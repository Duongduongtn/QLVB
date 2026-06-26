import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 2 đơn vị Thành Đạt — màu thương hiệu (TDD §3.2)
        gdnn: { DEFAULT: '#16a34a', soft: '#dcfce7' }, // xanh lá
        dvdl: { DEFAULT: '#7c3aed', soft: '#ede9fe' }, // tím
      },
      fontFamily: {
        sans: ['Be Vietnam Pro', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
