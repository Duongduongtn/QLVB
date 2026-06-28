# PRD — Hệ thống Quản lý Công văn và Ký số (QLCV)

> Tài liệu PRD này được xây dựng qua phỏng vấn từng bước. Mọi mục bên dưới đều đã được user xác nhận.

---

## 1. Overview

- **Tên đầy đủ**: Hệ thống Quản lý Công văn và Ký số — Thành Đạt
- **Code name**: `QLCV`
- **One-liner**: Web nội bộ giúp Trung tâm GDNN Thành Đạt và Công ty CP DVDL Thành Đạt quản lý công văn đi/đến và chèn mộc – chữ ký sẵn sàng để ký số bằng USB Token Viettel-CA.

### 1.1. Problem

**Hiện trạng**:
- Sổ công văn đang ghi bằng **Excel**, mỗi đơn vị 1 file riêng, dễ thất lạc và không tập trung.
- Quy trình phát hành công văn: **soạn Word → in giấy → đóng mộc tay + ký tay → scan ngược lại thành PDF → gửi đi**.

**Vấn đề muốn giải quyết**:
1. Quy trình thủ công nhiều bước (soạn – in – đóng – scan), **tốn thời gian**.
2. Công văn sau khi scan ngược **chất lượng kém, mờ, không đẹp** — ảnh hưởng hình ảnh khi gửi cơ quan nhà nước.
3. Công văn **không được quản lý khoa học**, lưu rải rác máy cá nhân, không có kho lưu trữ tập trung.
4. **Khó tìm kiếm** công văn cũ khi cần tra cứu lại.

### 1.2. Target users

- Phạm vi nội bộ **2 đơn vị Thành Đạt** (Trung tâm GDNN + Công ty CP DVDL).
- Tổng quy mô: **~5 user** (2 Quản lý + 3 Nhân viên).
- 2 cấp role duy nhất, không có Admin tách riêng — Quản lý kiêm Admin.
- **User KHÔNG gắn cứng với đơn vị** — bất kỳ user nào đăng nhập đều thao tác được cho cả 2 đơn vị. Sự phân biệt đơn vị chỉ áp dụng cho **dữ liệu CV đi, mộc, chữ ký, hồ sơ ký, danh bạ nơi nhận** (gắn với `unit_id`), không áp dụng cho user.

### 1.3. Goals & Success metrics

App được coi là thành công khi đạt **cả 4 mục tiêu** sau (đo lường được, kiểm tra sau 12 tháng đi vào sử dụng):

1. **Rút ngắn thời gian phát hành 1 công văn** từ ~30 phút (soạn + in + đóng dấu + scan) xuống ~5 phút (soạn + chèn mộc trên web + tải về ký số). Ước tính tiết kiệm ~200 giờ công/năm.
2. **Tập trung 100% công văn vào kho điện tử + chất lượng PDF rõ nét** — không còn file rải rác máy cá nhân, không còn PDF mờ do scan ngược. File xuất là PDF gốc kèm ảnh mộc PNG độ phân giải cao.
3. **Tìm kiếm bất kỳ công văn nào trong < 30 giây** nhờ OCR + full-text search.
4. **Không phát hành nhầm mộc giữa 2 đơn vị** — 0 vụ phát hành CV của GDNN bằng mộc DVDL hoặc ngược lại trong 1 năm. Đạt được nhờ cơ chế chọn đơn vị → tự áp mộc tương ứng + bước xác nhận trước khi xuất PDF.

---

## 2. User Personas

### Persona 1 — Quản lý (Manager) — 2 người

- Vai trò thực tế: Giám đốc, Phó Giám đốc của 2 đơn vị.
- **Quyền: FULL** — tất cả thao tác trong hệ thống.
- Việc thường làm:
  - Xem công văn đến / đi để đọc lại nội dung.
  - Duyệt nội dung công văn đi trước khi phát hành.
  - Upload nội dung công văn đi (file Word/PDF).
  - Tự chèn mộc, chữ ký, đóng giáp lai khi cần.
  - Quản trị hệ thống: upload/quản lý mộc gốc, đổi tên đơn vị, cấu hình sổ công văn, tạo/khoá user, xem audit log.

### Persona 2 — Nhân viên (Staff) — 3 người

- Vai trò thực tế: Văn thư, hành chính.
- **Quyền: HẠN CHẾ** — chỉ phần nghiệp vụ.
- Việc thường làm:
  - Upload công văn đi (file Word/PDF) lên hệ thống.
  - Chèn mộc, chữ ký vào file theo vị trí.
  - Đóng giáp lai khi công văn nhiều trang.
  - Vào sổ công văn đến.
  - Xem, tra cứu công văn.
- **KHÔNG có quyền**: quản trị mộc gốc, đổi UI/tên, cấu hình hệ thống, tạo user.

---

## 3. Features & User Stories

### Scope tổng quan (đã chốt 9 nhóm)

- **A** — Đăng nhập + Quản lý người dùng (2 role)
- **B** — Cấu hình hệ thống (đơn vị, sổ công văn, format số, tên cơ quan)
- **C** — Quản lý mộc + chữ ký + hồ sơ ký (nhiều người ký)
- **D** — Công văn ĐI: upload Word/PDF → chèn mộc/ký → giáp lai → cấp số → tải xuống
- **E** — Công văn ĐẾN (sổ chung): upload PDF → OCR → check trùng → vào sổ → phân công xử lý
- **F** — Tìm kiếm + tra cứu (full-text qua OCR)
- **G** — Báo cáo + Dashboard + xuất sổ theo NĐ 30/2020
- **H** — Bảo mật + Hạ tầng: HTTPS, watermark, audit log, soft delete, mã hoá file, backup R2
- **L** — PWA mobile-friendly
- **M** — Danh bạ cơ quan (nơi nhận CV đi + cơ quan gửi CV đến)

_Đã bỏ_: I (Email + Zalo OA), J (Sao y bản chính), K (Import sổ cũ Excel).

---

### 3.0. State machine (chu kỳ sống CV + Task)

#### CV ĐI — 3 trạng thái

```
   Draft ───────► Phát hành ───┐
     │                          │
     └──────► Huỷ ◄──────────────┘
```

- **Draft**: vừa upload, chưa cấp số, có thể sửa metadata + chèn mộc lại.
- **Phát hành**: đã cấp số (B2) + đã upload file ký số → vào sổ chính thức.
- **Huỷ**: CV bị huỷ — số đã cấp KHÔNG tái dùng.

**Transition cho phép**:
- Draft → Phát hành: khi user hoàn tất luồng D1 bước 12.
- Draft → Huỷ: cả Quản lý + Nhân viên (CV chưa có số chính thức).
- Phát hành → Huỷ: **chỉ Quản lý** (CV đã có số, cần "Thu hồi" có lý do).

#### CV ĐẾN — 3 trạng thái

```
   Mới ───────► Hoàn thành
     │              │
     └────► Huỷ ◄───┘ (chỉ trước khi giao)
```

- **Mới**: vào sổ xong, có thể đã giao hoặc chưa.
- **Hoàn thành**: tất cả task xử lý của các đơn vị liên quan đã xong.
- **Huỷ**: vào sổ nhầm (vd file trùng đã có) — số đến KHÔNG tái dùng.

**Transition cho phép**:
- Mới → Hoàn thành: khi mọi task xử lý đều ở state "Đã xong" (hoặc CV không cần giao xử lý).
- Mới → Huỷ: cả Quản lý + Nhân viên (kèm lý do).
- Hoàn thành → Huỷ: **chỉ Quản lý** (cần "Thu hồi" có lý do).

#### TASK xử lý (E2/E3) — 3 trạng thái

> 1 CV đến có thể tạo nhiều task (nếu phân công "Cả 2" đơn vị → 2 task riêng).

```
   Mới giao ──► Đang xử lý ──► Đã xong
       │            │
       └─► Chuyển người khác (tạo task mới, task cũ → "Đã chuyển")
```

- **Mới giao**: vừa được phân công, người nhận chưa mở.
- **Đang xử lý**: người nhận đã mở task và đang làm.
- **Đã xong**: hoàn tất xử lý.
- **Đã chuyển** (sub-state cuối): task được chuyển sang người khác.

**Quy tắc state CV đến vs state task**:
- Tất cả task → "Đã xong" → CV tự chuyển "Hoàn thành".
- 1 task còn ở "Mới giao" / "Đang xử lý" → CV vẫn "Mới".

---

### Nhóm A — Đăng nhập + Quản lý người dùng

#### [USR.LGN] A1. Đăng nhập

- **User Story**: [USR.LGN-01] Là người dùng (Quản lý hoặc Nhân viên), tôi muốn đăng nhập bằng username + mật khẩu, để vào hệ thống QLCV thao tác công văn.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done _(captcha-sau-3-lần defer GĐ2; đã có lockout 5/15' + fail2ban hạ tầng VPS)_
- **Done khi**:
  - Đăng nhập đúng → redirect vào dashboard < 2 giây.
  - Đăng nhập sai → báo lỗi chung "Sai username hoặc mật khẩu".
  - Sai pass 5 lần liên tiếp trong 15 phút → khoá tài khoản 15 phút.
  - Session lưu 8 giờ mặc định, hoặc 7 ngày nếu tick "Ghi nhớ đăng nhập".
  - Mọi lần đăng nhập (thành công/thất bại) đều ghi audit log: user, IP, thời gian, kết quả.
- **Edge cases**:
  - Username không tồn tại → vẫn báo lỗi chung, không tiết lộ username có thật hay không.
  - Tài khoản bị Quản lý khoá → "Tài khoản đã bị khoá, liên hệ Quản lý".
  - Mất mạng giữa chừng → hiện lỗi, cho retry.
  - Bị brute force → fail2ban + captcha sau 3 lần sai.

#### [USR.LGO] A2. Đăng xuất

- **User Story**: [USR.LGO-01] Là người dùng, tôi muốn đăng xuất khỏi hệ thống, để bảo vệ tài khoản khi xong việc/dùng máy chung.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done
- **Done khi**: bấm "Đăng xuất" → xoá session → redirect về trang login trong < 1 giây. Session đã đăng xuất không còn dùng để gọi API protected.

#### [USR.PWD] A3. Đổi mật khẩu

- **User Story**: [USR.PWD-01] Là người dùng, tôi muốn tự đổi mật khẩu, để bảo mật tài khoản cá nhân.
- **Ưu tiên**: **Nice** _(giai đoạn 1 chưa cần; tạm thời Quản lý reset pass cho user qua màn hình Quản lý người dùng)_
- **Trạng thái**: ✅ Done (28/06/2026) — `services/auth.change_password` (verify mật khẩu hiện tại qua bcrypt constant-time; chặn trùng mật khẩu cũ `PASSWORD_UNCHANGED`; set hash mới; audit `password_changed`; **kick MỌI phiên sau commit** → bắt đăng nhập lại mọi thiết bị). Schema `ChangePasswordRequest` tái dùng `_check_password` (≥8, chữ+số → 422 kèm lý do). Router `PUT /api/auth/password` (current_user) + `delete_cookie` khớp thuộc tính. FE: bật nút "Đổi mật khẩu" trong menu tài khoản → `ChangePasswordModal` (current/new/confirm, validate client + khớp confirm, 204 → `onLogout` dọn client + về login). 3 unit test. 1 review-code PASS không blocker (defer GĐ sau: rate-limit dò current_password + kick best-effort khi Redis lỗi). **Bỏ nút "Sắp có".**
- **Done khi**: nhập pass hiện tại + pass mới (2 lần) → pass mới hợp lệ (≥ 8 ký tự, có cả chữ + số), khác pass cũ → đổi xong và bị bắt đăng nhập lại.
- **Edge cases**: pass mới giống pass cũ → từ chối. Pass yếu → từ chối kèm lý do cụ thể.

#### [USR.MNG] A4. Quản lý người dùng (chỉ Quản lý)

- **User Story**: [USR.MNG-01] Là Quản lý, tôi muốn tạo - sửa - khoá - reset pass cho các user, để kiểm soát ai được dùng QLCV.
- **Ưu tiên**: **Must** — đầy đủ UI ngay từ Giai đoạn 1.
- **Trạng thái**: ✅ Done _(soft-delete + chặn tự-khoá/tự-xoá + Quản lý cuối (advisory lock) + kick <5s + audit)_
- **Steps to Complete**:
  1. Vào trang "Người dùng" (chỉ Quản lý thấy).
  2. Xem danh sách user, có search + paginate.
  3. "Thêm user mới" → username, họ tên, email, role, pass tạm → tạo.
  4. Bấm vào 1 user → sửa thông tin → lưu.
  5. "Khoá" → user đó không đăng nhập được.
  6. "Reset pass" → sinh pass mới ngẫu nhiên, hiện 1 lần trên màn hình.
- **Done khi**:
  - Tạo user xong → user mới đăng nhập được ngay < 1 phút.
  - Khoá user → đẩy ra session trong < 5 giây.
  - Reset pass → pass cũ vô hiệu ngay.
  - Mọi thao tác đều ghi audit log.
- **Edge cases**:
  - Username trùng → từ chối.
  - Quản lý tự khoá tài khoản chính mình → chặn.
  - Còn 1 Quản lý cuối cùng → không cho hạ role/khoá.
  - Xoá user = soft delete (giữ user record với flag `deleted_at`). CV người đó tạo vẫn giữ + reference `created_by`. Khi hiển thị → render "Nguyễn Văn A (đã ngừng sử dụng)" thay vì rỗng.

---

### Nhóm B — Cấu hình hệ thống

#### [CFG.UNT] B1. Quản lý 2 đơn vị

- **User Story**: [CFG.UNT-01] Là Quản lý, tôi muốn xem và chỉnh sửa thông tin của 2 đơn vị (tên, địa chỉ, MST, logo, mã màu), để hệ thống hiển thị đúng và áp dụng cho công văn đi của từng đơn vị.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done _(GET/PUT /api/units + upload/serve logo asset không mã hoá ≤2MB magic-bytes PNG/JPG; sửa 6 field text, color chặn cứng; audit; trang Cấu hình FE. Follow-up: nới color khi có bảng `documents`; integration test cho 3 nhánh validate upload_logo)_
- **Done khi**:
  - Hệ thống có sẵn 2 record cố định: Trung tâm GDNN Thành Đạt (mã màu xanh lá) + Công ty CP DVDL Thành Đạt (mã màu tím).
  - Mỗi đơn vị cho phép sửa: tên đầy đủ, tên viết tắt, địa chỉ, MST, SĐT, email, logo.
  - Sửa xong → áp dụng ngay cho CV đi tiếp theo trong < 1 phút.
- **Edge cases**:
  - Không cho xoá 2 đơn vị.
  - Logo PNG/JPG ≤ 2MB, có preview.
  - Mã màu không cho đổi sau khi đã có CV (giữ nhất quán).

#### [CFG.BOK] B2. Cấu hình sổ công văn (luồng nhiều bước)

- **User Story**: [CFG.BOK-01] Là Quản lý, tôi muốn cấu hình format số công văn cho từng loại văn bản và từng đơn vị, để khi phát hành CV hệ thống tự cấp số đúng nghiệp vụ.
- **Ưu tiên**: **Must** — đầy đủ UI.
- **Trạng thái**: ✅ Done _(CRUD loại VB 3 sổ + cấp số PG SEQUENCE atomic/không-lùi; biến format alias có/không dấu, {ĐƠN VỊ}=mã đơn vị; reset năm/tháng/none lazy; setval STT migrate Excel; UNIQUE (direction,unit_id,code) chặn trùng số; preview live; tab Cấu hình→Sổ công văn. 23 unit + 5 integration test (chạy trên CI Postgres). Deferred: cảnh báo "đổi format khi đã có CV" → làm cùng D1 khi bảng documents tồn tại; allocate_number sẵn cho D1.10)_
- **Steps to Complete**:
  1. Vào "Cấu hình → Sổ công văn".
  2. Chọn tab: Sổ đi GDNN / Sổ đi DVDL / Sổ đến (chung).
  3. Xem danh sách loại văn bản (CV, QĐ, TTr, TB, KH…).
  4. "Thêm loại" → tên loại, mã viết tắt, format số.
  5. Chọn chính sách reset: theo năm / theo tháng / không reset.
  6. **Cấu hình độ rộng STT (zero-pad)** cho loại này: số chữ số tối thiểu, vd 3 → `001`, `012`, `247`. Default = 3. Chọn 0 nếu không pad. **Cho phép cấu hình riêng cho từng sổ** (vd Sổ Công văn = 3 chữ số, Sổ Quyết định = 4 chữ số).
  7. Set STT bắt đầu + STT hiện tại (cho phép migrate từ sổ Excel).
  8. Preview → lưu.
- **Done khi**:
  - Tạo loại mới → CV phát hành dùng loại này có số đúng format.
  - Hỗ trợ biến: `{STT}` `{NĂM}` `{THÁNG}` `{ĐƠN VỊ}` `{LOẠI}`.
  - Reset đúng ngày 01/01 (nếu reset theo năm).
  - Counter không trùng kể cả khi xoá CV — implement bằng **PostgreSQL SEQUENCE** riêng cho mỗi `(đơn vị, loại VB, năm)`, atomic ở DB level. Khi CV bị Huỷ → số đó skip vĩnh viễn, không tái dùng. Chấp nhận sổ "nhảy số" do huỷ (vd 246 → 248).
- **Edge cases**:
  - Đổi format khi đã có CV → cảnh báo: CV mới dùng format mới, CV cũ giữ nguyên.
  - Xoá loại đã có CV → chuyển sang "Ngừng dùng" thay vì xoá.
  - Format thiếu `{STT}` → từ chối.
  - 2 đơn vị có thể trùng STT (CV 001/GDNN + CV 001/DVDL) — chấp nhận, vì phần tách đơn vị đảm bảo khác nhau.

#### [CFG.VEW] B3a. Switch view đơn vị (UI runtime)

- **User Story**: [CFG.VEW-01] Là người dùng, tôi muốn chuyển nhanh giữa view *Tất cả / GDNN / DVDL* qua dropdown góc trên, để chỉ thấy CV của đơn vị quan tâm.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — store Zustand persist `unitView` + `UnitViewSeg` header ("Tất cả" chỉ Quản lý, nhân viên ép về 1 đơn vị). **Wire vào sổ CV đi (28/06):** `cong-van-di.tsx` đọc `useUnitView().view` cho filter + query (header ⇄ FilterMenu trong trang = MỘT giá trị, đồng bộ); đổi đơn vị → về trang 1. **Server enforce role/đơn vị = N/A THEO THIẾT KẾ**: 2 đơn vị **dùng chung dữ liệu**, user **KHÔNG gắn đơn vị**, CV đi không có cờ "chỉ-QL-xem" → không có dữ liệu xuyên-đơn-vị cần chặn (khác `manager_only` của CV đến — cái đó ĐÃ enforce server `_visible`). unitView chỉ là tiện ích lọc client, không phải ranh giới bảo mật (đúng như note Nhóm D backend: "IDOR xuyên đơn vị = theo thiết kế"). CV đến dùng chung 2 đơn vị nên switch không áp (đến không có unit_id).
- **Done khi**: click chuyển → mọi list (CV đi, danh bạ, sổ) tự lọc theo đơn vị đã chọn trong < 0.5 giây. View "Tất cả" chỉ Quản lý thấy được.

#### [CFG.BRD] B3b. Branding header (tên app + logo)

- **User Story**: [CFG.BRD-01] Là Quản lý, tôi muốn cấu hình tên app + logo trên header, để hiển thị đúng thương hiệu.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done _(app_settings single-row + GET công khai / PUT+logo require_manager; header + trang login hiển thị app_name/logo động; tab Branding trong Cấu hình; nosniff header; audit. 4 unit test)_
- **Done khi**: đổi → mọi trang hiển thị tên/logo mới ngay sau reload.

---

### Nhóm C — Mộc + Chữ ký + Hồ sơ ký

#### [SIG.SEL] C1. Quản lý mộc

- **User Story**: [SIG.SEL-01] Là Quản lý, tôi muốn upload và quản lý các con mộc của 2 đơn vị, để khi phát hành CV chọn được mộc đúng đơn vị.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — defer: cảnh báo "không phải dạng tròn" (edge mềm) + seed ≥1 mộc/đơn vị (dữ liệu onboarding). Tách nền = SIG.BG riêng.
- **Done khi**:
  - Mỗi mộc lưu metadata: tên, đơn vị thuộc về (GDNN/DVDL), người upload, ngày upload, trạng thái active/inactive.
  - Mỗi đơn vị có ≥ 1 mộc gốc.
  - Hỗ trợ nhiều mộc/đơn vị (mộc tròn + mộc treo + mộc giáp lai chuyên dụng).
  - Inactive thay vì xoá — để CV cũ vẫn hiển thị mộc đã dùng.
- **Edge cases**:
  - File PNG/JPG ≤ 5MB; cảnh báo nếu không phải dạng tròn.
  - Chỉ Quản lý được upload mộc; Nhân viên chỉ chọn dùng.

#### [SIG.SGN] C2. Quản lý chữ ký

- **User Story**: [SIG.SGN-01] Là Quản lý, tôi muốn upload và quản lý chữ ký của những người sẽ ký công văn (GĐ A, GĐ B, PGĐ C…), để khi soạn CV chọn được chữ ký đúng người.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — đơn vị mặc định đổi được (không gắn cứng như mộc); ≤2MB; inactive thay vì xoá. Tách nền = SIG.BG riêng.
- **Done khi**:
  - Mỗi chữ ký lưu metadata: họ tên, chức danh, đơn vị mặc định, người upload, ngày upload, trạng thái.
  - 1 người có thể có nhiều chữ ký (cũ/mới).
  - Inactive thay vì xoá.
- **Edge cases**:
  - File PNG/JPG ≤ 2MB.
  - Chỉ Quản lý được upload; Nhân viên chỉ chọn dùng.

#### [SIG.BG] C3. Tách nền tự động khi upload mộc/chữ ký

- **User Story**: [SIG.BG-01] Là người upload mộc/chữ ký, tôi muốn web tự động tách nền từ ảnh chụp giấy, để không phải tự xử lý Photoshop.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — mộc rembg/U2Net giữ đỏ, chữ ký OpenCV threshold + slider, preview gốc/đã tách, fallback lưu ảnh gốc, tự resize ảnh lớn (cap input 20MB). Chạy ở Celery worker (lazy-import). Defer: trạng thái job qua Celery result (chưa bảng `jobs` — làm cùng Nhóm D); cold-start lần đầu nạp model ~14s (sau đó ≤5s); dọn `bg_tmp` qua beat hourly.
- **Done khi**:
  - Mộc đỏ → dùng `rembg` (U2Net AI), giữ nguyên màu đỏ gốc.
  - Chữ ký → dùng OpenCV threshold + invert alpha, giữ nét bút mảnh.
  - Output ảnh PNG có alpha channel (transparent background).
  - Hiện preview kết quả + slider tinh chỉnh ngưỡng cho user.
  - User duyệt visual → bấm "Lưu" → lưu phiên bản đã tách nền. **Không đo metric chất lượng tự động — dựa hoàn toàn vào duyệt visual của user.**
  - Thời gian xử lý ≤ 5 giây/file.
- **Edge cases**:
  - Ảnh nền phức tạp → fallback cho user upload phiên bản đã tách sẵn.
  - File >5MB → tự resize trước khi xử lý.
  - Tách thất bại → báo lỗi rõ, cho upload lại.

#### [SIG.PRO] C4. Hồ sơ ký (chống nhầm mộc — luồng nhiều bước)

- **User Story**: [SIG.PRO-01] Là Quản lý, tôi muốn tạo các Hồ sơ ký (mỗi hồ sơ = 1 người ký + chữ ký + chức danh + đơn vị + mộc đi kèm), để khi soạn CV chỉ cần chọn 1 hồ sơ là áp dụng đầy đủ ngay, không lo nhầm mộc.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — chống nhầm mộc enforce 2 lớp (service seal.unit_id==unit_id + FE lọc); cảnh báo khi tham chiếu chữ ký/mộc inactive (tại trang QL; luồng soạn CV D1 sẽ surface tiếp). "Áp đủ khi chọn hồ sơ" hoàn tất ở D1.
- **Steps to Complete**:
  1. Vào "Hồ sơ ký".
  2. "Tạo hồ sơ" → chọn đơn vị (GDNN/DVDL).
  3. Chọn chữ ký (lọc theo đơn vị).
  4. Chọn mộc đi kèm (lọc theo đơn vị → chống nhầm).
  5. Nhập chức danh hiển thị trên CV.
  6. Đặt tên hồ sơ ngắn → lưu.
- **Done khi**:
  - Tạo được nhiều hồ sơ (≥ 2/đơn vị: GĐ + PGĐ).
  - Khi soạn CV → chọn 1 hồ sơ → tự áp mộc + chữ ký + chức danh.
  - Mộc chỉ hiển thị từ đơn vị đã chọn → không thể chọn mộc đơn vị khác.
- **Edge cases**:
  - 1 người kiêm chức 2 đơn vị → 2 hồ sơ riêng.
  - Người ký nghỉ việc → inactive hồ sơ, không xoá.
  - Chữ ký/mộc bị inactive → hồ sơ tham chiếu inactive theo, cảnh báo khi dùng.

---

### Nhóm D — Công văn ĐI (nhóm chính)

#### [OUT.PUB] D1. Luồng phát hành công văn đi (luồng cốt lõi)

- **User Story**: [OUT.PUB-01] Là Quản lý/Nhân viên, tôi muốn upload file công văn → chọn đơn vị + hồ sơ ký → chèn mộc/chữ ký → cấp số → tải về PDF sẵn sàng ký số, để rút quy trình từ 30 phút (in/đóng/scan) xuống 5 phút.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — **backend + FE XONG gồm trọn vòng đời + convert Word**: tải **PDF hoặc Word (.docx/.doc → convert PDF ở WORKER LibreOffice, async poll; backend image vẫn gọn, 503 graceful nếu thiếu)**→metadata→hồ sơ ký lọc đơn vị→preview chèn mộc (PyMuPDF, auto góc dưới phải trang cuối)→giáp lai/ký nháy→**xác nhận chống nhầm hiện tên đơn vị**→cấp số atomic / dùng số có sẵn→tải `_CHUA_KY_SO`→**upload bản đã ký số (D1.12) → "Đã phát hành"**; **Huỷ/Thu hồi** (giữ số, **thu hồi CV đã phát hành chỉ Quản lý**). Chống nhầm mộc enforce server; khoá row mọi thao tác đổi trạng thái. **Defer:** kéo-thả vị trí mộc (D2-D, đang auto), verify chữ ký số PAdES bản upload (E1.5). ~~watermark khi tải (D1.11/H2)~~ → **✅ Done qua H2** (watermark on-the-fly khi tải, bỏ qua CV đã ký số).
- **Steps to Complete**:
  1. Vào "Công văn đi → Soạn mới".
  2. Upload file gốc (Word `.docx`/`.doc` hoặc PDF). Nếu Word → web convert sang PDF bằng LibreOffice headless.
  3. Điền metadata: trích yếu (auto-fill từ tên file), loại văn bản (chọn từ B2), nơi nhận (chọn từ danh bạ, multi-select), ngày phát hành (default hôm nay).
  4. Chọn đơn vị phát hành (GDNN hoặc DVDL) → web tự lọc hồ sơ ký theo đơn vị.
  5. Chọn hồ sơ ký (vd "GĐ TT GDNN") → tự áp mộc + chữ ký + chức danh.
  6. Áp vị trí mộc/chữ ký (chi tiết ở D2).
  7. Tuỳ chọn: tick "Đóng giáp lai" (D3) hoặc "Ký nháy mỗi trang" (D4).
  8. Preview PDF với mộc + chữ ký đã chèn.
  9. **Bước xác nhận chống nhầm mộc**: hiển thị "Phát hành CV với mộc của **TRUNG TÂM GDNN THÀNH ĐẠT**. Đúng chứ?" — bấm OK mới đi tiếp.
  10. **Cấp số CV** — có 2 tuỳ chọn:
      - **Tự cấp số** (mặc định): web sinh từ sổ tương ứng theo format B2.
      - **Dùng số có sẵn**: user nhập số đã có (vd Word đã in `Số: 123/CV-…`), web không sinh mới mà ghi nguyên vào sổ. Web vẫn check trùng số trong sổ — nếu trùng thì cảnh báo. **Đồng bộ SEQUENCE**: nếu N > counter hiện tại → web `setval(sequence_name, N+1)` để số tự cấp tiếp theo không trùng. Nếu N ≤ counter → check trùng record trước; chưa trùng thì cho, SEQUENCE không lùi. Báo cho user "Số tự cấp tiếp theo sẽ là M".
  11. Tải về PDF kèm hậu tố `_CHUA_KY_SO.pdf` + dòng nhắc đỏ "⚠️ Mở vSign + USB Token Viettel-CA để ký số trước khi gửi".
  12. Sau khi user ký số ngoài web → quay lại, upload file đã ký số → web đánh dấu CV "Đã phát hành" + lưu vào sổ.
- **Done khi**:
  - Toàn luồng 1-12 hoàn thành trong < 5 phút cho 1 CV thông thường (3-5 trang).
  - Số CV cấp đúng format B2, không trùng kể cả khi 2 user phát hành đồng thời.
  - PDF tải về có ảnh mộc + chữ ký rõ nét (≥ 300 DPI).
  - CV mới hiển thị ngay trong sổ "Công văn đi" của đơn vị tương ứng.
- **Edge cases**:
  - Word có font lạ → LibreOffice convert lệch → cảnh báo, cho preview trước khi cấp số.
  - PDF đã có chữ ký số sẵn → không cho chèn mộc lên (sẽ phá chữ ký số), cảnh báo.
  - Mất kết nối khi tải → cho tải lại từ trang chi tiết CV.
  - Upload file đã ký số sai CV (vd ký file của CV khác) → web check số trong tên file, cảnh báo.
  - "Dùng số có sẵn" mà số trùng với CV đã có → cảnh báo, cho user quyết.
  - User bỏ ngang giữa chừng → lưu draft, quay lại tiếp tục được.
  - **2 user cùng phát hành đồng thời**: PostgreSQL SEQUENCE đảm bảo không trùng số. User A có thể được số 247, B số 248. Nếu A huỷ → số 247 bỏ trống, không tái dùng. Audit log ghi rõ số nào bị huỷ + lý do để Quản lý đối chiếu sổ.

#### [OUT.MAP] D2. Auto map vị trí mộc/chữ ký (4 cách)

- **User Story**: [OUT.MAP-01] Là người soạn CV, tôi muốn web tự dò vị trí mộc/chữ ký để chèn đúng chỗ mà không phải kéo thả mỗi lần.
- **Ưu tiên**: **Must** — cả 4 cách.
- **Trạng thái**: ⚠️ Partial (27/06/2026) — `services/stamp_autodetect` áp **A→C**: **A placeholder** `{{KY_TEN}}/{{DONG_DAU}}/{{NGAY}}` (PyMuPDF search, toạ độ %, chọn cụm cuối — test đo được), **B regex** cụm chức danh (GIÁM ĐỐC/Người ký…, có biến thể không dấu), **C template** lưu/áp theo loại VB (cột `document_types.stamp_template`, migration 0013). Endpoint `POST /{id}/auto-detect` + `POST /{id}/save-template`; FE bước preview có nút "Tự dò vị trí" + "Lưu template" + hiện cách đã áp. **Defer:** D kéo-thả thủ công (editor canvas) — hiện fallback = đặt mặc định góc dưới phải; xoá hẳn placeholder text (ảnh mộc/chữ ký phủ lên).
- **Steps to Complete** (áp dụng tự động theo thứ tự ưu tiên A → D):
  1. **A. Placeholder trong text**: áp dụng cho **CẢ Word VÀ PDF có text layer**. Web extract text → tìm `{{KY_TEN}}`, `{{DONG_DAU}}`, `{{NGAY}}` → thay bằng ảnh tương ứng → xoá placeholder. Áp ngay, không hỏi. Implement: Word dùng `python-docx` thay placeholder trước khi convert sang PDF; PDF có text dùng `PyMuPDF` redact + insert ảnh.
  2. **B. Regex nhận diện cụm chuẩn**: tìm `Ký tên, đóng dấu`, `Người ký`, `Thủ trưởng đơn vị`, chức danh (`GIÁM ĐỐC`…) → đặt chữ ký phía trên chức danh + mộc đè 1/3 lên chữ ký. Hiện preview cho user duyệt.
  3. **C. Template lưu sẵn theo loại văn bản**: nếu đã có template cho loại CV này → áp toạ độ % đã lưu. Hiện preview duyệt. **Format template**: lưu dạng JSON `[{ kind: "signature|seal|date", page: int, x_pct: 0..1, y_pct: 0..1, w_pct: 0..1, h_pct: 0..1 }]` — toạ độ % so với kích thước trang để page resize không lệch. Mỗi loại văn bản có ≤ 1 template default.
  4. **D. Kéo thả thủ công**: fallback luôn có.
  
  Sau khi auto detect → cho preview cuối + nút "Lưu vị trí làm template" để lần sau cách C tự áp.
- **Done khi**:
  - 4 cách hoạt động đúng theo thứ tự A → D.
  - Cách A đạt ≥ 95% chính xác trên CV có placeholder rõ ràng (đo được bằng test case tự động).
  - Cách B + C hoạt động "work-able" — user duyệt/sửa lại nhanh nếu lệch, không bắt buộc đo metric chính xác. Nghiệm thu dựa trên UX feel khi user thật dùng thử với CV thật của Thành Đạt.
  - Cách D luôn dùng được làm fallback.
- **Edge cases**:
  - PDF chỉ chứa ảnh scan (không có text) → bỏ qua A+B, dùng C/D.
  - File có nhiều cụm "Ký tên" → chọn cụm cuối cùng.
  - User override vị trí auto → web ghi nhớ pattern, lần sau ưu tiên.

#### [OUT.GLA] D3. Đóng giáp lai (3 lựa chọn)

- **User Story**: [OUT.GLA-01] Là người phát hành CV nhiều trang, tôi muốn đóng giáp lai để chống đánh tráo trang, theo quy định cơ quan nhà nước.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — backend `pdf_stamp.giap_lai` (3 lựa chọn none/all/range, cắt mộc N cột mép phải, validate X≤Y≤page_count) + **FE wizard Step5** (`cong-van-di.soan.tsx` `RangeSeg` giáp lai) → gửi `sealing_option` → `outgoing.render_stamped` áp `giap_lai` (dùng chính mộc của hồ sơ ký, chặn thiếu mộc). **Còn lại = kiểm tra vận hành**: in thử ghép mép liền mạch (manual ops, ngoài phạm vi code).
- **Steps to Complete**:
  1. Trong luồng D1 bước 7, chọn 1 trong 3 option:
     - **Không giáp lai** (mặc định cho CV 1 trang).
     - **Giáp lai toàn bộ** (tất cả trang của CV).
     - **Giáp lai range** — nhập "Từ trang [X] đến trang [Y]" (vd: 2-5, hoặc 3 đến cuối).
  2. Web tự động lấy **mộc của hồ sơ ký đang dùng** (đã chọn ở D1 bước 5 — chính là mộc đóng cuối CV) → cắt ảnh thành N phần dọc bằng số trang trong range đã chọn. KHÔNG cần mộc giáp lai chuyên dụng riêng.
  3. Đặt từng phần ở mép phải mỗi trang sao cho ghép lại liền mạch khi in.
- **Done khi**:
  - 3 lựa chọn hoạt động đúng.
  - Ghép các trang in ra → mộc liền mạch khớp mép, không lệch.
  - Range trang validate: X ≤ Y, cả X và Y ≤ tổng số trang.
- **Edge cases**:
  - CV 1 trang + chọn "Toàn bộ" → vô hiệu hoá option (giáp lai 1 trang vô nghĩa).
  - Range chỉ 1 trang (X = Y) → cảnh báo, vẫn cho làm (in cả mộc lên trang đó).
  - Range vượt số trang thực → từ chối, báo lỗi rõ.

#### [OUT.INI] D4. Ký nháy mỗi trang

- **User Story**: [OUT.INI-01] Là người phát hành CV nhiều trang, tôi muốn chèn chữ ký nháy nhỏ ở góc dưới mỗi trang, để xác nhận từng trang đã đọc.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — backend `pdf_stamp.ky_nhay` (góc dưới phải, range, TRỪ trang cuối) + **FE wizard Step5** (`RangeSeg` ký nháy) → `sealing_option.ky_nhay` → `render_stamped` áp (dùng chữ ký của hồ sơ ký, chặn thiếu chữ ký).
- **Steps to Complete**:
  1. Trong luồng D1 bước 7, tick "Ký nháy mỗi trang".
  2. Chọn range tương tự D3: Không / Toàn bộ / Range.
  3. Web chèn chữ ký mini (size ~30%) ở góc dưới phải mỗi trang trong range, **trừ trang cuối** (vì có chữ ký chính).
- **Done khi**: mỗi trang trong range (trừ trang cuối) đều có chữ ký nháy nhỏ ở góc.
- **Edge cases**: CV 1 trang → vô hiệu hoá. Range chỉ chứa trang cuối → không chèn gì, báo "Không có trang nào để ký nháy".

#### [OUT.LNK] D5. Liên kết CV đi với CV đến (phản hồi)

- **User Story**: [OUT.LNK-01] Là người soạn CV đi, tôi muốn đánh dấu CV này là phản hồi của 1 công văn đến (nếu có), để tra cứu liên kết 2 chiều sau này.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — cột `outgoing.in_reply_to_incoming_id` (FK + migration 0011) + validate CV đến tồn tại; wizard soạn CV đi bước 2 có select "Phản hồi công văn đến"; **2 chiều**: detail CV đi hiện link sang CV đến gốc, detail CV đến hiện danh sách CV đi phản hồi (`GET /api/incoming/{id}/replies`). 1 CV đến ⟵ nhiều CV đi; 1 CV đi ⟶ ≤1 CV đến.
- **Steps to Complete**: trong luồng D1 bước 3, có ô tuỳ chọn "Phản hồi công văn đến" → tìm + chọn CV đến → lưu liên kết.
- **Done khi**: xem CV đi thấy link sang CV đến gốc; xem CV đến thấy danh sách CV đi phản hồi.
- **Edge cases**: 1 CV đến có thể có nhiều CV đi phản hồi (1 từ GDNN + 1 từ DVDL); 1 CV đi chỉ phản hồi 1 CV đến.

#### [OUT.LST] D6. Danh sách + Sổ công văn đi

- **User Story**: [OUT.LST-01] Là người dùng, tôi muốn xem danh sách CV đi, lọc theo đơn vị/thời gian/loại/trạng thái/người ký, để tra cứu nhanh.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — **backend + FE XONG** (bảng số CV/trích yếu/đơn vị/ngày/trạng thái, search debounce, filter đơn vị+trạng thái, paginate, detail drawer). **Xuất Excel danh sách ✅ (28/06):** nút "Xuất Excel" ở sổ CV đi → `GET /api/outgoing/export.xlsx` (cùng bộ lọc đơn vị/trạng thái/search; `report.build_outgoing_list_xlsx`, `_excel_safe` chống injection, cap 5000 dòng). **Defer còn lại:** filter thời gian/loại/người ký/nơi nhận, cột Loại/Người ký (cần BE trả kèm).
- **Done khi**:
  - Danh sách paginate, default sort theo ngày phát hành mới nhất.
  - Filter đa tiêu chí: đơn vị, khoảng thời gian, loại văn bản, trạng thái (Draft/Đã phát hành), người ký, nơi nhận.
  - Search nhanh theo số CV / trích yếu.
  - Click 1 record → trang chi tiết: full metadata + file PDF chưa ký + file PDF đã ký (nếu có) + lịch sử thay đổi.

---

### Nhóm E — Công văn ĐẾN (sổ chung 2 đơn vị)

#### [INC.REG] E1. Vào sổ công văn đến (luồng chính)

- **User Story**: [INC.REG-01] Là Nhân viên/Quản lý, tôi muốn vào sổ công văn đến bằng cách upload file PDF, web tự đọc metadata + check trùng, để CV được lưu tập trung và không nhập trùng.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — **BE+FE wizard 4 bước XONG**: upload PDF (mã hoá phong bì) → OCR worker (PyMuPDF text-layer / PaddleOCR `vie` scan, bản tạm `in_tmp` xoá ngay sau OCR + beat purge) → auto-fill số ký hiệu/ngày VB/gợi ý cơ quan → dedup 3 lớp (E1.6) → cấp **số đến sổ chung** (nextval atomic, theo năm tiếp nhận) → manager_only ẩn NV (404 server-side). Cancel giữ số. Audit gồm download. **Defer:** verify chữ ký số (E1.5 — đang `unchecked`), upload batch nhiều file, phụ lục (E4).
- **Steps to Complete**:
  1. Vào "Công văn đến → Vào sổ mới".
  2. Upload file PDF (drag drop, hỗ trợ upload nhiều file batch).
  3. Web tự **detect loại PDF**:
     - PDF có text layer (file gốc, không scan) → đọc text bằng **PyMuPDF** (nhanh).
     - PDF scan ảnh → render trang thành ảnh + chạy **PaddleOCR** (model `vie`) để trích text.
  4. Auto-fill form từ text vừa trích: số ký hiệu, ngày văn bản, tên cơ quan gửi.
  5. **Check trùng 3 lớp** (chi tiết ở E1.5).
  6. User chỉnh form: cơ quan gửi (chọn/thêm danh bạ), số ký hiệu, ngày VB, loại VB, trích yếu, **mức độ khẩn** (Thường/Khẩn/Thượng khẩn/Hoả tốc/Hoả tốc hẹn giờ), **mức độ mật** (Thường/Mật/Tối mật/Tuyệt mật), hạn xử lý (tuỳ chọn), **tuỳ chọn "Chỉ Quản lý xem"** (flag riêng, không tự động theo mức độ mật).
  7. (Tuỳ chọn) Đính kèm phụ lục (E5).
  8. Lưu → web cấp **số đến** kế tiếp trong sổ chung 2 đơn vị.
- **Done khi**:
  - Vào sổ 1 CV < 1 phút với OCR auto-fill **"work-able"** (user duyệt/sửa lại nhanh, không bắt buộc % chính xác). Nghiệm thu dựa trên UX feel với CV thật.
  - PDF scan ảnh đọc được text (test với CV mẫu của Thành Đạt).
  - Số đến cấp tự động, không trùng kể cả khi đồng thời.
  - File PDF gốc lưu mã hoá (local + sync R2).
  - Audit log đầy đủ.
- **Edge cases**:
  - File > 50MB → cảnh báo, gợi ý nén.
  - OCR fail hoàn toàn → vẫn lưu, user nhập tay metadata.
  - Cancel sau khi cấp số → giữ số đó, CV trạng thái "Huỷ", không tái dùng.
  - Upload batch 10 file → tạo 10 record nháp, user duyệt từng cái.
  - **CV được tick "Chỉ Quản lý xem"**: Nhân viên không thấy CV này trong danh sách (E5), không xuất hiện trong tìm kiếm (F1), không index OCR text vào full-text search. Chỉ Quản lý mới thấy + xử lý. Có thể đổi cờ này sau khi đã vào sổ (chỉ Quản lý đổi được).
  - **Mức độ mật field**: chỉ dùng để ghi nhận + xuất sổ NĐ 30 + hiển thị badge UI, KHÔNG tự động phân quyền (phân quyền dùng flag "Chỉ Quản lý xem" ở trên).

#### [INC.VER] E1.5. Verify chữ ký số CV đến (PAdES)

- **User Story**: [INC.VER-01] Là Nhân viên, tôi muốn web tự kiểm chữ ký số trên CV đến, để biết CV đó là thật hay giả mạo trước khi xử lý.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — code đủ luồng: worker `verify_pades` (pyHanko, import trễ) + `services/sign_verify` (classify none/valid/invalid, trust list NEAC cache local + seed fallback, `refresh_trust_cache` cron tuần — ghi atomic, không wipe cache bằng list rỗng, fail giữ cache cũ). Upload enqueue verify song song OCR → 2 asset tạm KHÔNG mã hoá (in_tmp/sig_tmp), worker tự xoá + beat purge. `POST /sig-status` poll ghi DB; `register()` bỏ dedup khi `signature_status=='valid'` (audit kèm signature_status). FE wizard bước 2: badge xanh "hợp lệ + ký bởi + CA + ký lúc + hạn"/vàng (hỏng/hết hạn/**cert lạ → headline trung tính "chưa được tin cậy — kiểm tra thủ công"**)/xám "Chưa ký số"; nhiều chữ ký hiện hết. **Bất biến bảo mật**: `valid` chỉ khi MỌI chữ ký intact+hợp lệ+còn hạn+**tin cậy** (chain tới CA trong trust list VN) → chỉ chữ ký tin cậy mới được bỏ dedup. **Partial vì**: trust list seed RỖNG + `NEAC_TRUST_LIST_URL` chưa cấu hình → chưa có CA gốc thật → badge xanh chưa demo/nghiệm thu được (mặc định an toàn: mọi chữ ký coi 'cert lạ' vàng, dedup luôn chạy). Cần seed cert gốc NEAC thật / cấu hình URL + chạy cron để nghiệm thu tiêu chí #1. 2 subagent review PASS không blocker. Verify pyHanko thật chạy khi deploy (image worker). 11 unit test lõi.
- **Done khi** (dùng thư viện `pyHanko`):
  - PDF có chữ ký số hợp lệ → hiển thị badge xanh: "Ký số bởi [Tên CQ], certificate [CA], lúc [time], hợp lệ đến [date]". Bỏ qua check trùng 3 lớp (chữ ký số đảm bảo duy nhất).
  - PDF có chữ ký số nhưng hết hạn/sai cert → badge vàng "Chữ ký số không hợp lệ".
  - PDF không có chữ ký số → badge xám "Chưa ký số" → chạy flow OCR + check trùng bình thường.
- **Edge cases**:
  - Certificate chưa có trong trust list VN → cảnh báo "Cert lạ, kiểm tra thủ công".
  - File có nhiều chữ ký (ký nhiều người) → hiển thị tất cả.
- **Nguồn trust list VN**: file `vn-trust-list.json` chứa các CA gốc đã đăng ký với **NEAC** (Trung tâm Chứng thực Điện tử Quốc gia — `neac.gov.vn`). Cron worker tự động download/cập nhật **mỗi tuần** từ URL NEAC chính thức + cache local. Nếu cron fail → dùng bản cache cũ + log cảnh báo cho admin.

#### [INC.DUP] E1.6. Check trùng 3 lớp (chỉ áp dụng khi CV không có chữ ký số)

- **User Story**: [INC.DUP-01] Là Nhân viên, tôi muốn web tự cảnh báo khi CV đến có dấu hiệu trùng (đã có trong sổ), để không vào sổ 2 lần.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — `check_duplicates` 3 lớp: SHA-256 (đỏ, chặn register nếu thiếu lý do) / metadata số-ký-hiệu+cơ-quan+ngày (vàng) / OCR similarity ≥90% (nhẹ, SequenceMatcher cắt 4000 ký tự + quick_ratio prefilter). Chữ ký số hợp lệ → bỏ qua dedup. FE cảnh báo + "Vẫn lưu" kèm `duplicate_note` (audit). FE tái kiểm lớp 2/3 sau khi chọn cơ quan gửi.
- **Steps to Complete**:
  - **Lớp 1 — SHA-256 hash**: trùng tuyệt đối → cảnh báo MẠNH 🔴 + link CV cũ + nút "Xem / Vẫn lưu / Huỷ".
  - **Lớp 2 — Trùng metadata** (số ký hiệu + cơ quan gửi + ngày VB): trùng có thể → cảnh báo TRUNG BÌNH 🟡 + gợi ý "Có thể cùng CV gửi cho cả 2 đơn vị → vào sổ 1 lần, gán xử lý Cả 2".
  - **Lớp 3 — OCR text similarity > 90%**: nghi trùng → cảnh báo NHẸ 🟢 + cho user quyết.
- **Done khi**: cả 3 lớp hoạt động đúng cấp độ. User luôn quyết được "Vẫn lưu" (kèm lý do để audit).
- **Edge cases**: lưu trùng phải nhập lý do; Admin xem được log "trùng nhưng vẫn lưu".

#### [INC.ASG] E2. Phân công xử lý

- **User Story**: [INC.ASG-01] Là Nhân viên, tôi muốn phân công CV đến cho 1 hoặc cả 2 đơn vị + gán người cụ thể, để rõ trách nhiệm xử lý.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — model `processing_tasks` (UNIQUE incoming+unit chống đua) + migration 0012. `assign` GDNN/DVDL/**Cả 2 → 2 task ĐỘC LẬP** + noti người được giao (đổi người → noti cả cũ + mới). Người bị khoá → chặn giao. Modal "Phân công" (seg đơn vị + người + hạn + ghi chú) ở chi tiết CV đến; chuông thông báo header poll số chưa đọc + dropdown. **Badge "Đã giao" trên sổ CV đến (28/06):** `tasks.summary_for_incomings` (1 query group-by, tránh N+1; gộp trạng thái → assigned/processing/done) gắn vào `IncomingListItem`; FE Pill (Đã giao/Đang xử lý/Hoàn thành) trong ô trích yếu; **không rò manager_only** (summary chỉ tính id của trang list — đã lọc manager_only với NV); invalidate `['incoming']` sau khi giao để badge cập nhật ngay. 1 review-nghiệp-vu PASS (fix invalidate). 7 unit test.
- **Steps to Complete**:
  1. Vào trang chi tiết CV đến.
  2. Click "Phân công".
  3. Chọn đơn vị xử lý: GDNN / DVDL / Cả 2 đơn vị.
  4. (Nếu "Cả 2") → tạo 2 task xử lý độc lập, mỗi đơn vị 1 task.
  5. Chọn người xử lý (chọn từ TẤT CẢ user — không lọc theo đơn vị vì user không gắn đơn vị; xem mục 1.2).
  6. Set hạn xử lý (default từ hạn CV).
  7. Ghi chú phân công.
  8. Lưu.
- **Done khi**:
  - Người được giao thấy task trong "Việc của tôi" < 5 giây.
  - Notification bell hiển thị.
  - Trạng thái CV chuyển "Đã giao".
  - 2 task của 2 đơn vị xử lý độc lập (1 xong, 1 chưa xong vẫn được).
- **Edge cases**:
  - Đổi người xử lý → log + noti cho cả người cũ + mới.
  - Người xử lý bị khoá tài khoản → cảnh báo, yêu cầu reassign.

#### [INC.TRK] E3. Theo dõi xử lý

- **User Story**: [INC.TRK-01] Là người được giao, tôi muốn cập nhật trạng thái xử lý CV, để báo cáo tiến độ.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — trang **"Việc của tôi"** (poll 15s) cập nhật trạng thái (Mới→Đang xử lý→Hoàn thành / Mở lại) + **chuyển người** (chỉ assignee/Quản lý — chống IDOR) + quá hạn **highlight đỏ**. Cron ngày `notify_due_tasks` nhắc việc sắp tới hạn (ngày mai/hôm nay) + **quá hạn** (cờ `reminded_on` chống spam). **✅ báo cáo tiến độ dashboard (28/06):** G1 dashboard đã có KPI "CV chưa xử lý" + "CV quá hạn" (đếm việc mở/quá deadline theo E2/E3) + toggle đơn vị.
- **Steps to Complete**:
  1. Vào "Việc của tôi".
  2. Mở 1 task → cập nhật trạng thái: Đang xử lý / Đã hoàn thành / Chuyển người khác.
  3. Thêm ghi chú xử lý.
  4. (Tuỳ chọn) Liên kết với CV đi đã phản hồi.
- **Done khi**:
  - Trạng thái cập nhật ngay.
  - Nhắc trước hạn 1 ngày (notification trong app).
  - Quá hạn → task highlight đỏ + noti.
  - Báo cáo tiến độ hiển thị trên dashboard (nhóm G).
- **Edge cases**:
  - Chuyển task cho người khác → log, người cũ vẫn xem được lịch sử.
  - Task quá hạn nhưng đã hoàn thành → không cảnh báo.

#### [INC.ATT] E4. Phụ lục đính kèm

- **User Story**: [INC.ATT-01] Là người vào sổ, tôi muốn đính kèm phụ lục (PDF, Excel, ảnh) cho CV chính, để lưu trữ đầy đủ tài liệu liên quan.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026 — F1 đã tiêu thụ `ocr_text`) — model `incoming_attachments` (FK CV cha CASCADE, file_id mã hoá envelope) + migration 0014. `services/incoming_attachments`: add (allowlist ext PDF/Word/Excel/ảnh, ≤50MB/file + tổng ≤500MB/CV, mã hoá như CV chính, orphan cleanup khi lỗi), list, tải lẻ, **ZIP gộp** (CV chính + tất cả phụ lục, `_safe_zip_name` chống traversal + dedup tên, semaphore chặn OOM đồng thời), xoá (**chỉ người tải lên hoặc Quản lý** + audit). Phụ lục **PDF → OCR** ghi `ocr_text` qua worker `ocr_attachment` (SessionLocal fire-and-forget; att_tmp KHÔNG mã hoá xoá ngay + beat purge); Excel/ảnh KHÔNG OCR. Router 5 endpoint đều `_visible(doc cha)` (CV "Chỉ Quản lý xem" → NV 404). FE: `AttachmentsCard` trong drawer CV đến (list + thêm + tải lẻ + Tải ZIP gộp + xoá, fmtSize VN). 15 unit test. 2 subagent review PASS không blocker. **✅ Done (28/06):** F1 (migration 0018) đã index `ocr_text` phụ lục vào search (trigger + GIN + nhánh EXISTS) với defense-in-depth manager_only (search_vector=NULL khi CV cha mật) → tìm full-text nội dung phụ lục hoạt động, tôn trọng "Chỉ Quản lý xem".
- **Done khi**:
  - Phụ lục liệt kê dưới CV chính.
  - Tải xuống được riêng lẻ hoặc gộp ZIP (CV chính + tất cả phụ lục).
  - Phụ lục PDF cũng OCR để tìm kiếm full-text.
- **Edge cases**:
  - File > 50MB → cảnh báo.
  - Tổng dung lượng phụ lục/CV ≤ 500MB.
  - Phụ lục Excel/ảnh không OCR.

#### [INC.LST] E5. Danh sách + Sổ công văn đến

- **User Story**: [INC.LST-01] Là người dùng, tôi muốn xem danh sách CV đến, lọc đa tiêu chí, để tra cứu nhanh.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (27/06/2026) — sổ paginate (sort ngày đến mới nhất) + filter **cơ quan gửi / mức khẩn / mức mật / thời gian (năm) / trạng thái** + search số đến/ký hiệu/trích yếu; cột chữ ký số + cờ "Chỉ Quản lý xem"; drawer chi tiết + Tải PDF + toggle ẩn (Quản lý) + Huỷ vào sổ. **Xuất Excel danh sách ✅ (28/06):** nút "Xuất Excel" ở sổ CV đến → `GET /api/incoming/export.xlsx` (cùng bộ lọc khẩn/mật/cơ quan/năm/trạng thái/search; **tôn trọng manager_only** — NV không xuất được CV "Chỉ Quản lý xem"; `report.build_incoming_list_xlsx`). **Defer còn lại:** filter trạng thái xử lý + đơn vị xử lý, lịch sử phân công/xử lý.
- **Done khi**:
  - Danh sách paginate, default sort theo ngày đến mới nhất.
  - Filter: thời gian, cơ quan gửi, mức độ khẩn, mức độ mật, trạng thái xử lý, đơn vị xử lý.
  - Search: số đến, trích yếu, số ký hiệu, cơ quan gửi.
  - Click → trang chi tiết: full metadata + file gốc + phụ lục + lịch sử phân công/xử lý + link CV đi phản hồi.

---

### Nhóm F — Tìm kiếm + tra cứu

#### [SRC.FTS] F1. Tìm kiếm toàn cục (full-text)

- **User Story**: [SRC.FTS-01] Là người dùng, tôi muốn tìm kiếm CV (đi và đến) bằng từ khoá toàn văn + lọc nâng cao, để tra cứu < 30 giây.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — migration 0015: extension `unaccent`+`pg_trgm`, wrapper `f_unaccent` IMMUTABLE, cột `search_vector` TSVECTOR (CV đi+đến) + **trigger** BEFORE INS/UPD (CV đến nhánh `manager_only` loại `ocr_text` khỏi index; CV đi subject+số) + GIN index `search_vector` + GIN trgm trên `f_unaccent(subject)` + backfill. `services/search.global_search`: hợp nhất 2 sổ UNION ALL, `websearch_to_tsquery('simple', unaccent(q))` (tìm có/không dấu) **OR** word_similarity `<%` (`SET LOCAL pg_trgm.word_similarity_threshold=0.3` — bắt lỗi chính tả nhẹ "vit nam"→"Việt Nam", dùng index), xếp `ts_rank`→ngày, lọc type/status/đơn vị(CV đi)/khẩn(CV đến)/khoảng ngày, phân trang. **Bất biến bảo mật (2 lớp) ĐẠT**: NV không thấy CV đến `manager_only` (query `manager_only=FALSE` + trigger loại OCR). Router `GET /api/search` current_user. FE: `GlobalSearch` ở header (Ctrl+K, debounce 250ms, dropdown badge Đi/Đến + highlight không dấu, deep-link `?q=` sang sổ tương ứng + seed/sync ô tìm). 5 unit + 5 integration test (có/không dấu, typo trgm, ẩn manager_only với NV, OCR loại khỏi index manager_only). 2 subagent review PASS không blocker. **Mở rộng tìm theo TÊN ✅ (28/06):** `search.global_search` khớp thêm **cơ quan gửi** (CV đến), **người ký** (CV đi, qua hồ sơ ký→chữ ký) + **nơi nhận** (CV đi, M2M) bằng **EXISTS join + trgm `_fuzzy` không dấu ở QUERY-TIME** (tránh migration/trigger phức tạp M2M + luôn tươi khi đổi tên). **Bất biến manager_only GIỮ NGUYÊN** (vẫn là điều kiện AND riêng — nhánh khớp-tên trong OR không nới lỏng; 3 integration test mới gồm 1 ca NV tìm theo tên cơ quan của CV manager_only vẫn không thấy). **OCR PHỤ LỤC ✅ (28/06):** migration 0018 thêm `incoming_attachments.search_vector` + trigger BEFORE INS/UPD (to_tsvector simple unaccent `left(ocr_text,500000)` chống vượt 1MB tsvector) + GIN index; `search.global_search` thêm nhánh **EXISTS attachment_match** vào `or_()` của CV đến. **Bảo mật 2 lớp parity parent 0015**: (1) query `manager_only=FALSE` loại CV cha mật với NV; (2) **trigger đặt search_vector phụ lục = NULL khi CV cha manager_only** (OCR mật KHÔNG vào index, kể cả Quản lý — giống parent-ocr) + **trigger AFTER UPDATE trên `incoming_documents` rebuild search_vector phụ lục con khi cờ manager_only đổi**. EXISTS → 1 CV cha dù nhiều phụ lục khớp (không nhân bản). 6 integration test mới (tìm qua OCR phụ lục, manager_only ẩn cả 2 lớp, update-path luồng worker, toggle cờ rebuild, dedup). 2 subagent review PASS (đồng quy: phụ lục = body mật → áp defense-in-depth như parent, không chỉ query-level → đã làm). **DEFER còn lại:** thống kê (cần aggregate). Tìm cơ quan/người ký/nơi nhận + OCR phụ lục đã xong.
- **Done khi**:
  - Search box ở header, mở bằng phím tắt `Ctrl+K`.
  - Tìm theo: trích yếu, số CV, cơ quan, người ký, nội dung qua OCR text + text gốc.
  - PostgreSQL `tsvector` + `tsquery` cấu hình tiếng Việt (config `simple` + extension `unaccent`) — tìm có dấu/không dấu đều ra. Kết hợp `pg_trgm` (trigram) cho fuzzy match.
  - Filter nâng cao: loại CV (đi/đến), thời gian, đơn vị, mức độ khẩn, trạng thái.
  - Highlight từ khoá khớp trong kết quả.
  - Kết quả < 1 giây cho dữ liệu 5 năm (~5000 CV).
- **Edge cases**: chấp nhận lỗi chính tả nhẹ — dùng `pg_trgm` operator `%` với ngưỡng `set_limit(0.3)`. Test: gõ "vit nam" tìm ra "Việt Nam"; gõ "biên bàn" tìm ra "biên bản".

#### [SRC.TAG] F2. Tag tự do

- **User Story**: [SRC.TAG-01] Là người dùng, tôi muốn gắn tag tự do cho CV (`#thi-tay-nghe`, `#kiem-toan-2026`…), để nhóm CV cùng chủ đề và tìm nhanh.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — model `tags` (name UNIQUE chuẩn hoá) + `document_tags` (polymorphic incoming/outgoing, PK ghép) + migration 0016. `services/tags`: `normalize_tag` (lowercase+bỏ dấu+gạch ngang → gộp `#Thi Tay Nghề`≡`thi-tay-nghe`), `get_or_create_tag` (**SAVEPOINT `begin_nested` chống đua, không rollback cả tx**), `set_tags` (replace + dedup + max 30 + **ON CONFLICT DO NOTHING** chống đua 2 PUT + audit), `suggest`/`list_all_with_counts`/`docs_by_tag` — **TẤT CẢ tôn trọng `manager_only`** (NV không đếm/gợi ý/lọc/thấy tag của CV đến chỉ-Quản-lý-xem; router `_ensure_visible` chặn GET/PUT → 404). router `/api/tags` (list+counts/suggest/documents/get+put theo object). FE: `routes/tag.tsx` (đám mây tag + bảng tỉ trọng + click xem CV — bám TagPage demo), `components/TagEditor.tsx` (chips + autocomplete, chuẩn hoá client) gắn drawer CV đi + CV đến. 10 unit (normalize) + 6 integration test (set/dedup/replace/suggest-ẩn-manager_only/counts-role-aware/race-không-mất-tag). 2 subagent review (FIX BLOCKER rollback-toàn-tx → SAVEPOINT + kẽ hở suggest lộ tag manager_only + ON CONFLICT). **Defer nhẹ**: dọn orphan `document_tags` khi hard-delete CV (Thùng rác) — hiện join doc nên orphan tự ẩn.
- **Đồng thời căn lại sidebar nav khớp ui-demo** (user phản hồi prod lệch demo): thêm nhóm **"Tra cứu" (Tìm kiếm `/tim-kiem` + Tag `/tag`)**, đổi thứ tự "Công việc" (Việc của tôi→CV đi→CV đến, icon Home) đúng `ui-demo/src/nav.tsx`; thêm trang `/tim-kiem` (full-text dùng `/api/search`, bám TimKiemPage demo). Đối chiếu Playwright: sidebar + 2 trang khớp demo.
- **Done khi**:
  - Mỗi CV có thể có nhiều tag.
  - Auto-suggest khi gõ (lấy từ tag đã có).
  - Lọc theo tag.
  - Trang "Tag" liệt kê tất cả tag + số CV/tag.
- **Edge cases**: chuẩn hoá tag (chữ thường + gạch ngang) để tránh trùng kiểu `#Thi Tay Nghề` và `#thi-tay-nghe`.

---

### Nhóm G — Báo cáo + Dashboard

#### [RPT.DSH] G1. Dashboard tổng quan

- **User Story**: [RPT.DSH-01] Là người dùng, tôi muốn xem dashboard tổng quan với các số liệu chính, để nắm tình hình công văn 2 đơn vị.
- **Ưu tiên**: **Should** — GD2 mới làm đầy đủ. GD1 thay bằng màn hình "Việc của tôi" (task được giao + nhắc hạn) làm trang chủ sau đăng nhập.
- **Trạng thái**: ✅ Done (28/06/2026, CI+Deploy XANH) — GD1: trang chủ "Việc của tôi" (đã có). **GD2 đầy đủ** mở rộng `/bao-cao` (manager-only): `report.dashboard_stats(year, today, unit_id)` thêm KPI **CV chưa xử lý** (CV đến `registered` còn việc mở HOẶC chưa giao việc — EXISTS, gồm cả CV chưa phân công khi xem toàn bộ; view theo đơn vị chỉ đếm việc mở của đơn vị) + **CV quá hạn** (có việc mở quá deadline, giờ VN) + **top 7 cơ quan gửi** + **cơ cấu loại VB đi** (pie). FE: 6 KPI card (quá hạn đỏ khi >0), **donut conic-gradient** (token design-system `SLICE_COLORS`, không raw Tailwind) + **thanh top cơ quan gửi**, **toggle đơn vị tái dùng `UnitViewSeg` global header** (`useUnitView`→`unit_id`), empty state "Chưa có dữ liệu". **Quyết định chốt với user:** bỏ KPI "tỉ lệ đúng hạn" (processing_tasks thiếu `completed_at` → không tính chính xác; chỉ hiển thị "quá hạn" đếm thật); Nhân viên dùng "Việc của tôi" làm phần liên quan mình (GD1). **Số liệu đúng**: base `status='registered'` loại nháp+huỷ (chống thổi phồng), biên năm CV đến quy giờ VN `timezone('Asia/Ho_Chi_Minh', created_at)` (nhất quán G3, không lệch giao thừa). `/api/reports/stats` require_manager. 2 integration test mới (KPI + edge: CV chưa giao/done/không-deadline/huỷ). 2 subagent review (đồng quy: loại CV huỷ + gồm CV chưa giao + chuẩn TZ → đã fix). **Defer:** thống kê M2/E5 (aggregate khác).
- **Done khi**:
  - GD1: trang chủ là "Việc của tôi" liệt kê CV được giao + nhắc hạn xử lý.
  - GD2: thêm KPI cards (CV đi/đến tháng này, CV chưa xử lý, CV quá hạn), biểu đồ CV theo tháng, top cơ quan gửi, pie loại VB, tỉ lệ xử lý đúng hạn, toggle view đơn vị, filter thời gian.
  - Quản lý thấy đủ; Nhân viên chỉ thấy phần liên quan mình.
- **Edge cases**: dữ liệu rỗng → message "Chưa có dữ liệu".

#### [RPT.BOK] G2. Xuất sổ CV đi/đến theo mẫu NĐ 30/2020

- **User Story**: [RPT.BOK-01] Là Quản lý, tôi muốn xuất sổ ra Excel đúng template Phụ lục III NĐ 30/2020, để in lưu trữ + nộp cơ quan lưu trữ.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — `services/report.build_register_xlsx(year, book)` 3 sổ (di_gdnn/di_dvdl/den) đúng cột NĐ30 (sổ đi: STT/số-ký-hiệu/ngày/trích yếu/người ký/nơi nhận/số bản/ghi chú; sổ đến: **Số đến THẬT**/ngày đến/số-ký-hiệu/ngày VB/cơ quan gửi/trích yếu/đơn vị xử lý/ghi chú), openpyxl import trễ, header tiếng Việt có dấu + style/freeze. Lọc năm + chỉ CV đã cấp số; CV huỷ vẫn liệt kê kèm "Đã huỷ" (NĐ30: số không tái dùng). Người ký join hồ sơ ký→chữ ký; nơi nhận/cơ quan gửi batch (hết N+1). **Bảo mật: `_excel_safe` chống formula injection** (field tự do `=+-@\t\r` → prepend `'` — bất biến export TDD §10.2). router `/api/reports/register.xlsx` + `/stats` **require_manager**. FE `/bao-cao` (KPI + biểu đồ 12 tháng thật + modal chọn năm/loại sổ → tải Excel) + nav "Báo cáo" managerOnly → **đóng nốt khoảng trống nav so ui-demo**. 12 unit (excel_safe/header/stats) + 4 integration test. 2 review FIX BLOCKER injection + "Số đến"=số-thật + N+1 + wb.active None-safety. **Defer**: cột "Số bản" + "Đơn vị/người nhận xử lý" để trống điền tay (chưa join ProcessingTask). [Kèm dashboard G1-lite KPI+chart — G1 đầy đủ là Should/GD2.]
- **Done khi**: chọn năm + loại sổ (Sổ đi GDNN / Sổ đi DVDL / Sổ đến chung) → tải Excel có đầy đủ cột chuẩn NĐ 30 (Số TT, Số/ký hiệu, Ngày, Trích yếu, Người ký, Đơn vị/người nhận, Số bản, Ghi chú).
- **Edge cases**: Excel mở được trên Office 2010+; có header tiếng Việt có dấu đầy đủ.

#### [RPT.STA] G3. Báo cáo thống kê tuỳ chỉnh

- **User Story**: [RPT.STA-01] Là Quản lý, tôi muốn lọc CV theo nhiều tiêu chí + xuất Excel báo cáo, để báo cáo cho cấp trên.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — `services/report.build_custom_report_xlsx` gộp CV đi (đã cấp số) + CV đến (đã vào sổ) theo khoảng ngày, lọc **đơn vị** (áp CV đi; CV đến dùng chung 2 đơn vị nên LUÔN gồm — ghi rõ trong sheet Tham số) + **loại VB** (theo `code`) + **nhóm theo** (tháng/quý/cơ quan/loại). Excel **3 sheet**: `Tổng quan` pivot (nhóm × Loại VB; `group_by=type` → Loại × Hướng cho khỏi suy biến) + **biểu đồ cột** (openpyxl BarChart), `Chi tiết` (Hướng/số-ký-hiệu/ngày VB/loại/trích yếu/người ký/nơi nhận–cơ quan gửi/trạng thái VN), `Tham số` (bộ lọc + tên loại + ngày xuất + ghi chú). Tách `_gather_custom_rows` (DB, batch hết N+1) ↔ `_render_custom_xlsx` (thuần, test standalone). **Bảo mật**: router `/api/reports/custom.xlsx` **require_manager** (không rò rỉ CV đến manager_only); `_excel_safe` chống formula injection áp MỌI field tự do cả 3 sheet (gồm nhãn pivot cơ quan); SQLAlchemy parameterized. CV đến lọc/nhóm theo **giờ VN (+7)** không lệch biên ngày. Cap `_MAX_ROWS=20000` chống RAM. FE trang `/bao-cao/tuy-chinh` (bám demo, filter thật + xuất Excel) + nút "Báo cáo tuỳ chỉnh" ở `/bao-cao`. 9 unit + 2 integration test. 2 subagent review PASS không BLOCKER (đã fix: múi giờ CV đến, Tham số ghi tên loại, cap số dòng, ngày FE local, a11y seg).
- **Done khi**: chọn khoảng thời gian + đơn vị + loại VB + nhóm theo (tháng/quý/cơ quan/loại) → xuất Excel **3 sheet**:
  - Sheet 1 `Tổng quan`: bảng pivot CV theo (Tháng × Loại VB) + biểu đồ cột.
  - Sheet 2 `Chi tiết`: list từng CV với cột metadata đầy đủ (số, ngày, trích yếu, người ký, nơi nhận/cơ quan gửi, trạng thái).
  - Sheet 3 `Tham số`: ghi lại bộ filter user đã chọn để xuất (thời gian + đơn vị + loại + nhóm theo).

#### [RPT.ZIP] G4. Export ZIP toàn bộ CV theo năm

- **User Story**: [RPT.ZIP-01] Là Quản lý, tôi muốn xuất toàn bộ CV của 1 năm thành ZIP, để backup hoặc nộp lưu trữ điện tử.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026 — bổ sung index.pdf) — `services/export.gather_year_items` gom CV đi GDNN/DVDL + CV đến đã cấp số trong năm (chọn bản đã ký số nếu published, không thì bản gốc; lọc CV đi theo đơn vị, CV đến chung luôn gồm; lọc năm CV đến theo **giờ VN +7**) + `build_year_zip` (ghi ZIP **ra đĩa**, giải mã từng PDF riêng lẻ — bounded RAM, KHÔNG buffer cả gói; `read_file` tiêm ngoài → test standalone; 1 file lỗi đếm `errors` + log không phá gói). Cấu trúc `2026-CV-Den/`, `2026-CV-Di-GDNN/`, `2026-CV-Di-DVDL/` — mỗi PDF kèm `metadata.json` (tiếng Việt có dấu), kèm **`index.xlsx` 3 sheet sổ NĐ30** (`report.build_register_workbook_bytes`, tái dùng `_fill_register_sheet` + `_excel_safe`). Worker `zip_export.export_year` (SessionLocal chỉ giữ khi truy vấn, nhả trước khi dựng ZIP; `update_state(PROGRESS)` throttle 10 file; ghi `exports/<token>.zip` volume dùng chung) + beat `purge_exports` dọn >24h. Router **require_manager** cả 3 endpoint: POST `/export-zip` (enqueue + **audit** `export_zip_request`), GET `/export-zip/{task_id}` (poll, KHÔNG lộ key nội bộ), GET `/export-zip/{task_id}/download` (FileResponse stream + **audit** `export_zip_download` — bất biến #11 + `_export_path` chống traversal prefix `exports/`). FE modal "Xuất ZIP năm" ở `/bao-cao` (chọn năm/đơn vị → poll thanh tiến độ → tải; cảnh báo >2GB gợi ý chia + báo lỗi file). 14 unit test (safe-name/zip-slip/oversize/errors/progress/ranh giới năm VN). 2 review (nghiệp-vu FIX BLOCKER audit-download; code PASS — fix DB-session-nhả-sớm + log exception + bỏ rò key). **index.pdf ✅ (28/06):** worker convert `index.xlsx`→`index.pdf` qua LibreOffice (`convert.convert_xlsx_to_pdf`, best-effort — lỗi/thiếu soffice thì bỏ qua, ZIP vẫn có index.xlsx; chạy thật OK local 5.8s). **Defer còn lại:** chưa đo thực tế <5 phút/800 CV (chỉ smoke ở deploy — không Redis/worker local); bảng `jobs` (dùng Celery result backend như rembg, nhất quán tech-debt). **Lưu ý vận hành: khi implement `r2_sync.upload_to_r2` PHẢI loại trừ `exports/` (ZIP plaintext) khỏi backup R2.**
- **Done khi**:
  - ZIP cấu trúc: `2026-CV-Den/`, `2026-CV-Di-GDNN/`, `2026-CV-Di-DVDL/`, mỗi PDF kèm `metadata.json`, kèm `index.xlsx` + `index.pdf` mẫu NĐ 30.
  - Tải < 5 phút cho 1 năm (~800 CV).
- **Edge cases**: ZIP > 2GB → cảnh báo, gợi ý chia theo quý.

---

### Nhóm H — Bảo mật (phần có UI)

> Phần hạ tầng không-UI (HTTPS, mã hoá file at-rest, backup R2) đặt ở Mục 4 — Non-functional Requirements.

#### [SEC.WMK] H2. Watermark cá nhân khi tải PDF

- **User Story**: [SEC.WMK-01] Là Quản lý, tôi muốn web tự thêm watermark vào PDF khi user tải xuống (username + IP + thời gian), để truy được ai đã leak file nếu rò rỉ.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — `services/watermark.apply_download_watermark` chèn watermark **ON-THE-FLY** lúc tải ("Tải bởi: <username> - dd/mm/yyyy HH:mm (giờ VN) - IP <ip>"), **KHÔNG sửa file storage** (hash gốc giữ nguyên cho dedup E1.6). Engine `pdf_stamp.watermark_pdf` (PyMuPDF `TextWriter` — layer text riêng, **mờ 10% (opacity 0.1)**, **14pt**, **xoay 45°**, GIỮA mỗi trang; font **DejaVu Sans** bundle `app/data/fonts/` hỗ trợ tiếng Việt có dấu — thay Roboto vì Roboto không bundle). **CV đã ký số → KHÔNG watermark** (tránh phá chữ ký): `pdf_has_signature` content-based qua `get_sigflags()` (đúng cả CV đi bản signed lẫn CV đến PAdES), VẪN ghi audit tải. Áp ở **3 điểm tải**: `/api/outgoing/{id}/download` (CV đi), `/api/incoming/{id}/file` (CV đến) + `/attachments/{att_id}/file` (phụ lục PDF; Word/Excel/ảnh giữ nguyên). **Edge Quản lý "Tải bản gốc không watermark"**: `?raw=1&reason=` — `should_serve_raw` enforce CHỈ Quản lý (NV truyền raw=1 vẫn bị watermark), bắt buộc lý do + audit `*_download_raw`. `Cache-Control: no-store` trên CV đến (tài liệu mật). 14 unit test (render fitz thật: giữ số trang + nội dung gốc còn nguyên + watermark hiện + skip signed + should_serve_raw 4 ca + format VN). 2 subagent review PASS không BLOCKER (fix: watermark phụ lục PDF, Cache-Control CV đến, log get_sigflags, tách should_serve_raw testable). **Ghi chú**: tiêu chí #3 "OCR có/không watermark cùng text" đạt ở mức **nội dung gốc bảo toàn** (watermark là text-layer mờ chéo — content OCR không bị che; chưa verify raster bằng PaddleOCR). Gỡ defer **D1.11**.
- **Done khi**:
  - Mọi lần tải PDF từ web → tự thêm watermark mờ chéo "Tải bởi: [username] - [dd/mm/yyyy hh:mm] - IP [xxx]" mỗi trang.
  - Watermark đặt làm layer riêng (PyMuPDF text layer), opacity 10%, text size 14pt, font Roboto, xoay 45°, đặt ở giữa trang.
  - "Không che nội dung" = OCR PDF có watermark + OCR PDF gốc cho cùng kết quả text (watermark không lẫn vào nội dung).
  - CV đã ký số → không watermark (không phá chữ ký số), nhưng vẫn log tải.
- **Edge cases**:
  - Quản lý có nút "Tải bản gốc không watermark" (log lại lý do, dùng khi in chính thức).
  - **Watermark generate ON-THE-FLY khi tải xuống — KHÔNG sửa file lưu trên server**. File gốc trên storage giữ nguyên hash. Check trùng SHA-256 (E1.6) so hash file gốc, không bị ảnh hưởng bởi watermark.

#### [SEC.AUD] H3. Audit log + Soft delete + Thùng rác

- **User Story**: [SEC.AUD-01] Là Quản lý, tôi muốn xem nhật ký mọi thao tác + khôi phục được CV đã xoá, để truy vết và an toàn dữ liệu.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — Trang **Audit log** (`/audit-log`, Quản lý): lọc người dùng + hành động + thời gian (biên giờ VN) + tìm action/đối tượng/username, phân trang, drawer chi tiết. **Xoá mềm** CV → Thùng rác (CV đã cấp số: chỉ Quản lý — enforce server); **Thùng rác** (`/thung-rac`, Quản lý): khôi phục + xoá vĩnh viễn (ghi audit `outgoing_purge` trước khi xoá + unlink file); beat `purge_trash_older_than_30d` tự xoá >30 ngày. Index `audit_logs.created_at`. **Defer:** Xuất log ra Excel (nút UI để sau).
- **Done khi**:
  - Mọi thao tác (tạo/sửa/xoá/upload/tải/đăng nhập) ghi log: user, IP, thời gian, action, object_id.
  - Xoá CV = soft delete → vào Thùng rác → giữ 30 ngày → tự xoá vĩnh viễn.
  - Quản lý xem Thùng rác + khôi phục CV trong 30 ngày.
  - Trang "Audit log" có filter (user, action, thời gian) + search.
- **Edge cases**:
  - Còn 1 admin cuối → không cho xoá tài khoản.
  - Xoá vĩnh viễn → cảnh báo + log lại.
  - CV đã phát hành (có số) → chỉ Quản lý xoá được, Nhân viên không.

---

### Nhóm L — PWA Mobile-friendly

#### [PWA] L1. PWA + Mobile-responsive

- **User Story**: [PWA-01] Là người dùng, tôi muốn cài QLCV như app trên điện thoại, để xem CV đến + duyệt CV đi từ xa.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (28/06/2026) — **PWA installable + offline + mobile-responsive + WEB PUSH (L1) XONG** (code-complete; chỉ còn vận hành: sinh VAPID thật + cho phép egress host push ở firewall worker + test trên thiết bị thật). **Web push (28/06):** bảng `push_subscriptions` (migration 0017, endpoint UNIQUE theo thiết bị) + service/worker/router `push` (`pywebpush` import trễ, **no-op an toàn khi chưa cấu hình VAPID** → local/CI chạy bình thường) + cặp khoá VAPID qua config (`vapid_public_key`/`vapid_private_key` SecretStr/`vapid_subject`). Gửi push: **lúc phân công/chuyển việc** (router enqueue `send_web_push.delay` cho assignee — không chặn response) + **cron `notify_due_tasks`** (gửi thẳng vì đã ở worker). **Bảo mật**: payload chỉ chứa số CV + câu chung (KHÔNG lộ trích yếu/OCR/manager_only); **SSRF guard** `_validate_push_endpoint` (chỉ https + chặn localhost/IP riêng/loopback/metadata 169.254.169.254 — khớp TDD §10.4) áp cả khi subscribe lẫn khi gửi; **audit** `push_subscribe`/`push_unsubscribe` (chỉ lưu host, không lưu endpoint bí mật); `delete_subscription` scope theo `user_id` (chống IDOR); **thiết bị chung**: upsert theo endpoint ghi đè user_id + logout gọi `unsubscribe`. **FE**: đổi `vite-plugin-pwa` generateSW→**injectManifest** (`src/sw.ts` custom SW: port lại NetworkFirst allowlist + CacheFirst fonts + navigateFallback + **handler `push`/`notificationclick`** + skipWaiting/clientsClaim) + `lib/push.ts` (feature-detect iOS<16.4, xin quyền→`pushManager.subscribe`→POST, unsubscribe) + nút **"Bật/Tắt thông báo đẩy thiết bị này"** trong dropdown `NotificationBell` (ẩn khi không hỗ trợ → fallback chuông in-app). tsconfig riêng cho SW (lib WebWorker) + workbox-* devDeps. 16 unit test push (no-op/gửi/dọn-410/SSRF/truncate/skip-nội-bộ) + 2 integration (upsert + IDOR delete). 2 subagent review (nghiệp-vu nêu egress worker + audit; code nêu SSRF + test gaps → đã fix hết các điểm code-được; egress là kiểm soát ops). **VẬN HÀNH CẦN**: `npx web-push generate-vapid-keys` → đặt vào `.env` (`MASTER_KEY` đã exclude rsync, VAPID cũng nằm trong `.env`); whitelist egress worker tới host push provider (fcm.googleapis.com / *.push.services.mozilla.com / web.push.apple.com / *.notify.windows.com) cạnh R2; test 1 lần trên Android/desktop Chrome. — *Ghi chú lịch sử (PWA phần đầu, ⚠️ Partial cũ):* `vite-plugin-pwa` (autoUpdate): manifest đủ **icons 192/512 + 512-maskable** (sinh bằng Pillow — nền kinpaku + trang công văn + mộc đỏ, on-brand) + `theme_color #f5efe3` khớp brand + display standalone. iOS: `apple-touch-icon` + `apple-mobile-web-app-capable/title` + `viewport-fit=cover` trong index.html → "Thêm vào MH chính" chạy. **Offline** (workbox): precache app shell + **runtimeCaching NetworkFirst `qlcv-api` (ALLOWLIST** chỉ JSON list/detail incoming/outgoing/tasks/search/tags/organizations/units/notifications — **negative-lookahead loại ảnh mộc/chữ ký `/image`,`/asset`, file nhị phân `/file`/`/download`/`/preview`/`.xlsx`/`.zip`, và `/api/auth/me`** chống tưởng phiên còn sống offline) + CacheFirst Google Fonts + `navigateFallback index.html` (denylist `/api`) → offline xem lại list/chi tiết CV đã tải. **Bảo mật cache thiết bị chung**: xoá cache `qlcv-api` khi **logout** VÀ khi `me===null` (đóng tab/hết phiên không logout). **Mobile**: AppShell vốn responsive (burger drawer `lg:hidden`, `.table-scroll`, drawer full-width @600px) + media `(max-width:768px)&(pointer:coarse)` ép **touch target ≥44px** (min-height thắng inline height). SW autoUpdate khi mở lại. Chuông in-app `NotificationBell` (poll 20s) = fallback khi không có push. 2 subagent review (FIX BLOCKER review-code: denylist cũ lọt ảnh mộc/chữ ký → đổi allowlist; nên-sửa: dọn cache khi unauthenticated). **DEFER (gap so "Done khi"):** **Web push** (nhắc hạn + CV mới giao) — vertical lớn (VAPID keys + bảng `push_subscriptions` + SW push handler + tích hợp cron `notify_due_tasks`; iOS Safari <16.4 không hỗ trợ); hiện chuông in-app cover. Cân nhắc `registerType:'prompt'` thay autoUpdate (tránh reload mất form đang gõ) ở vòng sau.
- **Done khi**:
  - Web có `manifest.json` + service worker đúng chuẩn PWA.
  - Chrome/Safari mobile hiện gợi ý "Cài đặt ứng dụng"/"Thêm vào màn hình chính".
  - Cài xong: icon riêng, mở fullscreen không thanh URL.
  - Offline: xem được danh sách + chi tiết CV đã load gần đây (cache).
  - Mobile UI responsive, touch-friendly (button ≥ 44px), menu burger, table scroll ngang.
  - Web push notification: nhắc hạn xử lý CV, có CV mới giao.
- **Edge cases**:
  - iOS PWA hạn chế (push trên Safari iOS < 16.4) → fallback bell trong app.
  - Update web → service worker tự update khi mở lại.

---

### Nhóm M — Danh bạ cơ quan

#### [CTC.RCV] M1. Danh bạ NƠI NHẬN (cho công văn ĐI)

- **User Story**: [CTC.RCV-01] Là người dùng, tôi muốn quản lý danh bạ các cơ quan/đơn vị thường nhận công văn của Thành Đạt, để khi soạn CV đi chọn nhanh nơi nhận, không phải gõ tay mỗi lần.
- **Ưu tiên**: **Must**
- **Trạng thái**: ✅ Done (27/06/2026) — CRUD đầy đủ (cả Quản lý + NV), tabs Nơi nhận/Cơ quan gửi, filter category Chung/GDNN/DVDL, chống trùng tên+địa chỉ, soft delete. Multi-select "gợi ý khi soạn CV" wire ở D1 (endpoint `?role=recipient&category=` đã sẵn).
- **Steps to Complete**:
  1. Vào "Danh bạ → Nơi nhận".
  2. Xem danh sách cơ quan đã có, có search + filter (Tất cả / Chung / Riêng GDNN / Riêng DVDL).
  3. "Thêm cơ quan mới" → tên đầy đủ, tên viết tắt, địa chỉ, email, SĐT, người liên hệ, ghi chú, phân loại (Chung / Riêng GDNN / Riêng DVDL).
  4. Sửa/xoá (soft delete) cơ quan đã có.
- **Done khi**:
  - Khi soạn CV đi (D1 bước 3) → multi-select hiện gợi ý từ danh bạ tương ứng đơn vị phát hành + danh bạ chung.
  - Quản lý + Nhân viên đều CRUD được.
  - Mỗi cơ quan có thể chứa nhiều địa chỉ nhận (chính + CC). _Phiên bản đầu chỉ 1 địa chỉ chính._
- **Edge cases**:
  - Tên cơ quan trùng → cảnh báo, không cho tạo trùng tuyệt đối; cho phép tạo nếu khác địa chỉ.
  - Xoá cơ quan đã có CV gắn → soft delete, vẫn hiển thị trong CV cũ.
  - Đổi phân loại (Chung ↔ Riêng) → CV cũ giữ link, CV mới theo phân loại mới.

#### [CTC.SND] M2. Danh bạ CƠ QUAN GỬI (cho công văn ĐẾN)

- **User Story**: [CTC.SND-01] Là người dùng, tôi muốn quản lý danh bạ các cơ quan thường gửi công văn đến Thành Đạt, để khi vào sổ CV đến chọn nhanh và tra cứu được lịch sử.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⚠️ Partial (28/06/2026) — CRUD cơ quan gửi (is_sender) xong, dùng chung entity organizations. **Autocomplete khi vào sổ ✅ (28/06):** `SenderCombobox` trong wizard `cong-van-den.vao-so.tsx` thay `<select>` tĩnh — gõ để tìm (debounce 250ms, query `/api/organizations?role=sender&q=`), dropdown chọn, nút "Bỏ chọn", giữ gợi ý OCR. **Thống kê số CV + lần cuối ✅ (28/06):** `org_doc_stats` batch (recipient→số CV đi published gửi tới + ngày phát hành gần nhất; sender→số CV đến registered nhận từ + ngày tiếp nhận giờ VN; **loại nháp+huỷ giữ số**), enrich `OrganizationOut.doc_count`/`last_activity`, cột "Số CV"+"Lần cuối" ở danh-ba. **Bảo mật:** received_count lọc `manager_only` cho Nhân viên (không lộ tồn tại CV mật qua con số tổng — integration test khoá). **Defer còn lại:** mức độ khẩn TB, fuzzy-match tên + merge + auto-tạo từ OCR khi vào sổ, pg_trgm GIN index.
- **Steps to Complete**:
  1. Vào "Danh bạ → Cơ quan gửi".
  2. Xem danh sách + search + sort theo "Số CV đã gửi".
  3. "Thêm cơ quan" → tên đầy đủ, tên viết tắt, địa chỉ, email, ghi chú.
  4. Sửa/xoá (soft delete).
  5. **Tự động tạo** khi vào sổ CV đến — nếu OCR/user nhập tên cơ quan chưa có trong danh bạ → web gợi ý "Cơ quan này chưa có trong danh bạ, tạo mới?" → 1 click tạo.
- **Done khi**:
  - Khi vào sổ CV đến (E1 bước 6) → autocomplete cơ quan gửi từ danh bạ.
  - Mỗi cơ quan có thống kê: số CV đã gửi, lần cuối gửi, mức độ khẩn trung bình.
  - Quản lý + Nhân viên đều CRUD.
- **Edge cases**:
  - Trùng tên gần giống (vd "Bộ Tài chính" vs "Bộ Tài Chính") → web fuzzy match similarity > 90% → gợi ý "Có phải bạn đang nói đến cơ quan X?".
  - Merge 2 cơ quan trùng → chuyển hết CV của A sang B → xoá A.
  - Cơ quan chỉ gửi 1 lần (vd cơ quan cá nhân, hộ dân) → vẫn tạo, không phải mọi entry trong danh bạ đều là cơ quan lớn.

---

## 4. Non-functional Requirements

### 4.1. Hiệu năng
- Trang load < 2 giây với mạng 5 Mbps.
- Tìm kiếm full-text < 1 giây trên dữ liệu 5000 CV.
- OCR PDF 5 trang < 30 giây (async qua queue, không block UI).
- Convert Word → PDF < 10 giây.
- Chèn mộc + chữ ký + xuất PDF < 5 giây.
- Upload file ≤ 50MB không timeout.

### 4.2. Bảo mật hạ tầng
- HTTPS bắt buộc (Let's Encrypt + Cloudflare Proxy ẩn IP gốc).
- Mã hoá file at-rest AES-256 (key giữ trong biến môi trường, không commit).
- Session-based auth (session lưu Redis, cookie HttpOnly) + bcrypt password (cost ≥ 12). _(TDD QĐ #1: dùng session Redis thay JWT để khoá user kick mọi phiên < 5s + quản lý đa phiên 4.6.1.)_
- Rate limit (10 req/s/IP) + Fail2ban.
- CSRF token cho mọi form.
- SQL injection protection qua ORM (SQLAlchemy).
- XSS sanitize input (HTML escape).
- 2FA cho Quản lý (tuỳ chọn GD2).
- Cookie HttpOnly + Secure + SameSite=Strict.

### 4.3. Khả dụng
- Uptime ≥ 99% (cho phép ~7 giờ downtime/tháng).
- Backup PostgreSQL hàng ngày sang Cloudflare R2, giữ 30 ngày.
- Backup file storage sync R2 (giữ vĩnh viễn — tài liệu pháp lý lưu ≥ 10 năm).
- Script restore < 30 phút từ R2 về VPS.
- Health check endpoint + monitoring (uptime ping bên ngoài).

### 4.3.1. Resilience — xử lý lỗi I/O & convert

- **File upload bị corrupt**: web parse header PDF/DOCX, nếu lỗi → từ chối ngay, báo "File hỏng/không đúng format". Không tạo record draft.
- **Convert Word → PDF fail** (font lạ, macro, OLE embed): retry 1 lần. Vẫn fail → giữ file Word gốc, hiển thị "Web không convert được, vui lòng convert thủ công và upload PDF". Cho user tải về Word gốc + upload PDF tay.
- **CV scan xoay 90°/180°/270°**: PaddleOCR `cls=True` (text angle classifier) tự xoay trước OCR. Nếu vẫn lệch → user xoay tay trong preview (rotate 90/180/270 buttons).
- **Disk full / R2 mất kết nối**: Monitoring → cảnh báo Admin khi disk > 85%. Upload fail → user thấy "Hệ thống tạm bận, thử lại sau" (KHÔNG để mất file). CV đã upload nhưng chưa sync R2 → retry queue tự động (Celery).
- **LibreOffice container crash**: Docker healthcheck auto restart. Job convert trong queue → retry 1 lần sau container lên lại. Quá 3 lần fail → user nhận thông báo + admin được alert (email/log).

### 4.4. Khả năng mở rộng
- Hỗ trợ ≥ 50 user đồng thời (dư xa cho 5 user thực tế).
- DB design cho 50.000+ CV (mở rộng từ ~5.000 ban đầu).
- File storage không giới hạn — R2 pay-per-use ~$0.015/GB/tháng.
- Backend container hoá Docker — dễ scale ngang nếu cần.

### 4.5. Tương thích trình duyệt + thiết bị
- Desktop: Chrome 90+, Edge 90+, Safari 14+, Firefox 90+.
- Mobile: iOS 14+, Android 10+.
- Viewport responsive: 320px (mobile S) → 4K (desktop).
- Touch-friendly button ≥ 44px ở mobile.

### 4.6. I18n / Định dạng Việt Nam (theo CORE_RULES)
- UTF-8 toàn bộ. Tiếng Việt có dấu đầy đủ, không mojibake.
- Date: `dd/mm/yyyy` hoặc `dd/mm/yyyy HH:mm` (24h, Asia/Saigon UTC+7).
- Number: `1.234.567,89` (phân cách hàng nghìn `.`, thập phân `,`).
- Tiền tệ: `1.234.567 đồng` hoặc `1.234.567 VND`.
- Font hỗ trợ tiếng Việt cho PDF/Excel export: Noto Sans Vietnamese, Times New Roman, Arial.
- **Timezone**: DB lưu mọi timestamp dạng UTC. UI render qua `dayjs.tz('Asia/Ho_Chi_Minh')`. Form input gửi backend ở dạng ISO `YYYY-MM-DDTHH:mm:00+07:00`. Sổ NĐ 30 xuất ra dùng giờ VN.

### 4.6.1. Session đa thiết bị
- Cho phép 1 user đăng nhập **đồng thời nhiều thiết bị/tab** (sếp PC + điện thoại).
- Trang "Phiên đăng nhập" (sau A3): user xem các session đang active + logout từng session riêng.
- Quản lý khoá tài khoản (A4) → kick MỌI session của user đó ngay lập tức.

### 4.7. Compliance pháp lý
- **Nghị định 30/2020/NĐ-CP** về công tác văn thư — mẫu sổ công văn, phụ lục III.
- **Luật Giao dịch điện tử 2023** — chữ ký số PAdES có hiệu lực.
- **Luật Lưu trữ** — giữ tài liệu ≥ 10 năm, có loại vĩnh viễn.

### 4.8. Accessibility
- Tương phản WCAG AA (tỉ lệ ≥ 4.5:1 với text thường, ≥ 3:1 với text lớn).
- Keyboard navigation đầy đủ (Tab/Shift+Tab/Enter/Esc).
- ARIA label cho screen reader.

---

## 4.9. Assumptions (giả định nền tảng)

Các giả định ngầm mà toàn bộ PRD dựa vào — nếu sai, cần thiết kế lại:

- **Người ký luôn có người thật ký bằng USB Token** — web không xử lý logic "uỷ quyền/đi vắng". Nếu sếp đi vắng → Quản lý tự setup thêm hồ sơ ký "Q. GIÁM ĐỐC" cho PGĐ → PGĐ ký số bằng USB Token của mình. Web chỉ chèn mộc/chữ ký + chuẩn bị PDF; hiệu lực pháp lý quyết định bởi ai ký số cuối cùng bằng USB Token.
- **Sếp có thể ký số từ bất kỳ đâu** — chỉ cần có máy có vSign + USB Token. Sếp ở nhà / công tác xa: tải PDF từ web → mở vSign offline → ký → upload lại file đã ký. Không cần ở văn phòng.
- **OCR PaddleOCR chạy CPU-only** — không cần GPU. RAM tối thiểu 2GB cho worker; trên VPS 11GB RAM (đang free 6.8GB) dư sức.
- **Cloudflare R2 do user Thành Đạt tự đăng ký** — tạo tài khoản Cloudflare, tạo R2 bucket, lấy `Access Key ID + Secret Access Key`, đưa cho dev cấu hình `.env` backend. Free tier 10GB; sau đó ~$0.015/GB/tháng.
- **DNS subdomain do user tự cấu hình** — A record subdomain (vd `qlcv.thanhdat.vn`) trỏ về VPS `36.50.26.199`. Dev hướng dẫn 1 lần nếu cần.
- **Seed dữ liệu khi deploy lần đầu**: migration Alembic tự seed 2 record `units` (GDNN xanh lá + DVDL tím) + 1 user `admin` (role Quản lý, pass random hiện 1 lần khi deploy lên console). Quản lý đổi pass + tạo user khác sau khi đăng nhập lần đầu.
- **Pháp luật văn thư + chữ ký số không đổi lớn** trong vòng 3 năm tới — NĐ 30/2020 + Luật Giao dịch điện tử 2023 giữ nguyên hiệu lực. Nếu đổi, cần migrate cấu trúc sổ và format số CV.

---

## 5. Out of Scope (KHÔNG làm trong app này)

Các tính năng dưới đây **không phát triển** trong scope hiện tại, dù có ý nghĩa tốt:

- **Email tự động** gửi công văn cho nơi nhận (loại nhóm I).
- **Zalo OA notification** (loại nhóm I).
- **Sao y bản chính** (loại nhóm J).
- **Import sổ cũ từ Excel** — bắt đầu sổ mới từ ngày deploy (loại nhóm K).
- **Workflow duyệt nhiều cấp** (nhân viên → trưởng phòng → sếp) — user đã chốt không cần.
- **Tích hợp trục liên thông văn bản quốc gia (VDXP)** của Văn phòng Chính phủ.
- **Tích hợp eOffice/VOffice** của bên thứ 3.
- **Mobile native app** (iOS/Android riêng) — chỉ PWA.
- **Ký số trực tiếp trên web** bằng USB Token (browser plugin / desktop companion) — user ký số ngoài web bằng vSign + USB Token Viettel-CA.
- **Multi-tenant** cho cơ quan khác ngoài 2 đơn vị Thành Đạt — hệ thống đóng cho 2 đơn vị này thôi.
- **AI suggest đơn vị xử lý** từ nội dung CV đến (chỉ filter cứng theo cơ quan gửi).
- **QR code xác thực công văn đi** trên file PDF.
- **Sticky bar / mini-widget** cho cán bộ ngoài app (Zalo Mini App / Web App).

---

## 6. Timeline & Milestones

### Giai đoạn 1 — MVP (~14 ngày làm việc)
**Mục tiêu**: phát hành công văn đi được, ký số được, đủ cho việc gấp.

Tính năng giao:
- A1 Đăng nhập, A2 Đăng xuất, A4 Quản lý người dùng.
- B1 Quản lý 2 đơn vị, B2 Cấu hình sổ công văn, B3a Switch view, B3b Branding header.
- C1 Quản lý mộc, C2 Quản lý chữ ký, C3 Tách nền auto, C4 Hồ sơ ký.
- D1-D6 toàn bộ Công văn ĐI (Luồng phát hành, Auto map vị trí, Giáp lai, Ký nháy, Liên kết phản hồi, Danh sách + Sổ).
- **M1 Danh bạ Nơi nhận**.
- H3 Audit log + Soft delete + Thùng rác.
- Deploy: VPS Ubuntu, Docker Compose, Nginx + Let's Encrypt + Cloudflare proxy.
- Backup R2 hàng ngày.

### Giai đoạn 2 — Đầy đủ nghiệp vụ (~16 ngày)
**Mục tiêu**: hệ thống quản lý văn bản hoàn chỉnh.

Tính năng giao:
- E1 Vào sổ CV đến, E1.5 Verify chữ ký số, E1.6 Check trùng 3 lớp.
- E2 Phân công xử lý, E3 Theo dõi xử lý.
- E4 Phụ lục đính kèm, E5 Danh sách + Sổ CV đến.
- **M2 Danh bạ Cơ quan gửi** (UI quản lý + auto-tạo khi vào sổ).
- F1 Tìm kiếm full-text, F2 Tag tự do.
- H2 Watermark cá nhân khi tải.

### Giai đoạn 3 — Nâng cao (~12 ngày)
**Mục tiêu**: production-grade, bàn giao.

Tính năng giao:
- A3 Đổi mật khẩu (Nice).
- G1 Dashboard tổng quan đầy đủ.
- G2 Xuất sổ NĐ 30, G3 Báo cáo tùy chỉnh, G4 Export ZIP theo năm.
- L1 PWA + Mobile responsive đầy đủ + Web push.
- Tinh chỉnh UX, bug fix, tối ưu hiệu năng.

**Tổng**: ~42 ngày làm việc (8-9 tuần thuần với 1 dev full-time, hoặc 12-14 tuần part-time).

---

## 7. Stack kỹ thuật (đã thống nhất)

- **Frontend**: Vite + React 18 + TypeScript + TanStack Router + React Query + Zustand + React Hook Form + Zod + Tailwind CSS + shadcn/ui + react-pdf + react-rnd. _(TDD QĐ #5: đổi từ Next.js sang Vite SPA tĩnh — app nội bộ sau login, không SEO/SSR; Nginx serve file tĩnh, không tốn process Node.)_
- **Backend**: FastAPI (Python 3.11+) + SQLAlchemy + Alembic.
- **Database**: PostgreSQL 16 (port mới 5437 trên VPS share).
- **Queue**: Celery + Redis (port 6380).
- **Storage**: Local filesystem + Cloudflare R2 cho file > 6 tháng và backup.
- **OCR**: PaddleOCR (model `vie`) + PyMuPDF (cho PDF có text layer).
- **PDF**: PyMuPDF (fitz) chèn mộc + pyHanko verify PAdES chữ ký số đầu vào.
- **Word → PDF**: LibreOffice headless trong Docker image backend.
- **Auth**: Session-based (Redis session store, cookie HttpOnly+Secure+SameSite=Strict) + bcrypt.
- **Deploy**: Docker Compose + Nginx + Let's Encrypt SSL + Cloudflare Proxy.
- **Hạ tầng**: VPS Ubuntu 22.04 sẵn có (36.50.26.199 — chia sẻ với 6 dự án khác).
- **Port dự kiến**: Frontend = file tĩnh do Nginx serve (không tốn port Node riêng), Backend `8003`, DB `5437`, Redis `6380`.
- **Domain**: subdomain user sẽ cung cấp sau (chưa cần gấp — config nội bộ trước).

---

## 8. Verification (cách kiểm tra PRD đạt yêu cầu)

Sau khi mỗi giai đoạn xong:
1. **Test luồng nghiệp vụ**: dùng 10 CV mẫu thật của Thành Đạt — đo thời gian phát hành/vào sổ thực tế.
2. **Test OCR**: dùng 20 CV scan thật từ các Sở/Bộ → đo độ chính xác auto-fill metadata.
3. **Test chống nhầm mộc**: thử phát hành CV của GDNN → đảm bảo chỉ thấy mộc GDNN.
4. **Test verify chữ ký số**: dùng CV đã ký số thật (vd CV của Sở/Cục đã ký) → web nhận diện đúng.
5. **Test hiệu năng**: nhập 100 CV, đo thời gian search, dashboard load.
6. **Test backup-restore**: xoá test data + restore từ R2 → đảm bảo nguyên vẹn.
7. **Test bảo mật**: chạy `nmap` + `OWASP ZAP` cơ bản trên domain → không có lỗ hổng nghiêm trọng.
8. **Đo các mục tiêu Goals (1.3)** sau 12 tháng vận hành thực tế.

---

## 9. Changelog — Senior PM Review (2026-06-25)

Review qua 5 điểm và bổ sung/sửa các phần sau:

### Điểm 1 — Mục mơ hồ
- ➕ Thêm **Nhóm M — Danh bạ cơ quan** (M1 Nơi nhận + M2 Cơ quan gửi), Must GD1/GD2.
- ➕ Thêm **mục 3.0 State machine** (CV đi 3 state, CV đến 3 state, Task 3+1 state) — tách CV state và Task state.
- ➕ Chốt: **User KHÔNG gắn đơn vị** — sửa mục 1.2 + E2 bước 5.
- ➕ Mộc giáp lai (D3) dùng tự động mộc của hồ sơ ký, không cần upload riêng.
- ➕ B2: thêm **cấu hình độ rộng STT zero-pad** riêng cho từng sổ (default 3).
- ➕ D2 cách C: định nghĩa **format JSON template** (toạ độ %).
- ➕ E1.5: chốt **trust list VN tự động cập nhật** từ NEAC mỗi tuần qua cron.

### Điểm 2 — Done khi
- ➕ D2 + E1: bỏ con số "70%", dùng "work-able" — nghiệm thu UX-based.
- ➕ F1: chốt thuật toán fuzzy — `pg_trgm` operator `%` + `unaccent`.
- ➕ G3 báo cáo Excel: định nghĩa 3 sheet (Tổng quan / Chi tiết / Tham số).
- ➕ H2 watermark: dùng PyMuPDF text layer, opacity 10%, 14pt, xoay 45°. Đo "không che nội dung" bằng OCR test.
- ➕ C3 tách nền: bỏ metric đo, dựa user duyệt visual.

### Điểm 3 — Edge case
- ➕ Race condition cấp số: **PostgreSQL SEQUENCE atomic**, chấp nhận nhảy số khi huỷ.
- ➕ Tuỳ chọn **"Chỉ Quản lý xem"** (flag per-CV) — KHÔNG tự động theo mức độ mật.
- ➕ Mục 4.3.1 Resilience: 5 case (file corrupt, convert fail, scan xoay 90°, disk full, LibreOffice crash).
- ➕ Mục 4.6 Timezone: DB lưu UTC, UI render Asia/Saigon.
- ➕ Mục 4.6.1 Session đa thiết bị: cho phép nhiều phiên + trang "Phiên đăng nhập".

### Điểm 4 — Assumption ngầm
- ➕ Mục 4.9 Assumptions: 7 giả định nền tảng (uỷ quyền ký, OCR CPU-only, R2 account, DNS, seed data, pháp luật, sếp ký từ xa).

### Điểm 5 — Conflict
- ➕ Conflict watermark vs check trùng SHA-256: **watermark generate on-the-fly khi tải**, KHÔNG sửa file gốc.
- ➕ Conflict xoá user vs CV người đó: render "Nguyễn Văn A (đã ngừng sử dụng)".
- ➕ Conflict "Dùng số có sẵn" vs SEQUENCE: `setval` để đồng bộ counter.
- ➕ Conflict D2 cách A vs PDF text layer: cách A áp dụng cho cả Word VÀ PDF có text layer (dùng `python-docx` hoặc `PyMuPDF`).

---

## 10. Tracking — Trạng thái user story (cập nhật thủ công mỗi build)

> Bảng tổng đồng bộ với field `Trạng thái` inline trong từng story (Mục 3). Mỗi lần đổi status story → cập nhật cả 2 nơi.

### Ký hiệu trạng thái
- 📝 **Draft** — story đang viết, chưa lock requirement
- ⏳ **Todo** — đã lock, sẵn sàng implement
- 🔄 **In Progress** — đang code
- ⚠️ **Partial** — code 1 phần, còn TODO/edge case chưa xong
- ✅ **Done** — code + test xong, deploy được

### Quy trình mỗi buổi build
1. Mở `PRD.md` → tìm story tiếp theo có trạng thái ⏳ Todo (ưu tiên theo Giai đoạn).
2. Đổi sang 🔄 In Progress **trước khi** viết dòng code đầu tiên (sync inline + bảng dưới).
3. Implement + test.
4. Đổi sang ✅ Done (full) hoặc ⚠️ Partial (còn TODO) **sau khi** test pass.
5. Lặp lại cho story tiếp theo.

### Giai đoạn 1 — MVP (19 story, ~14 ngày)

| ID | Mã | Tên story | Nhóm | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|
| USR.LGN | A1 | Đăng nhập | A | Must | ✅ Done |
| USR.LGO | A2 | Đăng xuất | A | Must | ✅ Done |
| USR.MNG | A4 | Quản lý người dùng | A | Must | ✅ Done |
| CFG.UNT | B1 | Quản lý 2 đơn vị | B | Must | ✅ Done |
| CFG.BOK | B2 | Cấu hình sổ công văn | B | Must | ✅ Done |
| CFG.VEW | B3a | Switch view đơn vị | B | Must | ⚠️ Partial |
| CFG.BRD | B3b | Branding header | B | Must | ✅ Done |
| SIG.SEL | C1 | Quản lý mộc | C | Must | ✅ Done |
| SIG.SGN | C2 | Quản lý chữ ký | C | Must | ✅ Done |
| SIG.BG | C3 | Tách nền tự động khi upload | C | Must | ✅ Done |
| SIG.PRO | C4 | Hồ sơ ký (chống nhầm mộc) | C | Must | ✅ Done |
| OUT.PUB | D1 | Luồng phát hành CV đi (cốt lõi) | D | Must | ⚠️ Partial |
| OUT.MAP | D2 | Auto map vị trí mộc/chữ ký (4 cách) | D | Must | ⚠️ Partial |
| OUT.GLA | D3 | Đóng giáp lai (3 lựa chọn) | D | Must | ⚠️ Partial |
| OUT.INI | D4 | Ký nháy mỗi trang | D | Must | ⚠️ Partial |
| OUT.LNK | D5 | Liên kết CV đi với CV đến | D | Must | ✅ Done |
| OUT.LST | D6 | Danh sách + Sổ CV đi | D | Must | ⚠️ Partial |
| CTC.RCV | M1 | Danh bạ Nơi nhận (CV đi) | M | Must | ✅ Done |
| SEC.AUD | H3 | Audit log + Soft delete + Thùng rác | H | Must | ✅ Done |

### Giai đoạn 2 — Đầy đủ nghiệp vụ (11 story, ~16 ngày)

| ID | Mã | Tên story | Nhóm | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|
| INC.REG | E1 | Vào sổ CV đến (luồng chính) | E | Must | ⚠️ Partial |
| INC.VER | E1.5 | Verify chữ ký số PAdES | E | Must | ⏳ Todo |
| INC.DUP | E1.6 | Check trùng 3 lớp | E | Must | ✅ Done |
| INC.ASG | E2 | Phân công xử lý | E | Must | ⚠️ Partial |
| INC.TRK | E3 | Theo dõi xử lý | E | Must | ⚠️ Partial |
| INC.ATT | E4 | Phụ lục đính kèm | E | Must | ⏳ Todo |
| INC.LST | E5 | Danh sách + Sổ CV đến | E | Must | ⚠️ Partial |
| CTC.SND | M2 | Danh bạ Cơ quan gửi (CV đến) | M | Must | ⚠️ Partial |
| SRC.FTS | F1 | Tìm kiếm full-text | F | Must | ⏳ Todo |
| SRC.TAG | F2 | Tag tự do | F | Must | ⏳ Todo |
| SEC.WMK | H2 | Watermark cá nhân khi tải PDF | H | Must | ⏳ Todo |

### Giai đoạn 3 — Nâng cao (6 story, ~12 ngày)

| ID | Mã | Tên story | Nhóm | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|
| USR.PWD | A3 | Đổi mật khẩu | A | Nice | ⏳ Todo |
| RPT.DSH | G1 | Dashboard tổng quan | G | Should | ⏳ Todo |
| RPT.BOK | G2 | Xuất sổ CV đi/đến NĐ 30/2020 | G | Must | ⏳ Todo |
| RPT.STA | G3 | Báo cáo thống kê tuỳ chỉnh | G | Must | ⏳ Todo |
| RPT.ZIP | G4 | Export ZIP toàn bộ CV theo năm | G | Must | ⏳ Todo |
| PWA | L1 | PWA + Mobile-responsive | L | Must | ⏳ Todo |

### Tổng kết tiến độ

| Giai đoạn | Tổng | 📝 Draft | ⏳ Todo | 🔄 In Progress | ⚠️ Partial | ✅ Done |
|---|---|---|---|---|---|---|
| GĐ 1 | 19 | 0 | 19 | 0 | 0 | 0 |
| GĐ 2 | 11 | 0 | 11 | 0 | 0 | 0 |
| GĐ 3 | 6 | 0 | 6 | 0 | 0 | 0 |
| **Tổng** | **36** | **0** | **36** | **0** | **0** | **0** |
