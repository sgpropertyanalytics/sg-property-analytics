import pytest

try:
    import flask_talisman  # noqa: F401
    HAS_TALISMAN = True
except ImportError:
    HAS_TALISMAN = False

pytestmark = pytest.mark.skipif(
    not HAS_TALISMAN,
    reason="flask-talisman not installed",
)


SECURITY_HEADERS = (
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Frame-Options",
)


def _assert_security_headers(response):
    missing = [header for header in SECURITY_HEADERS if header not in response.headers]
    assert not missing, f"Missing security headers: {missing}"

    has_csp = (
        "Content-Security-Policy" in response.headers
        or "Content-Security-Policy-Report-Only" in response.headers
    )
    assert has_csp, "Missing Content-Security-Policy header"


def test_security_headers_on_success(client):
    response = client.get("/api/ping")
    assert response.status_code == 200
    _assert_security_headers(response)


def test_security_headers_on_client_error(client):
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 400
    _assert_security_headers(response)


def test_security_headers_on_server_error(app, client):
    @app.route("/__test/boom")
    def boom():
        raise RuntimeError("boom")

    response = client.get("/__test/boom")
    assert response.status_code == 500
    _assert_security_headers(response)


def test_csp_report_endpoint(client):
    response = client.post("/api/csp-report", json={"csp-report": {"blocked-uri": "data:"}})
    assert response.status_code == 204
    _assert_security_headers(response)
