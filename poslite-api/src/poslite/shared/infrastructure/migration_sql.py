"""SQL building blocks for migrations (and the tests that prove them).

Every tenant-owned table calls `enable_tenant_rls`; every master table also calls
`sync_version_trigger`. See ADR-009 and ADR-013 in 05-backend-architecture.md.
"""

APP_ROLES = ("poslite_app", "poslite_system")

# Once per database (first migration).
SYNC_VERSION_FUNCTION = [
    "CREATE SEQUENCE sync_version_seq",
    """
    CREATE FUNCTION assign_sync_version() RETURNS trigger AS $$
    BEGIN
      -- Serialize version assignment per tenant until commit so version order == commit order
      -- (a pull cursor can never skip a row that commits later with a lower version).
      PERFORM pg_advisory_xact_lock(727001, hashtext(NEW.tenant_id));  -- 727001 = SYNC_VERSION_LOCK
      NEW.version := nextval('sync_version_seq');
      RETURN NEW;
    END $$ LANGUAGE plpgsql
    """,
]


def enable_tenant_rls(table: str) -> list[str]:
    """Row-level security: rows visible/writable only for `app.tenant_id` (FORCE: owner too)."""
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
        f"CREATE POLICY tenant_isolation ON {table}"
        " USING (tenant_id = current_setting('app.tenant_id', true))"
        " WITH CHECK (tenant_id = current_setting('app.tenant_id', true))",
    ]


def sync_version_trigger(table: str) -> list[str]:
    """`version` comes only from the trigger; soft deletes are updates, so they get one too."""
    return [
        f"CREATE INDEX ix_{table}_tenant_version ON {table} (tenant_id, version)",
        f"CREATE TRIGGER trg_{table}_sync_version BEFORE INSERT OR UPDATE ON {table}"
        " FOR EACH ROW EXECUTE FUNCTION assign_sync_version()",
    ]


# Once per database (migration 0016, ADR-022). Transaction rows (shifts, orders, rpt_*) carry the
# brand of their outlet for reporting; the server copies it from the outlet, never from a payload.
# An outlet never changes brand, so the copy cannot go stale.
FILL_BRAND_FUNCTION = """
    CREATE FUNCTION fill_brand_from_outlet() RETURNS trigger AS $$
    BEGIN
      SELECT brand_id INTO NEW.brand_id FROM outlets WHERE id = NEW.outlet_id;
      RETURN NEW;
    END $$ LANGUAGE plpgsql
"""


def fill_brand_trigger(table: str) -> str:
    return (
        f"CREATE TRIGGER trg_{table}_fill_brand BEFORE INSERT ON {table}"
        " FOR EACH ROW EXECUTE FUNCTION fill_brand_from_outlet()"
    )


def grant_to_app_roles(table: str) -> list[str]:
    return [f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {role}" for role in APP_ROLES]
