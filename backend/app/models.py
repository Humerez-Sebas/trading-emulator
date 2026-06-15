"""Database models. Candle times are UTC epoch seconds (BIGINT), matching the
frontend's `Candle.time` and the MT5 rates payload, so no timezone conversion
happens anywhere in the pipeline."""

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Symbol(Base):
    __tablename__ = "symbols"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    descripcion: Mapped[str] = mapped_column(String(255), default="")
    categoria: Mapped[str] = mapped_column(String(64), default="Otros")
    digits: Mapped[int] = mapped_column(Integer, default=2)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Candle(Base):
    """Hypertable (PostgreSQL/TimescaleDB) partitioned by `time`."""

    __tablename__ = "candles"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    tf: Mapped[str] = mapped_column(String(8), primary_key=True)
    time: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)


class IngestRun(Base):
    """Audit log: one row per accepted /ingest/candles batch."""

    __tablename__ = "ingest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32))
    tf: Mapped[str] = mapped_column(String(8))
    desde: Mapped[int] = mapped_column(BigInteger)
    hasta: Mapped[int] = mapped_column(BigInteger)
    velas: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RefreshToken(Base):
    """Issued refresh tokens, for rotation + revocation on logout."""

    __tablename__ = "refresh_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(default=False)


class UserSymbol(Base):
    """A user's curated catalog selection (which symbols they care about).

    Join table user <-> symbol. Both FKs cascade on delete: dropping a user
    or retiring a harvested symbol removes the dangling selection rows.
    """

    __tablename__ = "user_symbols"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    symbol: Mapped[str] = mapped_column(
        String(32), ForeignKey("symbols.name", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
