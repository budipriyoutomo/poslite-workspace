from httpx import ASGITransport, AsyncClient

from poslite.main import create_app


async def test_health_returns_ok_envelope() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok"}, "message": "OK", "meta": {}}
