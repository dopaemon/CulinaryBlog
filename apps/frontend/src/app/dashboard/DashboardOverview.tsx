'use client';

import type { RecipeSummaryDto, RecipeStatus, UserListItemDto } from '@culinary/shared';
import { Archive, BookOpen, FilePenLine, Plus, Tags, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiAuthedPaged, useSession } from '@/lib/auth';
import { buildRecipeListParams } from '@/lib/recipe-dashboard';

const statuses: { status: RecipeStatus; label: string; Icon: typeof BookOpen }[] = [
  { status: 'Draft', label: 'Bản nháp', Icon: FilePenLine },
  { status: 'Published', label: 'Đã xuất bản', Icon: BookOpen },
  { status: 'Archived', label: 'Đã lưu trữ', Icon: Archive },
];

export function DashboardOverview() {
  const session = useSession();
  const role = session?.user.role;
  const [counts, setCounts] = useState<Partial<Record<RecipeStatus, number>>>({});
  const [userCount, setUserCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!role) return;
    let active = true;
    const load = async () => {
      try {
        const recipes = await Promise.all(statuses.map(async ({ status }) => {
          const params = buildRecipeListParams(role, 1, 1, status);
          const result = await apiAuthedPaged<RecipeSummaryDto>(`/recipes?${params}`, { cache: 'no-store' });
          return [status, result.meta.totalCount] as const;
        }));
        if (active) setCounts(Object.fromEntries(recipes));
        if (role === 'Admin') {
          const users = await apiAuthedPaged<UserListItemDto>('/users?page=1&pageSize=1', { cache: 'no-store' });
          if (active) setUserCount(users.meta.totalCount);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    return () => { active = false; };
  }, [role]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Studio</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Tổng quan</h1>
          <p className="mt-2 text-sm text-muted-foreground">Xin chào, {session?.user.displayName}. Theo dõi nội dung của Culinary Blog tại đây.</p>
        </div>
        <Link href="/dashboard/recipes/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Tạo công thức</Link>
      </header>

      {error && <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">Không thể tải số liệu. Vui lòng tải lại trang.</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {statuses.map(({ status, label, Icon }) => (
          <Link key={status} href={`/dashboard/recipes?status=${status}`} className="rounded-2xl border border-border bg-card p-6 shadow-card transition-colors hover:bg-secondary">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <p className="mt-5 text-3xl font-semibold">{counts[status] ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/recipes" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm font-semibold shadow-card hover:bg-secondary"><BookOpen className="h-5 w-5 text-primary" />Quản lý công thức</Link>
        {role === 'Admin' && <>
          <Link href="/dashboard/categories" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm font-semibold shadow-card hover:bg-secondary"><Tags className="h-5 w-5 text-primary" />Quản lý danh mục</Link>
          <Link href="/dashboard/users" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm font-semibold shadow-card hover:bg-secondary"><Users className="h-5 w-5 text-primary" />Người dùng {userCount === null ? '' : `(${userCount})`}</Link>
        </>}
      </div>
    </main>
  );
}
