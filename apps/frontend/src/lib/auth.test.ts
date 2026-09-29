import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';

/**
 * `auth.ts` đọc `window.localStorage` ngay lúc dựng phiên, nên phải stub trước khi
 * import module (module-level cache `session` chỉ đọc storage đúng một lần).
 */
const store = new Map<string, string>();

const localStorageStub = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

vi.stubGlobal('window', { localStorage: localStorageStub, addEventListener() {}, removeEventListener() {} });
vi.stubGlobal('localStorage', localStorageStub);

const { apiAuthed, getSession, logout, refresh, setSession } = await import('./auth');

const user = { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null, bio: null, role: 'Author' as const, createdAt: '' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setSession({ accessToken: 'old-access', refreshToken: 'old-refresh', user });
});

afterEach(() => {
  setSession(null);
  vi.unstubAllGlobals();
});

describe('refresh', () => {
  it('chỉ gọi /auth/refresh một lần dù nhiều request cùng lúc', async () => {
    // Rotation: lần refresh thứ hai sẽ dùng refresh token đã bị thu hồi và backend
    // ghi nhận reuse attack, nên single-flight là yêu cầu bắt buộc, không phải tối ưu.
    fetchMock.mockResolvedValue(json({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }));

    const results = await Promise.all([refresh(), refresh(), refresh()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r?.accessToken)).toEqual(['new-access', 'new-access', 'new-access']);
    expect(getSession()?.refreshToken).toBe('new-refresh');
  });

  it('cho phép refresh lại sau khi lần trước đã xong', async () => {
    fetchMock.mockResolvedValue(json({ accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 }));

    await refresh();
    await refresh();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh token bị thu hồi thì xoá phiên', async () => {
    fetchMock.mockResolvedValue(json({ status: 401, detail: 'AUTH_REFRESH_TOKEN_REVOKED' }, 401));

    await expect(refresh()).resolves.toBeNull();
    expect(getSession()).toBeNull();
  });

  it('chưa đăng nhập thì không gọi API', async () => {
    setSession(null);

    await expect(refresh()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiAuthed', () => {
  it('gặp 401 thì refresh rồi thử lại với access token mới', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 401, detail: 'AUTH_TOKEN_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh', refreshToken: 'r2', expiresIn: 900 }))
      .mockResolvedValueOnce(json({ data: user }));

    await expect(apiAuthed('/auth/me')).resolves.toEqual(user);

    const retry = fetchMock.mock.calls[2][1] as RequestInit;
    expect(new Headers(retry.headers).get('Authorization')).toBe('Bearer fresh');
  });

  it('không thử lại lần hai khi refresh cũng thất bại', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 401 }, 401))
      .mockResolvedValueOnce(json({ status: 401 }, 401));

    await expect(apiAuthed('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('không refresh khi lỗi không phải 401', async () => {
    fetchMock.mockResolvedValue(json({ status: 403, detail: 'AUTH_ACCOUNT_DISABLED' }, 403));

    await expect(apiAuthed('/recipes')).rejects.toMatchObject({ status: 403, code: 'AUTH_ACCOUNT_DISABLED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('logout', () => {
  it('xoá phiên ngay cả khi gọi API thất bại', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await logout();

    expect(getSession()).toBeNull();
  });
});

describe('ApiError', () => {
  it('giữ nguyên mã lỗi và lỗi từng field của Problem Details', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          type: 'about:blank',
          title: 'Email đã tồn tại',
          status: 409,
          detail: 'AUTH_EMAIL_EXISTS',
          errors: { email: ['Email đã được sử dụng'] },
        },
        409,
      ),
    );

    const error = await apiAuthed('/auth/me').catch((e: unknown) => e as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('AUTH_EMAIL_EXISTS');
    expect((error as ApiError).fieldErrors.email).toEqual(['Email đã được sử dụng']);
  });
});
