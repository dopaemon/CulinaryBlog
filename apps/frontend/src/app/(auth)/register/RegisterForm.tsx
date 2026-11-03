'use client';

import { ChefHat, Lock, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { register } from '@/lib/auth';
import { registerErrorMessage, validateRegister, type RegisterFieldErrors } from './helpers';

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:py-20">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
        <ChefHat className="h-6 w-6" />
      </span>
      <h1 className="mt-6 text-center font-display text-3xl">Gia nhập gian bếp</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Viết công thức, lưu bản nháp, đăng khi sẵn sàng.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const errors = validateRegister(displayName, email, password, username);
            setFieldErrors(errors);
            if (Object.keys(errors).length > 0) return;

            setSubmitting(true);
            try {
              await register(displayName.trim(), username, email, password);
              router.push('/profile');
            } catch (err) {
              const { field, message } = registerErrorMessage(err);
              if (field) setFieldErrors((prev) => ({ ...prev, [field]: message }));
              else setError(message);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Họ và tên</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="field py-3 pl-10"
                placeholder="Hannah Fields"
              />
            </div>
            {fieldErrors.displayName && <p className="mt-1 text-sm text-destructive">{fieldErrors.displayName}</p>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Tên đăng nhập</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="field py-3 pl-10" placeholder="ten_dang_nhap" />
            </div>
            {fieldErrors.username && <p className="mt-1 text-sm text-destructive">{fieldErrors.username}</p>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field py-3 pl-10"
                placeholder="you@example.com"
              />
            </div>
            {fieldErrors.email && <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Mật khẩu</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field py-3 pl-10"
                placeholder="Ít nhất 8 ký tự"
              />
            </div>
            {fieldErrors.password && <p className="mt-1 text-sm text-destructive">{fieldErrors.password}</p>}
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-semibold text-primary">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
