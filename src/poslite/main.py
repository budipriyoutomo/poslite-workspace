from typing import Any

from fastapi import APIRouter, FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="POSLite API", version="0.1.0")

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["system"])
    async def health() -> dict[str, Any]:
        # Envelope per 07-api-contract.md (becomes shared ApiResponse[T] later).
        return {"data": {"status": "ok"}, "message": "OK", "meta": {}}

    app.include_router(api)
    return app


app = create_app()
