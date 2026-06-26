# QLCV — Quản lý Công văn + Ký số

Web nội bộ cho 2 đơn vị Thành Đạt: upload công văn → chèn mộc/chữ ký theo toạ độ
→ cấp số tự động → tải PDF rõ nét sẵn ký số bằng USB Token Viettel-CA. Sổ công văn
đến có OCR + check trùng + verify chữ ký số PAdES.

Tài liệu chi tiết:
- [docs/PRD.md](docs/PRD.md) — yêu cầu sản phẩm
- [docs/TDD.md](docs/TDD.md) — thiết kế kỹ thuật (13 quyết định kiến trúc)
- [ui-demo/](ui-demo/) — prototype UI tham chiếu visual (KHÔNG phải starter)

## Cấu trúc

```
QLCV/
├── apps/
│   ├── backend/             FastAPI + SQLAlchemy + Celery (share codebase)
│   │   ├── app/
│   │   │   ├── core/        config, db, redis, celery, security, errors, storage
│   │   │   ├── models/      SQLAlchemy ORM (autogenerate Alembic)
│   │   │   ├── schemas/     Pydantic request/response
│   │   │   ├── routers/     HTTP endpoints (KHÔNG business logic)
│   │   │   ├── services/    business logic (tách khỏi router)
│   │   │   ├── workers/     Celery tasks (convert/ocr/rembg/sign_verify/zip/r2_sync)
│   │   │   └── main.py
│   │   ├── alembic/         migrations
│   │   └── tests/           unit + integration (pytest)
│   └── frontend/            Vite + React 18 + TS SPA
│       ├── src/
│       │   ├── routes/      TanStack Router file-based
│       │   ├── features/    feature modules
│       │   ├── components/  reusable UI
│       │   ├── stores/      Zustand (client state)
│       │   ├── lib/         api client, query, format VN
│       │   └── api/         schema.ts (gen từ OpenAPI — .gitignore)
│       └── tests/e2e/       Playwright
├── docker/
│   ├── Dockerfile.backend   FastAPI image (không LibreOffice)
│   ├── Dockerfile.worker    Celery + LibreOffice + PaddleOCR + rembg
│   ├── Dockerfile.frontend  multi-stage Vite build → Nginx serve
│   ├── nginx-frontend.conf  Nginx trong container frontend
│   ├── nginx.conf           Reverse proxy host (mẫu)
│   └── postgres-init/       SQL init extensions
├── docker-compose.yml       6 service · project name `qlcv`
├── .env.example             template biến môi trường
├── .github/workflows/       test.yml + deploy.yml (SSH CD)
└── docs/                    PRD + TDD
```

## Tech stack (đã chốt trong TDD)

| Layer | Tech |
|---|---|
| Backend | FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2 · structlog · Sentry |
| Worker | Celery 5 · PyMuPDF · PaddleOCR (vie) · rembg · pyHanko · LibreOffice |
| Frontend | Vite · React 18 · TS · TanStack Router · React Query · Zustand · RHF + Zod · Tailwind · shadcn/ui · react-pdf · openapi-fetch |
| Storage | Postgres 16 (port 5437) · Redis 7 (port 6380) · Local FS (mã hoá phong bì AES-256-GCM) · Cloudflare R2 |
| Infra | Docker Compose (`-p qlcv`) · Nginx · GitHub Actions SSH deploy |

## Dev workflow (chưa install dependencies — phase scaffold)

```bash
# 1. Copy env
cp .env.example .env
# Sinh MASTER_KEY_HEX:
python -c "import secrets; print(secrets.token_hex(32))"
# Dán vào .env → MASTER_KEY_HEX=...

# 2. Khởi tạo stack
docker compose -p qlcv up -d qlcv_postgres qlcv_redis

# 3. Backend dev (host)
cd apps/backend
python -m venv .venv && source .venv/bin/activate    # PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e .[dev]
alembic upgrade head                                 # khi đã có migration đầu
uvicorn app.main:app --reload --port 8003

# 4. Worker dev
celery -A app.core.celery_app:celery worker --loglevel=info

# 5. Frontend dev
cd apps/frontend
npm install --legacy-peer-deps
npm run gen:api                                      # sinh src/api/schema.ts từ OpenAPI
npm run dev                                          # http://localhost:5173, proxy /api → 8003

# 6. Test
cd apps/backend && pytest -m unit
cd apps/frontend && npm run lint && npm run typecheck && npx playwright test
```

## Production deploy

CI/CD tự động khi push `main`:
1. `test.yml` chạy pytest + ruff + mypy + eslint + tsc + vite build.
2. `deploy.yml` rsync source → VPS → `docker compose build` → `alembic upgrade head` → `up -d` → smoke test `/api/health`.

GitHub Secrets cần set: `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, `VPS_DEPLOY_PATH`.

## Quy ước

Xem [CLAUDE.md](CLAUDE.md) — quy tắc khi implement (đọc PRD/TDD trước khi code User Story).

## Trạng thái

🚧 **Scaffold init** — cấu trúc + config sẵn sàng. Chưa install dependencies, chưa
có migration đầu, chưa implement business logic. Triển khai theo roadmap 3 giai đoạn
trong PRD.
