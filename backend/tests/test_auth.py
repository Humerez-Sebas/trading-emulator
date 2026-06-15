def test_register_login_me_flow(client):
    r = client.post("/auth/register", json={"username": "trader1", "password": "secreta1"})
    assert r.status_code == 201
    assert r.json()["username"] == "trader1"
    # register logs you in: the cookie is httpOnly and works for /auth/me
    assert "access_token" in client.cookies

    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "trader1"

    # fresh client: login with the right and wrong password
    client.cookies.clear()
    assert client.get("/auth/me").status_code == 401

    r = client.post("/auth/login", json={"username": "trader1", "password": "incorrecta"})
    assert r.status_code == 401

    r = client.post("/auth/login", json={"username": "trader1", "password": "secreta1"})
    assert r.status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_register_duplicate_username(client):
    creds = {"username": "trader1", "password": "secreta1"}
    assert client.post("/auth/register", json=creds).status_code == 201
    assert client.post("/auth/register", json=creds).status_code == 409


def test_register_closed_returns_403(client, monkeypatch):
    # The registration gate is read per-request, so flipping the env (Flagsmith
    # falls back to it when no key is configured) closes registration without
    # rebuilding the app. The next test's fixture re-clears the settings cache.
    from app import flags
    from app.config import get_settings

    monkeypatch.setenv("REGISTRATION_ENABLED", "false")
    get_settings.cache_clear()
    flags.reset_cache()

    r = client.post("/auth/register", json={"username": "nuevo", "password": "secreta1"})
    assert r.status_code == 403

    # login still works for existing accounts when registration is closed
    get_settings.cache_clear()
    monkeypatch.setenv("REGISTRATION_ENABLED", "true")
    client.post("/auth/register", json={"username": "existente", "password": "secreta1"})
    monkeypatch.setenv("REGISTRATION_ENABLED", "false")
    get_settings.cache_clear()
    assert client.post("/auth/login", json={"username": "existente", "password": "secreta1"}).status_code == 200


def test_refresh_rotates_and_logout_revokes(client):
    client.post("/auth/register", json={"username": "trader1", "password": "secreta1"})
    old_refresh = client.cookies.get("refresh_token")

    r = client.post("/auth/refresh")
    assert r.status_code == 200
    assert client.cookies.get("refresh_token") != old_refresh

    # the rotated-out token is revoked and cannot be replayed
    client.cookies.clear()
    client.cookies.set("refresh_token", old_refresh, path="/auth")
    assert client.post("/auth/refresh").status_code == 401

    # logout revokes the active refresh token and clears cookies
    client.cookies.clear()
    client.post("/auth/login", json={"username": "trader1", "password": "secreta1"})
    active = client.cookies.get("refresh_token")
    assert client.post("/auth/logout").status_code == 204
    client.cookies.clear()
    client.cookies.set("refresh_token", active, path="/auth")
    assert client.post("/auth/refresh").status_code == 401
