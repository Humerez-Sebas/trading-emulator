def test_health_reports_status_and_version(client):
    """/health exposes the app version so a curl confirms which build is live."""
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"]  # non-empty version string
