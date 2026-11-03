"use client";

import { ChefHat, ChevronDown, LogIn, LogOut, Menu, PenLine, Search, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout, useSession } from "@/lib/auth";
import { canManageRecipes } from "@/lib/recipe-dashboard";

const links = [
  { href: "/", label: "Trang chủ" },
  { href: "/recipes", label: "Công thức" },
  { href: "/categories", label: "Danh mục" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [query, setQuery] = useState("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const showRecipeDashboard = canManageRecipes(session?.user.role);
  const isAdmin = session?.user.role === 'Admin';

  useEffect(() => {
    if (!profileMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenu]);

  // Link "/" chỉ active khi đúng trang chủ; các link khác active cả trang con.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-10 py-3 sm:px-16 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-0 xl:px-20 2xl:max-w-[1600px] 2xl:px-24">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </span>
          <span className="truncate font-display text-lg font-semibold tracking-tight">
            Culinary Blog
          </span>
        </Link>

        <nav className="hidden w-full items-center justify-evenly whitespace-nowrap xl:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-foreground ${
                isActive(l.href) ? "bg-primary-soft text-foreground" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {showRecipeDashboard && (
            <Link
              href="/dashboard"
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-foreground ${
                pathname === "/dashboard" ? "bg-primary-soft text-foreground" : "text-muted-foreground"
              }`}
            >
              Tổng quan
            </Link>
          )}
          {isAdmin && (
            <Link href="/dashboard/users" aria-current={isActive('/dashboard/users') ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-foreground ${isActive('/dashboard/users') ? 'bg-primary-soft text-foreground' : 'text-muted-foreground'}`}>Người dùng</Link>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <form onSubmit={submitSearch} className="relative hidden 2xl:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm công thức…"
              aria-label="Tìm công thức"
              className="field w-52 pl-9"
            />
          </form>

          <Link href="/search" aria-label="Tìm công thức" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border xl:inline-flex 2xl:hidden">
            <Search className="h-4 w-4" aria-hidden />
          </Link>

          <Link
            href="/dashboard/recipes/new"
            className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 2xl:inline-flex"
          >
            <PenLine className="h-4 w-4" />
            Viết công thức
          </Link>

          {session ? (
            <div ref={profileMenuRef} className="relative min-w-0">
              <button
                type="button"
                onClick={() => { setProfileMenu((value) => !value); setOpen(false); }}
                aria-label={`Tài khoản của ${session.user.displayName}`}
                aria-expanded={profileMenu}
                aria-controls="profile-menu"
                className="inline-flex h-11 max-w-36 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:max-w-52"
              >
                <User className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{session.user.displayName}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${profileMenu ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {profileMenu && (
                <div id="profile-menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium">{session.user.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <Link href="/profile" onClick={() => setProfileMenu(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><User className="h-4 w-4" />Trang cá nhân</Link>
                  <button type="button" onClick={() => { setProfileMenu(false); void logout().then(() => router.push('/')); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><LogOut className="h-4 w-4" />Đăng xuất</button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng nhập</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu điều hướng"
            aria-expanded={open}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border xl:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-4 py-3 xl:hidden">
          <form onSubmit={submitSearch} className="relative mb-3" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm công thức…"
              aria-label="Tìm công thức"
              className="field pl-9"
            />
          </form>
          <nav className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(l.href) ? "page" : undefined}
                className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            {showRecipeDashboard && (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Tổng quan
              </Link>
            )}
            {isAdmin && <Link href="/dashboard/users" onClick={() => setOpen(false)} aria-current={isActive('/dashboard/users') ? 'page' : undefined} className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Quản lý người dùng</Link>}
            <Link
              href="/dashboard/recipes/new"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium text-accent"
            >
              Viết công thức
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
