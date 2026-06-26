# QLCV Backend

FastAPI + SQLAlchemy + Celery (cùng codebase, khác entrypoint).

## Setup local (không Docker)

```bash
python -m venv .venv
source .venv/bin/activate           # PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e .[dev]

# Cần Postgres + Redis đang chạy (qua docker compose hoặc local install)
export DATABASE_URL=postgresql+psycopg://qlcv:qlcv@localhost:5437/qlcv
export REDIS_URL=redis://localhost:6380/0
export MASTER_KEY_HEX=$(python -c "import secrets; print(secrets.token_hex(32))")

alembic upgrade head
uvicorn app.main:app --reload --port 8003
```

Mở `http://localhost:8003/api/docs` (chỉ khi DEBUG=true) để xem OpenAPI.

## Worker

```bash
celery -A app.core.celery_app:celery worker --loglevel=info --concurrency=2
celery -A app.core.celery_app:celery beat --loglevel=info   # cron
```

## Tạo model + migration mới

```bash
# 1. Viết model: app/models/<ten>.py
# 2. Import vào app/models/__init__.py
# 3. Sinh migration:
alembic revision --autogenerate -m "add <ten>"
# 4. Review file alembic/versions/*.py (autogenerate KHÔNG bắt mọi thứ)
# 5. Áp dụng
alembic upgrade head
```

## Lint + format + type-check + test

```bash
ruff check .            # lint
black .                 # format
isort .                 # imports
mypy app                # types
pytest -m unit          # chạy nhanh, không cần DB
pytest -m integration   # cần Postgres + Redis
pytest --cov=app
```

## Codebase layout

| Folder | Vai trò |
|---|---|
| `app/core/` | config, database, redis, celery, security, errors, storage, deps, logging |
| `app/models/` | SQLAlchemy ORM (1 file/bảng) — gom import qua `__init__.py` |
| `app/schemas/` | Pydantic request/response |
| `app/routers/` | HTTP endpoints — CHỈ validate + gọi service + format response |
| `app/services/` | Business logic — KHÔNG biết FastAPI |
| `app/workers/` | Celery tasks — 1 module/queue |
| `alembic/` | Migration |
| `tests/unit/` | Logic thuần, không DB |
| `tests/integration/` | DB + Redis thật |

## Nguyên tắc

- **Router mỏng, service dày** — dễ test + tái dùng cho CLI/worker.
- **Mọi lỗi business** → raise `AppError` (subclass), exception handler trả error envelope chuẩn.
- **KHÔNG đọc `os.environ` trực tiếp** — đi qua `app.core.config.settings`.
- **Pydantic-first** — request/response schema → FastAPI tự sinh OpenAPI → frontend codegen client.
