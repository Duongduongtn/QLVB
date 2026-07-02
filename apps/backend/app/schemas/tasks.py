"""Schemas phân công + theo dõi xử lý CV đến — E2/E3."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

TaskStatus = Literal["new", "in_progress", "done"]


class AssignRequest(BaseModel):
    """Phân công 1 người xử lý 1 CV đến (bỏ phân biệt đơn vị)."""

    assignee_id: int
    deadline: date | None = None
    note: Annotated[str | None, Field(max_length=1000)] = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus
    result_note: Annotated[str | None, Field(max_length=2000)] = None


class ReassignRequest(BaseModel):
    assignee_id: int


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    incoming_id: int
    unit_id: int | None
    assignee_id: int | None
    status: str
    deadline: date | None
    note: str | None
    result_note: str | None
    created_at: datetime
    updated_at: datetime


class MyTaskItem(BaseModel):
    id: int
    incoming_id: int
    status: str
    deadline: date | None
    overdue: bool
    number: str | None
    subject: str | None
    sender_org_id: int | None
    urgency: str


class MyTaskListResponse(BaseModel):
    items: list[MyTaskItem]
    total: int
