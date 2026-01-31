import os

os.environ.setdefault('DATABASE_URL', 'postgresql://dev:dev@localhost:5432/sg_property')

from flask import Flask
from routes import auth as auth_module


def test_auth_health_reports_firebase_status():
    auth_module._firebase_app = None
    auth_module._firebase_error_type = 'transient'
    auth_module._firebase_last_attempt = None

    app = Flask(__name__)
    app.register_blueprint(auth_module.auth_bp, url_prefix='/api/auth')
    client = app.test_client()

    response = client.get('/api/auth/health')

    assert response.status_code == 200
    data = response.get_json()
    assert data['firebase_admin']['status'] == 'transient_error'
    assert data['firebase_admin']['error_type'] == 'transient'
    assert 'cookies' in data
