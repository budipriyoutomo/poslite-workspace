import re

MAX_LENGTH = 20


def brand_code(slug: str) -> str:
    """Code of a company's first brand (A-Z, 0-9), derived from the company slug (ADR-022)."""
    return re.sub(r"[^A-Z0-9]", "", slug.upper())[:MAX_LENGTH] or "UTAMA"
