import { Inject, UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserRole } from '@culinary/shared';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../../../infrastructure/database/database.module';
import { users } from '../../../infrastructure/database/schema';
import { GetMeQuery } from './get-me.query';

export interface MeResult {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  // SRS trả roles dạng mảng dù DB hiện chỉ có 1 role/user.
  roles: UserRole[];
  createdAt: string;
}

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, MeResult> {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async execute({ userId }: GetMeQuery): Promise<MeResult> {
    // Chỉ select đúng cột cần trả — passwordHash không bao giờ ra khỏi tầng DB.
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isDeleted, false)))
      .limit(1);

    // Guard đã chặn token invalid; tới đây mà không còn user = vừa bị xoá/vô hiệu giữa 2 truy vấn.
    if (!user) throw new UnauthorizedException();

    const { role, createdAt, ...profile } = user;
    return { ...profile, roles: [role], createdAt: createdAt.toISOString() };
  }
}
