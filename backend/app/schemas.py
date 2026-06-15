"""HTTP contracts. User-facing field names stay in Spanish for consistency
with the existing MT5 helper (`descripcion`, `categoria`, `velas`, `desde`,
`hasta`)."""

from pydantic import BaseModel, Field

# ---- auth ----


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str


# ---- symbols ----


class SymbolIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    descripcion: str = ""
    categoria: str = "Otros"
    digits: int = 2


class CoverageOut(BaseModel):
    tf: str
    desde: int
    hasta: int
    velas: int


class SymbolOut(BaseModel):
    name: str
    descripcion: str
    categoria: str
    digits: int
    cobertura: list[CoverageOut]


class SymbolsResponse(BaseModel):
    total: int
    symbols: list[SymbolOut]


# ---- candles ----

# one candle on the wire: [time, open, high, low, close]
CandleRow = tuple[int, float, float, float, float]


class CandlesResponse(BaseModel):
    symbol: str
    tf: str
    velas: list[CandleRow]
    # epoch-seconds cursor for the next chunk; null = no more data
    siguiente: int | None


# ---- ingest ----


class IngestSymbols(BaseModel):
    symbols: list[SymbolIn]


class IngestCandles(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    tf: str = Field(min_length=2, max_length=8)
    velas: list[CandleRow]


class IngestRefresh(BaseModel):
    """Epoch-second range to re-materialize in the candles_daily aggregate,
    posted once per (symbol, tf) after its candle batches are all in."""

    desde: int = Field(ge=0)
    hasta: int = Field(ge=0)


class IngestResult(BaseModel):
    recibidas: int


# ---- user symbols (curated selection) ----


class UserSymbolsIn(BaseModel):
    """Replace-all payload: the full desired selection for the user."""

    symbols: list[str] = Field(default_factory=list)


class UserSymbolsOut(BaseModel):
    symbols: list[str]
    total: int
