# Technical Design Document — QLCV (Quản lý Công văn & Ký số)

> **Version:** 1.0 · **Ngày:** 26/06/2026 · **Author:** Solo dev + AI tools
> **Status:** Draft
> **PRD reference:** `docs/PRD.md`
> **Decisions reference:** 13 quyết định kiến trúc (phiên 1 + phiên 2, 26/06/2026)

---

## 1. Overview

### Bài toán

Trung tâm GDNN Thành Đạt và Công ty CP DVDL Thành Đạt (gọi chung **2 đơn vị Thành Đạt**, ~5 user) đang quản lý công văn bằng Excel rời rạc, phát hành theo quy trình thủ công **soạn Word → in → đóng mộc tay + ký tay → scan ngược → gửi**. Hậu quả: chậm (~30 phút/CV), PDF scan mờ xấu, lưu trữ rải rác, khó tra cứu, dễ nhầm mộc giữa 2 đơn vị.

### Giải pháp

Web nội bộ giúp: upload công văn → **chèn mộc + chữ ký theo toạ độ** → cấp số tự động → tải về PDF rõ nét sẵn sàng **ký số bằng USB Token Viettel-CA** (ký ngoài web bằng vSign). Cộng thêm: sổ công văn đến có **OCR + check trùng + verify chữ ký số PAdES**, tìm kiếm full-text, danh bạ, báo cáo NĐ 30/2020.

### Scope của TDD này

Bao gồm toàn bộ hệ thống 9 nhóm tính năng (A–H, L, M) qua 3 giai đoạn. **Không bao gồm** (Out of scope theo PRD Mục 5): email/Zalo tự động, sao y bản chính, import sổ Excel cũ, workflow duyệt nhiều cấp, tích hợp trục liên thông VDXP, ký số trực tiếp trên web, multi-tenant.

### Quyết định kiến trúc quan trọng (13 quyết định đã chốt)

| # | Quyết định | Chọn cách |
|---|---|---|
| 1 | **Auth/session** | Session lưu **Redis** (cookie HttpOnly), tra mỗi request → kick session < 5s |
| 2 | **Chèn mộc/chữ ký** | Toạ độ **%** là nguồn chân lý; server **PyMuPDF** chèn duy nhất; client chỉ preview |
| 3 | **Storage** | Local nóng + **Cloudflare R2** lạnh; backend luôn **stream** (giải mã→watermark→gửi); **mã hoá phong bì** |
| 4 | **Job topology** | Tách **worker Celery** riêng (LibreOffice/PaddleOCR/rembg/ZIP cách ly crash) |
| 5 | **Frontend** | **Vite + React** (SPA tĩnh) — KHÔNG Next.js (app nội bộ sau login, không SEO/SSR) |
| 6 | **Realtime** | **Polling React Query** + Web Push, KHÔNG SSE/WebSocket |
| 7 | **Testing** | **Full test pyramid**, ưu tiên test bất biến chịu lực trước |
| 8 | **API contract** | **Codegen OpenAPI** — FastAPI là nguồn chân lý duy nhất của type |
| 9 | **Schema đa hình** | **Tách 2 bảng** CV đi/đến; audit log **polymorphic mềm** |
| 10 | **State FE** | **Zustand** (client state) + React Query (server state) |
| 11 | **Form/validate** | **React Hook Form + Zod** (ghép shadcn/ui Form) |
| 12 | **Job nền** | Bảng **`jobs`** trong Postgres làm nguồn chân lý; Celery update; React Query poll |
| 13 | **CI/CD + giám sát** | GitHub Actions + **Continuous Deployment** qua SSH · **Sentry** + structlog + UptimeRobot |

> 💡 **Tại sao chốt 13 cái này trước khi code:** đây là các lựa chọn xuyên suốt, sai thì phải viết lại nhiều — chốt trước giúp AI gen code bám 1 hướng nhất quán, tránh "mỗi nơi một kiểu".

---

## 2. System Architecture

### 2.1 High-level diagram

```
┌──────────────────────────────────────────────────────────────┐
│                          CLIENT                                │
│   Vite + React SPA (file tĩnh) — TanStack Router + React Query │
│   Zustand · React Hook Form + Zod · shadcn/ui · react-pdf      │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS (cookie HttpOnly, credentials: include)
                                │ type-safe client sinh từ OpenAPI (openapi-fetch)
┌───────────────────────────────▼──────────────────────────────┐
│                    NGINX (reverse proxy + SSL)                 │
│   serve file tĩnh FE  ·  proxy /api → FastAPI  ·  Let's Encrypt │
└───────┬───────────────────────────────────────┬──────────────┘
        │ /api/*                                 │ (static)
┌───────▼───────────────────┐        ┌───────────▼──────────────┐
│   BACKEND — FastAPI (8003) │        │   FE static bundle (dist) │
│   ┌─────────────────────┐  │        └──────────────────────────┘
│   │ Routers (REST)      │  │
│   │ Pydantic validate   │  │   op nhẹ + chèn mộc PDF ít trang đồng bộ
│   │ SQLAlchemy + Alembic│  │
│   │ session check Redis │  │
│   └─────────┬───────────┘  │
└─────────────┼──────────────┘
              │ enqueue (broker)         ┌──────────────────────────┐
       ┌──────▼─────────┐ ◄── poll ──────┤  CELERY WORKER (container │
       │  Redis (6380)  │                │  riêng — cách ly crash)   │
       │  broker+session│ ──── update ──►│  LibreOffice · PaddleOCR  │
       └────────────────┘   bảng jobs    │  rembg · ZIP · R2-sync    │
                                         └────────────┬─────────────┘
┌──────────────────────┐  ┌──────────────────────┐    │
│  PostgreSQL 16 (5437) │  │  Local filesystem    │◄───┘ đọc/ghi file
│  data + tsvector FTS  │  │  (kho nóng, mã hoá)  │
│  SEQUENCE cấp số      │  └──────────┬───────────┘
│  bảng jobs · audit    │             │ sync (Celery)
└──────────────────────┘  ┌──────────▼───────────┐
                          │  Cloudflare R2       │  (kho lạnh + backup ≥10 năm)
                          │  file > 6 tháng/backup│
                          └──────────────────────┘
        ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐
        │ Sentry SaaS │  │ UptimeRobot  │  │ NEAC trust list    │
        │ (scrub PII) │  │ ping /health │  │ (cron tuần, cache) │
        └─────────────┘  └──────────────┘  └────────────────────┘
```

### 2.2 Các thành phần chính

| Component | Vai trò | Tech |
|---|---|---|
| **Web App (FE)** | UI soạn CV, vào sổ, tra cứu — SPA tĩnh | Vite + React 18 + TypeScript + Tailwind + shadcn/ui |
| **API Layer (BE)** | REST API, business logic, validate, op nhẹ + chèn mộc ít trang | FastAPI (Python 3.11) + SQLAlchemy + Alembic |
| **Worker** | Việc nặng async, cách ly crash | Celery + Redis broker |
| **Database** | Toàn bộ data + full-text search + cấp số atomic | PostgreSQL 16 |
| **Cache/Broker/Session** | Session store + Celery broker | Redis 7 |
| **File Storage nóng** | Kho chính, file mã hoá at-rest | Local filesystem |
| **File Storage lạnh** | Backup + file cũ ≥ 10 năm | Cloudflare R2 (S3-compatible) |
| **PDF engine** | Chèn mộc/chữ ký/watermark, đọc text | PyMuPDF (fitz) |
| **OCR** | Đọc PDF scan tiếng Việt | PaddleOCR (model `vie`) |
| **Tách nền** | Mộc đỏ / chữ ký | rembg (U2Net) + OpenCV |
| **Verify chữ ký số** | PAdES CV đến | pyHanko |
| **Word→PDF** | Convert .docx/.doc | LibreOffice headless |
| **Reverse proxy** | SSL, serve FE, route API | Nginx + Let's Encrypt + Cloudflare Proxy |

> 💡 **Tại sao tách BE/FE/Worker rời nhau** (không monorepo Next.js như template OPA): trái tim app là **Python** (PyMuPDF/PaddleOCR/rembg/pyHanko) → BE bắt buộc Python. FE chỉ là SPA gọi API → tách ra để build tĩnh, nhẹ. Worker tách để LibreOffice/OCR crash không kéo sập web.

### 2.3 Deployment topology (VPS Ubuntu 22.04 — chia sẻ 6 dự án khác)

```
VPS 36.50.26.199 (Docker Compose, project name: qlcv)
├── nginx (80/443)              ← reverse proxy + SSL (dùng chung hoặc riêng)
├── qlcv_frontend               ← chỉ build ra /dist, Nginx serve tĩnh (KHÔNG process Node)
├── qlcv_backend (8003)         ← FastAPI (uvicorn/gunicorn)
├── qlcv_worker                 ← Celery worker (LibreOffice + OCR + rembg cài sẵn trong image)
├── qlcv_beat                   ← Celery beat (cron: trust list tuần, backup ngày, dọn trash)
├── qlcv_postgres (5437)        ← PostgreSQL 16
└── qlcv_redis (6380)           ← Redis (session + broker)
```

> 💡 **Tại sao `docker compose -p qlcv`:** đặt project name cô lập → mọi lệnh deploy chỉ đụng container QLCV, **không ảnh hưởng 6 dự án cùng VPS**. FE là file tĩnh nên không tốn process Node 3008 như phương án Next.js ban đầu.

### 2.4 Network / trust boundary (hỗ trợ §10.4 — cách ly worker)

```mermaid
flowchart TB
    Internet((Internet)) -->|HTTPS 443| CF[Cloudflare Proxy ẩn IP gốc]
    CF --> NG[Nginx — điểm vào DUY NHẤT]
    subgraph VPS[VPS Ubuntu — chia sẻ 6 dự án — project qlcv]
        NG -->|static| FE[FE dist tĩnh]
        NG -->|/api| BE[Backend FastAPI]
        BE --> PG[(PostgreSQL 5437)]
        BE --> RD[(Redis 6380 — session+broker)]
        BE --> LS[(Local storage mã hoá)]
        RD -. broker .-> WK
        subgraph ISO[Worker — NETWORK ISOLATED]
            WK[Celery Worker — LibreOffice / OCR / rembg]
        end
        WK --> PG
        WK --> LS
    end
    BE -->|egress whitelist| R2[(Cloudflare R2)]
    WK -->|chỉ egress R2| R2
    WK -. chặn .-> INTRA[Intranet / 6 dự án khác / metadata endpoint]
    BE --> SEN[Sentry SaaS — scrub PII]
    style ISO fill:#fdd,stroke:#c00
    style INTRA stroke-dasharray: 5
```

> 💡 **Tại sao vẽ trust boundary:** worker là dịch vụ DUY NHẤT đụng file lạ → là điểm yếu RCE/SSRF lớn nhất. Sơ đồ này biến "cách ly mạng worker" (§10.4) thành cấu hình Docker network kiểm được: worker chỉ ra R2, KHÔNG chạm intranet/6 dự án khác.

---

## 3. Data Model

### 3.1 Entity Relationship Overview

```
units (2 cố định) ──< document_types ──< numbering_registry (SEQUENCE)
   │  │  │
   │  │  └──< seals ────────┐
   │  └──< signatures ──────┼──< signing_profiles
   │                        │
   ├──< outgoing_documents >─┴── (signing_profile_id, seal đóng theo hồ sơ)
   │       │  │  │
   │       │  │  └──< outgoing_recipients >── organizations (nơi nhận)
   │       │  └── in_reply_to ──► incoming_documents (D5 phản hồi)
   │       └── stamp_positions (JSON %)
   │
   └ (CV đến KHÔNG gắn đơn vị phát hành — sổ đến CHUNG)
incoming_documents ──< incoming_attachments
   │     │
   │     └── sender ──► organizations (cơ quan gửi)
   │
   └──< processing_tasks >── users (assigned_to)  · unit_id (đơn vị xử lý)

users ──< (created_by mọi nơi)        files (mã hoá phong bì) ◄── documents tham chiếu
tags ──< document_tags (polymorphic)  jobs (polymorphic related)
audit_logs (polymorphic mềm)          app_settings (branding)
```

> 💡 **Tại sao tách `outgoing_documents` + `incoming_documents` (QĐ #9):** 2 loại CV khác hẳn luồng/sổ/state/metadata. Gộp 1 bảng `documents` sẽ đẻ ra hàng chục cột NULL + `if direction == 'out'` rải khắp code (AI gen dễ sót nhánh). Phần dùng chung (tag, audit, file) tách riêng và tham chiếu **polymorphic**, không lặp.

### 3.1b ERD chuẩn (cardinality)

```mermaid
erDiagram
    units ||--o{ document_types : "có"
    units ||--o{ seals : "sở-hữu"
    units ||--o{ signatures : "mặc-định"
    units ||--o{ signing_profiles : "thuộc"
    units ||--o{ outgoing_documents : "phát-hành"
    document_types ||--o{ numbering_registry : "SEQUENCE-theo-period"
    document_types ||--o{ stamp_templates : "toạ-độ-%"
    document_types ||--o{ outgoing_documents : "loại"
    signatures ||--o{ signing_profiles : "chữ-ký"
    seals ||--o{ signing_profiles : "mộc-cùng-đơn-vị"
    signing_profiles ||--o{ outgoing_documents : "áp-mộc+chữ-ký"
    outgoing_documents ||--o{ outgoing_recipients : "gửi"
    organizations ||--o{ outgoing_recipients : "nơi-nhận"
    organizations ||--o{ incoming_documents : "cơ-quan-gửi"
    incoming_documents ||--o{ incoming_attachments : "phụ-lục"
    incoming_documents ||--o{ processing_tasks : "phân-công"
    incoming_documents ||--o{ outgoing_documents : "in_reply_to-D5"
    users ||--o{ processing_tasks : "assigned_to"
    users ||--o{ push_subscriptions : "thiết-bị"
    users ||--o{ audit_logs : "polymorphic-mềm"
    files ||--o{ outgoing_documents : "PDF"
    files ||--o{ incoming_documents : "PDF"
    tags ||--o{ document_tags : "polymorphic"
    jobs }o--o| users : "created_by"
```

> 💡 **Tại sao tách ERD ra Mermaid có cardinality:** ~22 bảng, quan hệ n-n (`outgoing_recipients`) và polymorphic (`document_tags`, `audit_logs`) khó thấy từ SQL phẳng. ERD giúp điều hướng nhanh khi code + thấy ngay chỗ chống-nhầm-mộc (`seals/signatures → signing_profiles` cùng `unit`).

### 3.2 Schema chi tiết

```sql
-- ════════════════════════════════════════════════════════════
-- USERS (KHÔNG gắn đơn vị — xem PRD 1.2)
-- ════════════════════════════════════════════════════════════
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL,                     -- UNIQUE qua partial index (xem dưới)
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,                    -- bcrypt cost ≥ 12
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff'
                CHECK (role IN ('manager','staff')),      -- manager kiêm admin
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,        -- FALSE = khoá → kick session
  failed_logins SMALLINT     NOT NULL DEFAULT 0,           -- A1: khoá 15' sau 5 lần sai
  locked_until  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,                              -- soft delete (A4: giữ created_by)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
-- PARTIAL UNIQUE: username chỉ unique TRONG SỐ user chưa xoá → soft-delete "vanthu1" xong
-- vẫn tạo lại được "vanthu1" mới (edge 2.2). Tương phản: incoming_documents UNIQUE cứng
-- (arrival_year, arrival_number) — số đến KHÔNG tái dùng kể cả khi huỷ (nghiệp vụ).
CREATE UNIQUE INDEX uq_users_username_active ON users(username) WHERE deleted_at IS NULL;
-- Lưu ý: KHÔNG có bảng sessions. Session lưu Redis (QĐ #1). "Phiên đăng nhập" (4.6.1)
-- liệt kê từ Redis set: session:user:{id} → {session_id}.

-- ════════════════════════════════════════════════════════════
-- UNITS — 2 đơn vị cố định (GDNN xanh lá / DVDL tím)
-- ════════════════════════════════════════════════════════════
CREATE TABLE units (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,                -- 'GDNN' | 'DVDL'
  full_name   VARCHAR(255) NOT NULL,
  short_name  VARCHAR(100),
  address     TEXT,
  tax_code    VARCHAR(20),
  phone       VARCHAR(30),
  email       VARCHAR(255),
  logo_file_id BIGINT REFERENCES files(id),
  color       VARCHAR(10) NOT NULL,                       -- mã màu, không đổi sau khi có CV
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- DOCUMENT TYPES + NUMBERING (B2 — cấu hình sổ)
-- ════════════════════════════════════════════════════════════
CREATE TABLE document_types (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direction     VARCHAR(3) NOT NULL CHECK (direction IN ('out','in')),
  unit_id       BIGINT REFERENCES units(id),             -- NULL với sổ đến (chung 2 đơn vị)
  name          VARCHAR(100) NOT NULL,                    -- "Công văn", "Quyết định"...
  code          VARCHAR(20)  NOT NULL,                    -- "CV", "QĐ", "TTr"...
  number_format VARCHAR(100) NOT NULL,                    -- "{STT}/{LOAI}-{DONVI}" biến hoá
  reset_policy  VARCHAR(10)  NOT NULL DEFAULT 'year'
                CHECK (reset_policy IN ('year','month','none')),
  zero_pad      SMALLINT     NOT NULL DEFAULT 3,          -- 3 → 001; 0 = không pad
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,        -- "Ngừng dùng" thay vì xoá
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Registry CHỈ ánh xạ (doc_type, period) → tên SEQUENCE thực. KHÔNG giữ giá trị đếm.
-- Nguồn chân lý số đếm = PG SEQUENCE duy nhất (đọc last_value qua pg_sequences khi cần hiển thị).
CREATE TABLE numbering_registry (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_type_id   BIGINT NOT NULL REFERENCES document_types(id),
  period_key    VARCHAR(7) NOT NULL,                      -- '2026' (reset năm) hoặc '2026-06' (reset tháng)
  sequence_name VARCHAR(120) NOT NULL,                    -- PG sequence thực: seq_out_gdnn_cv_2026
  UNIQUE (doc_type_id, period_key)
);
-- KHÔNG có cột current_value (tránh 2 nguồn chân lý lệch nhau). "Số kế tiếp" hiển thị cho user
-- đọc từ: SELECT last_value FROM pg_sequences WHERE sequencename = :name  → +1.

-- ════════════════════════════════════════════════════════════
-- SEALS + SIGNATURES + SIGNING PROFILES (Nhóm C — chống nhầm mộc)
-- ════════════════════════════════════════════════════════════
CREATE TABLE seals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id     BIGINT NOT NULL REFERENCES units(id),       -- mộc gắn cứng đơn vị → chống nhầm
  name        VARCHAR(150) NOT NULL,
  seal_type   VARCHAR(20) DEFAULT 'round'
              CHECK (seal_type IN ('round','hanging','overlap')),
  file_id     BIGINT NOT NULL REFERENCES files(id),       -- PNG alpha đã tách nền (rembg)
  uploaded_by BIGINT REFERENCES users(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,              -- inactive thay vì xoá
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signatures (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  title           VARCHAR(150),                           -- chức danh
  default_unit_id BIGINT REFERENCES units(id),
  file_id         BIGINT NOT NULL REFERENCES files(id),   -- PNG alpha (OpenCV threshold)
  uploaded_by     BIGINT REFERENCES users(id),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signing_profiles (                            -- C4: 1 hồ sơ = người ký + chữ ký + mộc + đơn vị
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id       BIGINT NOT NULL REFERENCES units(id),
  signature_id  BIGINT NOT NULL REFERENCES signatures(id),
  seal_id       BIGINT NOT NULL REFERENCES seals(id),      -- ràng buộc: seal.unit_id = unit_id (check ở service)
  display_title VARCHAR(150) NOT NULL,                     -- chức danh hiển thị trên CV
  name          VARCHAR(100) NOT NULL,                     -- tên hồ sơ ngắn ("GĐ TT GDNN")
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- FILES (mã hoá phong bì — QĐ #3)
-- ════════════════════════════════════════════════════════════
CREATE TABLE files (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key   VARCHAR(500) NOT NULL,                     -- đường dẫn local + key R2 (cùng key)
  location      VARCHAR(10) NOT NULL DEFAULT 'local'
                CHECK (location IN ('local','r2','both')),
  wrapped_key   BYTEA,                                     -- per-file key bọc master key (.env). NULL = không mã hoá (asset mộc/logo)
  sha256        CHAR(64) NOT NULL,                         -- hash file GỐC (trước watermark) — E1.6 check trùng
  size_bytes    BIGINT NOT NULL,
  mime_type     VARCHAR(100),
  original_name VARCHAR(300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_files_sha256 ON files(sha256);

-- ════════════════════════════════════════════════════════════
-- OUTGOING DOCUMENTS (CV ĐI — Nhóm D)
-- ════════════════════════════════════════════════════════════
CREATE TABLE outgoing_documents (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id            BIGINT NOT NULL REFERENCES units(id),  -- đơn vị phát hành
  doc_type_id        BIGINT NOT NULL REFERENCES document_types(id),
  number             VARCHAR(100),                          -- số đã cấp "247/CV-GDNN"; NULL khi draft
  number_int         BIGINT,                                -- STT số nguyên (để sort/check trùng)
  period_key         VARCHAR(7),                            -- '2026'
  subject            TEXT NOT NULL,                          -- trích yếu
  issue_date         DATE NOT NULL,
  status             VARCHAR(12) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','numbered','published','cancelled')),
                     -- 'numbered' = đã cấp số (đốt 1 số) nhưng CHƯA upload file ký số.
                     -- Cho phép báo cáo liệt kê "số treo" để Quản lý đối chiếu sổ (edge 2.1).
  signing_profile_id BIGINT REFERENCES signing_profiles(id),
  stamp_positions    JSONB,                                 -- toạ độ % đã chèn (QĐ #2)
  sealing_option     JSONB,                                 -- giáp lai (D3) + ký nháy (D4): {kind,range}
  original_file_id   BIGINT REFERENCES files(id),           -- PDF chưa ký số (_CHUA_KY_SO)
  signed_file_id     BIGINT REFERENCES files(id),           -- PDF đã ký số upload lại (D1.12)
  in_reply_to        BIGINT REFERENCES incoming_documents(id), -- D5 phản hồi
  cancel_reason      TEXT,                                  -- bắt buộc khi huỷ CV đã phát hành
  created_by         BIGINT REFERENCES users(id),
  deleted_at         TIMESTAMPTZ,                           -- soft delete → thùng rác 30 ngày
  search_vector      TSVECTOR,                              -- F1 full-text (trigger cập nhật)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_out_unit_status ON outgoing_documents(unit_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_out_search ON outgoing_documents USING GIN(search_vector);

CREATE TABLE outgoing_recipients (                          -- M2M CV đi ↔ nơi nhận
  outgoing_id     BIGINT NOT NULL REFERENCES outgoing_documents(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  PRIMARY KEY (outgoing_id, organization_id)
);

-- ════════════════════════════════════════════════════════════
-- INCOMING DOCUMENTS (CV ĐẾN — Nhóm E, sổ CHUNG 2 đơn vị)
-- ════════════════════════════════════════════════════════════
CREATE TABLE incoming_documents (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  arrival_number    BIGINT NOT NULL,                        -- số đến (sổ chung)
  arrival_year      SMALLINT NOT NULL,
  arrival_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  sender_id         BIGINT REFERENCES organizations(id),    -- cơ quan gửi
  reference_number  VARCHAR(100),                           -- số ký hiệu của CV gốc
  document_date     DATE,                                   -- ngày văn bản
  doc_type_id       BIGINT REFERENCES document_types(id),
  subject           TEXT,                                   -- trích yếu
  urgency           VARCHAR(20) DEFAULT 'normal'            -- Thường/Khẩn/Thượng khẩn/Hoả tốc/Hoả tốc hẹn giờ
                    CHECK (urgency IN ('normal','urgent','very_urgent','express','timed_express')),
  secrecy           VARCHAR(20) DEFAULT 'normal'            -- Thường/Mật/Tối mật/Tuyệt mật (chỉ ghi nhận, KHÔNG tự phân quyền)
                    CHECK (secrecy IN ('normal','secret','top_secret','absolute_secret')),
  deadline          DATE,
  manager_only      BOOLEAN NOT NULL DEFAULT FALSE,         -- flag "Chỉ Quản lý xem" (E1.6) — phân quyền độc lập secrecy
  status            VARCHAR(12) NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','done','cancelled')),
  has_signature     BOOLEAN,                                -- E1.5: PDF có chữ ký số?
  signature_valid   BOOLEAN,                                -- verify pyHanko hợp lệ?
  signature_info    JSONB,                                  -- {ca, signer, signed_at, valid_until}
  file_id           BIGINT REFERENCES files(id),            -- PDF gốc (mã hoá)
  ocr_text          TEXT,                                   -- text trích từ OCR/PyMuPDF
  status_reason     TEXT,                                   -- lý do huỷ / lý do "vẫn lưu trùng"
  created_by        BIGINT REFERENCES users(id),
  deleted_at        TIMESTAMPTZ,
  search_vector     TSVECTOR,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arrival_year, arrival_number)
);
CREATE INDEX idx_in_status ON incoming_documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_in_search ON incoming_documents USING GIN(search_vector);
-- search_vector tính bằng trigger BEFORE INSERT OR UPDATE → chạy lại MỖI KHI manager_only đổi
-- (E1.6 cho phép manager bật/tắt cờ SAU khi vào sổ). manager_only=TRUE → search_vector KHÔNG
-- chứa ocr_text (chỉ subject/reference_number); FALSE → index lại đầy đủ. KHÔNG set-once.

CREATE TABLE incoming_attachments (                         -- E4 phụ lục
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incoming_id BIGINT NOT NULL REFERENCES incoming_documents(id) ON DELETE CASCADE,
  file_id     BIGINT NOT NULL REFERENCES files(id),
  file_kind   VARCHAR(20),                                  -- pdf/excel/image
  ocr_text    TEXT,                                         -- chỉ PDF OCR
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- PROCESSING TASKS (E2/E3 — phân công xử lý)
-- ════════════════════════════════════════════════════════════
CREATE TABLE processing_tasks (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incoming_id     BIGINT NOT NULL REFERENCES incoming_documents(id) ON DELETE CASCADE,
  unit_id         BIGINT NOT NULL REFERENCES units(id),      -- đơn vị xử lý (Cả 2 → 2 task)
  assigned_to     BIGINT REFERENCES users(id),               -- chọn từ TẤT CẢ user (không lọc đơn vị)
  assigned_by     BIGINT REFERENCES users(id),
  status          VARCHAR(15) NOT NULL DEFAULT 'assigned'
                  CHECK (status IN ('assigned','in_progress','done','transferred')),
  deadline        DATE,
  note            TEXT,
  transferred_to  BIGINT REFERENCES processing_tasks(id),    -- task mới khi chuyển người
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_task_assignee ON processing_tasks(assigned_to, status);
-- Quy tắc state CV đến: tất cả task done → incoming.status = 'done' (trigger/service).

-- ════════════════════════════════════════════════════════════
-- ORGANIZATIONS (danh bạ M1 nơi nhận + M2 cơ quan gửi — 1 bảng, 2 vai)
-- ════════════════════════════════════════════════════════════
CREATE TABLE organizations (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name     VARCHAR(300) NOT NULL,
  short_name    VARCHAR(150),
  address       TEXT,
  email         VARCHAR(255),
  phone         VARCHAR(30),
  contact_person VARCHAR(150),
  note          TEXT,
  is_recipient  BOOLEAN NOT NULL DEFAULT FALSE,              -- M1: dùng cho CV đi
  is_sender     BOOLEAN NOT NULL DEFAULT FALSE,              -- M2: dùng cho CV đến
  category      VARCHAR(10) DEFAULT 'common'                 -- M1 scope: Chung/Riêng GDNN/Riêng DVDL
                CHECK (category IN ('common','gdnn','dvdl')),
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_trgm ON organizations USING GIN(full_name gin_trgm_ops); -- M2 fuzzy match

-- ════════════════════════════════════════════════════════════
-- TAGS (F2 — polymorphic) + TEMPLATES (D2-C) + SETTINGS (B3b)
-- ════════════════════════════════════════════════════════════
CREATE TABLE tags (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL                          -- chuẩn hoá: chữ thường + gạch ngang
);
CREATE TABLE document_tags (
  tag_id      BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  object_type VARCHAR(20) NOT NULL,                          -- 'outgoing' | 'incoming'
  object_id   BIGINT NOT NULL,
  PRIMARY KEY (tag_id, object_type, object_id)
);

CREATE TABLE stamp_templates (                               -- D2-C lưu toạ độ % theo loại VB
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_type_id BIGINT NOT NULL REFERENCES document_types(id),
  positions   JSONB NOT NULL,                                -- [{kind,page,x_pct,y_pct,w_pct,h_pct}]
  is_default  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_settings (                                  -- B3b branding (single row hoặc key-value)
  id        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name  VARCHAR(150) NOT NULL DEFAULT 'QLCV Thành Đạt',
  logo_file_id BIGINT REFERENCES files(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE push_subscriptions (                            -- L1 Web Push (VAPID) — 1 dòng / thiết bị
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,                                  -- URL push service của trình duyệt
  p256dh     TEXT NOT NULL,                                  -- key mã hoá payload
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)                                 -- 1 user nhiều thiết bị (PC + ĐT)
);

-- ════════════════════════════════════════════════════════════
-- JOBS (QĐ #12 — nguồn chân lý trạng thái job nền)
-- ════════════════════════════════════════════════════════════
CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(20) NOT NULL                         -- convert/ocr/rembg/sign_verify/zip/r2_sync
                CHECK (type IN ('convert','ocr','rembg','sign_verify','zip_export','r2_sync')),
  status        VARCHAR(12) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),
  progress      SMALLINT NOT NULL DEFAULT 0,                 -- 0..100
  retry_count   SMALLINT NOT NULL DEFAULT 0,                 -- quá 3 → alert admin (4.3.1)
  related_type  VARCHAR(20),                                 -- polymorphic
  related_id    BIGINT,
  result        JSONB,                                       -- vd {ocr_text, file_id...}
  error_message TEXT,                                        -- tiếng Việt sẵn cho UI
  heartbeat_at  TIMESTAMPTZ,                                 -- worker update mỗi ~15s khi running
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Reaper (Celery beat): job status='running' mà heartbeat_at < now()-5' → worker đã chết →
-- đánh 'failed' + retry (edge 2.3). Tránh job kẹt 'running' mãi khiến FE poll vô tận.
CREATE INDEX idx_jobs_related ON jobs(related_type, related_id);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('pending','running');

-- ════════════════════════════════════════════════════════════
-- AUDIT LOG (H3 — polymorphic mềm, QĐ #9, KHÔNG FK cứng)
-- ════════════════════════════════════════════════════════════
CREATE TABLE audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT,                                        -- KHÔNG FK cứng: log sống sót khi user/CV xoá
  action      VARCHAR(40) NOT NULL,                          -- login/create/update/delete/download/issue_number/cancel...
  object_type VARCHAR(30),                                   -- 'outgoing_document'|'incoming_document'|'user'|'seal'...
  object_id   BIGINT,
  ip          INET,
  user_agent  TEXT,
  detail      JSONB,                                         -- vd {number_cancelled:247, reason:"..."}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_object ON audit_logs(object_type, object_id);
CREATE INDEX idx_audit_user_time ON audit_logs(user_id, created_at DESC);
```

> 💡 **Tại sao audit_logs không có FK cứng:** log phải **tồn tại kể cả khi CV bị xoá vĩnh viễn** sau 30 ngày (H3) — yêu cầu pháp lý truy vết. FK cứng + cascade sẽ xoá mất lịch sử. Polymorphic mềm (`object_type`+`object_id`) cho 1 bảng log phục vụ mọi loại object, thêm loại mới khỏi đổi schema.

### 3.3 Cấp số atomic — chi tiết SEQUENCE (B2 / D1.10)

```
SEQUENCE được tạo LAZY (theo period), KHÔNG tạo sẵn lúc tạo document_type.
Lý do: reset theo năm/tháng nghĩa là MỖI period là 1 sequence riêng (PG sequence không tự reset).
Sequence của năm 2027 chỉ ra đời khi phát hành CV đầu tiên của 2027.

Hàm cấp số (chạy trong 1 transaction):
  1. period_key := tính từ issue_date + reset_policy   ('2026' | '2026-06' | 'all' nếu none)
  2. get-or-create sequence (atomic, idempotent):
        sequence_name := f"seq_{dir}_{unit}_{typecode}_{period_key}"
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || sequence_name;
        INSERT INTO numbering_registry(...) ON CONFLICT (doc_type_id, period_key) DO NOTHING;
  3. n := nextval(sequence_name)        -- ATOMIC, 2 user đồng thời KHÔNG trùng
        → format theo number_format + zero_pad → "247/CV-GDNN"

CV huỷ → số đã cấp KHÔNG tái dùng (nextval không lùi). Sổ chấp nhận "nhảy số" (246→248).

"Dùng số có sẵn" N (sau khi get-or-create sequence cho period):
   last := last_value của sequence
   - N > last  → setval(sequence_name, N) → số tự cấp kế tiếp = N+1 (không trùng về sau)
   - N ≤ last  → check trùng record trong (doc_type, period); chưa trùng thì cho ghi,
                 SEQUENCE GIỮ NGUYÊN (không lùi). Báo user "Số tự cấp tiếp theo vẫn là last+1".
```

> 💡 **Tại sao PG SEQUENCE thay vì `SELECT MAX(number)+1`:** SEQUENCE atomic ở tầng DB → 2 user phát hành cùng lúc **không bao giờ trùng số** mà không cần khoá bảng. `MAX+1` có race condition.

### 3.4 Mã hoá phong bì (Envelope encryption)

```
Master key (MASTER_KEY, 32 byte trong .env, KHÔNG commit)
  └─ mỗi file: sinh per-file key ngẫu nhiên (DEK)
       ├─ mã hoá nội dung: AES-256-GCM(DEK) → lưu ciphertext ra local/R2
       └─ bọc DEK:        AES-256(MASTER_KEY) → lưu vào files.wrapped_key
Đọc file: unwrap DEK bằng MASTER_KEY → giải mã nội dung → stream cho client.
```

> 💡 **Tại sao phong bì thay vì mã hoá thẳng bằng master key:** đổi master key sau này chỉ cần **bọc lại DEK** (vài KB), không phải giải-mã-mã-hoá-lại toàn bộ file CV. Cột `wrapped_key` để sẵn ngay từ đầu dù GĐ1 có thể dùng master key trực tiếp.

---

## 4. API Design

### 4.1 Base & Auth

```
Base: https://<subdomain>/api
Auth: cookie HttpOnly `qlcv_session` (Secure, SameSite=Strict) — credentials: include
      Backend tra session_id trong Redis mỗi request (QĐ #1).
Type: FE consume openapi.json → sinh client type-safe (openapi-typescript + openapi-fetch, QĐ #8)
Error envelope thống nhất: { "error": { "code": "DUPLICATE_NUMBER", "message": "Số 247 đã tồn tại trong sổ" } }
Pagination: ?page=1&size=20 → { items: [...], total, page, size }
```

> 💡 **Tại sao error envelope + pagination cố định:** FE viết 1 lần component xử lý lỗi/phân trang dùng chung; AI gen endpoint mới bám đúng khuôn, không "mỗi API một format".

### 4.2 Auth + Users (Nhóm A)

```
POST   /api/auth/login              username + password → set cookie session (Redis)
POST   /api/auth/logout             xoá session khỏi Redis
GET    /api/auth/me                 user hiện tại + role
PUT    /api/auth/password           A3 đổi mật khẩu (Nice)
GET    /api/auth/sessions           4.6.1 liệt kê phiên đang active (từ Redis)
DELETE /api/auth/sessions/:sid      logout 1 phiên cụ thể

GET    /api/users                   A4 danh sách (manager) — search + paginate
POST   /api/users                   tạo user (pass tạm)
PUT    /api/users/:id               sửa / khoá (is_active) / hạ role
                                    "Còn 1 manager cuối": check trong transaction với
                                    SELECT count(*) ... WHERE role='manager' AND is_active FOR UPDATE
                                    → chặn 2 manager đồng thời hạ nhau về 0 manager (race)
POST   /api/users/:id/reset-password  sinh pass mới, hiện 1 lần
```

### 4.3 Config + Đơn vị + Sổ (Nhóm B)

```
GET/PUT /api/units                  B1 xem/sửa 2 đơn vị
GET/PUT /api/settings               B3b branding (app_name, logo)
GET    /api/document-types          B2 danh sách loại VB (?direction=out&unit_id=)
POST   /api/document-types          thêm loại + format số + zero_pad → tạo SEQUENCE
PUT    /api/document-types/:id       sửa / "ngừng dùng"
POST   /api/document-types/:id/preview-number   preview số theo format
```

### 4.4 Mộc + Chữ ký + Hồ sơ ký (Nhóm C)

```
GET/POST /api/seals                 C1 (POST upload → job rembg tách nền)
GET/POST /api/signatures            C2 (POST upload → job OpenCV tách nền)
POST    /api/uploads/remove-bg      C3 tách nền + trả preview + ngưỡng slider
GET/POST /api/signing-profiles      C4 hồ sơ ký (lọc seal theo unit → chống nhầm)
PUT     /api/signing-profiles/:id   inactive
```

### 4.5 Công văn ĐI (Nhóm D)

```
GET    /api/outgoing                D6 danh sách + filter đa tiêu chí + search
POST   /api/outgoing                D1.1 tạo draft (upload file → job convert nếu Word)
GET    /api/outgoing/:id            chi tiết (file chưa ký + đã ký + lịch sử)
PUT    /api/outgoing/:id            sửa metadata draft
POST   /api/outgoing/:id/auto-map   D2 auto dò vị trí mộc/chữ ký (4 cách A→D) → trả positions %
POST   /api/outgoing/:id/preview    D1.8 render PDF có mộc (server PyMuPDF chèn — QĐ #2)
POST   /api/outgoing/:id/issue      D1.10 cấp số (auto / dùng số có sẵn) → nextval/setval
                                    IDEMPOTENT: nếu number != NULL → trả lại số cũ, KHÔNG nextval
                                    lần 2 (chống bấm 2 lần đốt 2 số). Set status='numbered'.
GET    /api/outgoing/:id/download   D1.11 stream PDF + watermark on-the-fly (_CHUA_KY_SO)
POST   /api/outgoing/:id/signed     D1.12 upload file đã ký số → status=published
POST   /api/outgoing/:id/cancel     huỷ (lý do); published→cancel chỉ manager
POST   /api/outgoing/:id/save-template  D2 lưu vị trí làm template (stamp_templates)
```

### 4.6 Công văn ĐẾN (Nhóm E)

```
POST   /api/incoming/upload         E1.2 upload PDF (batch) → job detect+OCR+verify
GET    /api/incoming/:jobId/draft   poll kết quả OCR auto-fill + check trùng + verify chữ ký số
POST   /api/incoming                E1.8 lưu vào sổ → cấp số đến (SEQUENCE chung)
GET    /api/incoming                E5 danh sách + filter
GET    /api/incoming/:id            chi tiết
PUT    /api/incoming/:id            sửa metadata / đổi flag manager_only (manager)
POST   /api/incoming/:id/cancel     huỷ (lý do)
POST   /api/incoming/:id/assign     E2 phân công (GDNN/DVDL/Cả 2 → 1-2 task)
GET    /api/tasks/mine              E3 "Việc của tôi" (polling React Query ~10s)
PUT    /api/tasks/:id               cập nhật status / chuyển người / ghi chú
POST   /api/incoming/:id/attachments  E4 phụ lục (PDF → job OCR)
```

### 4.7 Tìm kiếm + Tag + Danh bạ + Báo cáo (F, M, G)

```
GET    /api/search                  F1 full-text (tsvector + pg_trgm) ?q=&type=&unit=&...
GET/POST /api/tags                  F2
GET/POST/PUT/DELETE /api/organizations   M1+M2 danh bạ (?role=recipient|sender)
GET    /api/reports/book            G2 xuất sổ NĐ 30 (Excel) ?year=&book=
POST   /api/reports/custom          G3 báo cáo 3 sheet
POST   /api/reports/export-zip      G4 ZIP theo năm → job zip_export
GET    /api/dashboard               G1 KPI (GĐ2)
```

### 4.8 Jobs + Audit + Thùng rác (D12, H3)

```
GET    /api/jobs/:id                QĐ #12 poll trạng thái job (React Query)
GET    /api/audit                   H3 audit log + filter
GET    /api/trash                   H3 thùng rác (manager)
POST   /api/trash/:type/:id/restore khôi phục < 30 ngày
GET    /api/health                  UptimeRobot ping
```

### 4.9 Request/Response example

```json
// POST /api/outgoing/:id/issue  — cấp số
// Request
{ "mode": "manual" }                              // hoặc {"mode":"existing","number":123}
// Response 200
{ "number": "247/CV-GDNN", "number_int": 247, "next_auto": 248 }

// POST /api/incoming/upload → 202 Accepted
{ "job_id": "7c3...", "status": "pending" }        // FE poll /api/jobs/7c3...

// GET /api/jobs/7c3... → khi xong
{ "status": "done", "result": {
    "ocr_text": "...", "auto_fill": { "reference_number": "1234/UBND",
    "document_date": "2026-06-20", "sender": "UBND Tỉnh..." },
    "duplicates": [{ "layer": 1, "level": "red", "doc_id": 88 }],
    "signature": { "has": true, "valid": true, "ca": "Viettel-CA" } } }
```

---

## 5. Authentication & Authorization

### 5.1 Flow đăng nhập (session Redis — QĐ #1)

```
POST /api/auth/login (username, password, remember?)
  → tìm user; nếu locked_until > now → 423 "Tài khoản đã bị khoá"
  → bcrypt.verify(password, hash)  (cost ≥ 12)
      sai → failed_logins++; ≥5 trong 15' → locked_until = now+15'; báo lỗi CHUNG
  → đúng → tạo session_id (uuid) → lưu Redis:
        SET session:{session_id} = {user_id, role}  TTL = 8h (hoặc 7 ngày nếu remember)
        SADD session:user:{user_id} = session_id      (để liệt kê/kick)
  → set cookie HttpOnly Secure SameSite=Strict `qlcv_session=session_id`
  → audit_logs(action=login, ip, ua)
```

### 5.2 Middleware kiểm tra mỗi request

```python
# FastAPI dependency — chạy trước route protected
def current_user(session=Cookie(None)) -> User:
    data = redis.get(f"session:{session}")          # tra Redis mỗi request
    if not data: raise HTTPException(401)            # hết hạn / đã logout / bị kick
    user = db.get(User, data["user_id"])
    if not user.is_active: raise HTTPException(403)  # khoá → kick ngay (< 5s)
    return user

def require_manager(user=Depends(current_user)):
    if user.role != 'manager': raise HTTPException(403, "Chỉ Quản lý")
```

### 5.3 Kick session khi khoá user (A4 / 4.6.1)

```
PUT /api/users/:id  is_active=false  → 
  DEL mọi session:{sid} trong SMEMBERS session:user:{id}  → mọi phiên chết trong < 5s
```

### 5.4 Seed lần đầu (PRD 4.9)

```
Alembic migration seed: 2 units (GDNN xanh / DVDL tím) + 1 user admin (role manager,
pass random in ra console 1 lần). Manager đổi pass + tạo user sau khi đăng nhập.
```

> 💡 **Tại sao session Redis thay vì JWT** (khác template OPA dùng JWT): PRD đòi **khoá user → kick mọi phiên < 5s** (A4) + **liệt kê/logout từng phiên** (4.6.1). JWT stateless không thu hồi được giữa chừng nếu chưa hết hạn; phải duy trì blacklist — phức tạp hơn chính session store. Redis tra mỗi request là cách trực tiếp nhất.

> ⚠️ **Sửa PRD:** Mục 4.2 + Mục 7 ghi "JWT" → đổi thành **session-based (Redis)**.

### 5.5 Phân quyền (RBAC 2 role)

| Hành động | Manager | Staff |
|---|---|---|
| Nghiệp vụ CV đi/đến, vào sổ, phân công, tra cứu | ✅ | ✅ |
| Upload mộc gốc / chữ ký / hồ sơ ký, cấu hình sổ, đổi branding, tạo user, audit log | ✅ | ❌ |
| View "Tất cả" đơn vị (B3a) | ✅ | ❌ (chỉ GDNN/DVDL) |
| Huỷ CV đã phát hành (có số), xoá CV đã phát hành | ✅ | ❌ |
| Xem CV `manager_only`, tải bản gốc không watermark | ✅ | ❌ |

---

## 6. Core Workflows (Data flow các tính năng MUST)

### 6.0 State machines (chu kỳ sống — bug nghiệp vụ hay nấp ở đây)

**CV ĐI** — `draft → numbered → published → cancelled` (`numbered` là sub-state của "Draft" theo PRD):

```mermaid
stateDiagram-v2
    [*] --> draft: upload file (D1)
    draft --> numbered: /issue cấp số (idempotent, đốt 1 số)
    numbered --> published: upload file đã ký số (/signed)
    draft --> cancelled: huỷ — Quản lý + Nhân viên
    numbered --> cancelled: huỷ — số treo, KHÔNG tái dùng
    published --> cancelled: thu hồi — CHỈ Quản lý, có lý do
    numbered --> [*]: bỏ ngang = số treo (báo cáo G liệt kê)
    published --> [*]
    cancelled --> [*]
```

**CV ĐẾN** — sổ chung 2 đơn vị:

```mermaid
stateDiagram-v2
    [*] --> new: vào sổ (cấp số đến)
    new --> done: mọi task done (hoặc không cần giao)
    new --> cancelled: huỷ — kèm lý do
    done --> cancelled: thu hồi — CHỈ Quản lý
    done --> [*]
    cancelled --> [*]
```

**TASK xử lý** — 1 CV đến có thể sinh nhiều task (Cả 2 đơn vị → 2 task):

```mermaid
stateDiagram-v2
    [*] --> assigned: phân công (E2)
    assigned --> in_progress: người nhận mở task
    in_progress --> done: hoàn tất
    assigned --> transferred: chuyển người khác
    in_progress --> transferred: chuyển người khác
    transferred --> [*]: sinh task mới cho người mới
    done --> [*]
```

> 💡 **Tại sao vẽ riêng state machine:** chuyển trạng thái sai (vd Nhân viên huỷ CV `published`, hay `numbered` bỏ ngang không truy được) là loại bug nghiệp vụ/pháp lý nặng. Sơ đồ này là "hợp đồng" để code transition guard cho đúng quyền.

### 6.1 D1 — Phát hành CV đi (luồng cốt lõi)

```
[FE] upload .docx/.pdf  →  POST /api/outgoing (draft)
   └─ Word? → tạo job 'convert' (Celery: LibreOffice → PDF) → FE poll /api/jobs
[FE] điền metadata + chọn đơn vị → API lọc signing_profiles theo unit (chống nhầm)
[FE] chọn hồ sơ ký → auto áp seal+signature+title
[BE] POST /auto-map  → D2 dò vị trí (A placeholder → B regex → C template → D thủ công)
                       trả về positions % (toạ độ % là nguồn chân lý — QĐ #2)
[FE] kéo thả tinh chỉnh (overlay HTML, CHỈ preview)  → tick giáp lai (D3) / ký nháy (D4)
[BE] POST /preview    → PyMuPDF chèn thật theo % → trả PDF render (server chèn DUY NHẤT)
[FE] bước xác nhận chống nhầm mộc: "Phát hành với mộc TRUNG TÂM GDNN. Đúng chứ?" → OK
[BE] POST /issue      → IDEMPOTENT (number sẵn → trả lại, không nextval lần 2)
                       → nextval(SEQUENCE) atomic (hoặc setval nếu dùng số có sẵn)
                       → status = 'numbered' (sub-state của "Draft" theo state machine PRD)
[FE] GET /download    → BE stream: giải mã → PyMuPDF chèn mộc + watermark on-the-fly
                       → file "_CHUA_KY_SO.pdf" + nhắc đỏ "Mở vSign + USB Token"
[user] ký số NGOÀI web (vSign + Viettel-CA) → upload lại
[BE] POST /signed     → status='published' → vào sổ; audit_logs(issue_number)
   (CV 'numbered' bỏ ngang = "số treo" → báo cáo G liệt kê cho Quản lý đối chiếu)
```

> 💡 **Tại sao server PyMuPDF là bộ chèn DUY NHẤT, client chỉ preview (QĐ #2):** nếu client cũng "chèn thật" thì file tải về có thể lệch so với cái user thấy (font/DPI/scale khác nhau). Một nguồn chèn = WYSIWYG đảm bảo. Toạ độ % để trang resize không lệch.

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant FE as FE (Vite SPA)
    participant BE as Backend (FastAPI)
    participant Q as Redis (broker)
    participant W as Celery Worker
    participant DB as PostgreSQL
    participant S as Storage (local+R2)

    U->>FE: Upload .docx/.pdf + metadata
    FE->>BE: POST /api/outgoing (draft)
    BE->>S: lưu file gốc (mã hoá)
    BE->>DB: INSERT outgoing (draft)
    alt File Word cần convert
        BE->>DB: INSERT jobs(convert, pending)
        BE->>Q: enqueue convert
        BE-->>FE: 202 {job_id}
        W->>Q: nhận job
        W->>S: đọc Word → LibreOffice → PDF
        W->>DB: UPDATE jobs(done) + file PDF
        loop poll mỗi 1-2s
            FE->>BE: GET /api/jobs/:id
            BE-->>FE: trạng thái
        end
    end
    FE->>BE: POST /auto-map (D2 dò vị trí %)
    BE-->>FE: positions %
    U->>FE: kéo thả tinh chỉnh (overlay HTML, chỉ preview)
    FE->>BE: POST /preview
    BE->>BE: PyMuPDF chèn mộc theo % (đồng bộ)
    BE-->>FE: PDF preview
    U->>FE: xác nhận đúng mộc đơn vị
    FE->>BE: POST /issue (idempotent)
    BE->>DB: nextval(SEQUENCE) atomic → number, status=numbered
    BE-->>FE: {number, next_auto}
    FE->>BE: GET /download
    BE->>S: đọc + giải mã trong RAM
    BE->>BE: PyMuPDF chèn mộc + watermark on-the-fly
    BE-->>U: PDF _CHUA_KY_SO.pdf
    Note over U: Ký số NGOÀI web — vSign + USB Token Viettel-CA
    U->>FE: upload file đã ký số
    FE->>BE: POST /signed
    BE->>DB: status=published + audit_log
    BE-->>FE: OK — CV vào sổ
```

### 6.2 E1 — Vào sổ CV đến

```
[FE] upload PDF (batch)  → POST /api/incoming/upload → job 'sign_verify'+'ocr'
   ⚠ Dedup trong lô: check trùng (3 lớp) so với CẢ DB LẪN các file đã xử lý trong cùng lô
     (giữ set SHA-256 tạm) → 2 file giống nhau trong 1 lô không cùng lọt (edge 2.5)
[Worker] pyHanko verify PAdES:
   có chữ ký số hợp lệ → badge xanh + BỎ QUA check trùng (chữ ký số đảm bảo duy nhất)
   không có          → detect text layer? PyMuPDF (nhanh) : PaddleOCR(vie) (scan)
                       → check trùng 3 lớp (SHA-256 / metadata / OCR similarity >90%)
[FE] poll /api/jobs → auto-fill form + hiện cảnh báo trùng (🔴/🟡/🟢)
[FE] user sửa: cơ quan gửi (autocomplete danh bạ, auto-tạo nếu mới), urgency, secrecy,
     deadline, flag "Chỉ Quản lý xem"
[BE] POST /api/incoming → nextval(SEQUENCE số đến chung) → lưu (file mã hoá local + job r2_sync)
```

> 💡 **Tại sao verify chữ ký số TRƯỚC, có chữ ký số thì bỏ check trùng:** chữ ký số PAdES đã đảm bảo CV thật + duy nhất → check trùng SHA/OCR là thừa. Tiết kiệm OCR cho file đã ký.

```mermaid
sequenceDiagram
    actor U as Nhân viên
    participant FE as FE
    participant BE as Backend
    participant Q as Redis
    participant W as Worker
    participant DB as PostgreSQL

    U->>FE: Upload PDF (batch nhiều file)
    FE->>BE: POST /api/incoming/upload
    BE->>DB: INSERT jobs(sign_verify, ocr)
    BE->>Q: enqueue
    BE-->>FE: 202 {job_id}
    W->>Q: nhận job
    W->>W: pyHanko verify PAdES
    alt Có chữ ký số hợp lệ
        W->>W: badge xanh, BỎ QUA check trùng
    else Không có chữ ký số
        W->>W: detect text — PyMuPDF hoặc PaddleOCR vie
        W->>DB: check trùng 3 lớp (DB + set SHA trong lô)
    end
    W->>DB: UPDATE jobs done — result auto_fill + duplicates + signature
    loop poll
        FE->>BE: GET /api/jobs/:id
        BE-->>FE: result
    end
    FE->>U: auto-fill + cảnh báo trùng 🔴🟡🟢
    U->>FE: sửa metadata + cờ manager_only
    FE->>BE: POST /api/incoming
    BE->>DB: nextval(SEQUENCE số đến chung) → lưu
    BE->>Q: enqueue r2_sync
    BE-->>FE: OK — số đến
```

### 6.3 H2 — Watermark khi tải (stream, không sửa file gốc)

```
GET /download → BE: đọc file mã hoá (local, fallback R2) → giải mã (unwrap DEK)
   → CV đã ký số? → KHÔNG watermark (phá chữ ký số) nhưng VẪN log tải
   → chưa ký số  → PyMuPDF thêm layer watermark "Tải bởi [user]-[dd/mm/yyyy hh:mm]-IP"
                    opacity 10%, 14pt, xoay 45° → stream
   → audit_logs(action=download)
File trên storage GIỮ NGUYÊN hash (watermark on-the-fly) → check trùng SHA-256 không lệch.
```

> 💡 **Tại sao watermark on-the-fly, không lưu vào file:** PRD H2 conflict với E1.6 — nếu watermark sửa file gốc thì SHA-256 đổi → check trùng sai. Generate lúc tải giữ file gốc bất biến.

### 6.4 Realtime — chuông + "Việc của tôi" (QĐ #6)

```
React Query poll GET /api/tasks/mine + GET /api/notifications mỗi 10s (5s khi tab active)
App đóng → Web Push (service worker + VAPID): CV mới giao, nhắc hạn (L1)
```

> 💡 **Tại sao polling thay vì WebSocket/SSE:** 5 user, tần suất thấp → polling 10s đơn giản hơn nhiều, không cần giữ kết nối mở; Web Push lo lúc app đóng. Không đáng dựng hạ tầng realtime.

---

## 7. Background Jobs (Celery + bảng jobs — QĐ #4, #12)

### 7.1 Kiến trúc

```
FastAPI .delay(job_id, ...) → Redis broker → Celery worker (container riêng)
Worker chạy → UPDATE jobs SET status='running', progress=...
   xong  → status='done', result=JSONB
   lỗi   → status='failed', error_message (tiếng Việt), retry_count++
            retry 1 lần; quá 3 → alert admin (Sentry + log)
FE: React Query poll GET /api/jobs/:id (KHÔNG đọc Celery result backend)
```

| Job type | Việc | Lib |
|---|---|---|
| `convert` | Word → PDF (poll nhanh 1-2s) | LibreOffice headless |
| `ocr` | PDF scan → text | PaddleOCR (vie), cls=True (tự xoay) |
| `rembg` | Tách nền mộc đỏ | rembg U2Net |
| `sign_verify` | Verify PAdES CV đến | pyHanko |
| `zip_export` | G4 ZIP theo năm | zipfile + stream |
| `r2_sync` | Sync file lên R2 | boto3 |

> 💡 **Tại sao Redis chỉ làm broker, trạng thái lưu bảng `jobs` Postgres (QĐ #12):** Redis result backend ephemeral (mất khi restart/TTL). Bảng `jobs` bền → đếm `retry_count` để alert sau 3 fail (4.3.1), giữ tiến độ batch 10 file qua F5, truy vết 10 năm.

### 7.2 Celery beat (cron)

```
- Cập nhật vn-trust-list.json từ NEAC mỗi tuần (E1.5); fail → dùng cache + cảnh báo
- Backup pg_dump → R2 mỗi ngày, giữ 30 ngày (4.3)
- Dọn thùng rác > 30 ngày (H3)
- Nhắc hạn task trước 1 ngày + highlight quá hạn (E3)
- Reaper job mồ côi: job 'running' mà heartbeat_at quá 5' → 'failed' + retry (edge 2.3)
```

---

## 8. File Storage & PDF Processing

### 8.1 Lớp trừu tượng storage (QĐ #3)

```python
class Storage:                      # bọc local + R2 sau 1 interface
    def put(file_id, plaintext) -> writes AES-256-GCM ciphertext (local; job sync R2)
    def read_decrypted(file_id) -> bytes   # đọc + verify GCM tag + giải mã TRONG RAM
# Mọi lượt tải QUA BACKEND (không presigned R2 URL) để: kiểm quyền + watermark + log.
```

> ⚠️ **Lưu ý GCM không stream được (risk 3.3):** AES-256-GCM cần TOÀN BỘ ciphertext để verify
> auth tag trước khi tin dữ liệu → **không giải mã từng chunk an toàn**. Cộng watermark PyMuPDF
> cũng phải load cả PDF. → Mô hình thực tế: **đọc-giải mã-watermark cả file trong RAM rồi trả**
> (KHÔNG phải true streaming). Chấp nhận được vì file ≤ 50MB + 5 user (đồng thời thấp).
> Cần đặt **giới hạn RAM/đồng thời tải** để nhiều download 50MB không spike RAM trên VPS chung.

> 💡 **Tại sao tải qua backend, không presigned URL:** cần **watermark cá nhân + kiểm quyền + ghi log tải** mỗi lượt (H2/H3). Presigned URL cho tải thẳng từ R2 thì bỏ qua 3 việc đó — đổi lại phải chịu chi phí RAM ở trên.

### 8.2 PDF (PyMuPDF) — chèn theo % toạ độ

```
D2 auto-map: A placeholder {{KY_TEN}}/{{DONG_DAU}}/{{NGAY}} (Word: python-docx; PDF text: PyMuPDF redact+insert)
             B regex "Ký tên, đóng dấu"/chức danh → đặt chữ ký trên + mộc đè 1/3
             C template % lưu sẵn theo loại VB   D kéo thả thủ công (fallback)
D3 giáp lai: cắt mộc hồ sơ ký thành N phần dọc theo range → mép phải mỗi trang
D4 ký nháy:  chữ ký mini ~30% góc dưới phải mỗi trang trong range (trừ trang cuối)
```

---

## 9. Search (F1 — full-text tiếng Việt)

```sql
-- search_vector = to_tsvector('simple', unaccent(subject || ' ' || number || ' ' || ocr_text))
--   cập nhật bằng trigger BEFORE INSERT/UPDATE
-- Query: tsquery khớp có dấu/không dấu (unaccent) + pg_trgm fuzzy (gõ sai chính tả nhẹ)
SELECT ... WHERE search_vector @@ websearch_to_tsquery('simple', unaccent(:q))
   OR subject % :q;                      -- pg_trgm, set_limit(0.3)
-- Trigger build search_vector (chạy lại mỗi INSERT/UPDATE, kể cả khi đổi manager_only):
--   IF manager_only THEN to_tsvector('simple', unaccent(subject||' '||reference_number))
--   ELSE              to_tsvector('simple', unaccent(subject||' '||reference_number||' '||ocr_text))
-- → bật manager_only sau khi vào sổ sẽ XOÁ ocr_text khỏi index → nhân viên không còn tìm thấy.
-- Query của nhân viên thêm điều kiện: AND (manager_only = FALSE) — chặn 2 lớp.
```

> 💡 **Tại sao `simple` + `unaccent` + `pg_trgm` thay vì engine riêng (Elasticsearch):** 5000–50.000 CV nằm gọn trong Postgres; thêm ES là 1 service nặng phải vận hành. Postgres FTS đủ < 1s, lại tận dụng cùng DB → backup/transaction thống nhất.

---

## 10. Security

### 10.1 Authentication & data protection

| Cơ chế | Chi tiết |
|---|---|
| Password | bcrypt cost ≥ 12 |
| Session | Redis store, cookie HttpOnly + Secure + SameSite=Strict, kick < 5s |
| Brute force | 5 sai/15' → khoá 15'; Fail2ban + captcha sau 3 lần |
| File at-rest | AES-256-GCM mã hoá phong bì (DEK bọc master key .env) |
| Watermark | on-the-fly mỗi lượt tải (truy nguồn leak) |
| HTTPS | Let's Encrypt + Cloudflare Proxy (ẩn IP gốc) |
| Audit | mọi thao tác ghi log (user, IP, time, action, object) |

### 10.2 API security

```
- Rate limit 10 req/s/IP (Nginx) + Fail2ban; login có lockout riêng (5 sai/15')
- CSRF: SameSite=Strict đã chặn phần lớn. Chọn 1 cơ chế DỨT KHOÁT (không nửa vời):
   → dùng custom header bắt buộc (vd X-Requested-With) cho mọi mutate + SameSite=Strict,
     HOẶC double-submit CSRF token. KHÔNG ghi mơ hồ "CSRF token" rồi không nói cách (risk 3.x).
- Input validation: Pydantic (BE) + Zod (FE) — 2 lớp
- SQL injection: SQLAlchemy parameterized; cấp số EXECUTE dynamic SEQUENCE name phải whitelist
  ký tự [a-z0-9_] (tên sinh từ code, không từ input) — tránh SQL injection qua tên sequence
- XSS: React auto-escape + CSP header; sanitize HTML nếu render rich text
- Excel/CSV formula injection (G2/G3/G4 — risk 3.2): cell bắt đầu bằng = + - @ TAB CR →
  prefix dấu ' (hoặc set kiểu text tường minh). Áp cho MỌI field tự do khi export.
```

### 10.3 Object-level authorization (chống IDOR — risk 3.4)

```
Phân quyền KHÔNG chỉ ở cấp role/list — MỌI endpoint detail + mutate phải check cấp OBJECT:
- GET/PUT /api/incoming/:id  → nếu manager_only=TRUE và user.role != manager → 403
  (không dựa vào việc FE ẩn link; nhân viên đoán :id vẫn phải bị chặn)
- PUT /api/tasks/:id         → chỉ assigned_to hoặc manager
- POST /api/outgoing/:id/cancel (published) → chỉ manager
Implement: dependency load object → kiểm quyền trước khi trả/sửa.
```

### 10.4 Xử lý file KHÔNG tin cậy (sandbox worker — risk 3.1, NGHIÊM TRỌNG)

```
PDF/DOCX từ ngoài qua LibreOffice/PyMuPDF/PaddleOCR là bề mặt RCE/SSRF/XXE:
- LibreOffice: --headless --norestore, MacroSecurityLevel=3 (tắt macro), profile riêng/job
- Worker container NETWORK-ISOLATED: chặn truy cập intranet/IP nội bộ (VPS chung 6 dự án) +
  metadata endpoint; chỉ egress whitelist tới R2 → chặn SSRF
- Validate MAGIC BYTES (python-magic), KHÔNG tin đuôi file
- DOCX: parser tắt external entity (chống XXE)
- Worker chạy user NON-ROOT, ulimit RAM/CPU + timeout mỗi job
- Giới hạn số trang / độ phân giải trước OCR (risk 3.5 — chống PDF/ảnh bom)
- Concurrency cap queue nặng (Celery --concurrency=2) → tránh OOM khi batch (PaddleOCR ~2GB/job)
```

### 10.5 Bảo vệ master key trên VPS chia sẻ

```
MASTER_KEY (.env) giải mã được TOÀN BỘ CV → nếu 1 trong 6 dự án cùng VPS bị hack, không
được để đọc chéo .env của QLCV:
- File .env quyền 600, owner = service user riêng của QLCV
- Container backend/worker mount .env read-only; KHÔNG log MASTER_KEY (Sentry scrub)
- Cân nhắc tách secret ra Docker secret / file ngoài web root
```

> 💡 **Tại sao validate 2 lớp (Zod FE + Pydantic BE):** không phải trùng lặp thừa — **Zod lo UX** (báo lỗi tức thì, tiếng Việt, không cần round-trip); **Pydantic lo bảo mật** (không bao giờ tin client). Schema OpenAPI nối 2 đầu cho khớp tên trường.

> 💡 **Tại sao cách ly mạng worker là then chốt:** đây là dịch vụ DUY NHẤT đụng file lạ. Cách ly network biến một lỗ hổng RCE/SSRF trong LibreOffice từ "đụng cả VPS 6 dự án" xuống "chỉ trong container worker".

---

## 11. Non-Functional Requirements

| Metric | Target (PRD 4.1) |
|---|---|
| Page load | < 2s (5 Mbps) |
| Full-text search | < 1s / 5000 CV |
| OCR PDF 5 trang | < 30s (async, không block UI) |
| Word→PDF | < 10s |
| Chèn mộc + xuất PDF | < 5s |
| Upload ≤ 50MB | không timeout |
| Uptime | ≥ 99% |
| Backup | pg_dump → R2 ngày, giữ 30 ngày; file sync R2 ≥ 10 năm |

> 💡 **Tại sao OCR/convert async qua worker:** việc nặng 30s mà chạy trong request HTTP sẽ timeout + chiếm worker FastAPI. Đẩy sang Celery → web vẫn nhẹ, UI hiện tiến độ qua bảng `jobs`.

---

## 12. Testing Strategy (QĐ #7 — full pyramid, ưu tiên bất biến chịu lực)

### 12.1 Test bất biến chịu lực TRƯỚC (unit/integration, pytest)

```
numbering/     cấp số SEQUENCE không trùng khi 2 user đồng thời; huỷ → nhảy số; setval dùng số có sẵn
auth/          bcrypt; session Redis kick < 5s khi khoá user; brute-force lock
dedup/         check trùng 3 lớp đúng cấp độ (SHA / metadata / OCR >90%)
permission/    staff KHÔNG huỷ CV đã phát hành; manager_only ẩn khỏi staff + search
pdf/           chèn mộc đúng toạ độ %; watermark on-the-fly KHÔNG đổi hash gốc
placeholder/   D2-A ≥ 95% trên CV có placeholder rõ (đo tự động)
sign_verify/   pyHanko: hợp lệ/hết hạn/không có chữ ký số → đúng badge
```

### 12.2 Integration (API + test DB) + E2E gọn (Playwright)

```
- API: login→tạo CV đi→cấp số→published; vào sổ→phân công→done→CV done
- E2E CHỈ luồng chính (D1 phát hành, E1 vào sổ) — tránh test UI giòn
```

> 💡 **Tại sao ưu tiên test bất biến trước E2E:** các bất biến (cấp số, check trùng, phân quyền) là chỗ **sai thì hỏng nghiệp vụ/pháp lý**, lại ổn định nên test bền. E2E UI dễ giòn → giữ tối thiểu luồng chính.

---

## 13. Environment Variables

```bash
# App
APP_ENV=production
FRONTEND_ORIGIN=https://<subdomain>          # CORS

# Database / Redis (port VPS chung)
DATABASE_URL=postgresql+psycopg://qlcv:***@qlcv_postgres:5432/qlcv
REDIS_URL=redis://qlcv_redis:6379/0          # session + Celery broker

# Auth / Encryption
SESSION_TTL_HOURS=8
SESSION_TTL_REMEMBER_DAYS=7
MASTER_KEY=<32-byte hex>                       # mã hoá phong bì, KHÔNG commit

# Cloudflare R2
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=qlcv

# OCR / PDF
PADDLEOCR_LANG=vie
NEAC_TRUST_LIST_URL=https://neac.gov.vn/...    # E1.5 cron tuần

# Web Push (L1)
VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...

# Observability (QĐ #13)
SENTRY_DSN=...                                 # send_default_pii=False
```

> 💡 **Tại sao secret chỉ trong `.env` không commit:** lộ master key = giải mã được toàn bộ CV; lộ R2 key = truy cập kho backup. PRD 6.6 yêu cầu phát hiện secret → cảnh báo + rotate.

---

## 14. Coding Conventions

### 14.1 Backend (Python / FastAPI)

```
- Cấu trúc: app/{routers,services,models,schemas,workers,core}/ — tách router (HTTP) /
  service (business) / model (SQLAlchemy) / schema (Pydantic). Router KHÔNG chứa business logic.
- Naming: snake_case (hàm/biến/cột DB), PascalCase (class/Pydantic model). Tên DB/API field TIẾNG ANH.
- Type hint bắt buộc → OpenAPI sinh chuẩn (QĐ #8). Pydantic v2 cho mọi request/response.
- Format: black + ruff (lint). isort import.
- Migration: Alembic, mỗi đổi schema 1 migration; KHÔNG sửa migration đã merge.
- Timezone: DB lưu UTC (TIMESTAMPTZ); convert Asia/Saigon ở lớp trình bày.
- Lỗi: raise HTTPException với error code + message TIẾNG VIỆT cho user-facing.
- Log: structlog JSON ra stdout; KHÔNG print().
```

### 14.2 Frontend (Vite + React + TypeScript)

```
- Cấu trúc: src/{routes,features,components,lib,stores,api}/ — feature-based.
- Server state → React Query (hook useQuery/useMutation); client state → Zustand store (QĐ #10).
- API: CHỈ gọi qua client sinh từ OpenAPI (openapi-fetch) — KHÔNG fetch() tay (QĐ #8).
  Đổi API → `npm run gen-api` → TS báo đỏ chỗ lệch.
- Form: React Hook Form + Zod resolver + shadcn/ui <Form> (QĐ #11). 1 Zod schema/form.
- Naming: camelCase (biến/hàm), PascalCase (component). File component = PascalCase.tsx.
- Format: prettier + eslint. Tailwind cho style (không CSS rời trừ khi cần).
- i18n VN: ngày dd/mm/yyyy (dayjs.tz Asia/Ho_Chi_Minh), số 1.234.567,89 (Intl vi-VN).
  Mọi text user-facing TIẾNG VIỆT CÓ DẤU, UTF-8.
- Component: nhỏ, tái sử dụng; ưu tiên shadcn/ui sẵn có trước khi tự viết.
```

### 14.3 Chung

```
- Git: nhánh dev → merge main = sẵn lên prod (Continuous Deployment, QĐ #13).
  Commit nhỏ, message tiếng Việt rõ "đổi gì + vì sao".
- KHÔNG commit secret/.env. .gitignore chuẩn.
- Test đi kèm feature bất biến (QĐ #7) — không gộp cuối.
```

> 💡 **Tại sao tách router/service/model + chỉ gọi API qua client codegen:** ranh giới rõ giúp AI gen code đặt đúng chỗ, dễ test service độc lập; client codegen biến mọi lệch API thành lỗi compile thay vì lỗi runtime — tấm lưới quan trọng nhất cho solo dev không có review chéo.

---

## 15. Risks & Trade-offs

| Rủi ro | Xác suất | Impact | Mitigation |
|---|---|---|---|
| Word có font lạ → LibreOffice convert lệch | TB | Cao | Retry 1 lần; vẫn fail → giữ Word gốc, cho convert tay + upload PDF (4.3.1); preview trước cấp số |
| OCR PDF scan sai/lệch | TB | TB | cls=True tự xoay; user xoay tay + sửa form; auto-fill "work-able" không bắt % |
| 2 user phát hành đồng thời trùng số | Thấp | Cao | PG SEQUENCE atomic; huỷ → nhảy số, audit ghi rõ |
| LibreOffice/OCR crash | Thấp | Cao | Worker container riêng (cách ly); Docker healthcheck restart; quá 3 fail → alert |
| **RCE/SSRF/XXE từ file lạ** qua LibreOffice/PyMuPDF/OCR | Thấp | **Rất cao** | §10.4: tắt macro, network-isolate worker, magic bytes, non-root, ulimit (file lạ là bề mặt lớn nhất) |
| **Excel formula injection** trong báo cáo G2/G3/G4 | TB | Cao | §10.2: prefix `'` cho cell bắt đầu `= + - @` |
| **PDF/ảnh bom** → OOM worker | Thấp | Cao | Giới hạn số trang/độ phân giải + concurrency cap OCR (--concurrency=2) |
| RAM spike khi nhiều download 50MB (GCM load cả file) | Thấp | TB | Giới hạn đồng thời tải; file ≤ 50MB; 5 user đồng thời thấp |
| Disk VPS đầy (chung 6 dự án) | TB | Cao | Monitor > 85% cảnh báo; file cũ → R2; rotation log |
| Lộ master key | Rất thấp | Rất cao | .env không commit; mã hoá phong bì → rotate chỉ bọc lại DEK |
| NEAC trust list không tải được | TB | TB | Dùng cache cũ + cảnh báo admin |

### Trade-offs chính

```
Tách BE/FE/Worker thay vì monorepo: ✅ Python cho PDF/OCR + cách ly crash ❌ 3 thứ deploy
Vite SPA thay vì Next.js:           ✅ nhẹ, tĩnh, không tốn Node ❌ tự lo routing/PWA (TanStack/Vite-PWA)
Session Redis thay vì JWT:          ✅ kick < 5s, đa phiên ❌ tra Redis mỗi request (5 user không đáng lo)
Postgres FTS thay vì Elasticsearch: ✅ 1 DB, đủ < 1s ❌ kém linh hoạt với corpus rất lớn (không phải case này)
Polling thay vì WebSocket:          ✅ đơn giản ❌ trễ tối đa 10s (chấp nhận được)
```

---

## 16. Implementation Plan (theo PRD Mục 6)

### Giai đoạn 1 — MVP (~14 ngày): phát hành CV đi + ký số
```
[ ] Setup: Docker Compose (postgres/redis/backend/worker/frontend/nginx), Alembic, seed
[ ] CI/CD: GitHub Actions test-gate + Continuous Deployment SSH (-p qlcv)
[ ] A1/A2/A4 auth session Redis + users; B1/B2/B3 đơn vị + sổ (SEQUENCE) + branding
[ ] C1/C2/C3/C4 mộc/chữ ký/tách nền/hồ sơ ký
[ ] D1–D6 CV đi: convert, auto-map %, chèn mộc PyMuPDF, giáp lai, ký nháy, cấp số, sổ
[ ] M1 danh bạ nơi nhận; H3 audit + soft delete + thùng rác
[ ] Storage mã hoá phong bì + R2 sync; Sentry + structlog + UptimeRobot
```

### Giai đoạn 2 — Đầy đủ nghiệp vụ (~16 ngày): CV đến
```
[ ] E1/E1.5/E1.6 vào sổ + verify PAdES + check trùng 3 lớp
[ ] E2/E3 phân công + theo dõi task; E4/E5 phụ lục + sổ đến
[ ] M2 danh bạ cơ quan gửi (auto-tạo); F1/F2 full-text + tag; H2 watermark
```

### Giai đoạn 3 — Nâng cao (~12 ngày): production-grade
```
[ ] A3 đổi mật khẩu; G1 dashboard; G2/G3/G4 xuất sổ NĐ30 + báo cáo + ZIP
[ ] L1 PWA + mobile responsive + Web Push; tinh chỉnh UX, tối ưu, bug fix
```

---

## Changelog

| Ngày | Version | Thay đổi |
|---|---|---|
| 26/06/2026 | 1.0 | TDD đầu tiên — full design QLCV dựa trên PRD + 13 quyết định kiến trúc |

### Ghi chú sửa PRD cho khớp TDD
1. Mục 4.2 + 7: "JWT auth" → **session-based (Redis)** (QĐ #1).
2. Mục 7 + 4.x: "Next.js 14" → **Vite + React + TanStack Router** (SPA tĩnh); bỏ port Node 3008 (QĐ #5).
