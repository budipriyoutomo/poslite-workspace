from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from poslite.billing.presentation.router import router as billing_router
from poslite.catalog.presentation.router import router as catalog_router
from poslite.gateway.presentation.router import router as gateway_router
from poslite.identity.api import SqlTokenResolver
from poslite.identity.presentation.router import router as identity_router
from poslite.identity.presentation.users_router import router as users_router
from poslite.integration.presentation.router import router as integration_router
from poslite.organization.presentation.router import router as organization_router
from poslite.payment.presentation.router import router as payment_router
from poslite.platform_admin.presentation.router import router as platform_router
from poslite.promotion.presentation.router import router as promotion_router
from poslite.reporting.presentation.router import router as reporting_router
from poslite.sales.presentation.router import router as sales_router
from poslite.shared.application.clock import SystemClock
from poslite.shared.config import Settings, get_settings
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.database import create_engine, session_factory
from poslite.shared.infrastructure.gateways import build_gateway
from poslite.shared.infrastructure.object_storage import build_storage
from poslite.shared.presentation.errors import install_error_handlers
from poslite.shift.presentation.router import router as shift_router
from poslite.sync.presentation.router import router as sync_router
from poslite.tenancy.api import tenant_status
from poslite.tenancy.presentation.router import router as tenancy_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app_engine = create_engine(settings.database_url)
        system_engine = create_engine(settings.system_database_url)
        app.state.app_sessions = session_factory(app_engine)
        app.state.system_sessions = session_factory(system_engine)
        app.state.token_resolver = SqlTokenResolver(app.state.system_sessions, tenant_status)
        app.state.clock = SystemClock()
        app.state.new_id = new_ulid
        app.state.gateway = build_gateway(settings)
        app.state.storage = build_storage(settings)
        app.state.media_base_url = settings.media_base_url
        yield
        await app_engine.dispose()
        await system_engine.dispose()

    app = FastAPI(title="POSLite API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["system"])
    async def health() -> dict[str, Any]:
        return {"data": {"status": "ok"}, "message": "OK", "meta": {}}

    for module_router in (
        tenancy_router,
        identity_router,
        users_router,
        organization_router,
        catalog_router,
        payment_router,
        promotion_router,
        integration_router,
        billing_router,
        gateway_router,
        sync_router,
        shift_router,
        reporting_router,
        sales_router,
        platform_router,
    ):
        api.include_router(module_router)
    app.include_router(api)
    if settings.media_storage == "local":  # dev/test stand-in for the S3 bucket (ADR-021)
        media_dir = Path(settings.media_local_dir)
        media_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/media", StaticFiles(directory=media_dir), name="media")
    return app


app = create_app()
