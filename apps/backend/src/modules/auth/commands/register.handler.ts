import { ConflictException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserProfileDto } from '@culinary/shared';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../../../infrastructure/database/database.module';
import { users } from '../../../infrastructure/database/schema';
import { WelcomeEmailQueue } from '../../../infrastructure/jobs/welcome-email.queue';
import { authEmailExists } from '../auth.exceptions';
import { RegisterCommand } from './register.command';
import { issueTokens, type TokenPair } from './issue-tokens';

export interface RegisterResult extends TokenPair {
  expiresAt: string;
  user: UserProfileDto;
}

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, RegisterResult> {
  private readonly logger = new Logger(RegisterHandler.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(WelcomeEmailQueue) private readonly welcomeEmailQueue: WelcomeEmailQueue,
  ) {}

  async execute(command: RegisterCommand): Promise<RegisterResult> {
    const { email, password, displayName, username } = command;

    const existing = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      throw authEmailExists();
    }

    const [existingUsername] = await this.db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existingUsername) throw new ConflictException({ type: 'about:blank', title: 'Username đã được sử dụng', detail: 'AUTH_USERNAME_EXISTS' });

    const passwordHash = await argon2.hash(password);
    let created: { id: string; email: string; username: string; displayName: string; createdAt: Date };
    try {
      [created] = await this.db
        .insert(users)
        .values({ email, username, passwordHash, displayName, role: 'Author' })
        .returning({ id: users.id, email: users.email, username: users.username, displayName: users.displayName, createdAt: users.createdAt });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        if (String((error as { constraint?: string }).constraint).includes('username')) {
          throw new ConflictException({ type: 'about:blank', title: 'Username đã được sử dụng', detail: 'AUTH_USERNAME_EXISTS' });
        }
        throw authEmailExists();
      }
      throw error;
    }

    const tokens = await issueTokens(this.db, this.jwtService, this.config, created.id, command.ip);

    try {
      await this.welcomeEmailQueue.enqueue({
        email: created.email,
        displayName: created.displayName,
        appUrl: this.config.get<string>('AUTH_URL', 'http://localhost:3000'),
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue welcome email for ${created.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      ...tokens,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      user: {
        id: created.id,
        email: created.email,
        username: created.username,
        displayName: created.displayName,
        avatarUrl: null,
        bio: null,
        role: 'Author',
        createdAt: created.createdAt.toISOString(),
      },
    };
  }
}
