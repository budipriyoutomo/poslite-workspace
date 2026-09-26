from sqlalchemy import CHAR, BigInteger, Boolean, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class CategoryModel(MasterColumns, Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
    color: Mapped[str] = mapped_column(String(20), server_default="")
    print_role: Mapped[str] = mapped_column(String(20), server_default="receipt")


class ProductModel(MasterColumns, Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    category_id: Mapped[str] = mapped_column(CHAR(26))
    sku: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, server_default="")
    image_url: Mapped[str | None] = mapped_column(Text)
    price: Mapped[int] = mapped_column(BigInteger)
    is_available: Mapped[bool] = mapped_column(Boolean, server_default="true")


class ModifierGroupModel(MasterColumns, Base):
    __tablename__ = "modifier_groups"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    min_select: Mapped[int] = mapped_column(SmallInteger)
    max_select: Mapped[int] = mapped_column(SmallInteger)


class ModifierOptionModel(MasterColumns, Base):
    __tablename__ = "modifier_options"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    modifier_group_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    price: Mapped[int] = mapped_column(BigInteger, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")


class ProductModifierGroupModel(Base):
    __tablename__ = "product_modifier_group"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    product_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    modifier_group_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")


class OutletProductModel(Base):
    """Per-outlet override (link table): a change touches products.version (ADR-009)."""

    __tablename__ = "outlet_products"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    product_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    price: Mapped[int | None] = mapped_column(BigInteger)
    is_available: Mapped[bool] = mapped_column(Boolean, server_default="true")
