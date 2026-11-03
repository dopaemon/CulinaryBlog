export type UserRole = 'Author' | 'Admin';

export interface UserProfileDto {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  createdAt: string;
}

/** Bản ghi an toàn dùng cho danh sách người dùng của quản trị viên. */
export interface UserListItemDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  roles: UserRole[];
  isActive: boolean;
  createdAt: string;
}

export interface UpdateUserRequest {
  isActive?: boolean;
  role?: UserRole;
}

export const USER_LIST_SORT_VALUES = [
  'createdAt',
  '-createdAt',
  'email',
  '-email',
  'displayName',
  '-displayName',
] as const;

export type UserListSort = (typeof USER_LIST_SORT_VALUES)[number];

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds */
  expiresIn: number;
  user: UserProfileDto;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName: string;
}
