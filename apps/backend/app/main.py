"""FastAPI app — entry point cho Uvicorn/Gunicorn.

Run dev:
    uvicorn app.main:app --reload --port 8003
Run prod:
    gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8003
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.core.logging import configure_logging, logger
from app.routers import auth, health


@asynccontextmanager
async def lifespan(_: FastAPI):
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
