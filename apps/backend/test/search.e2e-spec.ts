import { Pool } from 'pg';
import request from 'supertest';

interface SearchItem {
  slug: string;
  status: string;
  relevanceScore: number;
}

interface SearchResponse {
  data: SearchItem[];
  meta: {
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

const apiUrl = process.env.SEARCH_API_URL ?? 'http://127.0.0.1:5000';
const databaseUrl = process.env.DATABASE_URL;
const authorId = '2c3d4e5f-6071-48a9-bcde-f01234567890';
const categoryId = '1a2b3c4d-5e6f-4789-abcd-ef0123456789';
const recipeIds = [
  '3a4b5c6d-7e8f-4901-abcd-ef2345678901',
  '4b5c6d7e-8f90-4a12-bcde-f23456789012',
  '5c6d7e8f-9012-4b23-cdef-345678901234',
  '6d7e8f90-1234-4c34-def0-456789012345',
];

const recipes = [
  {
    id: recipeIds[0],
    slug: 'search-fixture-pho-bo-featured',
    title: 'Phở Bò Đặc Biệt',
    description: 'Nước dùng trong và thơm.',
    difficulty: 'Easy',
    cookTime: 45,
    servings: 4,
    status: 'Published',
  },
  {
    id: recipeIds[1],
    slug: 'search-fixture-pho-bo-secondary',
    title: 'Bò Hầm',
    description: 'Phở bò nấu chậm với rau thơm.',
    difficulty: 'Hard',
    cookTime: 90,
    servings: 4,
    status: 'Published',
  },
  {
    id: recipeIds[2],
    slug: 'search-fixture-pho-bo-draft',
    title: 'Phở Bò Bản Nháp',
    description: 'Công thức chưa xuất bản.',
    difficulty: 'Easy',
    cookTime: 30,
    servings: 2,
    status: 'Draft',
  },
  {
    id: recipeIds[3],
    slug: 'search-fixture-pho-bo-archived',
    title: 'Phở Bò Lưu Trữ',
    description: 'Công thức đã lưu trữ.',
    difficulty: 'Easy',
    cookTime: 30,
    servings: 2,
    status: 'Archived',
  },
] as const;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the PostgreSQL search E2E test.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function removeFixtures(): Promise<void> {
  const placeholders = recipeIds.map((_, index) => `$${index + 1}`).join(', ');
  await pool.query(`DELETE FROM recipes WHERE id IN (${placeholders})`, recipeIds);
  await pool.query('DELETE FROM categories WHERE id = $1', [categoryId]);
  await pool.query('DELETE FROM users WHERE id = $1', [authorId]);
}

async function createFixtures(): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, username, display_name, role)
     VALUES ($1, $2, $3, $4, 'Author')`,
    [authorId, 'search-fixture-author@example.invalid', 'search_fixture_author', 'Search Fixture Author'],
  );
  await pool.query(
    `INSERT INTO categories (id, name, slug, description)
     VALUES ($1, $2, $3, $4)`,
    [categoryId, 'Search Fixture', 'search-fixture', 'Category used by search E2E tests.'],
  );

  for (const recipe of recipes) {
    await pool.query(
      `INSERT INTO recipes (
        id, title, slug, description, instructions, prep_time, cook_time,
        servings, difficulty, category_id, author_id, status, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        recipe.id,
        recipe.title,
        recipe.slug,
        recipe.description,
        `${recipe.title} instructions.`,
        15,
        recipe.cookTime,
        recipe.servings,
        recipe.difficulty,
        categoryId,
        authorId,
        recipe.status,
        recipe.status === 'Published' ? new Date() : null,
      ],
    );
  }
}

async function search(
  query: Record<string, string | number>,
): Promise<{ status: number; body: SearchResponse }> {
  const response = await request(apiUrl).get('/api/v1/recipes/search').query(query);
  return { status: response.status, body: response.body as SearchResponse };
}

describe('Recipe full-text search against PostgreSQL', () => {
  jest.setTimeout(30_000);

  beforeAll(async () => {
    await removeFixtures();
    await createFixtures();
  });

  afterAll(async () => {
    await removeFixtures();
    await pool.end();
  });

  it('finds accented recipes from an unaccented query and ranks title matches first', async () => {
    const result = await search({ q: 'pho bo', pageSize: 50 });

    expect(result.status).toBe(200);
    expect(result.body.meta.totalCount).toBe(2);
    expect(result.body.data.map((item) => item.slug)).toEqual([
      recipes[0].slug,
      recipes[1].slug,
    ]);
    expect(result.body.data[0].relevanceScore).toBeGreaterThan(
      result.body.data[1].relevanceScore,
    );
    expect(result.body.data.every((item) => item.status === 'Published')).toBe(true);
  });

  it('keeps the search terms while applying all filters with AND semantics', async () => {
    const result = await search({
      q: 'pho bo',
      page: 1,
      pageSize: 50,
      categoryId,
      difficulty: 'Easy',
      maxCookTime: 60,
      minServings: 2,
    });

    expect(result.status).toBe(200);
    expect(result.body.data.map((item) => item.slug)).toEqual([recipes[0].slug]);
    expect(result.body.meta).toMatchObject({
      totalCount: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('rejects a query shorter than two characters with 422', async () => {
    const result = await search({ q: 'a' });

    expect(result.status).toBe(422);
  });
});
