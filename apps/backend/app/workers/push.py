"""Gửi Web Push (L1 PWA) — task nền để KHÔNG chặn HTTP response lúc phân công việc.

Web request (phân công / chuyển việc) enqueue task này; worker mở SessionLocal, gọi
``services.push.send_to_user`` (mã hoá + đẩy tới push service) rồi commit phần dọn endpoint
chết. Cron nhắc hạn (``notify_due_tasks``) gọi thẳng service vì đã chạy trong worker.
"""

from __future__ import annotations

import logging

from app.core.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="app.workers.push.send_web_push")
def send_web_push(user_id: int, title: str, body: str, url: str) -> dict:
    """Đẩy 1 thông báo tới mọi thiết bị của user. No-op nếu chưa cấu hình VAPID.

    KHÔNG retry: ``send_to_user`` không idempotent (retry sẽ gửi trùng các thiết bị đã thành
    công). Lỗi từng thiết bị đã được nuốt bên trong; mất 1 push nhắc việc là chấp nhận được.
    """
    from app.core.database import SessionLocal
    from app.services.push import send_to_user

    with SessionLocal() as db:
        sent = send_to_user(db, user_id, title=title, body=body, url=url)
        db.commit()  # ghi nhận xoá endpoint chết (nếu có)
    return {"sent": sent}
