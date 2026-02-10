from models.user import User


def test_access_endpoint_requires_auth(client):
    response = client.get('/api/auth/subscription')
    assert response.status_code == 401


def test_access_endpoint_success_payload_shape(client, monkeypatch):
    user = User(id=123, email='test@example.com')

    monkeypatch.setattr(
        'utils.subscription.get_user_from_request',
        lambda: user,
    )

    response = client.get(
        '/api/auth/subscription',
        headers={'Authorization': 'Bearer test-token'},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['accessLevel'] == 'authenticated'
    assert payload['accessSource'] == 'authenticated_user'
    assert payload['has_access'] is True
    assert 'tier' not in payload
