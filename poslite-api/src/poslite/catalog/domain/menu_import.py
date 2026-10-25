"""Menu import from a workbook (P1-4): rows are checked before anything is written, every problem
is reported with its sheet and row, and a file with any problem imports nothing. Rows match by SKU
(products) or by name (categories, modifier groups)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

Row = Mapping[str, object]
SHEETS = ("categories", "modifier_groups", "products", "channel_prices", "outlet_prices")
PRINT_ROLES = ("receipt", "kitchen", "bar")


@dataclass(frozen=True, slots=True)
class RowError:
    sheet: str
    row: int  # as Excel numbers it: the header is row 1
    message: str


@dataclass(frozen=True, slots=True)
class CategoryRow:
    name: str
    print_role: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class ModifierGroupRow:
    name: str
    min_select: int
    max_select: int
    options: tuple[tuple[str, int], ...]  # (name, price) in sheet order


@dataclass(frozen=True, slots=True)
class ProductRow:
    sku: str
    name: str
    category: str
    price: int
    is_available: bool
    modifier_groups: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ChannelPriceRow:
    channel_code: str
    sku: str
    price: int


@dataclass(frozen=True, slots=True)
class OutletPriceRow:
    outlet_code: str
    sku: str
    price: int | None  # None = the product's price
    is_available: bool


@dataclass(frozen=True, slots=True)
class MenuImport:
    categories: tuple[CategoryRow, ...]
    modifier_groups: tuple[ModifierGroupRow, ...]
    products: tuple[ProductRow, ...]
    channel_prices: tuple[ChannelPriceRow, ...]
    outlet_prices: tuple[OutletPriceRow, ...]


def _text(row: Row, key: str) -> str:
    value = row.get(key)
    return "" if value is None else str(value).strip()


def _int(row: Row, key: str, default: int | None) -> int | None:
    """Whole numbers only (money is integer Rupiah, ADR-005); a blank cell is `default`."""
    value = row.get(key)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return default
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except ValueError:
        return None


_YES = ("", "ya", "y", "yes", "true", "1")
_NO = ("tidak", "t", "no", "n", "false", "0")


def _flag(row: Row, key: str) -> bool | None:
    value = _text(row, key).lower()
    return True if value in _YES else False if value in _NO else None


class _Errors:
    def __init__(self) -> None:
        self.items: list[RowError] = []

    def add(self, sheet: str, index: int, message: str) -> None:
        self.items.append(RowError(sheet, index + 2, message))


def _categories(rows: Sequence[Row], errors: _Errors) -> list[CategoryRow]:
    result, seen = [], set[str]()
    for i, row in enumerate(rows):
        name, role = _text(row, "name"), _text(row, "print_role").lower() or "receipt"
        order = _int(row, "sort_order", 0)
        if not name:
            errors.add("categories", i, "Nama wajib diisi")
        elif name.lower() in seen:
            errors.add("categories", i, f"Kategori '{name}' muncul dua kali")
        if role not in PRINT_ROLES:
            errors.add("categories", i, "print_role harus receipt, kitchen, atau bar")
        if order is None:
            errors.add("categories", i, "sort_order harus bilangan bulat")
        seen.add(name.lower())
        result.append(CategoryRow(name, role, order or 0))
    return result


def _groups(rows: Sequence[Row], errors: _Errors) -> list[ModifierGroupRow]:
    """One row per option; the group's min/max come from its first row."""
    order: list[str] = []
    first: dict[str, tuple[int, int]] = {}
    options: dict[str, list[tuple[str, int]]] = {}
    for i, row in enumerate(rows):
        group, option, price = _text(row, "group"), _text(row, "option"), _int(row, "price", 0)
        if not group or not option:
            errors.add("modifier_groups", i, "group dan option wajib diisi")
            continue
        if price is None or price < 0:
            errors.add("modifier_groups", i, "Harga harus bilangan bulat ≥ 0")
        key = group.lower()
        if key not in first:
            low, high = _int(row, "min_select", 0), _int(row, "max_select", 1)
            if low is None or high is None or low < 0 or high < 1 or low > high:
                errors.add("modifier_groups", i, "min_select/max_select tidak valid")
            first[key] = (low or 0, high or 1)
            order.append(group)
            options[key] = []
        options[key].append((option, price or 0))
    return [ModifierGroupRow(g, *first[g.lower()], tuple(options[g.lower()])) for g in order]


def _products(
    rows: Sequence[Row], categories: set[str], groups: set[str], errors: _Errors
) -> list[ProductRow]:
    result, seen = [], set[str]()
    if not rows:
        errors.items.append(RowError("products", 1, "Sheet products kosong"))
    for i, row in enumerate(rows):
        sku, name, category = _text(row, "sku"), _text(row, "name"), _text(row, "category")
        price, available = _int(row, "price", None), _flag(row, "is_available")
        names = tuple(g.strip() for g in _text(row, "modifier_groups").split(",") if g.strip())
        if category and category.lower() not in categories:
            errors.add("products", i, f"Kategori '{category}' tidak ada di sheet categories")
        if not sku:
            errors.add("products", i, "SKU wajib diisi")
        elif sku.lower() in seen:
            errors.add("products", i, f"SKU '{sku}' muncul dua kali")
        if not name or not category:
            errors.add("products", i, "name dan category wajib diisi")
        if price is None or price < 0:
            errors.add("products", i, "Harga harus bilangan bulat ≥ 0")
        if available is None:
            errors.add("products", i, "is_available harus ya atau tidak")
        for group in names:
            if group.lower() not in groups:
                errors.add(
                    "products", i, f"Grup modifier '{group}' tidak ada di sheet modifier_groups"
                )
        seen.add(sku.lower())
        result.append(ProductRow(sku, name, category, price or 0, available is not False, names))
    return result


def _where(sheet: str, i: int, row: Row, code: str, skus: set[str], errors: _Errors) -> str:
    where, sku = _text(row, code), _text(row, "sku")
    if not where or not sku:
        errors.add(sheet, i, f"{code} dan sku wajib diisi")
    elif sku.lower() not in skus:
        errors.add(sheet, i, f"SKU '{sku}' tidak ada di sheet products")
    return where.upper()


def _channel_prices(rows: Sequence[Row], skus: set[str], errors: _Errors) -> list[ChannelPriceRow]:
    result = []
    for i, row in enumerate(rows):
        code = _where("channel_prices", i, row, "channel_code", skus, errors)
        price = _int(row, "price", None)
        if price is None or price < 0:
            errors.add("channel_prices", i, "Harga harus bilangan bulat ≥ 0")
        result.append(ChannelPriceRow(code, _text(row, "sku"), price or 0))
    return result


def _outlet_prices(rows: Sequence[Row], skus: set[str], errors: _Errors) -> list[OutletPriceRow]:
    result = []
    for i, row in enumerate(rows):
        code = _where("outlet_prices", i, row, "outlet_code", skus, errors)
        price, available = _int(row, "price", None), _flag(row, "is_available")
        has_price = row.get("price") not in (None, "")
        if (has_price and (price is None or price < 0)) or available is None:
            errors.add("outlet_prices", i, "Harga kosong atau ≥ 0; is_available ya atau tidak")
        result.append(OutletPriceRow(code, _text(row, "sku"), price, available is not False))
    return result


def parse_menu(
    sheets: Mapping[str, Sequence[Row]],
    *,
    known_categories: frozenset[str] = frozenset(),
    known_groups: frozenset[str] = frozenset(),
) -> MenuImport | list[RowError]:
    """The import, or every problem found. `known_*` = lower-case names the brand already has."""
    errors = _Errors()
    categories = _categories(sheets.get("categories", ()), errors)
    groups = _groups(sheets.get("modifier_groups", ()), errors)
    products = _products(
        sheets.get("products", ()),
        {c.name.lower() for c in categories} | known_categories,
        {g.name.lower() for g in groups} | known_groups,
        errors,
    )
    skus = {p.sku.lower() for p in products}
    channel = _channel_prices(sheets.get("channel_prices", ()), skus, errors)
    outlet = _outlet_prices(sheets.get("outlet_prices", ()), skus, errors)
    if errors.items:
        return sorted(errors.items, key=lambda e: (SHEETS.index(e.sheet), e.row))
    return MenuImport(
        tuple(categories), tuple(groups), tuple(products), tuple(channel), tuple(outlet)
    )
