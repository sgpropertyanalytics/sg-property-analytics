"""
Authentication Routes - Firebase-only authentication

Includes:
- Firebase/Google OAuth (primary auth flow)
- Subscription status endpoints
"""
from flask import Blueprint, jsonify, current_app
import time
import os
from models.database import db
from api.contracts import api_contract

auth_bp = Blueprint('auth', __name__)

# Firebase Admin SDK (lazy initialization)
# None = not attempted, False = failed, otherwise = app instance
_firebase_app = None
_firebase_error_type = None  # 'config' for permanent errors, 'transient' for temporary
_firebase_last_attempt = None
_firebase_retry_delay_s = 30


def get_firebase_app():
    """
    Lazy initialize Firebase Admin SDK.

    Returns the Firebase app instance, or None if initialization failed.
    Uses a sentinel value (False) to cache failure state and avoid
    retrying initialization on every request (which was causing slowdowns).

    Supports three initialization methods (in priority order):
    1. FIREBASE_SERVICE_ACCOUNT_JSON - JSON string of service account (for Render/Heroku)
    2. FIREBASE_SERVICE_ACCOUNT_PATH - File path to service account JSON
    3. Default credentials (for Google Cloud environments)
    """
    global _firebase_app, _firebase_error_type, _firebase_last_attempt

    # Already initialized successfully
    if _firebase_app not in (None, False):
        return _firebase_app

    # Previously failed due to config - don't retry until deploy fixes it
    if _firebase_app is False and _firebase_error_type == 'config':
        return None

    # Transient failures: throttle retries to avoid tight loops
    if _firebase_error_type == 'transient' and _firebase_last_attempt is not None:
        if time.time() - _firebase_last_attempt < _firebase_retry_delay_s:
            return None

    try:
        import json
        import firebase_admin
        from firebase_admin import credentials

        cred = None

        # Priority 1: JSON string env var (for Render/Heroku/etc)
        service_account_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
        if service_account_json:
            try:
                service_account_info = json.loads(service_account_json)
                cred = credentials.Certificate(service_account_info)
                print("[Auth] Firebase Admin SDK initialized with JSON env var")
            except json.JSONDecodeError as je:
                print(f"[Auth] FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON: {je}")
                _firebase_app = False
                _firebase_error_type = 'config'
                _firebase_last_attempt = time.time()
                return None

        # Priority 2: File path
        if cred is None:
            service_account_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH')
            if service_account_path and os.path.exists(service_account_path):
                cred = credentials.Certificate(service_account_path)
                print("[Auth] Firebase Admin SDK initialized with service account file")

        # Priority 3: Default credentials (Google Cloud)
        if cred is None:
            # Try to initialize with default credentials (for Cloud Run, etc.)
            _firebase_app = firebase_admin.initialize_app()
            print("[Auth] Firebase Admin SDK initialized with default credentials")
            _firebase_error_type = None
            _firebase_last_attempt = None
            return _firebase_app

        # Initialize with credential
        _firebase_app = firebase_admin.initialize_app(cred)
        _firebase_error_type = None
        _firebase_last_attempt = None
        return _firebase_app
    except ImportError as e:
        # Config error: missing firebase-admin package (permanent until deployed with package)
        _firebase_app = False
        _firebase_error_type = 'config'
        _firebase_last_attempt = time.time()
        print(f"[Auth] Firebase Admin SDK initialization failed - missing package: {e}")
        return None
    except Exception as e:
        # Transient error: could be network, credentials, etc.
        _firebase_app = None
        _firebase_error_type = 'transient'
        _firebase_last_attempt = time.time()
        print(f"[Auth] Firebase Admin SDK initialization failed (transient): {e}")
        return None


@auth_bp.route("/me", methods=["GET"])
@api_contract("auth/me")
def get_current_user():
    """Get current user info (requires authentication)"""
    try:
        from utils.subscription import get_user_from_request
        user = get_user_from_request()
        if not user:
            return jsonify({"error": "Authorization required"}), 401

        return jsonify({
            "user": user.to_dict()
        }), 200

    except Exception as e:
        current_app.logger.exception("Get current user failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/firebase-sync", methods=["POST"])
@api_contract("auth/firebase-sync")
def firebase_sync():
    """
    Sync Firebase user with backend User model.

    Called after successful Google OAuth sign-in on frontend.
    Creates user if doesn't exist, returns subscription data.
    Firebase ID token is verified server-side via firebase_admin.
    """
    try:
        from utils.subscription import get_user_from_request
        user = get_user_from_request()
        if not user:
            return jsonify({
                "error": "Authorization required",
                "error_code": "auth_required",
            }), 401

        entitlement = user.entitlement_info()
        access_expires_at = entitlement.get("access_expires_at")

        return jsonify({
            "message": "Sync successful",
            "user": user.to_dict(),
            "subscription": {
                "tier": user.normalized_tier(),
                "has_access": entitlement.get("has_access", False),
                "subscribed": entitlement.get("has_access", False),
                "entitlement_source": entitlement.get("entitlement_source"),
                "access_expires_at": access_expires_at.isoformat() if access_expires_at else None,
                "ends_at": access_expires_at.isoformat() if access_expires_at else None,
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Firebase sync error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/subscription", methods=["GET"])
@api_contract("auth/subscription")
def get_subscription():
    """Get current user's subscription status"""
    try:
        from services.schema_guard import check_user_entitlement_columns

        guard_result = check_user_entitlement_columns()
        missing_columns = guard_result.get("missing") or []
        if missing_columns:
            missing_str = "/".join(missing_columns)
            print(
                "DB migration 015_add_user_entitlements not applied; "
                f"missing users.{missing_str}"
            )
            return jsonify({
                "error": "Database schema out of date. Run migration 015_add_user_entitlements.",
                "missing": missing_columns,
                "meta": {
                    "migration": "015_add_user_entitlements",
                    "table": "users",
                    "error": guard_result.get("error"),
                },
            }), 503

        from utils.subscription import get_user_from_request
        user = get_user_from_request()
        if not user:
            return jsonify({"error": "Authorization required"}), 401

        entitlement = user.entitlement_info()
        access_expires_at = entitlement.get("access_expires_at")

        return jsonify({
            "tier": user.normalized_tier(),
            "has_access": entitlement.get("has_access", False),
            "subscribed": entitlement.get("has_access", False),
            "entitlement_source": entitlement.get("entitlement_source"),
            "access_expires_at": access_expires_at.isoformat() if access_expires_at else None,
            "ends_at": access_expires_at.isoformat() if access_expires_at else None,
        }), 200

    except Exception as e:
        current_app.logger.exception("Get subscription failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/delete-account", methods=["DELETE"])
@api_contract("auth/delete-account")
def delete_account():
    """
    Delete user account and cancel any active Stripe subscription.

    This permanently deletes the user and all associated data.
    """
    try:
        from utils.subscription import get_user_from_request
        user = get_user_from_request()
        if not user:
            return jsonify({"error": "Authorization required"}), 401

        # If user has Stripe customer ID, cancel any active subscriptions
        if user.stripe_customer_id:
            try:
                import stripe
                stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
                if stripe.api_key:
                    # List and cancel all active subscriptions for this customer
                    subscriptions = stripe.Subscription.list(
                        customer=user.stripe_customer_id,
                        status='active'
                    )
                    for sub in subscriptions.data:
                        stripe.Subscription.delete(sub.id)
                        print(f"Cancelled subscription {sub.id} for user {user.id}")
            except Exception as stripe_error:
                print(f"Failed to cancel Stripe subscription: {stripe_error}")
                # Continue with account deletion even if Stripe cancellation fails

        # Delete user from database
        db.session.delete(user)
        db.session.commit()
        print(f"User account deleted: {user.id}")

        return jsonify({
            "message": "Account deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Account deletion failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/health", methods=["GET"])
def auth_health():
    """Auth health endpoint for diagnostics (no secrets)."""
    firebase_status = 'unknown'
    if _firebase_app not in (None, False):
        firebase_status = 'ready'
    elif _firebase_error_type == 'config':
        firebase_status = 'misconfigured'
    elif _firebase_error_type == 'transient':
        firebase_status = 'transient_error'

    last_attempt_age = None
    if _firebase_last_attempt is not None:
        last_attempt_age = max(0, int(time.time() - _firebase_last_attempt))

    return jsonify({
        "firebase_admin": {
            "status": firebase_status,
            "error_type": _firebase_error_type,
            "last_attempt_age_s": last_attempt_age,
            "retry_delay_s": _firebase_retry_delay_s,
        },
    }), 200
