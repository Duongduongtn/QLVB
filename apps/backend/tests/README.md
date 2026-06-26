# Tests — chiến lược pyramid (TDD §12)

## Cấu trúc
- `unit/`        — logic thuần, không DB/Redis. Mục tiêu phủ ≥80% bất biến.
- `integration/` — DB + Redis thật. Test 1 luồng API end-to-end.
- E2E Playwright — nằm ở `apps/frontend/tests/e2e/`.

## Test "bất biến chịu lực" ưu tiên (TDD §12.1)
1. Cấp số atomic (SEQUENCE) — 2 user đồng thời KHÔNG trùng.
2. Auth/session — kick user khoá <5s.
3. Dedup CV đến 3 lớp (SHA / OCR / fuzzy).
4. Phân quyền (manager vs staff, manager_only, B3a "Tất cả").
5. Chèn mộc PyMuPDF — toạ độ % chuyển sang pt đúng cho mọi A4/A3.
6. Verify chữ ký số (pyHanko) — true/false trust list NEAC.
7. Envelope encryption — round-trip + lỗi master key.

## Lệnh chạy
```
pytest                          # tất cả
pytest -m unit                  # nhanh, KHÔNG cần DB
pytest -m integration           # cần Postgres + Redis lên
pytest --cov=app --cov-report=html
```
