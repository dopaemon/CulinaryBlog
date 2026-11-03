import type { DifficultyLevel } from "@culinary/shared";

export const DEFAULT_SORT = "-createdAt";
const SORT_VALUES = [
  "-createdAt",
  "createdAt",
  "title",
  "-title",
  "cookTime",
  "-cookTime",
] as const;

type SortValue = (typeof SORT_VALUES)[number];
type SearchParams = Record<string, string | string[] | undefined>;

export interface RecipeListQuery {
  page: number;
  categoryId?: string;
  difficulty?: DifficultyLevel;
  maxCookTime?: number;
  sort: SortValue;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function normalizeSort(value: string | undefined): SortValue {
  return SORT_VALUES.includes(value as SortValue) ? (value as SortValue) : DEFAULT_SORT;
}

function normalizeDifficulty(value: string | undefined): DifficultyLevel | undefined {
  return value === "Easy" || value === "Medium" || value === "Hard" ? value : undefined;
}

function normalizeMaxCookTime(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) ? minutes : undefined;
}

export function parseRecipeListQuery(params: SearchParams): RecipeListQuery {
  return {
    page: normalizePage(firstValue(params.page)),
    categoryId: firstValue(params.categoryId)?.trim() || undefined,
    difficulty: normalizeDifficulty(firstValue(params.difficulty)),
    maxCookTime: normalizeMaxCookTime(firstValue(params.maxCookTime)),
    sort: normalizeSort(firstValue(params.sort)),
  };
}

export function buildRecipesHref(query: RecipeListQuery, page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.maxCookTime !== undefined) params.set("maxCookTime", String(query.maxCookTime));
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  const search = params.toString();
  return search ? `/recipes?${search}` : "/recipes";
}
