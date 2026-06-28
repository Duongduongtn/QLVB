"""Schema F2 — tag tự do."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TagCount(BaseModel):
    id: int
    name: str
    count: int


class SetTagsRequest(BaseModel):
    names: list[str] = Field(default_factory=list)


class TagNames(BaseModel):
    names: list[str]
