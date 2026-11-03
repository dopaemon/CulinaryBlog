import { boolean, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { baseColumns } from './base.columns';

export const userRoleEnum = pgEnum('user_role', ['Author', 'Admin']);

export const users = pgTable('users', {
  ...baseColumns,
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  // Nullable: user đăng nhập qua Google OAuth có thể không có mật khẩu (FR-AUTH-003).
  passwordHash: text('password_hash'),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  bio: text('bio'),
  role: userRoleEnum('role').notNull().default('Author'),
  isActive: boolean('is_active').notNull().default(true),
  // FR-AUTH-002: khóa tài khoản 15 phút sau 5 lần đăng nhập sai liên tiếp.
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
