from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from poslite.catalog.presentation.router import router as catalog_router
from poslite.identity.api import SqlTokenResolver
from poslite.identity.presentation.router import router as identity_router
from poslite.identity.presentation.users_router import router as users_router
from poslite.organization.presentation.router import router as organization_router
from poslite.payment.presentation.router import router as payment_router
from poslite.reporting.presentation.router import router as reporting_router
from poslite.shared.application.clock import SystemClock
from poslite.shared.config import Settings, get_settings
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.database import create_engine, session_factory
from poslite.shared.presentation.errors import install_error_handlers
from poslite.sync.presentation.router import router as sync_router
from poslite.tenancy.presentation.router import router as tenancy_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app_engine = create_engine(settings.database_url)
        system_engine = create_engine(settings.system_database_url)
        app.state.app_sessions = session_factory(app_engine)
        app.state.system_sessions = session_factory(system_engine)
        app.state.token_resolver = SqlTokenResolver(app.state.system_sessions)
        app.state.clock = SystemClock()
        app.state.new_id = new_ulid
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
        sync_router,
        reporting_router,
    ):
        api.include_router(module_router)
    app.include_router(api)
    return app


app = create_app()
