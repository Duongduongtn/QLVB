/**
 * Helper format VN — CORE_RULES: dd/mm/yyyy, phân cách `.`, thập phân `,`.
 * Tái sử dụng MỌI NƠI để tránh mỗi component format kiểu riêng.
 */
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

dayjs.locale('vi');

export const fmtDate = (d: string | Date | null | undefined): string =>
  d ? dayjs(d).format('DD/MM/YYYY') : '';

export const fmtDateTime = (d: string | Date | null | undefined): string =>
  d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '';

const nfInt = new Intl.NumberFormat('vi-VN');
const nfDec = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const fmtInt = (n: number | null | undefined): string =>
  n == null ? '' : nfInt.format(n);

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? '' : nfDec.format(n);

export const fmtVnd = (n: number | null | undefined): string =>
  n == null ? '' : `${nfInt.format(n)} VND`;
