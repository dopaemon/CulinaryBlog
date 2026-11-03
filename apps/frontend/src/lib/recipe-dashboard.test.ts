import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import {
  buildRecipeMutationRequest,
  buildDashboardHref,
  buildRecipeListParams,
  canManageRecipes,
  confirmRecipeDeletion,
  getRecipeDashboardActions,
  normalizeDashboardPage,
  normalizeDashboardStatus,
  recipeDashboardErrorMessage,
} from './recipe-dashboard';

describe('recipe dashboard requirements', () => {
  it('normalizes page and status query values', () => {
    expect(normalizeDashboardPage('3')).toBe(3);
    expect(normalizeDashboardPage('0')).toBe(1);
    expect(normalizeDashboardPage('999999999999999999')).toBe(1);

    expect(normalizeDashboardStatus('Archived')).toBe('Archived');
    expect(normalizeDashboardStatus('unknown')).toBeUndefined();
  });

  it('keeps status in page links and resets page when status changes', () => {
    expect(buildDashboardHref(4, 'Draft')).toBe(
      '/dashboard/recipes?page=4&status=Draft',
    );
    expect(buildDashboardHref(1, 'Published')).toBe(
      '/dashboard/recipes?status=Published',
    );
    expect(buildDashboardHref(1)).toBe('/dashboard/recipes');
  });

  it('requests only the Author’s recipes while Admin sees the full list', () => {
    const authorParams = buildRecipeListParams('Author', 2, 12, 'Archived');
    expect(authorParams.toString()).toBe(
      'page=2&pageSize=12&mine=true&status=Archived',
    );

    const adminParams = buildRecipeListParams('Admin', 1, 12, 'Draft');
    expect(adminParams.toString()).toBe('page=1&pageSize=12&status=Draft');
  });

  it('shows management navigation only to Authors and Admins', () => {
    expect(canManageRecipes('Author')).toBe(true);
    expect(canManageRecipes('Admin')).toBe(true);
    expect(canManageRecipes(undefined)).toBe(false);
  });

  it('allows only SRS-valid actions for each recipe status', () => {
    expect(getRecipeDashboardActions('Draft')).toEqual([
      'publish',
      'edit',
      'view',
      'delete',
    ]);
    expect(getRecipeDashboardActions('Published')).toEqual([
      'unpublish',
      'archive',
      'edit',
      'view',
      'delete',
    ]);
    expect(getRecipeDashboardActions('Archived')).toEqual(['edit', 'view', 'delete']);
  });

  it('calls the delete action only after confirmation', () => {
    const cancelDelete = vi.fn();
    const confirm = vi.fn().mockReturnValue(false);

    confirmRecipeDeletion('Bánh mì', confirm, cancelDelete);

    expect(confirm).toHaveBeenCalledWith(
      'Xóa “Bánh mì”? Thao tác này không thể hoàn tác.',
    );
    expect(cancelDelete).not.toHaveBeenCalled();

    const acceptDelete = vi.fn();
    confirmRecipeDeletion('Bánh mì', () => true, acceptDelete);
    expect(acceptDelete).toHaveBeenCalledOnce();
  });

  it('maps each recipe mutation to its API method and URL', () => {
    expect(buildRecipeMutationRequest('recipe/id', 'delete')).toEqual({
      path: '/recipes/recipe%2Fid',
      method: 'DELETE',
    });
    expect(buildRecipeMutationRequest('recipe-1', 'publish')).toEqual({
      path: '/recipes/recipe-1/publish',
      method: 'PATCH',
    });
    expect(buildRecipeMutationRequest('recipe-1', 'unpublish')).toEqual({
      path: '/recipes/recipe-1/unpublish',
      method: 'PATCH',
    });
    expect(buildRecipeMutationRequest('recipe-1', 'archive')).toEqual({
      path: '/recipes/recipe-1/archive',
      method: 'PATCH',
    });
  });

  it('maps API authorization, missing recipe, transition and concurrency errors', () => {
    expect(recipeDashboardErrorMessage(new ApiError(401, null))).toContain('đăng nhập');
    expect(recipeDashboardErrorMessage(new ApiError(403, null))).toContain('quyền');
    expect(recipeDashboardErrorMessage(new ApiError(404, null))).toContain('không còn tồn tại');
    expect(recipeDashboardErrorMessage(new ApiError(409, null))).toContain('cập nhật ở nơi khác');
    expect(
      recipeDashboardErrorMessage(
        new ApiError(422, {
          type: 'RECIPE_PUBLISH_INCOMPLETE',
          title: 'Chưa đủ điều kiện',
          status: 422,
          detail: 'RECIPE_PUBLISH_INCOMPLETE',
        }),
      ),
    ).toContain('ít nhất một bước');
    expect(
      recipeDashboardErrorMessage(
        new ApiError(422, {
          type: 'RECIPE_INVALID_STATUS_TRANSITION',
          title: 'Không hợp lệ',
          status: 422,
          detail: 'RECIPE_INVALID_STATUS_TRANSITION',
        }),
      ),
    ).toContain('Trạng thái công thức đã thay đổi');
  });
});
