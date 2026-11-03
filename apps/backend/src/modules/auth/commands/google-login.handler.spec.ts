import { BadRequestException } from '@nestjs/common';
import { GoogleLoginCommand } from './google-login.command';
import { GoogleLoginHandler } from './google-login.handler';

describe('GoogleLoginHandler', () => {
  const CLIENT_ID = 'client-id.apps.googleusercontent.com';

  const buildDb = (existing: unknown[]) => {
    const values = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: 'user-new' }]),
    });
    return {
      values,
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(existing) }),
        }),
      }),
      insert: jest.fn().mockReturnValue({ values }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
    };
  };

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token'),
    decode: jest.fn().mockReturnValue({ exp: 1_000_900, iat: 1_000_000 }),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(CLIENT_ID), get: jest.fn((_k, d) => d) };

  const mockTokenInfo = (body: unknown, ok = true) => {
    global.fetch = jest.fn().mockResolvedValue({ ok, json: jest.fn().mockResolvedValue(body) });
  };

  const build = (db: ReturnType<typeof buildDb>) =>
    new GoogleLoginHandler(db as never, jwtService as never, config as never);

  beforeEach(() => jest.clearAllMocks());

  it('liên kết tài khoản cũ khi email đã tồn tại, không tạo user trùng', async () => {
    mockTokenInfo({ aud: CLIENT_ID, email: 'a@b.com', email_verified: 'true', picture: 'p.jpg' });
    const db = buildDb([{ id: 'user-old', isActive: true, avatarUrl: null }]);

    const result = await build(db).execute(new GoogleLoginCommand('id-token'));

    expect(result).toEqual({ accessToken: 'token', refreshToken: 'token', expiresIn: 900 });
    // chỉ insert refresh_tokens, không insert users
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalled();
  });

  it('tạo user role Author kèm avatar Google khi email chưa tồn tại', async () => {
    mockTokenInfo({ aud: CLIENT_ID, email: 'new@b.com', email_verified: 'true', name: 'Tên', picture: 'p.jpg' });
    const db = buildDb([]);

    await build(db).execute(new GoogleLoginCommand('id-token'));

    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@b.com',
      username: expect.stringMatching(/^user_[a-f0-9]{24}$/),
      displayName: 'Tên',
      avatarUrl: 'p.jpg',
      role: 'Author',
    }));
  });

  it('ném AUTH_GOOGLE_TOKEN_INVALID khi aud không khớp client id', async () => {
    mockTokenInfo({ aud: 'app-khac', email: 'a@b.com', email_verified: 'true' });
    const db = buildDb([]);

    await expect(build(db).execute(new GoogleLoginCommand('id-token'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });
});
