"""Tests for the per-user curated symbol selection endpoints."""

from conftest import INGEST_HEADERS

SYMBOLS_PAYLOAD = {
    "symbols": [
        {"name": "US30", "descripcion": "Dow", "categoria": "Índices", "digits": 1},
        {"name": "XAUUSD", "descripcion": "Oro", "categoria": "Metales", "digits": 2},
        {"name": "EURUSD", "descripcion": "Euro", "categoria": "Forex", "digits": 5},
    ]
}


def _register(client):
    client.post("/auth/register", json={"username": "trader1", "password": "secreta1"})


def _seed_catalog(client):
    client.post("/ingest/symbols", json=SYMBOLS_PAYLOAD, headers=INGEST_HEADERS)


def test_user_symbols_requires_auth(client):
    assert client.get("/user/symbols").status_code == 401
    assert client.put("/user/symbols", json={"symbols": []}).status_code == 401


def test_get_returns_empty_for_new_user(client):
    _register(client)
    r = client.get("/user/symbols")
    assert r.status_code == 200
    assert r.json() == {"symbols": [], "total": 0}


def test_put_replaces_whole_selection(client):
    _register(client)
    _seed_catalog(client)

    r = client.put("/user/symbols", json={"symbols": ["XAUUSD", "US30"]})
    assert r.status_code == 200
    # sorted in the response
    assert r.json() == {"symbols": ["US30", "XAUUSD"], "total": 2}
    assert client.get("/user/symbols").json()["symbols"] == ["US30", "XAUUSD"]

    # replace-all semantics: a second PUT wipes the previous list
    r = client.put("/user/symbols", json={"symbols": ["EURUSD"]})
    assert r.json() == {"symbols": ["EURUSD"], "total": 1}
    assert client.get("/user/symbols").json()["symbols"] == ["EURUSD"]


def test_put_drops_unknown_symbols(client):
    _register(client)
    _seed_catalog(client)

    r = client.put("/user/symbols", json={"symbols": ["US30", "NOPE", "XAUUSD"]})
    assert r.status_code == 200
    # the symbol not in the catalog is silently dropped (FK would reject it)
    assert r.json()["symbols"] == ["US30", "XAUUSD"]


def test_put_dedupes_and_trims(client):
    _register(client)
    _seed_catalog(client)

    r = client.put("/user/symbols", json={"symbols": [" US30 ", "US30", "EURUSD"]})
    assert r.status_code == 200
    assert r.json()["symbols"] == ["EURUSD", "US30"]


def test_selection_is_per_user(client):
    _register(client)
    _seed_catalog(client)
    client.put("/user/symbols", json={"symbols": ["US30"]})

    # a different user starts empty and keeps an independent selection
    client.cookies.clear()
    client.post("/auth/register", json={"username": "trader2", "password": "secreta2"})
    assert client.get("/user/symbols").json()["symbols"] == []
    client.put("/user/symbols", json={"symbols": ["EURUSD"]})

    client.cookies.clear()
    client.post("/auth/login", json={"username": "trader1", "password": "secreta1"})
    assert client.get("/user/symbols").json()["symbols"] == ["US30"]
