# 📐 Prompt PRECISE — Danh sách Công văn đi (D6)

> Phiên bản RÕ RÀNG. Mục tiêu: AI generate đúng y chang, không tự sáng tạo.
> Copy nguyên block dưới vào v0.dev / Claude / Cursor để render.

---

## Context

Bạn đang xây dựng UI cho **QLCV — Hệ thống Quản lý Công văn và Ký số** của 2 đơn vị nội bộ Thành Đạt (TT GDNN + Cty CP DVDL). App dùng nội bộ ~5 user (2 Quản lý + 3 Nhân viên), chạy hàng ngày trong văn phòng. **App nội bộ tiếng Việt có dấu đầy đủ.**

Design system: **Impeccable "Neo Kinpaku"**, light variant (paper-based) — đây là design system editorial, restraint, opinionated. KHÔNG dùng dark theme cho app này (văn phòng dùng ánh sáng mạnh cả ngày).

Render với **Next.js 14 + Tailwind CSS + TypeScript**. Không dùng shadcn default styles — tự build component theo token bên dưới. Không dùng emoji icons, không dùng gradient/glass/neon/glow.

---

## Layout 3-zone

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER 64px height — sticky                                      │
├────────────┬─────────────────────────────────────────────────────┤
│            │                                                     │
│  SIDEBAR   │                                                     │
│  256px     │              CONTENT                                │
│  fixed     │              max-width 1320px                       │
│            │              padding-x 48px                         │
│            │                                                     │
│            │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

---

## Tokens (OKLCH only, KHÔNG dùng hex)

### Surfaces (light/paper)
- `--paper`: `oklch(97% 0.012 95)` — page ground
- `--paper-raised`: `oklch(99% 0.008 95)` — cards, table rows
- `--paper-deep`: `oklch(94% 0.014 95)` — sidebar bg, hover row
- `--light-graphite`: `oklch(91% 0.012 95)` — input bg, badge bg
- `--light-graphite-2`: `oklch(88% 0.014 95)` — dividers strong

### Text
- `--ink`: `oklch(18% 0.02 95)` — headings, strong
- `--ink-body`: `oklch(25% 0.018 95)` — body
- `--ink-muted`: `oklch(45% 0.015 95)` — captions, table meta
- `--ink-faint`: `oklch(55% 0.012 95)` — placeholder, disabled
- `--ink-disabled`: `oklch(65% 0.01 95)`

### Brand accents
- `--kinpaku`: `oklch(84% 0.19 80.46)` — primary CTA, active state, current nav
- `--kinpaku-rich`: `oklch(77% 0.13 82)` — active CTA fill
- `--kinpaku-pale`: `oklch(86% 0.07 84)` — hover lift
- `--kinpaku-deep`: `oklch(61% 0.085 78)` — icon strokes on light

### Unit colors (BADGE only, không là color system chính)
- `--unit-gdnn`: `oklch(58% 0.10 188)` — patina deep, gắn với Trung tâm GDNN Thành Đạt
- `--unit-gdnn-soft`: `oklch(92% 0.04 188)` — badge bg
- `--unit-dvdl`: `oklch(48% 0.10 295)` — viola deep, gắn với Công ty CP DVDL Thành Đạt
- `--unit-dvdl-soft`: `oklch(92% 0.04 295)` — badge bg

### State
- `--rule`: `oklch(25% 0.02 95 / 0.16)` — default hairline
- `--rule-strong`: `oklch(74% 0.09 82 / 0.6)` — active focus outline (kinpaku)
- `--success`: `oklch(40% 0.10 145)` — published state
- `--warning`: `oklch(58% 0.15 35)` — draft/warning
- `--danger`: `oklch(52% 0.16 35)` — cancelled

### Typography
- Display: `Alumni Sans Pinstripe, Albert Sans, Arial, sans-serif`
- Body/UI: `Albert Sans, Avenir Next, Helvetica Neue, Arial, sans-serif`
- Mono (eyebrow, mã CV, ngày): `SFMono-Regular, Roboto Mono, Consolas, monospace`

Page title (h1): Albert Sans 1.5rem, weight 600, line-height 1.2, color `--ink`.
Section eyebrow: Mono 0.7rem, weight 500, uppercase, letter-spacing 0.18em, color `--ink-muted`.
Body/UI label: Albert Sans 0.875rem, weight 500.
Table cell: Albert Sans 0.875rem, weight 400, line-height 1.4.
Table meta (date, số CV): Mono 0.78rem, color `--ink-muted`.

### Spacing scale
8 / 16 / 24 / 32 / 48 / 80 / 112 px.

### Radius
- Buttons + inputs: 4px (`rounded-sm` token)
- Cards + panels: 6px
- Badges/pills: 999px (`pill`)
- Avatars: 6px (square-ish, không tròn)

### Material rules (giữ nguyên triết lý Impeccable)
- **Hairline first**: dùng 1px border `--rule` trước khi nghĩ đến shadow.
- **No shadow on cards**: cards rest on background contrast + hairline.
- **No glass/blur/neon/gradient.**
- **Texture chỉ ở** hero seam (không có ở màn list này).

---

## HEADER (64px)

Layout (flex row, gap 24px, padding-x 24px, border-bottom 1px `--rule`, bg `--paper-raised`):

1. **Brand lockup** (left, gap 12px):
   - Mark: 32×32 square. Background `--kinpaku`, white slash diagonal in center. Border-radius 4px. **Không phải logo cơ quan** — đây là brand mark của app.
   - Wordmark: `QLCV` — Alumni Sans, weight 400, uppercase, letter-spacing 0.15em, size 1.1rem, color `--ink`. Bên cạnh wordmark: text mono nhỏ `THÀNH ĐẠT` 0.65rem, color `--ink-muted`, uppercase, letter-spacing 0.2em.

2. **Spacer flex-1**.

3. **Switch view đơn vị** (segmented control, mục B3a — chỉ Quản lý thấy "Tất cả"):
   - 3 segment ngang: `Tất cả` / `GDNN` / `DVDL`.
   - Bg `--light-graphite`, padding 4px, radius 6px.
   - Segment active: bg `--paper-raised`, text `--ink`, border-bottom 2px `--kinpaku`.
   - Segment inactive: text `--ink-muted`, no bg.
   - Khi chọn GDNN → 2px line màu `--unit-gdnn`. Chọn DVDL → 2px line `--unit-dvdl`. Tất cả → 2px line `--kinpaku`.

4. **Global search** (Ctrl+K, width 360px):
   - Input bg `--light-graphite`, border 1px `--rule`, radius 4px, padding 8px 12px.
   - Placeholder mono 0.78rem: `Tìm công văn… (Ctrl+K)`, color `--ink-faint`.
   - Có icon search 16px left, kbd `⌘K` 0.7rem mono right.

5. **Notification bell**: icon 20px, button square 36×36, không border. Có dot đỏ `oklch(58% 0.15 35)` 6px góc trên phải nếu có noti.

6. **User menu** (button, gap 8px):
   - Avatar 32×32 vuông radius 6px, bg `--kinpaku-pale`, chữ initial Albert Sans 600 0.85rem màu `--ink`.
   - Dropdown caret 12px sau avatar.

---

## SIDEBAR (256px fixed, height calc(100vh - 64px))

Bg `--paper-deep`, border-right 1px `--rule`, padding 24px 16px, scrollable.

Cấu trúc menu (theo PRD QLCV):

```
[eyebrow] CHÍNH

🏠  Việc của tôi               (badge số task chưa làm)
📤  Công văn đi
📥  Công văn đến                (badge số CV mới chưa giao)

[eyebrow] NGHIỆP VỤ

📇  Danh bạ
🔏  Mộc & Chữ ký
   ├─  Mộc
   ├─  Chữ ký
   └─  Hồ sơ ký
🏷  Tag
📚  Tìm kiếm

[eyebrow] HỆ THỐNG  (chỉ Quản lý thấy)

⚙️  Cấu hình
👥  Người dùng
📊  Báo cáo
📜  Audit log
🗑  Thùng rác
```

Eyebrow: mono 0.65rem, uppercase, letter-spacing 0.18em, color `--ink-muted`, margin-bottom 12px, margin-top 24px (lần đầu 0).

Nav item:
- Padding 10px 12px, radius 4px, gap 12px (icon + text).
- Icon 18px stroke 1.5px, color `--ink-muted` ở rest.
- Text Albert Sans 0.9rem, weight 500, color `--ink-body`.
- Hover: bg `--light-graphite`.
- Active: bg `--paper-raised`, border-left 2px `--kinpaku` (offset 0px), text `--ink`, icon color `--kinpaku-deep`.
- Sub-item: indent 32px, no icon.
- Badge số: mono 0.7rem, padding 2px 6px, radius 999px, bg `--kinpaku-rich`, text white. Đặt right.

KHÔNG dùng emoji thật — emoji ở trên là placeholder, render dùng icon stroke (lucide-react: `Home`, `Send`, `Inbox`, `Contact`, `Stamp`, `Tag`, `Search`, `Settings`, `Users`, `BarChart3`, `ScrollText`, `Trash2`).

---

## CONTENT (Danh sách Công văn đi)

Padding: 32px 48px. Max-width 1320px. Stacked vertical, gap 24px.

### 1. Page header

Row, justify-between, gap 16px:
- Left:
  - Eyebrow mono `CÔNG VĂN ĐI`.
  - h1 Albert Sans 1.5rem weight 600 `Danh sách công văn đi`.
  - Subhead Albert Sans 0.95rem weight 400 `--ink-muted`: `247 công văn — 156 đã phát hành, 89 đang soạn, 2 huỷ` (số ví dụ).
- Right (button row, gap 8px):
  - Secondary button `Xuất Excel` — transparent, border 1px `--rule`, text `--ink-body`, radius 4px, height 36px, padding 0 16px, font Albert Sans 0.85rem weight 500.
  - Primary button `+ Soạn công văn mới` — bg `--kinpaku`, text `oklch(18% 0.02 95)` (dark ink), no border, radius 4px, height 36px, padding 0 20px, weight 500. Hover bg `--kinpaku-pale`.

### 2. Filter bar (card, padding 16px)

Bg `--paper-raised`, border 1px `--rule`, radius 6px. Flex row wrap gap 12px.

Mỗi filter là một `select` dropdown trigger (button rectangle 36px height):
- Bg `--light-graphite`, border 1px `--rule`, radius 4px, padding 0 12px.
- Label trái mono 0.7rem `--ink-muted` "Đơn vị:", value Albert Sans 0.85rem `--ink-body` "Tất cả".
- Chevron-down 14px right.

Filters: `Đơn vị` (Tất cả/GDNN/DVDL), `Thời gian` (preset: Tháng này/Quý này/Năm này/Tuỳ chỉnh), `Loại VB` (Tất cả/Công văn/Quyết định/…), `Trạng thái` (Tất cả/Draft/Phát hành/Huỷ), `Người ký`.

Cuối row, push right: ghost button `Đặt lại bộ lọc` text `--ink-muted` 0.85rem.

### 3. Table (card, padding 0, overflow visible)

Bg `--paper-raised`, border 1px `--rule`, radius 6px.

**Table header row** (height 44px, bg `--paper-deep`, border-bottom 1px `--rule`):
- Checkbox 16px column (width 48px) — bulk select.
- `SỐ CV` — mono 0.7rem uppercase letter-spacing 0.18 `--ink-muted` — width 160px, sortable.
- `TRÍCH YẾU` — flex 1.
- `ĐƠN VỊ` — width 100px, center-aligned badge column.
- `LOẠI` — width 80px.
- `NGƯỜI KÝ` — width 140px.
- `PHÁT HÀNH` — width 110px, mono date.
- `TRẠNG THÁI` — width 110px.
- `` (empty for actions) — width 44px.

**Table row** (height 56px, bg `--paper-raised`, border-bottom 1px `--rule` — last row no border):
- Hover: bg `--paper-deep`.
- Checkbox cell.
- Số CV: Mono 0.8rem `--ink-body` (vd `247/2026/CV-GDNN-TĐ`). Bold first part (số) `--ink`.
- Trích yếu: Albert Sans 0.875rem `--ink`, max 2 lines truncate, weight 400. Subtext mono 0.7rem `--ink-muted` "Phản hồi CV đến số 12/CV-BTC" nếu có liên kết phản hồi.
- Đơn vị: Badge pill (chi tiết bên dưới).
- Loại: Tag mono uppercase 0.7rem padding 4px 8px bg `--light-graphite` text `--ink-body` radius 4px (vd `CV`, `QĐ`, `TTr`).
- Người ký: Albert Sans 0.85rem `--ink-body` (vd "Nguyễn Văn A").
- Phát hành: Mono 0.78rem `--ink-muted` (vd `15/06/2026`).
- Trạng thái: Status pill (chi tiết bên dưới).
- Actions: icon-button 3 dots vertical 28×28 ghost — open dropdown menu `Xem / Sửa / Tải PDF chưa ký / Tải PDF đã ký / Huỷ`.

### Badge ĐƠN VỊ (pill 999px, height 22px, padding 0 8px, font mono 0.65rem weight 500 uppercase letter-spacing 0.1em)

- GDNN: bg `--unit-gdnn-soft`, text `--unit-gdnn`, có dot 6px `--unit-gdnn` trước text.
- DVDL: bg `--unit-dvdl-soft`, text `--unit-dvdl`, có dot 6px `--unit-dvdl` trước text.

### Status pill (pill 999px, height 22px, padding 0 8px, font mono 0.65rem weight 500 uppercase letter-spacing 0.1em)

- Draft: bg `oklch(92% 0.02 95)`, text `--ink-muted`, không dot.
- Phát hành: bg `oklch(95% 0.05 145)` (success-soft), text `--success`, có dot 6px `--success`.
- Huỷ: bg `oklch(92% 0.03 35)`, text `--danger`, gạch ngang chữ.

### 4. Pagination row

Padding 16px 24px, border-top 1px `--rule` (nằm trong card table).

Row, justify-between:
- Left: Albert Sans 0.85rem `--ink-muted` `Hiện 1–20 / 247 công văn`. Có select `Mỗi trang: 20 ⌄`.
- Right: pagination buttons.
  - Buttons 32×32 radius 4px, mono 0.85rem.
  - Inactive: ghost, text `--ink-body`, hover bg `--light-graphite`.
  - Active: bg `--kinpaku`, text dark ink.
  - Prev/next chevron icon 14px.

---

## States & micro-detail

- **Empty state** (filter return 0 rows): trong card table, padding 80px, center. Eyebrow mono `KHÔNG CÓ KẾT QUẢ`, h3 Albert Sans 1.2rem weight 500 `Chưa có công văn nào khớp bộ lọc`. Subtext `--ink-muted` `Thử đặt lại bộ lọc hoặc soạn công văn mới.` Ghost button center `Đặt lại bộ lọc`.
- **Loading state**: skeleton row 56px x 8 rows, bg `--light-graphite` opacity animate.
- **Bulk action bar** (khi tick ≥ 1 row): hiện thay filter bar, position sticky top 80px. Bg `--ink` (dark inverted), text white, padding 12px 16px, radius 6px. Format: `247 đã chọn — [Xuất Excel] [Đổi trạng thái] [Xoá]`.
- **Keyboard**: `/` focus search, `Ctrl+K` mở search modal, `Esc` clear, focus visible outline 2px `--rule-strong` offset 2px.

---

## Không được làm

- KHÔNG dùng emoji thật trong UI.
- KHÔNG dùng dark theme.
- KHÔNG dùng gradient, glass, blur, glow, neon.
- KHÔNG có drop shadow trên card (chỉ hairline + bg contrast).
- KHÔNG dùng rounded > 8px ngoài pill badge.
- KHÔNG dùng màu purple/magenta/cyan ngoài 2 unit token đã định.
- KHÔNG dùng hex color — chỉ OKLCH.
- KHÔNG icon emoji 🔴🟡🟢 — dùng dot SVG OKLCH.

---

## Dữ liệu mẫu (8 row)

| Số CV | Trích yếu | Đơn vị | Loại | Người ký | Phát hành | Trạng thái |
|---|---|---|---|---|---|---|
| 247/2026/CV-GDNN-TĐ | V/v đăng ký tham gia Hội thi tay nghề cấp tỉnh năm 2026 | GDNN | CV | Trần Văn B | 15/06/2026 | Phát hành |
| 089/2026/CV-DVDL-TĐ | V/v báo cáo doanh thu Quý 2 năm 2026 gửi Sở Du lịch | DVDL | CV | Nguyễn Thị C | 14/06/2026 | Phát hành |
| 248/2026/CV-GDNN-TĐ | V/v đề xuất bổ sung kinh phí đào tạo nghề năm 2026 | GDNN | TTr | Trần Văn B | — | Draft |
| 052/2026/QĐ-DVDL-TĐ | Quyết định bổ nhiệm Trưởng phòng Kinh doanh | DVDL | QĐ | Nguyễn Thị C | 10/06/2026 | Phát hành |
| 246/2026/CV-GDNN-TĐ | V/v cử cán bộ tham dự tập huấn nghiệp vụ tại Hà Nội (Phản hồi CV đến 12/CV-TCGDNN) | GDNN | CV | Trần Văn B | 08/06/2026 | Phát hành |
| 090/2026/CV-DVDL-TĐ | V/v rà soát hợp đồng cung cấp dịch vụ lưu trú | DVDL | CV | Lê Văn D | — | Draft |
| 245/2026/TB-GDNN-TĐ | Thông báo lịch nghỉ Lễ 30/4 - 1/5 | GDNN | TB | Trần Văn B | 25/04/2026 | Phát hành |
| 049/2026/CV-DVDL-TĐ | V/v đăng ký nhận hồ sơ ưu đãi thuế năm 2026 | DVDL | CV | Nguyễn Thị C | 02/06/2026 | Huỷ |

---

## Acceptance — tick từng cái:

- [ ] Layout 3-zone đúng kích thước (header 64, sidebar 256, content max 1320).
- [ ] Page ground là `--paper` (paper-based light), KHÔNG dark.
- [ ] Brand mark là carved tile gold + slash (không phải logo cơ quan).
- [ ] Wordmark `QLCV` Alumni Sans uppercase letter-spacing 0.15em + tagline mono `THÀNH ĐẠT`.
- [ ] Switch view 3-segment có line accent đổi màu theo unit chọn.
- [ ] Search input có placeholder mono + `⌘K` indicator.
- [ ] Sidebar 3 eyebrow group (CHÍNH / NGHIỆP VỤ / HỆ THỐNG), nav item border-left 2px kinpaku khi active.
- [ ] Filter bar 5 select + reset link.
- [ ] Table header mono uppercase 0.7rem letter-spacing 0.18.
- [ ] Số CV row dùng mono font, bold số STT.
- [ ] Badge đơn vị GDNN xanh patina + DVDL tím viola, có dot 6px trước text.
- [ ] Status pill 3 màu (Draft xám, Phát hành xanh success, Huỷ đỏ + gạch ngang).
- [ ] Pagination buttons 32×32 mono font, active bg kinpaku.
- [ ] Hairline 1px everywhere, KHÔNG shadow card.
- [ ] Toàn bộ text tiếng Việt có dấu đúng, không mojibake.
- [ ] Không có emoji, gradient, glass, neon, glow.
- [ ] Tất cả color đều OKLCH, không hex.
