import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Loader2, ShieldCheck, User } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useBranding } from '~/lib/branding';
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
  const { data: branding } = useBranding();
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
    <div className="login-bg">
      <div className="w-full" style={{ maxWidth: 408 }}>
        {/* Thương hiệu (B3b — theo cấu hình app_settings) */}
        <div className="flex flex-col items-center" style={{ gap: 12, marginBottom: 28 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            {branding?.logo_file_id ? (
              <img
                src={`/api/settings/logo?v=${branding.logo_file_id}`}
                alt="Logo"
                className="object-contain"
                style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }}
              />
            ) : (
              <div className="brand-mark" aria-hidden="true" />
            )}
            <div className="flex flex-col">
              <span className="wordmark">{branding?.app_name ?? 'QLCV'}</span>
              <span className="tagline">Thành Đạt</span>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textAlign: 'center' }}>
            Hệ thống Quản lý Công văn và Ký số
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Đăng nhập
          </div>
          <h1 className="section-title" style={{ marginBottom: 20 }}>
            Chào mừng trở lại
          </h1>

          {serverError && (
            <div
              role="alert"
              className="pill pill-cancelled"
              style={{
                display: 'block',
                height: 'auto',
                padding: '8px 12px',
                marginBottom: 16,
                textDecoration: 'none',
                letterSpacing: 0,
                textTransform: 'none',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
              }}
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="username">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute"
                  style={{
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-faint)',
                  }}
                />
                <input
                  id="username"
                  className="text-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="vanthu.gdnn"
                  autoComplete="username"
                  autoFocus
                  {...register('username')}
                />
              </div>
              {errors.username && (
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' }}>
                  {errors.username.message}
                </p>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="password">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute"
                  style={{
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-faint)',
                  }}
                />
                <input
                  id="password"
                  type="password"
                  className="text-input"
                  style={{ paddingLeft: 38 }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            <label
              className="flex items-center"
              style={{ gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <input type="checkbox" className="qlcv-check" {...register('remember')} />
              <span className="text-ink-body">Ghi nhớ đăng nhập (7 ngày)</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          <div
            className="flex items-center"
            style={{ gap: 8, marginTop: 18, fontSize: '0.75rem', color: 'var(--ink-faint)' }}
          >
            <ShieldCheck size={14} />
            Sai mật khẩu 5 lần trong 15 phút sẽ bị khoá tạm thời.
          </div>
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: '0.75rem',
            color: 'var(--ink-faint)',
          }}
        >
          © 2026 Trung tâm GDNN &amp; Công ty CP DVDL Thành Đạt
        </p>
      </div>
    </div>
  );
}
