def device_code(existing: int) -> str:
    """Next device code of an outlet (A, B, … Z, AA, AB, …); it is part of every receipt number."""
    if existing < 0:
        raise ValueError(f"existing must be >= 0, got {existing}")
    n = existing + 1
    code = ""
    while n > 0:
        n, rest = divmod(n - 1, 26)
        code = chr(ord("A") + rest) + code
    return code
