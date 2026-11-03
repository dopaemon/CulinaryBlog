import type { RecipeStatus, UserRole } from '@culinary/shared';
import { ApiError } from './api';

export const RECIPE_DASHBOARD_STATUSES: Array<{
  value?: RecipeStatus;
  label: string;
}> = [
  { label: 'Tất cả' },
  { value: 'Published', label: 'Đã xuất bản' },
  { value: 'Draft', label: 'Bản nháp' },
  { value: 'Archived', label: 'Đã lưu trữ' },
];

export type RecipeDashboardAction =
  | 'publish'
  | 'edit'
  | 'unpublish'
  | 'archive'
  | 'view'
  | 'delete';

export type RecipeMutationAction = 'publish' | 'unpublish' | 'archive' | 'delete';

export function buildRecipeMutationRequest(
  recipeId: string,
  action: RecipeMutationAction,
): { path: string; method: 'PATCH' | 'DELETE' } {
  const id = encodeURIComponent(recipeId);
  return action === 'delete'
    ? { path: `/recipes/${id}`, method: 'DELETE' }
    : { path: `/recipes/${id}/${action}`, method: 'PATCH' };
}

export function confirmRecipeDeletion(
  title: string,
  confirm: (message: string) => boolean,
  onConfirm: () => void,
): void {
  if (confirm(`Xóa “${title}”? Thao tác này không thể hoàn tác.`)) onConfirm();
}

export function recipeDashboardErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
  }
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return 'Công thức không còn tồn tại. Danh sách sẽ được tải lại.';
  if (error.problem?.type === 'RECIPE_PUBLISH_INCOMPLETE') {
    return 'Hãy thêm ít nhất một bước thực hiện trước khi xuất bản công thức.';
  }
  if (error.problem?.type === 'RECIPE_INVALID_STATUS_TRANSITION') {
    return 'Trạng thái công thức đã thay đổi. Hãy tải lại danh sách.';
  }
  if (error.status === 409) return 'Công thức vừa được cập nhật ở nơi khác. Hãy tải lại danh sách.';
  return error.message || 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

const actionsByStatus: Record<RecipeStatus, RecipeDashboardAction[]> = {
  Draft: ['publish', 'edit', 'view', 'delete'],
  Published: ['unpublish', 'archive', 'edit', 'view', 'delete'],
  Archived: ['edit', 'view', 'delete'],
};

export function getRecipeDashboardActions(
  status: RecipeStatus,
): RecipeDashboardAction[] {
  return actionsByStatus[status];
}

export function canManageRecipes(role?: UserRole): boolean {
  return role === 'Author' || role === 'Admin';
}

export function normalizeDashboardStatus(
  value: string | null,
): RecipeStatus | undefined {
  return value === 'Draft' || value === 'Published' || value === 'Archived'
    ? value
    : undefined;
}

export function normalizeDashboardPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function buildDashboardHref(
  page: number,
  status?: RecipeStatus,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `/dashboard/recipes?${query}` : '/dashboard/recipes';
}

export function buildRecipeListParams(
  role: UserRole,
  page: number,
  pageSize: number,
  status?: RecipeStatus,
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (role === 'Author') params.set('mine', 'true');
  if (status) params.set('status', status);
  return params;
}
