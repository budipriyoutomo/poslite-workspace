import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient

from .helpers import outlet_with_menu_and_device, post, pull

# Same file as poslite-web's Zod pull schemas test: the device parses exactly these fields.
FIXTURE: dict[str, Any] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-pull.json").read_text()
)
EXPECTED = {c["entity"]: c["data"] for c in FIXTURE["changes"] if c["op"] == "upsert"}


def _shape(data: dict[str, Any]) -> dict[str, str]:
    """Field → JSON type; null matches anything (optional fields are often empty)."""
    return {k: type(v).__name__ for k, v in data.items() if v is not None}


async def test_every_pulled_entity_has_the_fields_the_device_parses(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await post(api, s.owner_token, f"/outlets/{s.outlet_id}/tables", {"label": "T1", "seats": 4})
    await post(
        api,
        s.owner_token,
        "/promotions",
        {"name": "Happy Hour", "type": "percent_off", "percentage": 20},
    )

    data = await pull(api, s.device_token)

    assert data.keys() == FIXTURE.keys()
    pulled = {c["entity"]: c["data"] for c in data["changes"] if c["op"] == "upsert"}
    assert pulled.keys() == EXPECTED.keys()
    for entity, fields in pulled.items():
        assert fields.keys() == EXPECTED[entity].keys(), entity
        shape, expected = _shape(fields), _shape(EXPECTED[entity])
        assert {k: t for k, t in shape.items() if k in expected} == {
            k: t for k, t in expected.items() if k in shape
        }, entity


def test_the_fixture_page_has_the_pull_envelope() -> None:
    assert {"changes", "next_cursor", "has_more", "server_time", "media_base_url"} == FIXTURE.keys()
    assert all(
        c.keys() == {"entity", "op", "id", "version"}
        for c in FIXTURE["changes"]
        if c["op"] == "delete"
    )
