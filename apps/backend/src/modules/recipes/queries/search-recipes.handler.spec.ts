import 'reflect-metadata';
import { PgDialect } from 'drizzle-orm/pg-core';
import { RecipeListDifficulty } from '../dto/get-recipes-query.dto';
import { SearchRecipesHandler, buildSearchTsQuery } from './search-recipes.handler';
import { SearchRecipesQuery } from './search-recipes.query';

describe('SearchRecipesHandler', () => {
  const createdAt = new Date('2026-09-18T08:00:00.000Z');
  const publishedAt = new Date('2026-09-19T08:00:00.000Z');
  const row = {
    id: '38cd0ac5-58f8-4b9f-9161-c311958c4eed',
    title: 'Phở bò',
    slug: 'pho-bo',
    excerpt: 'Nước dùng trong và thơm',
    status: 'Published' as const,
    difficulty: 'Medium' as const,
    prepTimeMinutes: 30,
    cookTimeMinutes: 120,
    servings: 4,
    authorId: 'b5766939-6e3d-41cb-b652-84a185d9207f',
    authorDisplayName: 'Trang',
    authorAvatarUrl: null,
    categoryId: 'f8050eb8-9d4b-4ce6-a94f-68b590119185',
    categoryName: 'Món Việt',
    categorySlug: 'mon-viet',
    publishedAt,
    createdAt,
    relevanceScore: 0.9,
  };

  function buildDb(
    totalCount = 1,
    rows = [row],
    images: { recipeId: string; mediumUrl: string | null; originalUrl: string }[] = [],
  ) {
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

    return { select, countWhere, limit, offset, orderBy };
  }

  it('tạo tsquery prefix theo logic AND và giữ dấu để PostgreSQL xử lý', () => {
    expect(buildSearchTsQuery('pho bò')).toBe('pho:* & bò:*');
  });

  it('từ chối truy vấn chỉ chứa ký tự không thể lập chỉ mục', () => {
    expect(() => buildSearchTsQuery('***')).toThrow();
  });

  it('lọc Published, kết hợp filter AND và trả relevanceScore cùng phân trang', async () => {
    const db = buildDb(13);
    const handler = new SearchRecipesHandler(db as never);

    const result = await handler.execute(
      new SearchRecipesQuery({
        q: 'pho bo',
        page: 2,
        pageSize: 12,
        categoryId: row.categoryId,
        difficulty: RecipeListDifficulty.Medium,
        maxCookTime: 150,
        minServings: 2,
        sort: 'relevance',
      }),
    );

    expect(db.limit).toHaveBeenCalledWith(12);
    expect(db.offset).toHaveBeenCalledWith(12);
    expect(result).toMatchObject({
      totalCount: 13,
      page: 2,
      pageSize: 12,
      totalPages: 2,
      items: [
        expect.objectContaining({
          title: row.title,
          relevanceScore: row.relevanceScore,
        }),
      ],
    });

    const compiled = new PgDialect().sqlToQuery(db.countWhere.mock.calls[0][0]);
    expect(compiled.params).toEqual(
      expect.arrayContaining([false, 'Published', 'pho:* & bo:*', row.categoryId, 'Medium', 150, 2]),
    );
  });

  it('trả ảnh chính cho kết quả tìm kiếm và ưu tiên ảnh medium', async () => {
    const db = buildDb(1, [row], [
      { recipeId: row.id, mediumUrl: 'https://cdn.test/medium.webp', originalUrl: 'https://cdn.test/original.jpg' },
      { recipeId: row.id, mediumUrl: null, originalUrl: 'https://cdn.test/other.jpg' },
    ]);
    const handler = new SearchRecipesHandler(db as never);

    const result = await handler.execute(new SearchRecipesQuery({
      q: 'phở bò',
      page: 1,
      pageSize: 12,
      sort: 'relevance',
    }));

    expect(result.items[0]?.coverImageUrl).toBe('https://cdn.test/medium.webp');
  });
});
