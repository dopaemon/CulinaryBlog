'use client';

import { useSyncExternalStore } from 'react';
import type { AuthResponseDto, PagedResponse, UserProfileDto, UserRole } from '@culinary/shared';
import { ApiError, baseUrl, parse, parsePaged, requestHeaders } from './api';

/**
 * Lớp quản lý phiên đăng nhập phía client.
 *
 * Token lưu ở `localStorage` chứ không dùng cookie: SRS chương 8.1 bắt refresh token
 * đi trong request body để tránh CSRF, nên cookie `httpOnly` không dùng được. Đổi lại
 * phải chấp nhận rủi ro XSS — mọi nội dung do người dùng nhập phải được escape.
 */
const STORAGE_KEY = 'culinary.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDto;
}

// The SRS contract exposes roles as an array, while the frontend session uses
// the single role currently stored for each user. Normalize at the API boundary
// so role guards do not reject a valid Author session.
type ProfileResponse = Omit<UserProfileDto, 'role'> & {
  role?: UserRole;
  roles?: UserRole[];
};

function normalizeProfile(profile: ProfileResponse): UserProfileDto {
  const role = profile.role ?? profile.roles?.[0];
  if (!role) throw new Error('API không trả về role của người dùng.');
  const normalized = { ...profile, role };
  delete normalized.roles;
  return normalized;
}

let session: Session | null | undefined;
const listeners = new Set<() => void>();

function read(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Session & { user: ProfileResponse };
    return { ...stored, user: normalizeProfile(stored.user) };
  } catch {
    // localStorage bị chặn (private mode) hoặc dữ liệu hỏng → coi như chưa đăng nhập.
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getSession(): Session | null {
  // Cache để `useSyncExternalStore` nhận đúng một tham chiếu ổn định giữa các lần render.
  if (session === undefined) session = read();
  return session;
}

export function setSession(next: Session | null) {
  session = next;
  if (typeof window !== 'undefined') {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Đăng xuất ở tab khác phải đá luôn tab này.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      session = read();
      emit();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Phiên hiện tại, tự re-render khi đăng nhập/đăng xuất (kể cả từ tab khác). */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}

async function post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

/**
 * `/auth/login`, `/auth/google` và `/auth/refresh` ở backend chỉ trả cặp token, không
 * kèm profile (xem `TokenPair` trong `commands/issue-tokens.ts`), nên phải gọi thêm
 * `/auth/me` một lần để dựng phiên.
 */
type TokenPair = Pick<AuthResponseDto, 'accessToken' | 'refreshToken' | 'expiresIn'>;

function fetchProfile(accessToken: string): Promise<UserProfileDto> {
  return fetch(`${baseUrl}/auth/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  }).then((res) => parse<ProfileResponse>(res)).then(normalizeProfile);
}

async function establish(tokens: TokenPair): Promise<Session> {
  const next = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: await fetchProfile(tokens.accessToken),
  };
  setSession(next);
  return next;
}

export async function login(email: string, password: string): Promise<Session> {
  return establish(await post<TokenPair>('/auth/login', { email, password }));
}

export async function register(displayName: string, username: string, email: string, password: string): Promise<Session> {
  const result = await post<AuthResponseDto>('/auth/register', { displayName, username, email, password });
  const next = { accessToken: result.accessToken, refreshToken: result.refreshToken, user: normalizeProfile(result.user) };
  setSession(next);
  return next;
}

export async function loginWithGoogle(idToken: string): Promise<Session> {
  return establish(await post<TokenPair>('/auth/google', { idToken }));
}

export async function logout(): Promise<void> {
  const current = getSession();
  setSession(null);
  if (!current) return;
  // Backend trả 204 idempotent; mạng lỗi cũng không được giữ lại phiên phía client.
  await post<void>('/auth/logout', { refreshToken: current.refreshToken }, current.accessToken).catch(
    () => undefined,
  );
}

/**
 * Đổi refresh token lấy cặp token mới.
 *
 * Nhiều request 401 cùng lúc phải dùng chung một lần gọi: token có rotation nên lần
 * refresh thứ hai sẽ dùng token đã bị thu hồi và bị backend coi là reuse attack.
 */
let refreshing: Promise<Session | null> | null = null;

async function rotate(): Promise<Session | null> {
  const current = getSession();
  if (!current) return null;
  try {
    const tokens = await post<TokenPair>('/auth/refresh', { refreshToken: current.refreshToken });
    // Giữ lại profile đang có: `/auth/refresh` không trả user, và refresh xảy ra giữa
    // lúc người dùng đang làm việc nên không nên thêm một round trip nữa.
    const next = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: current.user,
    };
    setSession(next);
    return next;
  } catch {
    // Refresh token hết hạn hoặc bị thu hồi → buộc đăng nhập lại.
    setSession(null);
    return null;
  }
}

export function refresh(): Promise<Session | null> {
  // `finally` phải gắn vào promise rồi mới gán, không đặt trong thân `rotate`: nhánh
  // "chưa đăng nhập" trả về đồng bộ, callback trong thân sẽ xoá `refreshing` trước khi
  // `??=` kịp gán và biến này kẹt lại ở một promise cũ vĩnh viễn.
  refreshing ??= rotate().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Gọi API kèm Bearer token, tự refresh đúng một lần khi gặp 401 rồi thử lại.
 * Dùng cho mọi endpoint cần đăng nhập; endpoint công khai vẫn dùng `apiGet`.
 */
export async function apiAuthed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = async (token: string | undefined) => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: requestHeaders(init, token),
  });

  let res = await send(getSession()?.accessToken);
  if (res.status === 401) {
    const renewed = await refresh();
    if (!renewed) throw new ApiError(401, null);
    res = await send(renewed.accessToken);
  }
  return parse<T>(res);
}

/** Gọi API phân trang cần đăng nhập, giữ meta và tự refresh token như apiAuthed. */
export async function apiAuthedPaged<T>(
  path: string,
  init: RequestInit = {},
): Promise<PagedResponse<T>> {
  const send = async (token: string | undefined) => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: requestHeaders(init, token),
  });

  let res = await send(getSession()?.accessToken);
  if (res.status === 401) {
    const renewed = await refresh();
    if (!renewed) throw new ApiError(401, null);
    res = await send(renewed.accessToken);
  }
  return parsePaged<T>(res);
}

/** Upload multipart có tiến trình và dùng cùng cơ chế refresh token với apiAuthed. */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (percentage: number) => void,
): Promise<T> {
  const send = (token: string | undefined) =>
    new Promise<Response>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', `${baseUrl}${path}`);
      request.setRequestHeader('Accept', 'application/json');
      if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      };
      request.onerror = () => reject(new Error('Không thể kết nối tới máy chủ.'));
      request.onabort = () => reject(new Error('Tải ảnh đã bị hủy.'));
      request.onload = () => resolve(new Response(request.responseText, {
        status: request.status,
        headers: { 'Content-Type': 'application/json' },
      }));
      request.send(formData);
    });

  let response = await send(getSession()?.accessToken);
  if (response.status === 401) {
    const renewed = await refresh();
    if (!renewed) throw new ApiError(401, null);
    response = await send(renewed.accessToken);
  }
  return parse<T>(response);
}

export function getProfile(): Promise<UserProfileDto> {
  return apiAuthed<ProfileResponse>('/auth/me').then(normalizeProfile);
}

export async function updateProfile(
  patch: Partial<Pick<UserProfileDto, 'displayName' | 'avatarUrl' | 'bio'>>,
): Promise<UserProfileDto> {
  const user = await apiAuthed<ProfileResponse>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then(normalizeProfile);
  const current = getSession();
  if (current) setSession({ ...current, user });
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiAuthed<void>('/auth/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  setSession(null);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await post<void>('/auth/password-reset-requests', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${baseUrl}/auth/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ token, newPassword }),
  });
  await parse<void>(res);
  setSession(null);
}
