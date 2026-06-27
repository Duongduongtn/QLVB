/**
 * Guard design-system: CẤM màu raw Tailwind trong src/routes + src/components.
 * Ép dùng token/class của design system (xem CLAUDE.md "Frontend — Design system").
 *
 * Kiểu RATCHET (bánh cóc): file trong `design-allowlist.txt` (legacy CHƯA migrate) chỉ
 * cảnh báo, KHÔNG fail — để CI không vỡ khi đang migrate dần. File MỚI / file đã migrate
 * (không có trong allowlist) mà còn màu raw → FAIL. Migrate xong file nào → xoá khỏi
 * allowlist; allowlist rỗng = enforce hoàn toàn.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..'); // apps/frontend
const SCAN_DIRS = ['src/routes', 'src/components'];
const ALLOWLIST_FILE = join(ROOT, 'design-allowlist.txt');

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX =
  'bg|text|border|ring|from|to|via|divide|fill|stroke|placeholder|accent|outline|decoration|shadow|caret';
const SHADE = '50|100|200|300|400|500|600|700|800|900|950';
const RAW_COLOR = new RegExp(`\\b(?:${PREFIX})-(?:${PALETTE})-(?:${SHADE})\\b`, 'g');

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const allowlist = new Set(
  existsSync(ALLOWLIST_FILE)
    ? readFileSync(ALLOWLIST_FILE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

let failed = false;
let warnFiles = 0;
const cleanAllowlisted = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const matches = readFileSync(file, 'utf8').match(RAW_COLOR) ?? [];
    const inAllow = allowlist.has(rel);
    if (matches.length === 0) {
      if (inAllow) cleanAllowlisted.push(rel);
      continue;
    }
    if (inAllow) {
      warnFiles++;
      console.warn(`⚠️  legacy (allowlisted): ${rel} — còn ${matches.length} màu raw, cần migrate sang token`);
    } else {
      failed = true;
      const uniq = [...new Set(matches)].slice(0, 8).join(', ');
      console.error(`❌  ${rel}: dùng màu raw Tailwind (${matches.length}): ${uniq}… → dùng token design-system`);
    }
  }
}

if (cleanAllowlisted.length) {
  console.warn(`\nℹ️  ${cleanAllowlisted.length} file allowlist đã SẠCH → nên xoá khỏi design-allowlist.txt:`);
  cleanAllowlisted.forEach((f) => console.warn(`   - ${f}`));
}

if (failed) {
  console.error('\n❌ check:design THẤT BẠI — màu raw Tailwind ở file KHÔNG nằm trong allowlist.');
  console.error('   Sửa: dùng token/class design-system (CLAUDE.md "Frontend — Design system").');
  process.exit(1);
}
console.log(`\n✅ check:design OK${warnFiles ? ` (${warnFiles} file legacy đang chờ migrate)` : ''}.`);
