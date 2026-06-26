# Models — ánh xạ SQLAlchemy

Đây mới là 2 model nguồn (`user`, `unit`) để chuẩn pattern. Các bảng còn lại
(file, seal, signature, signing_profile, document_type, numbering_registry,
outgoing_document, outgoing_recipient, incoming_document, incoming_attachment,
processing_task, organization, tag, document_tag, stamp_template,
app_setting, push_subscription, job, audit_log) tạo lần lượt khi
implement từng nhóm tính năng — xem TDD §3.2.

## Quy tắc thêm model mới
1. Tạo file `app/models/<ten_bang>.py` (snake_case).
2. Import vào `app/models/__init__.py` để Alembic autogenerate thấy.
3. Chạy: `alembic revision --autogenerate -m "add <ten_bang>"`.
4. Review migration sinh ra (autogenerate KHÔNG bắt được mọi thứ — đặc biệt
   partial index, CHECK constraint phức tạp, tsvector trigger → viết tay bổ sung).
5. `alembic upgrade head` để áp dụng.
