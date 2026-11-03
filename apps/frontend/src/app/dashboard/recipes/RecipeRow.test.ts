import type { RecipeStatus, RecipeSummaryDto } from '@culinary/shared';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string;
    children?: ReactNode;
    className?: string;
    'aria-label'?: string;
    'aria-current'?: string;
  }) => createElement('a', { href, ...props }, children),
}));

import { RecipeRow } from './RecipeDashboard';

const recipeId = '38cd0ac5-58f8-4b9f-9161-c311958c4eed';

function renderRecipeRow(status: RecipeStatus) {
  const recipe: RecipeSummaryDto = {
    id: recipeId,
    title: 'Bánh mì thịt nướng',
    slug: 'banh-mi-thit-nuong',
    excerpt: 'Bánh mì Việt Nam',
    coverImageUrl: null,
    status,
    difficulty: 'Medium',
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    servings: 4,
    author: { id: 'author-1', displayName: 'Trang', avatarUrl: null },
    category: { id: 'category-1', name: 'Món Việt', slug: 'mon-viet' },
    publishedAt: null,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  };

  return renderToStaticMarkup(
    createElement(RecipeRow, {
      recipe,
      busy: false,
      onAction: vi.fn(),
    }),
  );
}

describe('RecipeRow actions', () => {
  it('Draft có Publish, Sửa và Xóa', () => {
    const html = renderRecipeRow('Draft');

    expect(html).toContain('Xuất bản');
    expect(html).toContain('Sửa');
    expect(html).toContain('Xóa');
    expect(html).toContain(`href="/dashboard/recipes/${recipeId}/edit"`);
    expect(html).not.toContain('Hủy xuất bản');
    expect(html).not.toContain('Lưu trữ');
  });

  it('Published có Unpublish, Archive và Sửa', () => {
    const html = renderRecipeRow('Published');

    expect(html).toContain('Hủy xuất bản');
    expect(html).toContain('Lưu trữ');
    expect(html).toContain(`href="/dashboard/recipes/${recipeId}/edit"`);
    expect(html).toContain('Xóa');
    expect(html).not.toContain('Xuất bản');
    expect(html).toContain('Sửa');
  });

  it('Archived không có Publish/Unpublish/Archive nhưng vẫn sửa, xem và xóa được', () => {
    const html = renderRecipeRow('Archived');

    expect(html).toContain('Xem');
    expect(html).toContain('Xóa');
    expect(html).toContain(`href="/dashboard/recipes/${recipeId}/edit"`);
    expect(html).not.toContain('Xuất bản');
    expect(html).not.toContain('Hủy xuất bản');
    expect(html).not.toContain('Lưu trữ');
    expect(html).toContain('Sửa');
  });
});
