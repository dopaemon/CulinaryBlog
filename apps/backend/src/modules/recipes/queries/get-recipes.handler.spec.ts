import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CacheService } from '../../../infrastructure/cache/cache.service';
import {
  RecipeListDifficulty,
  RecipeListStatus,
} from '../dto/get-recipes-query.dto';
import { GetRecipesHandler } from './get-recipes.handler';
import { GetRecipesQuery } from './get-recipes.query';

describe('GetRecipesHandler', () => {
  const createdAt = new Date('2026-09-18T08:00:00.000Z');
  const publishedAt = new Date('2026-09-19T08:00:00.000Z');
  const updatedAt = new Date('2026-09-20T08:00:00.000Z');
  const row = {
    id: '38cd0ac5-58f8-4b9f-9161-c311958c4eed',
    title: 'Bánh mì thịt nướng',
    slug: 'banh-mi-thit-nuong',
    excerpt: 'Bánh mì Việt Nam',
    status: 'Published' as const,
    difficulty: 'Medium' as const,
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    servings: 4,
    authorId: 'b5766939-6e3d-41cb-b652-84a185d9207f',
    authorDisplayName: 'Trang',
    authorAvatarUrl: null,
    categoryId: 'f8050eb8-9d4b-4ce6-a94f-68b590119185',
    categoryName: 'Món Việt',
    categorySlug: 'mon-viet',
    publishedAt,
    createdAt,
    updatedAt,
  };

  const params = {
    page: 2,
    pageSize: 12,
    categoryId: row.categoryId,
    difficulty: RecipeListDifficulty.Medium,
    maxCookTime: 30,
    sort: '-cookTime' as const,
  };

  function buildDb(totalCount = 13, rows: unknown[] = [row], images: unknown[] = []) {
    const countWhere = jest.fn().mockResolvedValue([{ totalCount }]);
    const countFrom = jest.fn().mockReturnValue({ where: countWhere });

    const offset = jest.fn().mockResolvedValue(rows);
    const limit = jest.fn().mockReturnValue({ offset });
    const orderBy = jest.fn().mockReturnValue({ limit });
    const dataWhere = jest.fn().mockReturnValue({ orderBy });
    const secondJoin = jest.fn().mockReturnValue({ where: dataWhere });
    const firstJoin = jest.fn().mockReturnValue({ innerJoin: secondJoin });
    const dataFrom = jest.fn().mockReturnValue({ innerJoin: firstJoin });

    const imageOrderBy = jest.fn().mockResolvedValue(images);
    const imageWhere = jest.fn().mockReturnValue({ orderBy: imageOrderBy });
    const imageFrom = jest.fn().mockReturnValue({ where: imageWhere });
    const select = jest
      .fn()
      .mockReturnValueOnce({ from: countFrom })
      .mockReturnValueOnce({ from: dataFrom })
      .mockReturnValueOnce({ from: imageFrom });

    return { select, countWhere, limit, offset, imageWhere, imageOrderBy };
  }

  function buildCache(cached: unknown = null) {
    return {
      get: jest.fn().mockResolvedValue(cached),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as CacheService;
  }

  it('trả cache riêng theo query và quyền hiển thị của người dùng', async () => {
    const cached = {
      items: [],
      totalCount: 0,
      page: 2,
      pageSize: 12,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: true,
    };
    const db = buildDb();
    const cache = buildCache(cached);
    const handler = new GetRecipesHandler(db as never, cache);

    await expect(
      handler.execute(
        new GetRecipesQuery(params, {
          id: row.authorId,
          email: 'trang@example.com',
          role: 'Author',
        }),
      ),
    ).resolves.toEqual(cached);
    expect(cache.get).toHaveBeenCalledWith(
      `recipes:list:Author:${row.authorId}:2:12:all:-:${row.categoryId}:Medium:30:-:-cookTime`,
      900,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('kết hợp phân trang, ánh xạ summary cho UI và cache kết quả 15 phút', async () => {
    const db = buildDb();
    const cache = buildCache();
    const handler = new GetRecipesHandler(db as never, cache);

    const result = await handler.execute(new GetRecipesQuery(params));

    expect(db.limit).toHaveBeenCalledWith(12);
    expect(db.offset).toHaveBeenCalledWith(12);
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: row.id,
          title: row.title,
          coverImageUrl: null,
          category: {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          },
          author: {
            id: row.authorId,
            displayName: row.authorDisplayName,
            avatarUrl: null,
          },
          publishedAt: publishedAt.toISOString(),
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        }),
      ],
      totalCount: 13,
      page: 2,
      pageSize: 12,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(cache.set).toHaveBeenCalledWith(
      `recipes:list:Guest:2:12:all:-:${row.categoryId}:Medium:30:-:-cookTime`,
      result,
      900,
    );
  });

  it('lấy ảnh chính cho công thức trong trang hiện tại và dùng ảnh gốc khi chưa resize', async () => {
    const secondId = '717a72bb-a9a5-46f3-9b6a-9438f23bb997';
    const db = buildDb(
      2,
      [row, { ...row, id: secondId, slug: 'mon-thu-hai' }],
      [
        {
          recipeId: row.id,
          mediumUrl: 'https://cdn.test/primary-medium.webp',
          originalUrl: 'https://cdn.test/primary.jpg',
        },
        {
          recipeId: row.id,
          mediumUrl: 'https://cdn.test/other-medium.webp',
          originalUrl: 'https://cdn.test/other.jpg',
        },
        {
          recipeId: secondId,
          mediumUrl: null,
          originalUrl: 'https://cdn.test/second-original.jpg',
        },
      ],
    );
    const handler = new GetRecipesHandler(db as never, buildCache());

    const result = await handler.execute(
      new GetRecipesQuery({ page: 1, pageSize: 12, sort: '-createdAt' }),
    );

    expect(result.items.map((item) => item.coverImageUrl)).toEqual([
      'https://cdn.test/primary-medium.webp',
      'https://cdn.test/second-original.jpg',
    ]);
    expect(db.select).toHaveBeenCalledTimes(3);
    const imageFilter = new PgDialect().sqlToQuery(db.imageWhere.mock.calls[0][0]);
    expect(imageFilter.params).toEqual([row.id, secondId, false]);
    const imageSort = db.imageOrderBy.mock.calls[0]
      .map((part: SQL) => new PgDialect().sqlToQuery(part).sql)
      .join(' ');
    expect(imageSort).toContain('is_primary" desc');
    expect(imageSort).toContain('order_index" asc');
    expect(imageSort).toContain('created_at" asc');
  });

  it('trả danh sách rỗng thay vì 404 khi category không có công thức', async () => {
    const db = buildDb(0, []);
    const handler = new GetRecipesHandler(db as never, buildCache());

    await expect(
      handler.execute(new GetRecipesQuery({ ...params, page: 1 })),
    ).resolves.toMatchObject({
      items: [],
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'Guest chỉ thấy Published',
      user: undefined,
      expectedParams: [false, 'Published'],
    },
    {
      name: 'Author thấy Published và Draft/Archived của chính mình',
      user: {
        id: row.authorId,
        email: 'trang@example.com',
        role: 'Author' as const,
      },
      expectedParams: [false, 'Published', row.authorId, 'Draft', 'Archived'],
    },
    {
      name: 'Admin thấy mọi trạng thái',
      user: {
        id: row.authorId,
        email: 'admin@example.com',
        role: 'Admin' as const,
      },
      expectedParams: [false],
    },
  ])('$name', async ({ user, expectedParams }) => {
    const db = buildDb(0, []);
    const handler = new GetRecipesHandler(db as never, buildCache());

    await handler.execute(
      new GetRecipesQuery(
        {
          page: 1,
          pageSize: 12,
          sort: '-createdAt',
        },
        user,
      ),
    );

    const condition = db.countWhere.mock.calls[0][0];
    const compiled = new PgDialect().sqlToQuery(condition);
    expect(compiled.params).toEqual(expectedParams);
  });

  it('chỉ thêm Draft của Author khi được gọi từ category detail', async () => {
    const db = buildDb(0, []);
    const cache = buildCache();
    const handler = new GetRecipesHandler(db as never, cache);
    const user = {
      id: row.authorId,
      email: 'trang@example.com',
      role: 'Author' as const,
    };

    await handler.execute(
      new GetRecipesQuery(
        {
          page: 1,
          pageSize: 12,
          categoryId: row.categoryId,
          sort: '-createdAt',
        },
        user,
        ['Draft'],
      ),
    );

    const condition = db.countWhere.mock.calls[0][0];
    const compiled = new PgDialect().sqlToQuery(condition);
    expect(compiled.params).toEqual([
      false,
      'Published',
      row.authorId,
      'Draft',
      row.categoryId,
    ]);
    expect(cache.set).toHaveBeenCalledWith(
      `recipes:list:Author:${row.authorId}:Draft:1:12:all:-:${row.categoryId}:-:-:-:-createdAt`,
      expect.any(Object),
      900,
    );
  });

  it('mine=true giới hạn theo user và lọc status trước khi phân trang', async () => {
    const db = buildDb(1, [{ ...row, status: 'Draft' }]);
    const cache = buildCache();
    const handler = new GetRecipesHandler(db as never, cache);
    const user = {
      id: row.authorId,
      email: 'trang@example.com',
      role: 'Author' as const,
    };

    const result = await handler.execute(
      new GetRecipesQuery(
        {
          page: 1,
          pageSize: 12,
          mine: true,
          status: RecipeListStatus.Draft,
          sort: '-createdAt',
        },
        user,
      ),
    );

    const condition = db.countWhere.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([
      false,
      row.authorId,
      'Draft',
    ]);
    expect(result.items[0]).toMatchObject({
      id: row.id,
      status: 'Draft',
      updatedAt: updatedAt.toISOString(),
    });
    expect(cache.set).toHaveBeenCalledWith(
      `recipes:list:Mine:${row.authorId}:1:12:mine:Draft:-:-:-:-:-createdAt`,
      result,
      900,
    );
  });

  it('yêu cầu đăng nhập cho mine=true trước khi đọc cache hoặc database', async () => {
    const db = buildDb();
    const cache = buildCache();
    const handler = new GetRecipesHandler(db as never, cache);

    await expect(
      handler.execute(
        new GetRecipesQuery({
          page: 1,
          pageSize: 12,
          mine: true,
          sort: '-createdAt',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(cache.get).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('tách cache mine=true giữa các Admin khác nhau', async () => {
    const adminA = { id: 'admin-a', email: 'a@example.com', role: 'Admin' as const };
    const adminB = { id: 'admin-b', email: 'b@example.com', role: 'Admin' as const };
    const cacheA = buildCache();
    const cacheB = buildCache();

    await new GetRecipesHandler(buildDb(0, []) as never, cacheA).execute(
      new GetRecipesQuery(
        { page: 1, pageSize: 12, mine: true, sort: '-createdAt' },
        adminA,
      ),
    );
    await new GetRecipesHandler(buildDb(0, []) as never, cacheB).execute(
      new GetRecipesQuery(
        { page: 1, pageSize: 12, mine: true, sort: '-createdAt' },
        adminB,
      ),
    );

    expect(cacheA.get).toHaveBeenCalledWith(
      'recipes:list:Mine:admin-a:1:12:mine:-:-:-:-:-:-createdAt',
      900,
    );
    expect(cacheB.get).toHaveBeenCalledWith(
      'recipes:list:Mine:admin-b:1:12:mine:-:-:-:-:-:-createdAt',
      900,
    );
  });
});
