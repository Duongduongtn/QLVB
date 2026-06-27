"""SQLAlchemy models — import gom để Alembic autogenerate thấy hết metadata.

Mỗi khi thêm model mới: tạo file model_xxx.py rồi import vào đây.
"""

from app.models.app_settings import AppSettings
from app.models.audit_log import AuditLog
from app.models.base import Base
from app.models.document_type import DocumentType, NumberingRegistry
from app.models.file import File
from app.models.incoming_attachment import IncomingAttachment
from app.models.incoming_document import IncomingDocument
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.processing_task import ProcessingTask
from app.models.seal import Seal
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit
from app.models.user import User

__all__ = [
    "AppSettings",
    "AuditLog",
    "Base",
    "DocumentType",
    "File",
    "IncomingAttachment",
    "IncomingDocument",
    "Notification",
    "NumberingRegistry",
    "Organization",
    "OutgoingDocument",
    "OutgoingRecipient",
    "ProcessingTask",
    "Seal",
    "Signature",
    "SigningProfile",
    "Unit",
    "User",
]
