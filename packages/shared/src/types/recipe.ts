import type { UserProfileDto } from './auth';
import type { CategoryDto } from './category';

export type RecipeStatus = 'Draft' | 'Published' | 'Archived';
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface RecipeIngredientDto {
  id: string;
  name: string;
  quantity: string;
  unit: string | null;
  order: number;
}

export interface RecipeStepDto {
  id: string;
  order: number;
  instruction: string;
  imageUrl: string | null;
}

export interface RecipeImageDto {
  id: string;
  url: string;
  alt: string | null;
  isCover: boolean;
}

export interface RecipeSummaryDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  status: RecipeStatus;
  difficulty: DifficultyLevel;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  author: Pick<UserProfileDto, 'id' | 'displayName' | 'avatarUrl'>;
  categories: CategoryDto[];
  publishedAt: string | null;
  createdAt: string;
}

export interface RecipeDetailDto extends RecipeSummaryDto {
  description: string | null;
  ingredients: RecipeIngredientDto[];
  steps: RecipeStepDto[];
  images: RecipeImageDto[];
  updatedAt: string;
}
