# Tài liệu dự án
Các tài liệu nằm trong repo — đọc khi cần, không phải mỗi lần:
- PRD (yêu cầu sản phẩm): docs/PRD.md
- TDD (thiết kế kỹ thuật): docs/TDD.md
- UI Demo (prototype thiết kế sẵn): ui-demo/
- README tổng + cấu trúc thư mục: README.md
- README backend: apps/backend/README.md

# Cấu trúc mã nguồn (monorepo)
- apps/backend/   — FastAPI + Celery (cùng codebase, khác entrypoint)
- apps/frontend/  — Vite + React 18 SPA
- docker/         — Dockerfile.{backend,worker,frontend} + nginx config
- docker-compose.yml — `docker compose -p qlcv up`
- .github/workflows/ — test + deploy SSH

# Nguyên tắc khi implement
- Trước khi code một User Story: đọc story đó trong PRD và phần kỹ thuật liên quan trong TDD
- Implement đầy đủ theo từng tiêu chí "Done khi" trong story
- Tham chiếu TDD cho mọi quyết định kỹ thuật: tech stack, DB schema, API design
- Đọc UI trong ui-demo/ trước khi viết layout — không tự sáng tạo layout mới
- Hỏi trước khi làm nếu có gì chưa rõ trong PRD hoặc TDD

# Quy ước code
- Backend: router mỏng, service dày. KHÔNG đọc os.environ trực tiếp — dùng app.core.config.settings.
- Backend: lỗi business raise AppError (subclass) → exception handler trả error envelope chuẩn.
- Frontend: server state dùng React Query (polling), client state dùng Zustand.
- Frontend: form dùng React Hook Form + Zod (KHÔNG state thủ công).
- Frontend: API client type-safe sinh từ OpenAPI — `npm run gen:api` (KHÔNG tự viết type).
- Format VN qua helper `src/lib/format.ts` — KHÔNG mỗi nơi format kiểu riêng.
