import { useEffect, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Trash2, X } from 'lucide-react';

import { api, type ApiErrorEnvelope } from '~/lib/api';
import { useAuth } from '~/stores/auth';

export const Route = createFileRoute('/danh-ba')({
  component: DanhBaPage,
});

type Role = 'recipient' | 'sender';
type Category = 'common' | 'gdnn' | 'dvdl';

interface OrgRow {
  id: number;
  full_name: string;
  short_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  note: string | null;
  is_recipient: boolean;
  is_sender: boolean;
  category: Category;
  created_at: string;
}

const PAGE_SIZE = 20;
const CATEGORY_LABEL: Record<Category, string> = {
  common: 'Chung',
  gdnn: 'Riêng GDNN',
  dvdl: 'Riêng DVDL',
};

function errMsg(error: unknown, fallback: string): string {
  return (error as ApiErrorEnvelope | undefined)?.error?.message ?? fallback;
}

function CategoryPill({ category }: { category: Category }) {
  const cls =
    category === 'gdnn'
      ? 'bg-green-50 text-green-700'
      : category === 'dvdl'
        ? 'bg-violet-50 text-violet-700'
        : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{CATEGORY_LABEL[category]}</span>;
}

function DanhBaPage() {
  const me = useAuth((s) => s.user);
  const [role, setRole] = useState<Role>('recipient');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Debounce ô tìm → không bắn request mỗi ký tự gõ.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const orgsQuery = useQuery({
    queryKey: ['organizations', role, debouncedQ, category, page],
    enabled: !!me,
    staleTime: 30_000, // danh bạ ít đổi → đỡ refetch thừa khi focus/remount
    queryFn: async () => {
      const { data, error } = await api.GET('/api/organizations', {
        params: {
          query: {
            role,
            q: debouncedQ || undefined,
            category: role === 'recipient' && category !== 'all' ? category : undefined,
            page,
            size: PAGE_SIZE,
          },
        },
      });
      if (error || !data) throw new Error(errMsg(error, 'Không tải được danh bạ'));
      return data as { items: OrgRow[]; total: number };
    },
  });

  if (!me) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-slate-500">Đang tải…</p>
      </div>
    );
  }

  const items = orgsQuery.data?.items ?? [];
  const total = orgsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function switchRole(r: Role) {
    setRole(r);
    setPage(1);
    setCategory('all');
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Danh bạ</p>
          <h2 className="text-2xl font-semibold text-slate-800">Danh bạ cơ quan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý nơi nhận công văn đi và cơ quan gửi công văn đến.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500"
        >
          <Plus size={16} />
          Thêm cơ quan
        </button>
      </div>

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          <SegButton active={role === 'recipient'} onClick={() => switchRole('recipient')}>
            Nơi nhận (CV đi)
          </SegButton>
          <SegButton active={role === 'sender'} onClick={() => switchRole('sender')}>
            Cơ quan gửi (CV đến)
          </SegButton>
        </div>
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm cơ quan…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        {role === 'recipient' && (
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category | 'all');
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="common">Chung</option>
            <option value="gdnn">Riêng GDNN</option>
            <option value="dvdl">Riêng DVDL</option>
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tên cơ quan</th>
              <th className="px-4 py-3 font-medium">Viết tắt</th>
              <th className="px-4 py-3 font-medium">Địa chỉ</th>
              {role === 'recipient' && <th className="px-4 py-3 font-medium">Phân loại</th>}
              <th className="px-4 py-3 font-medium">Liên hệ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgsQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Đang tải…</td>
              </tr>
            )}
            {!orgsQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chưa có cơ quan nào trong danh bạ.
                </td>
              </tr>
            )}
            {items.map((o) => (
              <tr
                key={o.id}
                tabIndex={0}
                onClick={() => setSelected(o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(o);
                  }
                }}
                className="cursor-pointer hover:bg-amber-50/50 focus:bg-amber-50 focus:outline-none"
              >
                <td className="px-4 py-3 font-medium text-slate-800">{o.full_name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{o.short_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.address ?? '—'}</td>
                {role === 'recipient' && (
                  <td className="px-4 py-3">
                    <CategoryPill category={o.category} />
                  </td>
                )}
                <td className="px-4 py-3 text-slate-600">{o.contact_person ?? o.phone ?? o.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-slate-500">Trang {page}/{totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}

      {creating && <OrgDrawer role={role} onClose={() => setCreating(false)} />}
      {selected && <OrgDrawer role={role} org={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Danh bạ cơ quan</p>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const fieldClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

const orgSchema = z.object({
  full_name: z.string().trim().min(1, 'Nhập tên cơ quan').max(300),
  short_name: z.string().max(150).optional(),
  category: z.enum(['common', 'gdnn', 'dvdl']),
  address: z.string().max(500).optional(),
  email: z.string().email('Email không hợp lệ').or(z.literal('')),
  phone: z.string().max(30).optional(),
  contact_person: z.string().max(150).optional(),
  note: z.string().max(2000).optional(),
});
type OrgValues = z.infer<typeof orgSchema>;

function OrgDrawer({ role, org, onClose }: { role: Role; org?: OrgRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!org;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      full_name: org?.full_name ?? '',
      short_name: org?.short_name ?? '',
      category: org?.category ?? 'common',
      address: org?.address ?? '',
      email: org?.email ?? '',
      phone: org?.phone ?? '',
      contact_person: org?.contact_person ?? '',
      note: org?.note ?? '',
    },
  });

  async function onSubmit(values: OrgValues) {
    setServerError(null);
    const body = {
      full_name: values.full_name,
      short_name: values.short_name || null,
      category: values.category,
      address: values.address || null,
      email: values.email || null,
      phone: values.phone || null,
      contact_person: values.contact_person || null,
      note: values.note || null,
    };
    if (isEdit) {
      const { error } = await api.PUT('/api/organizations/{org_id}', {
        params: { path: { org_id: org!.id } },
        body,
      });
      if (error) {
        setServerError(errMsg(error, 'Lưu thất bại'));
        return;
      }
    } else {
      const { error } = await api.POST('/api/organizations', { body: { ...body, role } });
      if (error) {
        setServerError(errMsg(error, 'Tạo cơ quan thất bại'));
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    onClose();
  }

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE('/api/organizations/{org_id}', {
        params: { path: { org_id: org!.id } },
      });
      if (error) throw new Error(errMsg(error, 'Xoá thất bại'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onClose();
    },
    onError: (e: Error) => setServerError(e.message),
  });

  function confirmDelete() {
    if (window.confirm(`Xoá cơ quan "${org!.full_name}"? Cơ quan sẽ bị ẩn nhưng CV cũ vẫn giữ liên kết.`)) {
      remove.mutate();
    }
  }

  return (
    <Drawer title={isEdit ? org!.full_name : 'Thêm cơ quan'} onClose={onClose}>
      {serverError && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="o_name">Tên đầy đủ</label>
          <input id="o_name" className={fieldClass} placeholder="Tên cơ quan…" {...register('full_name')} />
          {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
        </div>
        <div className={role === 'recipient' ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label className={labelClass} htmlFor="o_short">Viết tắt</label>
            <input id="o_short" className={fieldClass} {...register('short_name')} />
          </div>
          {/* Phân loại chỉ áp dụng cho nơi nhận (M1) — cơ quan gửi không phân loại đơn vị. */}
          {role === 'recipient' && (
            <div>
              <label className={labelClass} htmlFor="o_cat">Phân loại</label>
              <select id="o_cat" className={fieldClass} {...register('category')}>
                <option value="common">Chung</option>
                <option value="gdnn">Riêng GDNN</option>
                <option value="dvdl">Riêng DVDL</option>
              </select>
            </div>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="o_addr">Địa chỉ</label>
          <input id="o_addr" className={fieldClass} {...register('address')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="o_email">Email</label>
            <input id="o_email" className={fieldClass} placeholder="email@coquan.gov.vn" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="o_phone">Điện thoại</label>
            <input id="o_phone" className={fieldClass} placeholder="0123 456 789" {...register('phone')} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="o_contact">Người liên hệ</label>
          <input id="o_contact" className={fieldClass} {...register('contact_person')} />
        </div>
        <div>
          <label className={labelClass} htmlFor="o_note">Ghi chú</label>
          <textarea id="o_note" rows={2} className={fieldClass} {...register('note')} />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          {isEdit && (
            <button
              type="button"
              onClick={confirmDelete}
              disabled={remove.isPending}
              className="mr-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={15} />
              Xoá
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-60"
          >
            {isEdit ? 'Lưu' : 'Tạo cơ quan'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
