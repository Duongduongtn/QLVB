"""Celery tasks — chia theo loại công việc, 1 module / 1 queue.

Mỗi task PHẢI:
- Update bảng `jobs` (Postgres) làm nguồn chân lý — QĐ #12.
- Heartbeat `heartbeat_at` mỗi ~15s khi running (reaper §3.2 quét job kẹt).
- Trả exception → reaper retry tối đa 3 lần → alert admin nếu vẫn fail.
"""
