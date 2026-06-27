"""Schemas branding — B3b (CFG.BRD). Tên app + logo header."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    app_name: str
    logo_file_id: int | None


class SettingsUpdate(BaseModel):
    app_name: Annotated[str | None, Field(min_length=1, max_length=150)] = None
