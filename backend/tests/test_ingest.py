from conftest import INGEST_HEADERS

CANDLES = {
    "symbol": "US30",
    "tf": "H1",
    "velas": [
        [1717200000, 38000.0, 38100.0, 37950.0, 38050.0],
        [1717203600, 38050.0, 38200.0, 38000.0, 38150.0],
        [1717207200, 38150.0, 38300.0, 38100.0, 38250.0],
    ],
}


def _register(client):
    client.post("/auth/register", json={"username": "trader1", "password": "secreta1"})


def test_ingest_requires_api_key(client):
    assert client.post("/ingest/candles", json=CANDLES).status_code == 401
    bad = {"X-API-Key": "wrong"}
    assert client.post("/ingest/candles", json=CANDLES, headers=bad).status_code == 401


def test_ingest_is_idempotent_and_audited(client):
    _register(client)
    r = client.post("/ingest/candles", json=CANDLES, headers=INGEST_HEADERS)
    assert r.status_code == 200
    assert r.json() == {"recibidas": 3}

    # re-running the exact same batch must NOT duplicate candles
    r = client.post("/ingest/candles", json=CANDLES, headers=INGEST_HEADERS)
    assert r.status_code == 200

    r = client.get("/candles", params={"symbol": "US30", "tf": "H1"})
    assert r.status_code == 200
    assert len(r.json()["velas"]) == 3

    # both runs are audited
    from app.db import get_sessionmaker
    from app.models import IngestRun

    with get_sessionmaker()() as db:
        runs = db.query(IngestRun).all()
        assert len(runs) == 2
        assert runs[0].symbol == "US30"
        assert runs[0].velas == 3
        assert runs[0].desde == 1717200000
        assert runs[0].hasta == 1717207200


def test_ingest_symbols_upsert(client):
    _register(client)
    payload = {
        "symbols": [
            {"name": "US30", "descripcion": "Dow Jones", "categoria": "Índices", "digits": 2}
        ]
    }
    assert client.post("/ingest/symbols", json=payload, headers=INGEST_HEADERS).status_code == 200
    # upsert updates the description instead of failing on the PK
    payload["symbols"][0]["descripcion"] = "Dow Jones 30"
    assert client.post("/ingest/symbols", json=payload, headers=INGEST_HEADERS).status_code == 200

    r = client.get("/symbols")
    body = r.json()
    assert body["total"] == 1
    assert body["symbols"][0]["descripcion"] == "Dow Jones 30"


def test_symbols_coverage(client):
    _register(client)
    client.post(
        "/ingest/symbols",
        json={"symbols": [{"name": "US30", "descripcion": "Dow", "categoria": "Índices", "digits": 2}]},
        headers=INGEST_HEADERS,
    )
    client.post("/ingest/candles", json=CANDLES, headers=INGEST_HEADERS)

    cov = client.get("/symbols").json()["symbols"][0]["cobertura"]
    assert cov == [{"tf": "H1", "desde": 1717200000, "hasta": 1717207200, "velas": 3}]


def test_new_symbol_tf_reflected_after_ingest(client):
    """A freshly ingested (symbol, tf) shows up in /symbols after the batch
    plus a /ingest/refresh call -- the contract the harvester follows. On
    SQLite (here) /symbols reads candles directly, so coverage is correct
    regardless; on PostgreSQL the refresh re-materializes candles_daily."""
    _register(client)
    client.post(
        "/ingest/symbols",
        json={"symbols": [{"name": "XAUUSD", "descripcion": "Oro", "categoria": "Metales", "digits": 2}]},
        headers=INGEST_HEADERS,
    )

    # a brand-new (symbol, tf) that did not exist before this batch
    batch = {
        "symbol": "XAUUSD",
        "tf": "M5",
        "velas": [
            [1717200000, 2300.0, 2305.0, 2299.0, 2302.0],
            [1717200300, 2302.0, 2308.0, 2301.0, 2307.0],
        ],
    }
    assert client.post("/ingest/candles", json=batch, headers=INGEST_HEADERS).status_code == 200
    # the harvester finalizes the (symbol, tf) with one refresh over its range
    r = client.post(
        "/ingest/refresh",
        json={"desde": 1717200000, "hasta": 1717200300},
        headers=INGEST_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    sym = next(s for s in client.get("/symbols").json()["symbols"] if s["name"] == "XAUUSD")
    assert sym["cobertura"] == [
        {"tf": "M5", "desde": 1717200000, "hasta": 1717200300, "velas": 2}
    ]


def test_refresh_requires_api_key(client):
    body = {"desde": 1717200000, "hasta": 1717207200}
    assert client.post("/ingest/refresh", json=body).status_code == 401
    assert client.post("/ingest/refresh", json=body, headers={"X-API-Key": "wrong"}).status_code == 401


def test_coverage_window_is_bucket_aligned():
    """The refresh window must align to the daily bucket and always span at
    least one full bucket, even for a single-candle range."""
    from app.routers.ingest import COVERAGE_BUCKET, _coverage_window

    # a single candle still yields a one-bucket [start, end) window
    start, end = _coverage_window(1717200000, 1717200000)
    assert start % COVERAGE_BUCKET == 0
    assert end == start + COVERAGE_BUCKET
    assert start <= 1717200000 < end

    # a range spanning three days covers every touched bucket, end exclusive
    start, end = _coverage_window(1717200000, 1717200000 + 2 * COVERAGE_BUCKET)
    assert start % COVERAGE_BUCKET == 0
    assert end == start + 3 * COVERAGE_BUCKET
