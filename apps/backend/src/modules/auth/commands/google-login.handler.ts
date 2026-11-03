import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../../../infrastructure/database/database.module';
import { users } from '../../../infrastructure/database/schema';
import { authAccountDisabled, authGoogleTokenInvalid } from '../auth.exceptions';
import { GoogleLoginCommand } from './google-login.command';
import { TokenPair, issueTokens } from './issue-tokens';

interface GoogleTokenInfo {
  aud: string;
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
}

@CommandHandler(GoogleLoginCommand)
export class GoogleLoginHandler implements ICommandHandler<GoogleLoginCommand, TokenPair> {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(command: GoogleLoginCommand): Promise<TokenPair> {
    const profile = await this.verifyIdToken(command.idToken);

    const [existing] = await this.db
      .select({ id: users.id, isActive: users.isActive, avatarUrl: users.avatarUrl })
      .from(users)
      .where(and(eq(users.email, profile.email), eq(users.isDeleted, false)))
      .limit(1);

    // Email đã đăng ký thủ công trước đó → liên kết, không tạo user trùng.
    if (existing) {
      if (!existing.isActive) {
        throw authAccountDisabled();
      }
      if (!existing.avatarUrl && profile.picture) {
        await this.db
          .update(users)
          .set({ avatarUrl: profile.picture })
          .where(eq(users.id, existing.id));
      }
      return issueTokens(this.db, this.jwtService, this.config, existing.id, command.ip);
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email: profile.email,
        username: `user_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        displayName: profile.name ?? profile.email.split('@')[0],
        avatarUrl: profile.picture ?? null,
        role: 'Author',
      })
      .returning({ id: users.id });

    return issueTokens(this.db, this.jwtService, this.config, created.id, command.ip);
  }

  // ponytail: verify qua endpoint tokeninfo của Google (1 round-trip mỗi lần login) thay vì tự
  // kiểm chữ ký bằng JWKS — không thêm dependency google-auth-library. Upgrade sang verify local
  // (cache certs) nếu latency login thành vấn đề.
  private async verifyIdToken(idToken: string): Promise<GoogleTokenInfo> {
    const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');

    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) throw authGoogleTokenInvalid();

    const info = (await res.json()) as GoogleTokenInfo;
    // aud sai = token phát cho app khác; email chưa verify = không tin được là chủ email.
    if (info.aud !== clientId || !info.email || info.email_verified !== 'true') throw authGoogleTokenInvalid();

    return info;
  }
}
