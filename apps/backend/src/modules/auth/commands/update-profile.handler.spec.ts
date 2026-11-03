import { UnauthorizedException } from '@nestjs/common';
import { UpdateProfileCommand } from './update-profile.command';
import { UpdateProfileHandler } from './update-profile.handler';

describe('UpdateProfileHandler', () => {
  const buildDb = (rows: unknown[]) => {
    const set = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue(rows) }),
    });
    return { update: jest.fn().mockReturnValue({ set }), set };
  };

  const row = {
    id: 'user-1',
    email: 'a@b.com',
    username: 'user_a',
    displayName: 'Tên mới',
    avatarUrl: 'https://cdn.test/a.png',
    bio: null,
    role: 'Author',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('cập nhật đúng field được gửi và trả hồ sơ mới', async () => {
    const db = buildDb([row]);

    const result = await new UpdateProfileHandler(db as never).execute(
      new UpdateProfileCommand('user-1', {
        displayName: 'Tên mới',
        avatarUrl: 'https://cdn.test/a.png',
      }),
    );

    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      username: 'user_a',
      displayName: 'Tên mới',
      avatarUrl: 'https://cdn.test/a.png',
      bio: null,
      roles: ['Author'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    // bio không gửi thì không được ghi đè thành null.
    expect(Object.keys(db.set.mock.calls[0][0]).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'updatedAt',
    ]);
  });

  it('không bao giờ ghi email/role/passwordHash kể cả khi client gửi kèm', async () => {
    const db = buildDb([row]);

    await new UpdateProfileHandler(db as never).execute(
      new UpdateProfileCommand('user-1', {
        displayName: 'Tên mới',
        email: 'hacker@b.com',
        role: 'Admin',
        passwordHash: 'x',
      } as never),
    );

    const written = Object.keys(db.set.mock.calls[0][0]);
    expect(written).not.toContain('email');
    expect(written).not.toContain('role');
    expect(written).not.toContain('passwordHash');
  });

  it('body rỗng vẫn hợp lệ: chỉ set updatedAt, trả hồ sơ hiện tại', async () => {
    const db = buildDb([row]);

    await new UpdateProfileHandler(db as never).execute(new UpdateProfileCommand('user-1', {}));

    expect(Object.keys(db.set.mock.calls[0][0])).toEqual(['updatedAt']);
  });

  it('ném 401 khi user không còn tồn tại', async () => {
    await expect(
      new UpdateProfileHandler(buildDb([]) as never).execute(
        new UpdateProfileCommand('user-mat-tich', { bio: 'x' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
