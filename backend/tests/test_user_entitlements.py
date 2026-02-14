from datetime import datetime, timedelta

from models.user import User


def test_authenticated_user_has_access_by_default():
    user = User(email='test@example.com')

    access = user.access_info()

    assert user.access_level == 'authenticated'
    assert access['has_access'] is True
    assert access['access_source'] == 'authenticated_user'
    assert access['access_expires_at'] is None


def test_admin_override_sets_admin_source_and_expiry():
    now = datetime.utcnow()
    future = now + timedelta(days=3)
    user = User(
        email='test@example.com',
        access_override_enabled=True,
        access_override_until=future,
        access_source='admin_override',
    )

    access = user.access_info(now=now)

    assert access['has_access'] is True
    assert access['access_source'] == 'admin_override'
    assert access['access_expires_at'] == future


def test_to_dict_uses_neutral_access_fields_only():
    user = User(id=1, email='test@example.com')

    payload = user.to_dict()

    assert payload['accessLevel'] == 'authenticated'
    assert payload['has_access'] is True
    assert payload['accessSource'] == 'authenticated_user'
    assert 'tier' not in payload
    assert 'access_source' not in payload
