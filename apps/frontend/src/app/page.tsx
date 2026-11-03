import type { CategoryDto, PagedResponse, RecipeSummaryDto } from "@culinary/shared";
import type { Metadata } from "next";
import { ArrowRight, Search, Timer } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CategorySidebar } from "@/components/CategorySidebar";
import { RecipeCard } from "@/components/RecipeCard";
import { apiGet, apiGetPaged } from "@/lib/api";
import { toErrorStateInfo, type ErrorStateInfo } from "@/lib/error-state";

// Trang chủ là nội dung công khai, dùng ISR theo TTL của module categories trong SRS.
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
};

// Backend có thể chưa chạy (dev local, CI build) — trang chủ vẫn phải render được,
// nên mỗi lệnh gọi tự chịu lỗi và trả về giá trị rỗng.
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

interface CategoriesResult {
  data: CategoryDto[];
  error?: ErrorStateInfo;
}

async function loadCategories(): Promise<CategoriesResult> {
  try {
    return {
      data: await apiGet<CategoryDto[]>("/categories", undefined, { next: { revalidate } }),
    };
  } catch (error) {
    return { data: [], error: toErrorStateInfo(error) };
  }
}

const emptyPage: PagedResponse<RecipeSummaryDto> = {
  data: [],
  meta: {
    totalCount: 0,
    page: 1,
    pageSize: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

export default async function HomePage() {
  const [{ data: categories, error: categoryError }, featured, quick] = await Promise.all([
    loadCategories(),
    safe(
      apiGetPaged<RecipeSummaryDto>(
        "/recipes",
        { pageSize: 6, sort: "-createdAt" },
        { cache: "no-store" },
      ),
      emptyPage,
    ),
    // pageSize 1: chỉ cần totalCount cho con số "dưới 30 phút", không cần danh sách.
    safe(
      apiGetPaged<RecipeSummaryDto>(
        "/recipes",
        { pageSize: 1, maxCookTime: 30 },
        { cache: "no-store" },
      ),
      emptyPage,
    ),
  ]);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Bữa ngon bắt đầu từ
              <span className="text-primary"> một công thức thật thà.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Mỗi món ở đây đều có thời gian chuẩn bị, thời gian nấu và từng bước thực hiện rõ ràng.
              Không bước mơ hồ, không thời gian phóng đại.
            </p>

            {/* form GET thuần: không cần JS, submit sang /search?q=… (route của FR-SRCH). */}
            <form
              action="/search"
              role="search"
              className="mt-8 grid gap-2 rounded-2xl border border-border bg-card p-2 shadow-card sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  aria-label="Tìm công thức"
                  placeholder="Tối nay bạn nấu gì?"
                  className="field border-transparent bg-transparent py-3 pl-10"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Tìm công thức
              </button>
            </form>

            {/* Số liệu lấy từ API (totalCount), không phải con số minh hoạ như mockup. */}
            {featured.meta.totalCount > 0 && (
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                <Metric value={featured.meta.totalCount} label="Công thức đã đăng" />
                {categories.length > 0 && (
                  <Metric value={categories.length} label="Danh mục" />
                )}
                {quick.meta.totalCount > 0 && (
                  <Metric value={quick.meta.totalCount} label="Món dưới 30 phút" />
                )}
              </dl>
            )}
          </div>

          <div className="relative">
            <Image
              src="/hero-kitchen.jpg"
              alt="Bàn bếp mộc với rau thơm, gia vị, dầu ô liu và rau củ nướng"
              width={1600}
              height={1100}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lift"
            />
            {quick.meta.totalCount > 0 && (
              <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-card backdrop-blur">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <Timer className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">Dưới 30 phút</p>
                  <p className="text-xs text-muted-foreground">{quick.meta.totalCount} món cho ngày thường</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <CategorySidebar categories={categories} error={categoryError} />

          <section className="min-w-0">
            <SectionHead
              title="Công thức mới nhất"
              subtitle="Những món vừa được đăng trên blog."
              href="/recipes"
              linkLabel="Tất cả công thức"
            />

            {featured.data.length > 0 ? (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.data.map((r) => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>
            ) : (
              <p className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Chưa có công thức nào được đăng. Hãy là người đầu tiên chia sẻ món của bạn.
              </p>
            )}
          </section>
        </div>

        <div className="mt-10 rounded-3xl bg-ink px-6 py-12 text-center text-ink-foreground sm:px-12">
          <h2 className="font-display text-3xl">Nấu món đáng để ghi lại</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed opacity-80">
            Có món mà bạn bè cứ hỏi cách làm? Đăng lên đây kèm thời gian, nguyên liệu và hình ảnh
            đầy đủ.
          </p>
          <Link
            href="/dashboard/recipes/new"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Viết công thức
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHead({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-3xl sm:text-4xl">{title}</h2>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex"
      >
        {linkLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-display text-2xl">{value}</span>
        <span className="block text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      </dd>
    </div>
  );
}
