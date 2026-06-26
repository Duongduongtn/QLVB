# 🎨 Prompt CREATIVE — Danh sách Công văn đi (D6)

> Phiên bản SÁNG TẠO. Mục tiêu: cho AI tự quyết định design dựa trên context + style guide. Xem AI sẽ làm gì khi được tự do.
> Copy nguyên block dưới vào v0.dev / Claude / Cursor.

---

## What we're building

App nội bộ **QLCV — Quản lý Công văn và Ký số** cho 2 đơn vị Việt Nam chung văn phòng: **Trung tâm GDNN Thành Đạt** (giáo dục nghề nghiệp) và **Công ty CP DVDL Thành Đạt** (du lịch). 5 user (2 Quản lý + 3 Nhân viên) dùng app cả ngày để soạn / vào sổ / tra cứu công văn gửi cơ quan nhà nước.

Render màn **"Danh sách Công văn đi"** — đây là trang user vào nhiều nhất, ngày nào cũng mở để theo dõi 247+ công văn đã/đang phát hành trong năm. Họ cần thấy nhanh: cái nào draft chờ ký, cái nào đã phát hành, cái nào của đơn vị nào, ai ký, gửi đi đâu.

---

## Style guide: Impeccable design system

Dùng nguyên triết lý từ design system **Impeccable** (`D:/Du_An/impeccable`):

- **Editorial, expert, decisive.** Cảm giác như đọc một tạp chí design uy tín, không phải SaaS landing page có thật nhiều decoration. Mọi element phải có lý do tồn tại.
- **Restraint.** Hairline 1px thay vì shadow. Surface contrast thay vì glow. Typography hierarchy thay vì màu sắc loè loẹt.
- **OKLCH colors only.** Không hex. Không gradient. Không neon. Không glass. Không glow particles. Không purple/cyan generic AI vibes.
- **Brand color**: kinpaku gold `oklch(84% 0.19 80.46)` cho CTA + active + brand mark. Verdigris patina `oklch(70% 0.12 188)` cho secondary/improved state.
- **Typography**: Alumni Sans Pinstripe cho display (h1, h2 lớn). Albert Sans cho body + UI. SFMono/Roboto Mono cho eyebrow + metadata + table header + mã số.
- **Small radii**: 2–8px chủ yếu. Pill 999px cho badge. Tuyệt đối không rounded 16px+ cards.
- **Spacing scale**: 8/16/24/32/48/80/112.
- **No emoji.** Dùng icon stroke (lucide).
- **Tiếng Việt có dấu đầy đủ.** Date `dd/mm/yyyy`, số phân cách `1.234`.

---

## Adapt cho app văn phòng VN

Impeccable bản gốc là dark lacquer. App này dùng cả ngày trong văn phòng đèn sáng → **chọn variant light/paper-based** (Impeccable có sẵn token `light-paper`, `light-ink`, `light-muted`...). Kinpaku gold + verdigris patina vẫn giữ làm accent.

2 đơn vị cần phân biệt nhẹ (chỉ ở badge nhỏ, không phá color system chính):
- **GDNN**: tông xanh patina (gần verdigris).
- **DVDL**: tông tím trầm cùng tone OKLCH (vd `oklch(48% 0.10 295)`).

Bạn quyết định cụ thể OKLCH chính xác cho 2 màu unit này.

---

## Cái cần có trên trang

User vào trang phải thấy/làm được những thứ này (cách trình bày tự bạn quyết):

1. **Biết mình đang ở đâu** — branding QLCV + đang xem đơn vị nào (Tất cả / GDNN / DVDL).
2. **Tìm nhanh** một CV cụ thể qua search.
3. **Xem danh sách công văn** với các thông tin: số CV, trích yếu (vắn tắt), đơn vị phát hành, loại văn bản, người ký, ngày phát hành, trạng thái (Draft / Phát hành / Huỷ).
4. **Lọc nhiều tiêu chí**: đơn vị, thời gian, loại, trạng thái, người ký.
5. **Hành động chính**: soạn công văn mới (CTA quan trọng nhất), xuất Excel.
6. **Hành động theo dòng**: xem chi tiết, tải PDF chưa ký, tải PDF đã ký, huỷ.
7. **Chuyển trang** khi danh sách dài (~247 CV/năm, hiển thị 20/trang).
8. **Sidebar nav** để đi sang các module khác: Việc của tôi, Công văn đến, Danh bạ, Mộc & Chữ ký, Tag, Tìm kiếm, Cấu hình (Quản lý), Người dùng (Quản lý), Báo cáo (Quản lý), Audit log (Quản lý), Thùng rác (Quản lý).
9. **Notification bell** cho task được giao + nhắc hạn.
10. **User menu** ở góc.

Bạn quyết định: layout pattern (table vs cards vs hybrid?), filter chỗ nào (top bar vs sidebar drawer?), bulk action ra sao, empty state thế nào, loading skeleton, focus state, keyboard shortcut, v.v.

---

## Constraints

- **Không** dark theme — văn phòng dùng ánh sáng mạnh cả ngày.
- **Không** emoji, gradient, glass, blur, neon, glow particles, drop shadow on cards.
- **Không** rounded > 8px (trừ pill badge).
- **Không** purple/magenta/cyan generic — chỉ dùng OKLCH token đã định.
- **Không** mojibake tiếng Việt.
- **Không** hex color.
- Output là React component Next.js 14 + Tailwind, **không** dùng shadcn/ui default styles — tự build theo Impeccable.

---

## Tự đánh giá khi xong

Trước khi submit, kiểm tra:

1. Có "look and feel" của một design publication uy tín không? Hay vẫn giống AI landing page generic?
2. Người Việt mở ra dùng có thấy chuyên nghiệp, đáng tin, hợp ngữ cảnh công văn nhà nước không?
3. Có chỗ nào "decoration cho có" không? Mọi border, badge, color có function rõ ràng?
4. Switch view đơn vị có "kể chuyện" rõ rằng đây là app 2-tenant không?
5. Editorial restraint vs SaaS cliché — bạn đang ở phía nào?

Nếu có chỗ nghi ngờ "cái này có thừa không?" — thường là thừa. Bỏ đi.

---

## Reference vibe

- ✅ **Hợp tinh thần**: It's Nice That, A List Apart, Eye Magazine, Stripe Docs, Linear, Vercel Dashboard (light variant), Plaid Docs.
- ❌ **Anti-reference**: dashboard giáo dục VN scoreboard kiểu xanh đỏ vàng full màu, ERP rườm rà nhiều card glow, SaaS gradient hero giả vờ "modern".
