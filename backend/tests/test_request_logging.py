import logging

from flask import Flask, jsonify

from api.middleware.request_logging import setup_request_logging_middleware


def _build_test_app():
    app = Flask(__name__)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    setup_request_logging_middleware(app)
    return app


def test_request_logging_sample_rate(monkeypatch, caplog):
    monkeypatch.setenv("REQUEST_LOG_ENABLED", "true")
    monkeypatch.setenv("REQUEST_LOG_SAMPLE_RATE", "1.0")
    monkeypatch.setenv("REQUEST_LOG_ENDPOINTS", "")

    app = _build_test_app()
    app.config["TESTING"] = True
    client = app.test_client()

    with caplog.at_level(logging.INFO, logger="api.request"):
        response = client.get("/api/health")

    assert response.status_code == 200
    assert any(
        "api_request path=/api/health" in record.getMessage()
        for record in caplog.records
    )


def test_request_logging_watchlist(monkeypatch, caplog):
    monkeypatch.setenv("REQUEST_LOG_ENABLED", "true")
    monkeypatch.setenv("REQUEST_LOG_SAMPLE_RATE", "0.0")
    monkeypatch.setenv("REQUEST_LOG_ENDPOINTS", "/api/health")

    app = _build_test_app()
    app.config["TESTING"] = True
    client = app.test_client()

    with caplog.at_level(logging.INFO, logger="api.request"):
        response = client.get("/api/health")

    assert response.status_code == 200
    assert any(
        "api_request path=/api/health" in record.getMessage()
        for record in caplog.records
    )
