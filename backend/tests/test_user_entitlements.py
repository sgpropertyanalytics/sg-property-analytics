from models.user import User


def test_authenticated_user_has_access_by_default():
    user = User(email='test@example.com')

    access = user.access_info()

    assert user.access_level == 'authenticated'
    assert access['has_access'] is True
    assert access['access_source'] == 'authenticated_user'
    assert access['access_expires_at'] is None


def test_access_info_always_returns_full_access():
    """All authenticated users have full access — no tiers, no overrides."""
    user = User(email='test@example.com')

    access = user.access_info()

    assert access['has_access'] is True
    assert access['access_source'] == 'authenticated_user'
    assert access['access_expires_at'] is None


def test_to_dict_uses_neutral_access_fields_only():
    user = User(id=1, email='test@example.com')

    payload = user.to_dict()

    assert payload['accessLevel'] == 'authenticated'
    assert payload['has_access'] is True
    assert payload['accessSource'] == 'authenticated_user'
    assert 'tier' not in payload
    assert 'access_source' not in payload
