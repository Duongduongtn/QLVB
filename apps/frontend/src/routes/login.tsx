import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Loader2, ShieldCheck, User } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth, type Role } from '~/stores/auth';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

const schema = z.object({
  username: z.string().min(1, 'Nhập tên đăng nhập'),
  password: z.string().min(1, 'Nhập mật khẩu'),
  remember: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Mặc định KHÔNG tick → phiên 8h (PRD A1); tick mới 7 ngày.
    defaultValues: { username: '', password: '', remember: false },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const { data, error } = await api.POST('/api/auth/login', { body: values });
      if (error || !data) {
        const env = error as unknown as ApiErrorEnvelope | undefined;
        setServerError(env?.error?.message ?? 'Đăng nhập thất bại, vui lòng thử lại.');
        return;
      }
      const user = { ...data, role: data.role as Role };
      setUser(user);
      // Đồng bộ cache ['me'] để __root không refetch cũ sau khi đăng nhập.
      queryClient.setQueryData(['me'], user);
      navigate({ to: '/' });
    } catch {
      setServerError('Mất kết nối máy chủ, vui lòng thử lại.');
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-[408px]">
        {/* Thương hiệu */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-block h-9 w-9 rounded-md bg-amber-400" aria-hidden="true" />
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold tracking-widest text-slate-800">QLCV</span>
              <span className="text-xs uppercase tracking-[0.2em] text-amber-600">Thành Đạt</span>
            </div>
          </div>
          <p className="text-sm text-slate-500">Hệ thống Quản lý Công văn và Ký số</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
            Đăng nhập
          </p>
          <h1 className="mb-5 text-xl font-semibold text-slate-800">Chào mừng trở lại</h1>

          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-4">
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="username"
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  placeholder="vanthu.gdnn"
                  autoComplete="username"
                  autoFocus
                  {...register('username')}
                />
              </div>
              {errors.username && (
                <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="password"
                  type="password"
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-300"
                {...register('remember')}
              />
              Ghi nhớ đăng nhập (7 ngày)
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-400 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} />
            Sai mật khẩu 5 lần trong 15 phút sẽ bị khoá tạm thời.
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          © 2026 Trung tâm GDNN &amp; Công ty CP DVDL Thành Đạt
        </p>
      </div>
    </div>
  );
}
