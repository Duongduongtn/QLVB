"""FastAPI app — entry point cho Uvicorn/Gunicorn.

Run dev:
    uvicorn app.main:app --reload --port 8003
Run prod:
    gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8003
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.core.logging import configure_logging, logger
from app.routers import (
    auth,
    bg_removal,
    document_types,
    health,
    organizations,
    seals,
    signatures,
    signing_profiles,
    units,
    users,
)
from app.routers import settings as settings_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            send_default_pii=False,
            traces_sample_rate=0.1,
        )
    logger.info("qlcv.startup", environment=settings.environment)
    yield
    logger.info("qlcv.shutdown")


app = FastAPI(
    title="QLCV API",
    version="0.1.0",
    description="Quản lý Công văn + Ký số — 2 đơn vị Thành Đạt",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)

# Routers — thêm dần khi implement từng nhóm tính năng
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(units.router, prefix="/api/units", tags=["units"])
app.include_router(
    document_types.router, prefix="/api/document-types", tags=["document-types"]
)
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(seals.router, prefix="/api/seals", tags=["seals"])
app.include_router(signatures.router, prefix="/api/signatures", tags=["signatures"])
app.include_router(
    signing_profiles.router, prefix="/api/signing-profiles", tags=["signing-profiles"]
)
app.include_router(bg_removal.router, prefix="/api/bg-removal", tags=["bg-removal"])
app.include_router(organizations.router, prefix="/api/organizations", tags=["organizations"])
