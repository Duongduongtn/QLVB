"""File model — kho file mã hoá phong bì (TDD §3.2 + §3.4).

Mỗi file (PDF CV, phụ lục, ảnh mộc/chữ ký, logo) lưu 1 dòng ở đây.
`wrapped_key` = DEK bọc bằng MASTER_KEY (NULL với asset không mã hoá: mộc/logo).
`sha256` = hash file GỐC (trước watermark) — dùng cho check trùng E1.6.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, Index, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class File(Base, TimestampMixin):
    __tablename__ = "files"
    __table_args__ = (
        CheckConstraint("location IN ('local','r2','both')", name="ck_files_location"),
        Index("idx_files_sha256", "sha256"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[str] = mapped_column(String(10), nullable=False, default="local")
    wrapped_key: Mapped[bytes | None] = mapped_column(LargeBinary)  # NULL = không mã hoá
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    original_name: Mapped[str | None] = mapped_column(String(300))
