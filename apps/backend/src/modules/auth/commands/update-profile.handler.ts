import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../../../infrastructure/database/database.module';
import { users } from '../../../infrastructure/database/schema';
import { MeResult } from '../queries/get-me.handler';
import { UpdateProfileCommand } from './update-profile.command';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand, MeResult> {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async execute({ userId, changes }: UpdateProfileCommand): Promise<MeResult> {
    // Chỉ 3 cột này được phép ghi — email/role/passwordHash không có đường vào set.
    // updatedAt luôn có nên body rỗng vẫn là câu UPDATE hợp lệ (drizzle không nhận set rỗng).
    const [user] = await this.db
      .update(users)
      .set({
        ...(changes.displayName !== undefined && { displayName: changes.displayName }),
        ...(changes.avatarUrl !== undefined && { avatarUrl: changes.avatarUrl }),
        ...(changes.bio !== undefined && { bio: changes.bio }),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.isDeleted, false)))
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        role: users.role,
        createdAt: users.createdAt,
      });

    // Guard đã chặn token invalid; tới đây mà không còn user = vừa bị xoá giữa 2 truy vấn.
    if (!user) throw new UnauthorizedException();

    const { role, createdAt, ...profile } = user;
    return { ...profile, roles: [role], createdAt: createdAt.toISOString() };
  }
}
