from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserModel(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(16), default="zh-TW")
    allow_oversized: Mapped[bool] = mapped_column(Boolean, default=False)
    default_city: Mapped[str] = mapped_column(String(100), default="Taipei")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BodyProfileModel(Base):
    __tablename__ = "user_body_profiles"

    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), unique=True)
    height_cm: Mapped[float | None] = mapped_column(Numeric(5, 1))
    shoulder_width_ratio: Mapped[float] = mapped_column(Numeric(5, 4), default=0.28)
    torso_length_ratio: Mapped[float] = mapped_column(Numeric(5, 4), default=0.34)
    leg_length_ratio: Mapped[float] = mapped_column(Numeric(5, 4), default=0.48)
    shoulder_to_hip_ratio: Mapped[float] = mapped_column(Numeric(5, 4), default=1.08)
    pose_landmarks_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    head_cutout_url: Mapped[str | None] = mapped_column(Text)
    use_head_anchor: Mapped[bool] = mapped_column(Boolean, default=False)


class WardrobeItemModel(Base):
    __tablename__ = "wardrobe_items"

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    image_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    sub_category: Mapped[str] = mapped_column(String(48), nullable=False)
    fit: Mapped[str] = mapped_column(String(16), nullable=False)
    length: Mapped[str] = mapped_column(String(16), nullable=False)
    thermal_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    style_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    season: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    primary_hex: Mapped[str] = mapped_column(String(7), nullable=False)
    primary_hsl: Mapped[dict] = mapped_column(JSONB, nullable=False)
    secondary_hex: Mapped[str | None] = mapped_column(String(7))
    secondary_hsl: Mapped[dict | None] = mapped_column(JSONB)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="TWD")
    wear_count: Mapped[int] = mapped_column(Integer, default=0)
    last_worn_at: Mapped[date | None] = mapped_column(Date)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
