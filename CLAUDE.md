# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Tài liệu nguồn (đọc khi cần — không phải mỗi phiên)
- PRD (yêu cầu sản phẩm + 36 user story A–H, L, M): `docs/PRD.md`
- TDD (thiết kế kỹ thuật, 13 quyết định kiến trúc): `docs/TDD.md`
- UI Demo (prototype thiết kế sẵn — KHÔNG phải starter, chỉ tham chiếu visual): `ui-demo/`
- README tổng + tech stack: `README.md`
- README backend: `apps/backend/README.md`

# Cấu trúc monorepo
- `apps/backend/`   — FastAPI + Celery (cùng codebase, khác entrypoint: `uvicorn app.main:app` vs `celery -A app.core.celery_app:celery`)
- `apps/frontend/`  — Vite + React 18 SPA, TanStack Router file-based
- `docker/`         — `Dockerfile.{backend,worker,frontend}` + nginx config + postgres-init
- `docker-compose.yml` — 6 service, project name `qlcv` (cô lập với 6 dự án khác trên VPS chung)
- `.github/workflows/` — `test.yml` (pytest + ruff + mypy + eslint + tsc + build), `deploy.yml` (SSH rsync deploy)

# Kiến trúc lớn (big picture — đọc nhiều file mới hiểu)

## Backend split: web ↔ worker chia codebase, khác mạng Docker
Backend (`qlcv_backend`) và worker (`qlcv_worker`, `qlcv_beat`) **chia chung codebase Python** trong `apps/backend/`, **khác entrypoint** và **khác Docker image**:
- `Dockerfile.backend` — image gọn, KHÔNG có LibreOffice/PaddleOCR/rembg.
- `Dockerfile.worker` — image to, có LibreOffice (convert .docx→pdf), PaddleOCR (vie), rembg (xoá nền mộc), pyHanko (verify ký số PAdES).
- Worker ở mạng `qlcv_worker_net` riêng, **KHÔNG ở `qlcv_net`** → không gọi ngược backend / intranet (TDD §2.4). Chỉ ra Internet để gọi R2.

## Backend layering: router mỏng, service dày
- `app/core/` — `config` (pydantic-settings, KHÔNG `os.environ` trực tiếp ở chỗ khác), `database`, `redis_client`, `celery_app`, `security`, `errors`, `storage` (envelope encryption AES-256-GCM với MASTER_KEY), `deps`, `http`, `logging` (structlog).
- `app/models/` — SQLAlchemy ORM, 1 file/bảng, gom import qua `__init__.py` để Alembic autogenerate thấy.
- `app/schemas/` — Pydantic v2 request/response → FastAPI sinh OpenAPI → frontend codegen client.
- `app/routers/` — HTTP endpoint, CHỈ validate + gọi service + format response.
- `app/services/` — business logic, KHÔNG biết FastAPI (test được standalone, gọi lại từ CLI/worker).
- `app/workers/` — Celery task: `convert`, `ocr`, `rembg_task`, `sign_verify`, `zip_export`, `r2_sync` — 1 module/queue.

Mọi lỗi business → `raise AppError(...)` (subclass: `NotFound`, `PermissionDenied`, `Conflict`, `ValidationFailed`). Exception handler trong `main.py` trả envelope chuẩn `{"error":{"code":"...","message":"..."}}` với message tiếng Việt để hiển thị thẳng cho user.

## Storage: envelope encryption local + R2 stream
- File gốc + file đã ký lưu local `/var/qlcv/storage` (volume `qlcv_storage`), **mã hoá phong bì AES-256-GCM** với `MASTER_KEY_HEX` (32 byte hex, sinh `python -c "import secrets; print(secrets.token_hex(32))"`).
- Worker `r2_sync` đẩy bản backup lên Cloudflare R2 (S3 API). KHÔNG xoá bản gốc.
- **CẢNH BÁO deploy**: `.env` chứa `MASTER_KEY_HEX` — CD đã exclude `.env` khỏi rsync. Mất key = mất hết file đã ký. Xem [deploy gotcha VPS_DEPLOY_PATH](C:/Users/Admin/.claude/projects/d--Du-An-QLCV/memory/deploy-gotcha-vpspath.md).

## Frontend state model
- **Server state** → React Query (polling cho realtime — TDD §12 chọn polling thay vì WebSocket).
- **Client state** → Zustand (`src/stores/`).
- **Form** → React Hook Form + Zod resolver, KHÔNG `useState` thủ công cho field.
- **API client** → `openapi-fetch` type-safe, type sinh từ OpenAPI bằng `npm run gen:api` → `src/api/schema.ts` (đã `.gitignore`). **KHÔNG tự viết type request/response.**
- **Format VN** → MỌI chỗ qua `src/lib/format.ts` (`fmtDate`, `fmtDateTime`, `fmtInt`, `fmtNum`, `fmtVnd`). KHÔNG mỗi component format kiểu riêng.
- **Router** → TanStack Router file-based, `routeTree.gen.ts` auto-generate từ `src/routes/`.

## Auth: session Redis (KHÔNG JWT)
- Login → `services/auth.authenticate` → tạo session ID lưu Redis với TTL (8h mặc định, 7 ngày nếu `remember`) → set httpOnly cookie `qlcv_session`.
- `current_user` dependency (`app/core/deps.py`) đọc cookie → look up Redis → load `User` từ DB.
- Logout → `destroy_session` xoá key Redis (cho phép "kick" session từ admin).
- Audit mọi `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGOUT` qua `services/audit.log_action`.

# Lệnh dev hay dùng

## Khởi tạo lần đầu
```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # dán vào MASTER_KEY_HEX trong .env
docker compose -p qlcv up -d qlcv_postgres qlcv_redis      # chỉ DB + Redis, dev backend trên host
```

## Backend (Python 3.11, port 8003)
```bash
cd apps/backend
python -m venv .venv ; .\.venv\Scripts\Activate.ps1        # PowerShell
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload --port 8003                  # http://localhost:8003/api/docs khi DEBUG=true
```

## Worker
```bash
cd apps/backend
celery -A app.core.celery_app:celery worker --loglevel=info --concurrency=2
celery -A app.core.celery_app:celery beat --loglevel=info  # cron (riêng process)
```

## Frontend (Node 20, port 5173 proxy `/api` → 8003)
```bash
cd apps/frontend
npm install --legacy-peer-deps
npm run gen:api          # sinh src/api/schema.ts từ backend đang chạy ở 8003
npm run dev
```

## Migration
```bash
cd apps/backend
# 1. Viết model app/models/<ten>.py
# 2. Import vào app/models/__init__.py (để autogenerate thấy)
alembic revision --autogenerate -m "add <ten>"
# 3. Review file alembic/versions/*.py (autogenerate KHÔNG bắt mọi thứ — check enum, index, FK)
alembic upgrade head
```

## Lint + type-check + test
```bash
# Backend
cd apps/backend
ruff check . && black . && isort . && mypy app
pytest -m unit                      # nhanh, không cần DB
pytest -m integration               # cần Postgres + Redis
pytest -m "not slow"                # CI dùng cái này
pytest -k test_authenticate         # chạy 1 test cụ thể
pytest --cov=app --cov-report=term-missing

# Frontend
cd apps/frontend
npm run lint && npm run typecheck && npm run build
npx playwright test
npx playwright test tests/e2e/login.spec.ts   # 1 file
```

## Toàn stack (Docker)
```bash
docker compose -p qlcv up -d        # 6 service: postgres/redis/backend/worker/beat/frontend
docker compose -p qlcv logs -f qlcv_backend
docker compose -p qlcv exec qlcv_backend alembic upgrade head
```

# Frontend — Design system & ui-demo (LUẬT CỨNG, ưu tiên cao hơn memory)

Giao diện app PHẢI khớp `ui-demo/`. Vỏ + bảng màu + typography đến từ **design system đã port** vào `apps/frontend/src/styles/index.css` (token OKLCH `--paper`/`--ink`/`--kinpaku`, font **Be Vietnam Pro**, component classes `.btn-primary`/`.btn-secondary`/`.card`/`.seg`/`.pill-*`/`.nav-item`/`.text-input`/`.search-input`/`.avatar`...). Shell = `AppShell` trong `__root.tsx` (sidebar 248px + header), điều hướng bám `ui-demo/src/nav.tsx`.

**Bắt buộc khi viết / sửa BẤT KỲ FE nào:**
1. **CẤM màu raw Tailwind** (`slate-*`, `gray-*`, `amber-*`, `green-*`, `red-*`, `violet-*`, `sky-*`...) trong `src/routes/` và `src/components/`. Dùng **token/class của design system** (`var(--ink-muted)`, `.btn-primary`, `.pill-success`, `bg-gdnn/dvdl` cho màu 2 đơn vị) — đúng như `ui-demo/src/components/ui.tsx`.
2. Trước khi viết layout 1 màn: đọc `ui-demo/src/pages/<Màn>Page.tsx` **+ `ui-demo/src/components/ui.tsx` + `index.css`** để biết component/token có sẵn — KHÔNG tự chế card/button/pill mới.
3. CI có guard chặn màu raw: `npm run check:design` (script `apps/frontend/scripts/check-design-tokens.mjs` + allowlist `design-allowlist.txt` cho file legacy CHƯA migrate). File mới / file đã migrate phải SẠCH token; migrate xong file nào → xoá khỏi allowlist.
4. Verify FE không chỉ `tsc/eslint/build` xanh (= chạy được) mà phải **đối chiếu thị giác với ui-demo** (mắt, hoặc Playwright screenshot 3 viewport theo CORE_RULES rule 12). "Build pass" KHÔNG đủ.
5. Coi cảnh báo design-hook (impeccable `gray-on-color`...) là **tín hiệu lệch token**, KHÔNG gạt mặc định là false-positive.

# Quy ước khi implement user story
1. Đọc story trong PRD + phần kỹ thuật liên quan trong TDD **trước** khi code.
2. Theo Story-Skill Mapping (memory) để nạp skill cần thiết (`fastapi-pro`, `react-best-practices`, `tdd-workflow`...).
3. Implement đầy đủ từng tiêu chí "Done khi" trong story.
4. **FE: đọc `ui-demo/` + dùng design system (xem mục "Frontend — Design system" trên) — KHÔNG tự sáng tạo layout/màu/font.**
5. Code xong → gọi subagent `review-nghiep-vu` (đối chiếu PRD/TDD) **và** `review-code` (chất lượng + security) trước khi merge.
   - **Model subagent = `sonnet`** (đã set trong frontmatter 2 agent). Mọi subagent spawn qua Agent tool trong dự án này cũng dùng `model: sonnet` (tiết kiệm token/chi phí; main loop giữ Opus).
6. Cập nhật trạng thái story trong PRD.md (📝 Draft / ⏳ Todo / 🔄 In Progress / ⚠️ Partial / ✅ Done) **không chờ user nhắc**.
7. Hỏi trước khi làm nếu PRD/TDD có gì chưa rõ.

# Trạng thái hiện tại
🚧 **Nhóm B gần xong** — Scaffold + USR.LGN/LGO/MNG, CFG.UNT (2 đơn vị+logo), CFG.BOK (cấu hình sổ+SEQUENCE), CFG.BRD (branding) ✅ Done; CFG.VEW ⚠️ Partial (hạ tầng switch-view xong, chờ list để wire + enforce role server-side). CI xanh. **Nhóm B hoàn tất → tiếp theo nhóm C (Mộc + Chữ ký + Hồ sơ ký)** — tái dùng asset storage + tách nền worker. Xem PRD.
