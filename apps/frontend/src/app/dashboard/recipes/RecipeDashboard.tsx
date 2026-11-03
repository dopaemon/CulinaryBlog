'use client';

import type { RecipeStatus, RecipeSummaryDto } from '@culinary/shared';
import { Archive, CheckCircle2, ChefHat, Eye, EyeOff, Loader2, PenLine, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/Pagination';
import { ErrorState } from '@/components/ErrorState';
import { ApiError } from '@/lib/api';
import { apiAuthed, apiAuthedPaged, useSession } from '@/lib/auth';
import {
  buildRecipeMutationRequest,
  buildDashboardHref,
  buildRecipeListParams,
  confirmRecipeDeletion,
  getRecipeDashboardActions,
  normalizeDashboardPage,
  normalizeDashboardStatus,
  recipeDashboardErrorMessage,
  RECIPE_DASHBOARD_STATUSES,
  type RecipeMutationAction,
} from '@/lib/recipe-dashboard';

const PAGE_SIZE = 12;

interface RecipeListState {
  queryKey: string;
  recipes: RecipeSummaryDto[];
  totalCount: number;
  totalPages: number;
  error: string | null;
}

const statusTone: Record<RecipeStatus, string> = {
  Published: 'bg-accent-soft text-accent',
  Draft: 'bg-primary-soft text-primary',
  Archived: 'bg-secondary text-secondary-foreground',
};

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return 'Chưa có ngày cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có ngày cập nhật';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

export function RecipeDashboard() {
  const session = useSession();
  const role = session?.user.role;
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = normalizeDashboardPage(searchParams.get('page'));
  const status = normalizeDashboardStatus(searchParams.get('status'));
  const queryKey = `${role ?? 'none'}:${page}:${status ?? 'all'}`;
  const [listState, setListState] = useState<RecipeListState | null>(null);
  const latestRequestId = useRef(0);
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const currentList = listState?.queryKey === queryKey ? listState : null;
  const isLoading = currentList === null;
  const recipes = currentList?.recipes ?? [];
  const totalCount = currentList?.totalCount ?? 0;
  const totalPages = currentList?.totalPages ?? 0;
  const loadError = currentList?.error ?? null;

  const fetchRecipes = useCallback(async () => {
    if (!role) return;
    const requestId = ++latestRequestId.current;
    const requestQueryKey = `${role}:${page}:${status ?? 'all'}`;
    const params = buildRecipeListParams(role, page, PAGE_SIZE, status);

    try {
      const result = await apiAuthedPaged<RecipeSummaryDto>(`/recipes?${params.toString()}`, {
        cache: 'no-store',
      });
      const lastPage = Math.max(result.meta.totalPages, 1);
      if (page > lastPage) {
        router.replace(buildDashboardHref(lastPage, status));
        return;
      }
      if (requestId !== latestRequestId.current) return;
      setListState({
        queryKey: requestQueryKey,
        recipes: result.data,
        totalCount: result.meta.totalCount,
        totalPages: result.meta.totalPages,
        error: null,
      });
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setListState({
        queryKey: requestQueryKey,
        recipes: [],
        totalCount: 0,
        totalPages: 0,
        error: recipeDashboardErrorMessage(error),
      });
    }
  }, [latestRequestId, page, role, router, status]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return fetchRecipes();
      return undefined;
    });
    return () => {
      active = false;
      latestRequestId.current += 1;
    };
  }, [fetchRecipes]);

  function changeStatus(nextStatus?: RecipeStatus) {
    setActionError(null);
    setNotice(null);
    router.push(buildDashboardHref(1, nextStatus));
  }

  async function runAction(recipe: RecipeSummaryDto, action: RecipeMutationAction) {
    setBusyRecipeId(recipe.id);
    setActionError(null);
    setNotice(null);
    try {
      const request = buildRecipeMutationRequest(recipe.id, action);
      await apiAuthed<unknown>(request.path, { method: request.method });
      if (action === 'delete') {
        setNotice(`Đã xóa “${recipe.title}”.`);
      } else {
        const messages = {
          publish: `Đã xuất bản “${recipe.title}”.`,
          unpublish: `Đã chuyển “${recipe.title}” về bản nháp.`,
          archive: `Đã lưu trữ “${recipe.title}”.`,
        };
        setNotice(messages[action]);
      }
      await fetchRecipes();
      router.refresh();
    } catch (error) {
      setActionError(recipeDashboardErrorMessage(error));
      if (error instanceof ApiError && error.status === 404) await fetchRecipes();
    } finally {
      setBusyRecipeId(null);
    }
  }

  const isAdmin = role === 'Admin';
  const heading = isAdmin ? 'Tất cả công thức' : 'Công thức của bạn';

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Studio</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdmin ? 'Quản lý công thức trên Culinary Blog.' : 'Theo dõi và quản lý các công thức bạn đã tạo.'}
          </p>
        </div>
        <Link
          href="/dashboard/recipes/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Tạo công thức
        </Link>
      </header>

      {notice && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {notice}
        </div>
      )}
      {actionError && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{actionError}</p>}

      <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Lọc trạng thái công thức">
        {RECIPE_DASHBOARD_STATUSES.map((item) => {
          const active = item.value === status;
          return (
            <button
              key={item.value ?? 'all'}
              type="button"
              onClick={() => changeStatus(item.value)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>{isLoading ? 'Đang tải…' : `${totalCount} công thức`}</p>
        {page > 1 && <p>Trang {page}{totalPages ? ` / ${totalPages}` : ''}</p>}
      </div>

      {loadError ? (
        <ErrorState
          title="Không thể tải danh sách"
          message={loadError}
          onRetry={() => {
            setListState(null);
            void fetchRecipes();
          }}
          className="mt-6 max-w-none"
        />
      ) : isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground" aria-busy="true">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" aria-hidden />
          Đang tải công thức…
        </div>
      ) : recipes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl">Chưa có công thức trong mục này</p>
          <p className="mt-2 text-sm text-muted-foreground">Tạo công thức mới để bắt đầu quản lý nội dung của bạn.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              busy={busyRecipeId === recipe.id}
              onAction={(action) => void runAction(recipe, action)}
            />
          ))}
        </div>
      )}

      {!loadError && !isLoading && totalPages > 1 && (
        <Pagination
          meta={{
            page,
            pageSize: PAGE_SIZE,
            totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          }}
          hrefForPage={(nextPage) => buildDashboardHref(nextPage, status)}
          label="Phân trang danh sách công thức"
        />
      )}
    </main>
  );
}

type RecipeAction = 'publish' | 'unpublish' | 'archive' | 'delete';

export function RecipeRow({
  recipe,
  busy,
  onAction,
}: {
  recipe: RecipeSummaryDto;
  busy: boolean;
  onAction: (action: RecipeAction) => void;
}) {
  const availableActions = getRecipeDashboardActions(recipe.status);

  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:grid-cols-[112px_minmax(0,1fr)] sm:p-5">
      {recipe.coverImageUrl ? (
        // API image URLs are supplied by the recipe service and are not bundled assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={recipe.coverImageUrl} alt={recipe.title} loading="lazy" className="h-28 w-full rounded-xl object-cover sm:h-full" />
      ) : (
        <div className="grid h-28 place-items-center rounded-xl bg-secondary text-muted-foreground sm:h-full" aria-hidden>
          <ChefHat className="h-8 w-8" />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[recipe.status]}`}>
            {recipe.status === 'Published' ? 'Đã xuất bản' : recipe.status === 'Draft' ? 'Bản nháp' : 'Đã lưu trữ'}
          </span>
          <span className="text-xs text-muted-foreground">
            {recipe.category.name} · Cập nhật {formatUpdatedAt(recipe.updatedAt)}
          </span>
        </div>
        <h2 className="mt-2 font-display text-xl leading-snug">{recipe.title}</h2>
        {recipe.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{recipe.excerpt}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {availableActions.includes('publish') && (
            <ActionButton label="Xuất bản" primary disabled={busy} onClick={() => onAction('publish')}>
              <Eye className="h-4 w-4" aria-hidden />
            </ActionButton>
          )}
          {availableActions.includes('edit') && (
            <Link href={`/dashboard/recipes/${encodeURIComponent(recipe.id)}/edit`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary">
              <PenLine className="h-4 w-4" aria-hidden />
              Sửa
            </Link>
          )}
          {availableActions.includes('unpublish') && (
            <>
              <ActionButton label="Hủy xuất bản" disabled={busy} onClick={() => onAction('unpublish')}>
                <EyeOff className="h-4 w-4" aria-hidden />
              </ActionButton>
            </>
          )}
          {availableActions.includes('archive') && (
            <ActionButton label="Lưu trữ" disabled={busy} onClick={() => onAction('archive')}>
              <Archive className="h-4 w-4" aria-hidden />
            </ActionButton>
          )}
          {availableActions.includes('view') && (
            <Link href={`/recipes/${encodeURIComponent(recipe.slug)}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary">
              <Eye className="h-4 w-4" aria-hidden />
              Xem
            </Link>
          )}
          {availableActions.includes('delete') && (
            <ActionButton label="Xóa" danger disabled={busy} onClick={() => {
              confirmRecipeDeletion(
                recipe.title,
                (message) => window.confirm(message),
                () => onAction('delete'),
              );
            }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            </ActionButton>
          )}
        </div>
      </div>
    </article>
  );
}

function ActionButton({
  label,
  onClick,
  children,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const tone = primary
    ? 'bg-primary text-primary-foreground'
    : danger
      ? 'border border-border bg-card text-destructive hover:bg-destructive/10'
      : 'border border-border bg-card hover:bg-secondary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${tone}`}
    >
      {children}
      {label}
    </button>
  );
}
