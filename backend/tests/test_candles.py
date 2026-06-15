from conftest import INGEST_HEADERS

BASE = 1717200000  # 2024-06-01 00:00 UTC
HOUR = 3600


def _seed(client, n=10):
    client.post("/auth/register", json={"username": "trader1", "password": "secreta1"})
    velas = [[BASE + i * HOUR, 1.0 + i, 2.0 + i, 0.5 + i, 1.5 + i] for i in range(n)]
    r = client.post(
        "/ingest/candles",
        json={"symbol": "EURUSD", "tf": "H1", "velas": velas},
        headers=INGEST_HEADERS,
    )
    assert r.status_code == 200


def test_candles_requires_auth(client):
    r = client.get("/candles", params={"symbol": "EURUSD", "tf": "H1"})
    assert r.status_code == 401


def test_candles_range_query(client):
    _seed(client)
    r = client.get(
        "/candles",
        params={"symbol": "EURUSD", "tf": "H1", "desde": BASE + 2 * HOUR, "hasta": BASE + 5 * HOUR},
    )
    body = r.json()
    assert [v[0] for v in body["velas"]] == [BASE + i * HOUR for i in range(2, 6)]
    assert body["siguiente"] is None


def test_candles_iso_dates(client):
    _seed(client)
    r = client.get(
        "/candles",
        params={"symbol": "EURUSD", "tf": "H1", "desde": "2024-06-01", "hasta": "2024-06-01 03:00"},
    )
    assert len(r.json()["velas"]) == 4


def test_candles_chunking_cursor(client):
    _seed(client, n=10)
    times = []
    cursor = None
    for _ in range(10):  # safety bound
        params = {"symbol": "EURUSD", "tf": "H1", "limite": 4}
        if cursor is not None:
            params["desde"] = cursor
        body = client.get("/candles", params=params).json()
        times += [v[0] for v in body["velas"]]
        cursor = body["siguiente"]
        if cursor is None:
            break
    assert times == [BASE + i * HOUR for i in range(10)]
