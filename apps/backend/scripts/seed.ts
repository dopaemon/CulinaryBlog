import { and, inArray, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  categories,
  recipeIngredients,
  recipes,
  recipeSteps,
  users,
} from '../src/infrastructure/database/schema';
import { seedRecipeImages } from './seed-recipe-images';
import { SAMPLE_RECIPES } from './recipe-sample-catalog';

const AUTHOR_EMAIL = 'lab2.seed.author@example.invalid';
const AUTHOR_DISPLAY_NAME = 'Sample Author';
const CATEGORY_NAMES = [
  'Món Việt', 'Món Á', 'Món Âu', 'Món chay', 'Món nướng',
  'Món hấp', 'Món xào', 'Món chiên', 'Món kho', 'Món canh',
  'Món súp', 'Món cơm', 'Món mì', 'Món bún', 'Món bánh',
  'Món tráng miệng', 'Món ăn sáng', 'Món ăn nhẹ', 'Món gia đình', 'Món ngày lễ',
] as const;
const INGREDIENTS = [
  'thịt gà', 'thịt bò', 'thịt heo', 'cá', 'tôm', 'đậu hũ', 'trứng',
  'gạo', 'mì', 'bún', 'cà rốt', 'khoai tây', 'cà chua', 'hành tây',
  'hành lá', 'tỏi', 'gừng', 'nấm', 'bắp cải', 'rau cải', 'bí đỏ',
  'đậu que', 'ớt chuông', 'nước mắm', 'muối', 'đường', 'tiêu',
  'dầu ăn', 'nước tương', 'rau thơm',
] as const;
const STEP_TITLES = [
  'Chuẩn bị nguyên liệu', 'Sơ chế', 'Ướp gia vị', 'Làm nóng chảo',
  'Chế biến phần chính', 'Nêm nếm', 'Hoàn thiện và trình bày',
] as const;

function categorySlug(index: number): string {
  return `category-${String(index + 1).padStart(2, '0')}`;
}

function sampleCategoryIndex(title: string): number {
  const normalized = title
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đ]/g, 'd');

  if (/^(che |sua chua |banh flan|tiramisu)/.test(normalized)) return 15;
  if (/(pizza|lasagna|mi y)/.test(normalized)) return 2;
  if (/(sushi|kimchi|bibimbap|gyoza|pad thai|katsu)/.test(normalized)) return 1;
  if (normalized.startsWith('canh ')) return 9;
  if (normalized.startsWith('sup ')) return 10;
  if (normalized.startsWith('lau ')) return 18;
  if (normalized.startsWith('bun ') || normalized.startsWith('pho ') || normalized.startsWith('hu tieu ')) return 13;
  if (normalized.startsWith('mi ') || normalized.startsWith('mien ') || normalized.startsWith('cao lau')) return 12;
  if (normalized.startsWith('com ') || normalized.startsWith('xoi ') || normalized.startsWith('chao ')) return 11;
  if (normalized.startsWith('banh ')) return 14;
  if (normalized.startsWith('goi ') || normalized.startsWith('nom ')) return 17;
  if (/(nuong|nem lui)/.test(normalized)) return 4;
  if (/(hap|banh beo|banh nam)/.test(normalized)) return 5;
  if (/(xao|rang)/.test(normalized)) return 6;
  if (/(chien|banh khot)/.test(normalized)) return 7;
  if (/(kho|rim|om)/.test(normalized)) return 8;
  return 18;
}

function legacyCategorySlug(index: number): string {
  return `lab2-category-${String(index + 1).padStart(2, '0')}`;
}

function randomFor(index: number): () => number {
  let state = (0x6d2b79f5 + index * 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class SeedDataFactory {
  static recipe(index: number) {
    const random = randomFor(index);
    const ingredientCount = 10 + Math.floor(random() * 3);
    const stepCount = 5 + Math.floor(random() * 3);
    const shuffled = [...INGREDIENTS];
    for (let position = shuffled.length - 1; position > 0; position--) {
      const target = Math.floor(random() * (position + 1));
      [shuffled[position], shuffled[target]] = [shuffled[target], shuffled[position]];
    }
    const title = SAMPLE_RECIPES[index % SAMPLE_RECIPES.length].title;
    const ingredients = shuffled.slice(0, ingredientCount).map((name, orderIndex) => ({
      name,
      quantity: String(1 + Math.floor(random() * 5)),
      unit: 'phần',
      orderIndex,
    }));
    const steps = STEP_TITLES.slice(0, stepCount).map((stepTitle, stepIndex) => ({
      stepNumber: stepIndex + 1,
      title: stepTitle,
      description: `${stepTitle} cho ${title.toLowerCase()}, dùng nguyên liệu đã chuẩn bị và thực hiện trong ${5 + Math.floor(random() * 16)} phút.`,
      timerMinutes: 5 + Math.floor(random() * 16),
    }));

    return {
      slug: `lab2-recipe-${String(index + 1).padStart(3, '0')}`,
      title,
      description: `Công thức mẫu ${title.toLowerCase()} thuộc ${CATEGORY_NAMES[sampleCategoryIndex(title)]}.`,
      instructions: steps.map((step) => `${step.stepNumber}. ${step.description}`).join('\n'),
      prepTime: 10 + Math.floor(random() * 21),
      cookTime: 15 + Math.floor(random() * 46),
      servings: 2 + Math.floor(random() * 5),
      difficulty: (['Easy', 'Medium', 'Hard'] as const)[Math.floor(random() * 3)],
      ingredients,
      steps,
    };
  }
}

async function verify(pool: Pool): Promise<void> {
  const counts = await pool.query<{
    category_count: string;
    recipe_count: string;
    seeded_recipe_count: string;
    unique_seeded_title_count: string;
    seeded_recipe_image_count: string;
    unique_seeded_image_count: string;
    incomplete_recipe_count: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM categories WHERE NOT is_deleted) AS category_count,
      (SELECT COUNT(*) FROM recipes WHERE NOT is_deleted) AS recipe_count,
      (SELECT COUNT(*) FROM recipes WHERE NOT is_deleted AND LEFT(slug, 12) = 'lab2-recipe-') AS seeded_recipe_count,
      (SELECT COUNT(DISTINCT title) FROM recipes WHERE NOT is_deleted AND LEFT(slug, 12) = 'lab2-recipe-') AS unique_seeded_title_count,
      (SELECT COUNT(DISTINCT r.id) FROM recipes r
        INNER JOIN recipe_images ri ON ri.recipe_id = r.id AND NOT ri.is_deleted AND ri.is_primary
        WHERE NOT r.is_deleted AND LEFT(r.slug, 12) = 'lab2-recipe-'
      ) AS seeded_recipe_image_count,
      (SELECT COUNT(DISTINCT ri.object_key) FROM recipes r
        INNER JOIN recipe_images ri ON ri.recipe_id = r.id AND NOT ri.is_deleted AND ri.is_primary
        WHERE NOT r.is_deleted AND LEFT(r.slug, 12) = 'lab2-recipe-'
      ) AS unique_seeded_image_count,
      (SELECT COUNT(*) FROM recipes r
        LEFT JOIN (SELECT recipe_id, COUNT(*) AS n FROM recipe_ingredients WHERE NOT is_deleted GROUP BY recipe_id) i ON i.recipe_id = r.id
        LEFT JOIN (SELECT recipe_id, COUNT(*) AS n FROM recipe_steps WHERE NOT is_deleted GROUP BY recipe_id) s ON s.recipe_id = r.id
        WHERE NOT r.is_deleted AND (COALESCE(i.n, 0) < 10 OR COALESCE(s.n, 0) < 5)
      ) AS incomplete_recipe_count
  `);
  const result = counts.rows[0];
  console.log(`Categories: ${result.category_count}; recipes: ${result.recipe_count}; lab 2 recipes: ${result.seeded_recipe_count}; unique sample titles: ${result.unique_seeded_title_count}; recipes with a primary sample image: ${result.seeded_recipe_image_count}; unique sample images: ${result.unique_seeded_image_count}; recipes with fewer than 10 ingredients or 5 steps: ${result.incomplete_recipe_count}`);
  if (
    Number(result.category_count) < 20 ||
    Number(result.recipe_count) < 100 ||
    Number(result.seeded_recipe_count) < 100 ||
    Number(result.unique_seeded_title_count) !== SAMPLE_RECIPES.length ||
    Number(result.seeded_recipe_image_count) !== SAMPLE_RECIPES.length ||
    Number(result.unique_seeded_image_count) !== SAMPLE_RECIPES.length ||
    Number(result.incomplete_recipe_count) > 0
  ) {
    throw new Error('Database does not meet the lab 2 data requirements.');
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  try {
    if (process.argv.includes('--verify-only')) {
      await verify(pool);
      return;
    }

    const slugs = Array.from({ length: SAMPLE_RECIPES.length }, (_, index) => SeedDataFactory.recipe(index).slug);
    const added = await db.transaction(async (tx) => {
      await tx.insert(users).values({
        email: AUTHOR_EMAIL,
        displayName: AUTHOR_DISPLAY_NAME,
        role: 'Author',
      }).onConflictDoNothing({ target: users.email });
      await tx.update(users)
        .set({ displayName: AUTHOR_DISPLAY_NAME })
        .where(eq(users.email, AUTHOR_EMAIL));
      const [author] = await tx.select({ id: users.id }).from(users).where(eq(users.email, AUTHOR_EMAIL));
      if (!author) throw new Error('Could not find seed author.');

      const categorySeed = CATEGORY_NAMES.map((name, index) => ({
        name,
        slug: categorySlug(index),
        description: `Danh mục ${name.toLowerCase()}.`,
        orderIndex: index,
      }));
      await tx.insert(categories).values(categorySeed).onConflictDoNothing();
      for (const category of categorySeed) {
        await tx.update(categories)
          .set({
            name: category.name,
            description: category.description,
            orderIndex: category.orderIndex,
          })
          .where(eq(categories.slug, category.slug));
      }
      const categoryRows = await tx.select({ id: categories.id, slug: categories.slug })
        .from(categories)
        .where(inArray(categories.slug, CATEGORY_NAMES.map((_, index) => categorySlug(index))));
      if (categoryRows.length !== CATEGORY_NAMES.length) {
        throw new Error('Could not find all seed categories.');
      }
      const categoryIds = new Map(categoryRows.map(({ slug, id }) => [slug, id]));
      const existing = await tx.select({ id: recipes.id, slug: recipes.slug })
        .from(recipes)
        .where(inArray(recipes.slug, slugs));
      const existingRecipes = new Map(existing.map(({ slug, id }) => [slug, id]));
      let inserted = 0;

      for (let index = 0; index < SAMPLE_RECIPES.length; index++) {
        const data = SeedDataFactory.recipe(index);
        const categoryId = categoryIds.get(categorySlug(sampleCategoryIndex(data.title)));
        if (!categoryId) throw new Error(`Missing category for ${data.slug}.`);
        const existingRecipeId = existingRecipes.get(data.slug);
        if (existingRecipeId) {
          await tx.update(recipes)
            .set({
              title: data.title,
              description: data.description,
              instructions: data.instructions,
              categoryId,
            })
            .where(eq(recipes.id, existingRecipeId));
          for (const step of data.steps) {
            await tx.update(recipeSteps)
              .set({
                title: step.title,
                description: step.description,
                timerMinutes: step.timerMinutes,
              })
              .where(and(
                eq(recipeSteps.recipeId, existingRecipeId),
                eq(recipeSteps.stepNumber, step.stepNumber),
              ));
          }
          continue;
        }
        const [recipe] = await tx.insert(recipes).values({
          title: data.title,
          slug: data.slug,
          description: data.description,
          instructions: data.instructions,
          prepTime: data.prepTime,
          cookTime: data.cookTime,
          servings: data.servings,
          difficulty: data.difficulty,
          categoryId,
          authorId: author.id,
          status: 'Published',
          publishedAt: new Date(),
        }).returning({ id: recipes.id });
        await tx.insert(recipeIngredients).values(data.ingredients.map((ingredient) => ({
          ...ingredient,
          recipeId: recipe.id,
        })));
        await tx.insert(recipeSteps).values(data.steps.map((step) => ({
          ...step,
          recipeId: recipe.id,
        })));
        inserted++;
      }
      await tx.update(categories)
        .set({ isDeleted: true })
        .where(inArray(
          categories.slug,
          CATEGORY_NAMES.map((_, index) => legacyCategorySlug(index)),
        ));
      return inserted;
    });
    console.log(`Inserted ${added} recipes; existing seed display data was synchronized.`);
    await seedRecipeImages(pool);
    await verify(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
