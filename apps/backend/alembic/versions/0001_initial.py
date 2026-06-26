"""initial schema — users, units, files, audit_logs + seed (Phase 0)

Tạo 4 bảng nền móng + seed 2 đơn vị Thành Đạt + 1 admin (PRD 4.9).
Bảng nghiệp vụ (outgoing/incoming/seals/...) thêm ở các migration sau theo từng story.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-26
"""

from __future__ import annotations

import os
import secrets

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── files (units FK → files nên tạo TRƯỚC) ──────────────────────
    op.create_table(
        "files",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("location", sa.String(10), nullable=False, server_default="local"),
        sa.Column("wrapped_key", sa.LargeBinary(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("original_name", sa.String(300), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("location IN ('local','r2','both')", name="ck_files_location"),
    )
    op.create_index("idx_files_sha256", "files", ["sha256"])

    # ── units (2 đơn vị cố định) ────────────────────────────────────
    op.create_table(
        "units",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("short_name", sa.String(100), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("tax_code", sa.String(20), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("logo_file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=True),
        sa.Column("color", sa.String(10), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )

    # ── users ───────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="staff"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failed_logins", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("role IN ('manager','staff')", name="ck_users_role"),
    )
    # UNIQUE chỉ trong số user chưa xoá (edge 2.2 — soft-delete không chặn tạo lại)
    op.create_index(
        "uq_users_username_active",
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ── audit_logs (polymorphic mềm — KHÔNG FK) ─────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("object_type", sa.String(30), nullable=True),
        sa.Column("object_id", sa.BigInteger(), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("idx_audit_object", "audit_logs", ["object_type", "object_id"])
    op.create_index("idx_audit_user_time", "audit_logs", ["user_id", "created_at"])

    _seed()


def _seed() -> None:
    """Seed 2 đơn vị + 1 admin (PRD 4.9). Pass admin random, log 1 lần khi deploy."""
    from app.core.security import hash_password

    units = sa.table(
        "units",
        sa.column("code"),
        sa.column("full_name"),
        sa.column("short_name"),
        sa.column("color"),
    )
    op.bulk_insert(
        units,
        [
            {
                "code": "GDNN",
                "full_name": "Trung tâm Giáo dục nghề nghiệp Thành Đạt",
                "short_name": "TT GDNN Thành Đạt",
                "color": "#16a34a",  # xanh lá
            },
            {
                "code": "DVDL",
                "full_name": "Công ty Cổ phần Dịch vụ Du lịch Thành Đạt",
                "short_name": "Cty DVDL Thành Đạt",
                "color": "#7c3aed",  # tím
            },
        ],
    )

    pw = os.environ.get("SEED_ADMIN_PASSWORD") or secrets.token_urlsafe(9)
    users = sa.table(
        "users",
        sa.column("username"),
        sa.column("full_name"),
        sa.column("password_hash"),
        sa.column("role"),
    )
    op.bulk_insert(
        users,
        [
            {
                "username": "admin",
                "full_name": "Quản trị hệ thống",
                "password_hash": hash_password(pw),
                "role": "manager",
            }
        ],
    )
    if not os.environ.get("SEED_ADMIN_PASSWORD"):
        print(
            "\n========== QLCV SEED ADMIN ==========\n"
            "  Username: admin\n"
            f"  Mật khẩu (CHỈ HIỆN 1 LẦN): {pw}\n"
            "  → Đăng nhập rồi ĐỔI MẬT KHẨU ngay.\n"
            "=====================================\n"
        )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("users")
    op.drop_table("units")
    op.drop_table("files")
