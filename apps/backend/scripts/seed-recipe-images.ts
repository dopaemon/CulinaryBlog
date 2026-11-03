import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { recipeImages, recipes, users } from '../src/infrastructure/database/schema';
import { SAMPLE_RECIPES } from './recipe-sample-catalog';

const SEED_AUTHOR_EMAIL = 'lab2.seed.author@example.invalid';
const DISH_IMAGE_FILES = new Map<string, string>(SAMPLE_RECIPES.map(({ title, imageFile }) => [title, imageFile]));

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to seed recipe images.`);
  return value;
}

async function clearRecipeCache(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'recipes:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== '0');
    await redis.del('recipes');
  } catch (error) {
    console.warn('Could not clear recipe cache after image seed:', error);
  } finally {
    redis.disconnect();
  }
}

export async function seedRecipeImages(pool: Pool): Promise<void> {
  if (SAMPLE_RECIPES.length !== 100) {
    throw new Error(`Expected 100 sample dishes, found ${SAMPLE_RECIPES.length}.`);
  }
  if (
    new Set(SAMPLE_RECIPES.map(({ title }) => title)).size !== SAMPLE_RECIPES.length ||
    new Set(SAMPLE_RECIPES.map(({ imageFile }) => imageFile)).size !== SAMPLE_RECIPES.length
  ) {
    throw new Error('Sample dishes and image files must each be unique.');
  }

  const db = drizzle(pool);
  const seedRecipes = await db
    .select({ id: recipes.id, title: recipes.title, slug: recipes.slug })
    .from(recipes)
    .innerJoin(users, eq(recipes.authorId, users.id))
    .where(and(
      eq(users.email, SEED_AUTHOR_EMAIL),
      eq(recipes.isDeleted, false),
      like(recipes.slug, 'lab2-recipe-%'),
    ));

  if (seedRecipes.length !== SAMPLE_RECIPES.length) {
    throw new Error(`Expected ${SAMPLE_RECIPES.length} sample recipes before image seed, found ${seedRecipes.length}.`);
  }
  for (const recipe of seedRecipes) {
    if (!DISH_IMAGE_FILES.has(recipe.title)) {
      throw new Error(`No sample image matches recipe ${recipe.slug}: ${recipe.title}`);
    }
  }

  const existingImages = await db
    .select({ id: recipeImages.id, recipeId: recipeImages.recipeId, objectKey: recipeImages.objectKey })
    .from(recipeImages)
    .where(and(
      inArray(recipeImages.recipeId, seedRecipes.map((recipe) => recipe.id)),
      eq(recipeImages.isDeleted, false),
    ));
  const seedImagesByRecipe = new Map(
    existingImages
      .filter((image) => image.objectKey.endsWith('/seed-cover.webp'))
      .map((image) => [image.recipeId, image]),
  );
  const recipesToSeed = seedRecipes.filter((recipe) => {
    const hasSeedImage = seedImagesByRecipe.has(recipe.id);
    const hasOtherImage = existingImages.some((image) => image.recipeId === recipe.id && !image.objectKey.endsWith('/seed-cover.webp'));
    return hasSeedImage || !hasOtherImage;
  });

  const buffers = new Map<string, Buffer>();
  for (const fileName of new Set(recipesToSeed.map((recipe) => DISH_IMAGE_FILES.get(recipe.title)!))) {
    buffers.set(fileName, await readFile(join(__dirname, 'assets', 'recipe-images', fileName)));
  }

  const bucket = process.env.S3_BUCKET || 'culinary-blog';
  const publicUrl = requiredEnv('S3_PUBLIC_URL').replace(/\/$/, '');
  const s3 = new S3Client({
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: requiredEnv('S3_ACCESS_KEY'),
      secretAccessKey: requiredEnv('S3_SECRET_KEY'),
    },
  });

  try {
    for (const recipe of recipesToSeed) {
      const fileName = DISH_IMAGE_FILES.get(recipe.title)!;
      const buffer = buffers.get(fileName)!;
      const objectKey = `recipes/${recipe.id}/seed-cover.webp`;
      const url = `${publicUrl}/${bucket}/${objectKey}`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: 'image/webp',
        ContentLength: buffer.length,
      }));
      try {
        const existingSeedImage = seedImagesByRecipe.get(recipe.id);
        const imageValues = {
          originalUrl: url,
          objectKey,
          mediumUrl: url,
          thumbnailUrl: url,
          altText: recipe.title,
          isPrimary: true,
        };
        if (existingSeedImage) {
          await db.update(recipeImages)
            .set(imageValues)
            .where(eq(recipeImages.id, existingSeedImage.id));
        } else {
          await db.insert(recipeImages).values({ recipeId: recipe.id, ...imageValues });
        }
      } catch (error) {
        if (!seedImagesByRecipe.has(recipe.id)) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
        }
        throw error;
      }
    }
  } finally {
    s3.destroy();
  }

  await clearRecipeCache();
  console.log(`Synchronized unique sample photos for ${recipesToSeed.length} recipes.`);
}
