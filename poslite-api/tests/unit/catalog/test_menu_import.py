"""P1-4: a menu workbook is checked row by row before anything is written; every problem is
reported with its sheet and row, and a file with any problem imports nothing."""

from poslite.catalog.domain.menu_import import MenuImport, RowError, parse_menu

SHEETS = {
    "categories": [{"name": "Minuman", "print_role": "bar", "sort_order": 1}],
    "modifier_groups": [
        {
            "group": "Level Gula",
            "option": "Normal",
            "price": None,
            "min_select": 1,
            "max_select": 1,
        },
        {
            "group": "Level Gula",
            "option": "Less",
            "price": 0,
            "min_select": None,
            "max_select": None,
        },
    ],
    "products": [
        {
            "sku": "MN-1",
            "name": "Es Teh",
            "category": "Minuman",
            "price": 5000,
            "is_available": "ya",
            "modifier_groups": "Level Gula",
        }
    ],
    "channel_prices": [{"channel_code": "GOFOOD", "sku": "MN-1", "price": 6000}],
    "outlet_prices": [
        {"outlet_code": "JKT01", "sku": "MN-1", "price": None, "is_available": "tidak"}
    ],
}


def test_reads_a_whole_menu() -> None:
    result = parse_menu(SHEETS)

    assert isinstance(result, MenuImport)
    assert [(c.name, c.print_role, c.sort_order) for c in result.categories] == [
        ("Minuman", "bar", 1)
    ]
    [group] = result.modifier_groups
    assert (group.name, group.min_select, group.max_select, group.options) == (
        "Level Gula",
        1,
        1,
        (("Normal", 0), ("Less", 0)),
    )
    [product] = result.products
    assert (product.sku, product.category, product.price, product.is_available) == (
        "MN-1",
        "Minuman",
        5000,
        True,
    )
    assert product.modifier_groups == ("Level Gula",)
    assert [(p.channel_code, p.sku, p.price) for p in result.channel_prices] == [
        ("GOFOOD", "MN-1", 6000)
    ]
    assert [(p.outlet_code, p.price, p.is_available) for p in result.outlet_prices] == [
        ("JKT01", None, False)
    ]


def test_reports_every_bad_row_with_its_sheet_and_row_number() -> None:
    bad = {
        **SHEETS,
        "products": [
            {"sku": "MN-1", "name": "Es Teh", "category": "Makanan", "price": 5000},
            {"sku": "MN-1", "name": "Teh 2", "category": "Minuman", "price": -1},
            {"sku": "", "name": "Tanpa SKU", "category": "Minuman", "price": 1000},
            {
                "sku": "MN-3",
                "name": "Kopi",
                "category": "Minuman",
                "price": 8000,
                "modifier_groups": "Topping",
            },
        ],
    }

    result = parse_menu(bad)

    assert result == [
        RowError("products", 2, "Kategori 'Makanan' tidak ada di sheet categories"),
        RowError("products", 3, "SKU 'MN-1' muncul dua kali"),
        RowError("products", 3, "Harga harus bilangan bulat ≥ 0"),
        RowError("products", 4, "SKU wajib diisi"),
        RowError("products", 5, "Grup modifier 'Topping' tidak ada di sheet modifier_groups"),
    ]


def test_a_price_on_a_channel_needs_a_product_of_the_file() -> None:
    result = parse_menu(
        {**SHEETS, "channel_prices": [{"channel_code": "GOFOOD", "sku": "X-9", "price": 1}]}
    )

    assert result == [RowError("channel_prices", 2, "SKU 'X-9' tidak ada di sheet products")]


def test_an_empty_workbook_is_refused() -> None:
    assert parse_menu({}) == [RowError("products", 1, "Sheet products kosong")]
