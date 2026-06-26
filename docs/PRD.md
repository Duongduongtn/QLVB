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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
- **Done khi**: bấm "Đăng xuất" → xoá session → redirect về trang login trong < 1 giây. Session đã đăng xuất không còn dùng để gọi API protected.

#### [USR.PWD] A3. Đổi mật khẩu

- **User Story**: [USR.PWD-01] Là người dùng, tôi muốn tự đổi mật khẩu, để bảo mật tài khoản cá nhân.
- **Ưu tiên**: **Nice** _(giai đoạn 1 chưa cần; tạm thời Quản lý reset pass cho user qua màn hình Quản lý người dùng)_
- **Trạng thái**: ⏳ Todo
- **Done khi**: nhập pass hiện tại + pass mới (2 lần) → pass mới hợp lệ (≥ 8 ký tự, có cả chữ + số), khác pass cũ → đổi xong và bị bắt đăng nhập lại.
- **Edge cases**: pass mới giống pass cũ → từ chối. Pass yếu → từ chối kèm lý do cụ thể.

#### [USR.MNG] A4. Quản lý người dùng (chỉ Quản lý)

- **User Story**: [USR.MNG-01] Là Quản lý, tôi muốn tạo - sửa - khoá - reset pass cho các user, để kiểm soát ai được dùng QLCV.
- **Ưu tiên**: **Must** — đầy đủ UI ngay từ Giai đoạn 1.
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
- **Done khi**: click chuyển → mọi list (CV đi, danh bạ, sổ) tự lọc theo đơn vị đã chọn trong < 0.5 giây. View "Tất cả" chỉ Quản lý thấy được.

#### [CFG.BRD] B3b. Branding header (tên app + logo)

- **User Story**: [CFG.BRD-01] Là Quản lý, tôi muốn cấu hình tên app + logo trên header, để hiển thị đúng thương hiệu.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
- **Done khi**: đổi → mọi trang hiển thị tên/logo mới ngay sau reload.

---

### Nhóm C — Mộc + Chữ ký + Hồ sơ ký

#### [SIG.SEL] C1. Quản lý mộc

- **User Story**: [SIG.SEL-01] Là Quản lý, tôi muốn upload và quản lý các con mộc của 2 đơn vị, để khi phát hành CV chọn được mộc đúng đơn vị.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
- **Steps to Complete**:
  1. Trong luồng D1 bước 7, tick "Ký nháy mỗi trang".
  2. Chọn range tương tự D3: Không / Toàn bộ / Range.
  3. Web chèn chữ ký mini (size ~30%) ở góc dưới phải mỗi trang trong range, **trừ trang cuối** (vì có chữ ký chính).
- **Done khi**: mỗi trang trong range (trừ trang cuối) đều có chữ ký nháy nhỏ ở góc.
- **Edge cases**: CV 1 trang → vô hiệu hoá. Range chỉ chứa trang cuối → không chèn gì, báo "Không có trang nào để ký nháy".

#### [OUT.LNK] D5. Liên kết CV đi với CV đến (phản hồi)

- **User Story**: [OUT.LNK-01] Là người soạn CV đi, tôi muốn đánh dấu CV này là phản hồi của 1 công văn đến (nếu có), để tra cứu liên kết 2 chiều sau này.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
- **Steps to Complete**: trong luồng D1 bước 3, có ô tuỳ chọn "Phản hồi công văn đến" → tìm + chọn CV đến → lưu liên kết.
- **Done khi**: xem CV đi thấy link sang CV đến gốc; xem CV đến thấy danh sách CV đi phản hồi.
- **Edge cases**: 1 CV đến có thể có nhiều CV đi phản hồi (1 từ GDNN + 1 từ DVDL); 1 CV đi chỉ phản hồi 1 CV đến.

#### [OUT.LST] D6. Danh sách + Sổ công văn đi

- **User Story**: [OUT.LST-01] Là người dùng, tôi muốn xem danh sách CV đi, lọc theo đơn vị/thời gian/loại/trạng thái/người ký, để tra cứu nhanh.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
- **Steps to Complete**:
  - **Lớp 1 — SHA-256 hash**: trùng tuyệt đối → cảnh báo MẠNH 🔴 + link CV cũ + nút "Xem / Vẫn lưu / Huỷ".
  - **Lớp 2 — Trùng metadata** (số ký hiệu + cơ quan gửi + ngày VB): trùng có thể → cảnh báo TRUNG BÌNH 🟡 + gợi ý "Có thể cùng CV gửi cho cả 2 đơn vị → vào sổ 1 lần, gán xử lý Cả 2".
  - **Lớp 3 — OCR text similarity > 90%**: nghi trùng → cảnh báo NHẸ 🟢 + cho user quyết.
- **Done khi**: cả 3 lớp hoạt động đúng cấp độ. User luôn quyết được "Vẫn lưu" (kèm lý do để audit).
- **Edge cases**: lưu trùng phải nhập lý do; Admin xem được log "trùng nhưng vẫn lưu".

#### [INC.ASG] E2. Phân công xử lý

- **User Story**: [INC.ASG-01] Là Nhân viên, tôi muốn phân công CV đến cho 1 hoặc cả 2 đơn vị + gán người cụ thể, để rõ trách nhiệm xử lý.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
- **Done khi**:
  - GD1: trang chủ là "Việc của tôi" liệt kê CV được giao + nhắc hạn xử lý.
  - GD2: thêm KPI cards (CV đi/đến tháng này, CV chưa xử lý, CV quá hạn), biểu đồ CV theo tháng, top cơ quan gửi, pie loại VB, tỉ lệ xử lý đúng hạn, toggle view đơn vị, filter thời gian.
  - Quản lý thấy đủ; Nhân viên chỉ thấy phần liên quan mình.
- **Edge cases**: dữ liệu rỗng → message "Chưa có dữ liệu".

#### [RPT.BOK] G2. Xuất sổ CV đi/đến theo mẫu NĐ 30/2020

- **User Story**: [RPT.BOK-01] Là Quản lý, tôi muốn xuất sổ ra Excel đúng template Phụ lục III NĐ 30/2020, để in lưu trữ + nộp cơ quan lưu trữ.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
- **Done khi**: chọn năm + loại sổ (Sổ đi GDNN / Sổ đi DVDL / Sổ đến chung) → tải Excel có đầy đủ cột chuẩn NĐ 30 (Số TT, Số/ký hiệu, Ngày, Trích yếu, Người ký, Đơn vị/người nhận, Số bản, Ghi chú).
- **Edge cases**: Excel mở được trên Office 2010+; có header tiếng Việt có dấu đầy đủ.

#### [RPT.STA] G3. Báo cáo thống kê tuỳ chỉnh

- **User Story**: [RPT.STA-01] Là Quản lý, tôi muốn lọc CV theo nhiều tiêu chí + xuất Excel báo cáo, để báo cáo cho cấp trên.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
- **Done khi**: chọn khoảng thời gian + đơn vị + loại VB + nhóm theo (tháng/quý/cơ quan/loại) → xuất Excel **3 sheet**:
  - Sheet 1 `Tổng quan`: bảng pivot CV theo (Tháng × Loại VB) + biểu đồ cột.
  - Sheet 2 `Chi tiết`: list từng CV với cột metadata đầy đủ (số, ngày, trích yếu, người ký, nơi nhận/cơ quan gửi, trạng thái).
  - Sheet 3 `Tham số`: ghi lại bộ filter user đã chọn để xuất (thời gian + đơn vị + loại + nhóm theo).

#### [RPT.ZIP] G4. Export ZIP toàn bộ CV theo năm

- **User Story**: [RPT.ZIP-01] Là Quản lý, tôi muốn xuất toàn bộ CV của 1 năm thành ZIP, để backup hoặc nộp lưu trữ điện tử.
- **Ưu tiên**: **Must**
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
- **Trạng thái**: ⏳ Todo
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
| USR.LGN | A1 | Đăng nhập | A | Must | ⏳ Todo |
| USR.LGO | A2 | Đăng xuất | A | Must | ⏳ Todo |
| USR.MNG | A4 | Quản lý người dùng | A | Must | ⏳ Todo |
| CFG.UNT | B1 | Quản lý 2 đơn vị | B | Must | ⏳ Todo |
| CFG.BOK | B2 | Cấu hình sổ công văn | B | Must | ⏳ Todo |
| CFG.VEW | B3a | Switch view đơn vị | B | Must | ⏳ Todo |
| CFG.BRD | B3b | Branding header | B | Must | ⏳ Todo |
| SIG.SEL | C1 | Quản lý mộc | C | Must | ⏳ Todo |
| SIG.SGN | C2 | Quản lý chữ ký | C | Must | ⏳ Todo |
| SIG.BG | C3 | Tách nền tự động khi upload | C | Must | ⏳ Todo |
| SIG.PRO | C4 | Hồ sơ ký (chống nhầm mộc) | C | Must | ⏳ Todo |
| OUT.PUB | D1 | Luồng phát hành CV đi (cốt lõi) | D | Must | ⏳ Todo |
| OUT.MAP | D2 | Auto map vị trí mộc/chữ ký (4 cách) | D | Must | ⏳ Todo |
| OUT.GLA | D3 | Đóng giáp lai (3 lựa chọn) | D | Must | ⏳ Todo |
| OUT.INI | D4 | Ký nháy mỗi trang | D | Must | ⏳ Todo |
| OUT.LNK | D5 | Liên kết CV đi với CV đến | D | Must | ⏳ Todo |
| OUT.LST | D6 | Danh sách + Sổ CV đi | D | Must | ⏳ Todo |
| CTC.RCV | M1 | Danh bạ Nơi nhận (CV đi) | M | Must | ⏳ Todo |
| SEC.AUD | H3 | Audit log + Soft delete + Thùng rác | H | Must | ⏳ Todo |

### Giai đoạn 2 — Đầy đủ nghiệp vụ (11 story, ~16 ngày)

| ID | Mã | Tên story | Nhóm | Ưu tiên | Trạng thái |
|---|---|---|---|---|---|
| INC.REG | E1 | Vào sổ CV đến (luồng chính) | E | Must | ⏳ Todo |
| INC.VER | E1.5 | Verify chữ ký số PAdES | E | Must | ⏳ Todo |
| INC.DUP | E1.6 | Check trùng 3 lớp | E | Must | ⏳ Todo |
| INC.ASG | E2 | Phân công xử lý | E | Must | ⏳ Todo |
| INC.TRK | E3 | Theo dõi xử lý | E | Must | ⏳ Todo |
| INC.ATT | E4 | Phụ lục đính kèm | E | Must | ⏳ Todo |
| INC.LST | E5 | Danh sách + Sổ CV đến | E | Must | ⏳ Todo |
| CTC.SND | M2 | Danh bạ Cơ quan gửi (CV đến) | M | Must | ⏳ Todo |
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
