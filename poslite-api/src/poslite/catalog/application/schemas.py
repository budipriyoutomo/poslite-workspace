from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from poslite.shared.presentation.schemas import Name, Rupiah, Ulid


class CategoryIn(BaseModel):
    name: Name
    sort_order: int = 0
    color: Annotated[str, StringConstraints(max_length=20)] = ""
    print_role: Literal["receipt", "kitchen", "bar"] = "receipt"


class CategoryOut(CategoryIn):
    id: str


class ProductIn(BaseModel):
    category_id: Ulid
    sku: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
    price: Rupiah
    # Key from POST /media/images (ADR-021), never a vendor URL.
    image_key: Annotated[str, StringConstraints(max_length=300)] | None = None
    is_available: bool = True
    modifier_group_ids: list[Ulid] = []


class ProductOut(ProductIn):
    id: str
    image_url: str | None  # image_key on the current media base URL


class OptionIn(BaseModel):
    id: Ulid | None = None
    name: Name
    price: Rupiah = 0


class OptionOut(BaseModel):
    id: str
    name: str
    price: int


class ModifierGroupIn(BaseModel):
    name: Name
    min_select: Annotated[int, Field(ge=0, le=20)] = 0
    max_select: Annotated[int, Field(ge=1, le=20)] = 1
    options: Annotated[list[OptionIn], Field(min_length=1)]


class ModifierGroupOut(BaseModel):
    id: str
    name: str
    min_select: int
    max_select: int
    options: list[OptionOut]


class OutletProductIn(BaseModel):
    price: Rupiah | None  # None = use the base price
    is_available: bool = True


class OutletProductOut(BaseModel):
    product_id: str
    name: str
    base_price: int
    price: int | None
    effective_price: int
    is_available: bool


class ImageOut(BaseModel):
    key: str  # what products.image_key stores (ADR-021)
    url: str  # for a preview; built from the current media base URL
