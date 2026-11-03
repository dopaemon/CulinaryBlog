import { Inject, UnprocessableEntityException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PagedResult, RecipeSearchResultDto } from '@culinary/shared';
import {
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
} from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  Database,
} from '../../../infrastructure/database/database.module';
import {
  categories,
  recipeImages,
  recipes,
  users,
} from '../../../infrastructure/database/schema';
import {
  SearchRecipeSort,
  SearchRecipesQueryParams,
} from '../dto/search-recipes-query.dto';
import { SearchRecipesQuery } from './search-recipes.query';

export function buildSearchTsQuery(value: string): string {
  const terms = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length === 0) {
    throw new UnprocessableEntityException({
      type: 'SEARCH_QUERY_INVALID',
      title: 'Từ khóa tìm kiếm không hợp lệ',
      status: 422,
      detail: 'Từ khóa phải chứa ít nhất một chữ cái hoặc chữ số',
    });
  }

  return terms.map((term) => `${term}:*`).join(' & ');
}

@QueryHandler(SearchRecipesQuery)
export class SearchRecipesHandler implements IQueryHandler<
  SearchRecipesQuery,
  PagedResult<RecipeSearchResultDto>
> {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
  ) {}

  async execute(
    query: SearchRecipesQuery,
  ): Promise<PagedResult<RecipeSearchResultDto>> {
    const { params } = query;
    const tsQuery = sql`to_tsquery('culinary_search', ${buildSearchTsQuery(params.q)})`;
    const relevanceScore = sql<number>`ts_rank(${recipes.searchVector}, ${tsQuery})`;
    const where = and(
      eq(recipes.isDeleted, false),
      eq(recipes.status, 'Published'),
      sql`${recipes.searchVector} @@ ${tsQuery}`,
      ...this.createFilterConditions(params),
    );

    const [{ totalCount }] = await this.db
      .select({ totalCount: count() })
      .from(recipes)
      .where(where);

    const rows = await this.db
      .select({
        id: recipes.id,
        title: recipes.title,
        slug: recipes.slug,
        excerpt: recipes.description,
        status: recipes.status,
        difficulty: recipes.difficulty,
        prepTimeMinutes: recipes.prepTime,
        cookTimeMinutes: recipes.cookTime,
        servings: recipes.servings,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        publishedAt: recipes.publishedAt,
        createdAt: recipes.createdAt,
        relevanceScore,
      })
      .from(recipes)
      .innerJoin(users, eq(recipes.authorId, users.id))
      .innerJoin(categories, eq(recipes.categoryId, categories.id))
      .where(where)
      .orderBy(...this.createOrder(params.sort, relevanceScore))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const coverImageUrls = new Map<string, string>();
    if (rows.length > 0) {
      const images = await this.db
        .select({
          recipeId: recipeImages.recipeId,
          mediumUrl: recipeImages.mediumUrl,
          originalUrl: recipeImages.originalUrl,
        })
        .from(recipeImages)
        .where(and(
          inArray(recipeImages.recipeId, rows.map((row) => row.id)),
          eq(recipeImages.isDeleted, false),
        ))
        .orderBy(
          asc(recipeImages.recipeId),
          desc(recipeImages.isPrimary),
          asc(recipeImages.orderIndex),
          asc(recipeImages.createdAt),
          asc(recipeImages.id),
        );

      for (const image of images) {
        if (!coverImageUrls.has(image.recipeId)) {
          coverImageUrls.set(image.recipeId, image.mediumUrl ?? image.originalUrl);
        }
      }
    }

    const items: RecipeSearchResultDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      coverImageUrl: coverImageUrls.get(row.id) ?? null,
      status: row.status,
      difficulty: row.difficulty,
      prepTimeMinutes: row.prepTimeMinutes,
      cookTimeMinutes: row.cookTimeMinutes,
      servings: row.servings,
      author: {
        id: row.authorId,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      },
      category: {
        id: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
      },
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      relevanceScore: row.relevanceScore,
    }));

    const totalPages = Math.ceil(totalCount / params.pageSize);
    return {
      items,
      totalCount,
      page: params.page,
      pageSize: params.pageSize,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPreviousPage: params.page > 1,
    };
  }

  private createFilterConditions(params: SearchRecipesQueryParams): SQL[] {
    const conditions: SQL[] = [];
    if (params.categoryId) {
      conditions.push(eq(recipes.categoryId, params.categoryId));
    }
    if (params.difficulty) {
      conditions.push(eq(recipes.difficulty, params.difficulty));
    }
    if (params.maxCookTime !== undefined) {
      conditions.push(lte(recipes.cookTime, params.maxCookTime));
    }
    if (params.minServings !== undefined) {
      conditions.push(gte(recipes.servings, params.minServings));
    }
    return conditions;
  }

  private createOrder(sort: SearchRecipeSort, relevanceScore: SQL): SQL[] {
    if (sort === 'relevance') {
      return [desc(relevanceScore), asc(recipes.id)];
    }

    const descending = sort.startsWith('-');
    const field = descending ? sort.slice(1) : sort;
    const column =
      field === 'title'
        ? recipes.title
        : field === 'cookTime'
          ? recipes.cookTime
          : recipes.createdAt;

    return [descending ? desc(column) : asc(column), asc(recipes.id)];
  }
}
