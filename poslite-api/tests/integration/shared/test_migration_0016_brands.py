"""ADR-022 migration on a database that already holds data: brand "Utama", brand_id everywhere,
SKU unique per brand, outlet_user → user_assignments (and back on downgrade).

Runs in its own scratch database so it can stop at 0015, seed, and upgrade.
"""

import asyncio
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Protocol

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

pytestmark = pytest.mark.integration

API_ROOT = Path(__file__).resolve().parents[3]


class DatabaseSettings(Protocol):  # the session fixture from tests/conftest.py
    migration_database_url: str


SCRATCH_DB = "poslite_test_migration"
TENANT = "01K5ZT00000000000000000001"
OUTLET_1, OUTLET_2 = "01K5Z000000000000000000001", "01K5Z000000000000000000002"
OWNER, CASHIER, MANAGER = (
    "01K5ZU00000000000000000001",
    "01K5ZU00000000000000000002",
    "01K5ZU00000000000000000003",
)
CATEGORY, PRODUCT = "01K5ZC00000000000000000001", "01K5ZP00000000000000000001"
DEVICE, SHIFT = "01K5ZD00000000000000000001", "01K5ZS00000000000000000001"


def _alembic(url: str, action: str, target: str) -> None:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    config.set_main_option("sqlalchemy.url", url)
    with ThreadPoolExecutor(max_workers=1) as pool:  # Alembic's env.py calls asyncio.run
        pool.submit(getattr(command, action), config, target).result()


@pytest.fixture
async def scratch(db_settings: DatabaseSettings) -> AsyncIterator[str]:
    """Empty database migrated to 0015; yields its owner URL and drops it afterwards."""
    admin = create_async_engine(db_settings.migration_database_url, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DB}"))
        await conn.execute(text(f"CREATE DATABASE {SCRATCH_DB}"))
    url = make_url(db_settings.migration_database_url).set(database=SCRATCH_DB)
    url_str = url.render_as_string(hide_password=False)
    await asyncio.to_thread(_alembic, url_str, "upgrade", "0015")
    yield url_str
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DB}"))
    await admin.dispose()


async def _as_tenant(engine: AsyncEngine) -> AsyncConnection:
    conn = await engine.connect()
    await conn.execute(text("SELECT set_config('app.tenant_id', :t, false)"), {"t": TENANT})
    return conn


async def _seed(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO tenants (id, slug, name) VALUES (:t, 'rasa-nusantara', 'Rasa')"),
            {"t": TENANT},
        )
        await conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT})
        for outlet_id, code in [(OUTLET_1, "BDG01"), (OUTLET_2, "JKT01")]:
            await conn.execute(
                text(
                    "INSERT INTO outlets"
                    " (id, tenant_id, code, name, receipt_header, receipt_footer)"
                    " VALUES (:id, :t, :code, :code, 'Rasa Dago', 'Terima kasih')"
                ),
                {"id": outlet_id, "t": TENANT, "code": code},
            )
        for user_id, name in [(OWNER, "Owner"), (CASHIER, "Kasir"), (MANAGER, "Manajer")]:
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, name) VALUES (:id, :t, :name)"),
                {"id": user_id, "t": TENANT, "name": name},
            )
        for outlet_id, user_id, role_id in [
            (OUTLET_1, OWNER, 1),
            (OUTLET_1, CASHIER, 3),
            (OUTLET_2, CASHIER, 3),
            (OUTLET_2, MANAGER, 2),
        ]:
            await conn.execute(
                text(
                    "INSERT INTO outlet_user (tenant_id, outlet_id, user_id, role_id)"
                    " VALUES (:t, :o, :u, :r)"
                ),
                {"t": TENANT, "o": outlet_id, "u": user_id, "r": role_id},
            )
        await conn.execute(
            text("INSERT INTO categories (id, tenant_id, name) VALUES (:id, :t, 'Makanan')"),
            {"id": CATEGORY, "t": TENANT},
        )
        await conn.execute(
            text(
                "INSERT INTO products (id, tenant_id, category_id, sku, name, price)"
                " VALUES (:id, :t, :c, 'NSG-01', 'Nasi Goreng', 25000)"
            ),
            {"id": PRODUCT, "t": TENANT, "c": CATEGORY},
        )
        await conn.execute(
            text(
                "INSERT INTO devices (id, tenant_id, outlet_id, code, name, activated_by)"
                " VALUES (:id, :t, :o, 'A', 'Tablet', :u)"
            ),
            {"id": DEVICE, "t": TENANT, "o": OUTLET_1, "u": OWNER},
        )
        await conn.execute(
            text(
                "INSERT INTO shifts (id, tenant_id, outlet_id, device_id, opened_by, opened_at,"
                " opening_cash, business_date, status)"
                " VALUES (:id, :t, :o, :d, :u, now(), 100000, '2026-10-06', 'open')"
            ),
            {"id": SHIFT, "t": TENANT, "o": OUTLET_1, "d": DEVICE, "u": CASHIER},
        )


async def _rows(conn: AsyncConnection, sql: str) -> list[tuple[object, ...]]:
    return [tuple(r) for r in (await conn.execute(text(sql))).all()]


async def test_existing_tenant_gets_brand_utama_owning_all_its_data(scratch: str) -> None:
    engine = create_async_engine(scratch)
    await _seed(engine)

    await asyncio.to_thread(_alembic, scratch, "upgrade", "0016")

    conn = await _as_tenant(engine)
    try:
        brands = await _rows(
            conn, "SELECT id, code, name, receipt_header, receipt_footer FROM brands"
        )
        assert [b[1:] for b in brands] == [("RASANUSANTARA", "Utama", "Rasa Dago", "Terima kasih")]
        brand_id = brands[0][0]
        for table in ("outlets", "categories", "products", "shifts"):
            sql = f"SELECT brand_id FROM {table}"  # noqa: S608 — constant table names
            assert set(await _rows(conn, sql)) == {(brand_id,)}
        assignments = await _rows(
            conn,
            "SELECT user_id, role_id, scope_type, brand_id, outlet_id FROM user_assignments"
            " ORDER BY user_id, outlet_id",
        )
        assert assignments == [
            (OWNER, 1, "company", None, None),
            (CASHIER, 3, "outlet", brand_id, OUTLET_1),
            (CASHIER, 3, "outlet", brand_id, OUTLET_2),
            (MANAGER, 2, "outlet", brand_id, OUTLET_2),
        ]
        outlet_user = await _rows(conn, "SELECT to_regclass('outlet_user')")
        assert outlet_user == [(None,)]
    finally:
        await conn.close()
        await engine.dispose()


async def test_sku_is_unique_per_brand_and_new_rows_copy_the_outlet_brand(scratch: str) -> None:
    engine = create_async_engine(scratch)
    await _seed(engine)
    await asyncio.to_thread(_alembic, scratch, "upgrade", "0016")

    conn = await _as_tenant(engine)
    try:
        await conn.execute(
            text(
                "INSERT INTO brands (id, tenant_id, code, name)"
                " VALUES ('01K5ZB00000000000000000002', :t, 'SUSHI', 'Sushi')"
            ),
            {"t": TENANT},
        )
        # Same SKU in another brand is fine.
        await conn.execute(
            text(
                "INSERT INTO categories (id, tenant_id, brand_id, name)"
                " VALUES ('01K5ZC00000000000000000002', :t, '01K5ZB00000000000000000002', 'Sushi')"
            ),
            {"t": TENANT},
        )
        await conn.execute(
            text(
                "INSERT INTO products (id, tenant_id, brand_id, category_id, sku, name, price)"
                " VALUES ('01K5ZP00000000000000000002', :t, '01K5ZB00000000000000000002',"
                " '01K5ZC00000000000000000002', 'NSG-01', 'Salmon Roll', 40000)"
            ),
            {"t": TENANT},
        )
        # A shift inserted without brand_id gets its outlet's brand from the trigger.
        await conn.execute(
            text(
                "INSERT INTO shifts (id, tenant_id, outlet_id, device_id, opened_by, opened_at,"
                " opening_cash, business_date, status)"
                " VALUES ('01K5ZS00000000000000000002', :t, :o, :d, :u, now(), 0,"
                " '2026-10-07', 'open')"
            ),
            {"t": TENANT, "o": OUTLET_1, "d": DEVICE, "u": CASHIER},
        )
        shift_brand = await _rows(
            conn,
            "SELECT s.brand_id = o.brand_id FROM shifts s JOIN outlets o ON o.id = s.outlet_id"
            " WHERE s.id = '01K5ZS00000000000000000002'",
        )
        assert shift_brand == [(True,)]
    finally:
        await conn.rollback()
        await conn.close()
        await engine.dispose()


async def test_owner_assignment_must_be_company_wide(scratch: str) -> None:
    engine = create_async_engine(scratch)
    await _seed(engine)
    await asyncio.to_thread(_alembic, scratch, "upgrade", "0016")

    conn = await _as_tenant(engine)
    try:
        with pytest.raises(Exception, match="owner_company"):
            await conn.execute(
                text(
                    "INSERT INTO user_assignments (id, tenant_id, user_id, role_id, scope_type,"
                    " brand_id, outlet_id) SELECT '01K5ZA00000000000000000009', :t, :u, 1,"
                    " 'outlet', brand_id, id FROM outlets WHERE id = :o"
                ),
                {"t": TENANT, "u": MANAGER, "o": OUTLET_1},
            )
    finally:
        await conn.rollback()
        await conn.close()
        await engine.dispose()


async def test_downgrade_restores_outlet_roles(scratch: str) -> None:
    engine = create_async_engine(scratch)
    await _seed(engine)
    await asyncio.to_thread(_alembic, scratch, "upgrade", "0016")

    await asyncio.to_thread(_alembic, scratch, "downgrade", "0015")

    conn = await _as_tenant(engine)
    try:
        roles = await _rows(
            conn, "SELECT user_id, outlet_id, role_id FROM outlet_user ORDER BY user_id, outlet_id"
        )
        # The owner (company-wide) comes back as owner at every outlet.
        assert roles == [
            (OWNER, OUTLET_1, 1),
            (OWNER, OUTLET_2, 1),
            (CASHIER, OUTLET_1, 3),
            (CASHIER, OUTLET_2, 3),
            (MANAGER, OUTLET_2, 2),
        ]
    finally:
        await conn.close()
        await engine.dispose()
