import os
import time

os.environ.setdefault('DATABASE_URL', 'postgresql://dev:dev@localhost:5432/sg_property')

from routes import auth as auth_module


def reset_firebase_globals():
    auth_module._firebase_app = None
    auth_module._firebase_error_type = None
    auth_module._firebase_last_attempt = None


def test_get_firebase_app_respects_config_error_cache():
    reset_firebase_globals()
    auth_module._firebase_app = False
    auth_module._firebase_error_type = 'config'

    result = auth_module.get_firebase_app()

    assert result is None
    assert auth_module._firebase_app is False
    assert auth_module._firebase_error_type == 'config'


def test_get_firebase_app_throttles_transient_failures():
    reset_firebase_globals()
    auth_module._firebase_error_type = 'transient'
    auth_module._firebase_last_attempt = time.time()

    result = auth_module.get_firebase_app()

    assert result is None
    assert auth_module._firebase_error_type == 'transient'


def test_get_firebase_app_retries_after_backoff(monkeypatch):
    reset_firebase_globals()
    auth_module._firebase_error_type = 'transient'
    auth_module._firebase_last_attempt = time.time() - auth_module._firebase_retry_delay_s - 1

    class FakeFirebaseAdmin:
        credentials = None

        @staticmethod
        def initialize_app(_cred=None):
            return object()

    class FakeCredentials:
        @staticmethod
        def Certificate(_info):
            return object()

    import sys

    FakeFirebaseAdmin.credentials = FakeCredentials
    monkeypatch.setitem(sys.modules, 'firebase_admin', FakeFirebaseAdmin)
    monkeypatch.setitem(sys.modules, 'firebase_admin.credentials', FakeCredentials)
    monkeypatch.setitem(sys.modules, 'firebase_admin.auth', object())
    monkeypatch.setenv('FIREBASE_SERVICE_ACCOUNT_JSON', '')
    monkeypatch.setenv('FIREBASE_SERVICE_ACCOUNT_PATH', '')
    monkeypatch.setattr(auth_module.os.path, 'exists', lambda _path: False)

    result = auth_module.get_firebase_app()

    assert result is not None
    assert auth_module._firebase_error_type is None
    assert auth_module._firebase_last_attempt is None


def test_get_firebase_app_invalid_json_marks_config_error(monkeypatch):
    reset_firebase_globals()

    class FakeFirebaseAdmin:
        credentials = None

        @staticmethod
        def initialize_app(_cred=None):
            return object()

    class FakeCredentials:
        @staticmethod
        def Certificate(_info):
            return object()

    import sys

    FakeFirebaseAdmin.credentials = FakeCredentials
    monkeypatch.setitem(sys.modules, 'firebase_admin', FakeFirebaseAdmin)
    monkeypatch.setitem(sys.modules, 'firebase_admin.credentials', FakeCredentials)
    monkeypatch.setitem(sys.modules, 'firebase_admin.auth', object())
    monkeypatch.setenv('FIREBASE_SERVICE_ACCOUNT_JSON', '{not-json')
    monkeypatch.setenv('FIREBASE_SERVICE_ACCOUNT_PATH', '')
    monkeypatch.setattr(auth_module.os.path, 'exists', lambda _path: False)

    result = auth_module.get_firebase_app()

    assert result is None
    assert auth_module._firebase_app is False
    assert auth_module._firebase_error_type == 'config'
