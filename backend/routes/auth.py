"""
Authentication Routes - JWT-based user authentication

Includes:
- Email/password authentication
- Firebase/Google OAuth sync
- Subscription status endpoints
"""
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta
import time
import secrets
import jwt
import os
from models.database import db
from models.user import User
from config import Config
from api.contracts import api_contract

auth_bp = Blueprint('auth', __name__)

def _cookie_secure():
    if Config.AUTH_COOKIE_SECURE is not None:
        return str(Config.AUTH_COOKIE_SECURE).lower() in ('1', 'true', 'yes')
    if _cookie_samesite() == 'None':
        return True
    return not Config.DEBUG


def _cookie_samesite():
    value = (Config.AUTH_COOKIE_SAMESITE or 'Lax').strip()
    if value.lower() == 'none':
        return 'None'
    return value


def set_auth_cookie(response, token):
    response.set_cookie(
        Config.AUTH_COOKIE_NAME,
        token,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        max_age=Config.JWT_EXPIRATION_HOURS * 3600,
        path="/",
    )
    return response


def set_csrf_cookie(response):
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        Config.CSRF_COOKIE_NAME,
        token,
        httponly=False,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),  # Must match auth cookie for cross-origin (Vercel→Render)
        max_age=Config.JWT_EXPIRATION_HOURS * 3600,
        path="/",
    )
    return response


def issue_auth_cookies(response, token):
    set_auth_cookie(response, token)
    set_csrf_cookie(response)
    return response


def clear_auth_cookie(response):
    response.delete_cookie(Config.AUTH_COOKIE_NAME, path="/")
    response.delete_cookie(Config.CSRF_COOKIE_NAME, path="/")
    return response


def get_auth_token_from_request():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1]
    return request.cookies.get(Config.AUTH_COOKIE_NAME)

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


def generate_token(user_id, email):
    """Generate JWT token for user"""
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    token = jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
    return token


def verify_token(token):
    """Verify JWT token and return user_id"""
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


@auth_bp.route("/register", methods=["POST"])
@api_contract("auth/register")
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Email and password are required"}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Validate email format
        if '@' not in email or '.' not in email:
            return jsonify({"error": "Invalid email format"}), 400
        
        # Check if user already exists
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({"error": "User with this email already exists"}), 409
        
        # Validate password length
        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters"}), 400
        
        # Create new user
        user = User(email=email, plan_tier='free')
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Generate token
        token = generate_token(user.id, user.email)

        response = jsonify({
            "message": "User registered successfully",
            "user": user.to_dict(),
        })
        return issue_auth_cookies(response, token), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Register failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/login", methods=["POST"])
@api_contract("auth/login")
def login():
    """Login user and return JWT token"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({"error": "Email and password are required"}), 400
        
        email = data['email'].strip().lower()
        password = data['password']
        
        # Find user
        user = User.query.filter_by(email=email).first()
        
        if not user or not user.check_password(password):
            return jsonify({"error": "Invalid email or password"}), 401
        
        # Generate token
        token = generate_token(user.id, user.email)

        response = jsonify({
            "message": "Login successful",
            "user": user.to_dict(),
        })
        return issue_auth_cookies(response, token), 200
        
    except Exception as e:
        current_app.logger.exception("Login failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/me", methods=["GET"])
@api_contract("auth/me")
def get_current_user():
    """Get current user info (requires authentication)"""
    try:
        token = get_auth_token_from_request()
        if not token:
            return jsonify({"error": "Authorization required"}), 401
        user_id = verify_token(token)

        if not user_id:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

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
    Creates user if doesn't exist, returns JWT for API calls.
    Also saves profile data (displayName, photoURL) from Google OAuth.
    """
    try:
        data = request.get_json()
        id_token = data.get('idToken')
        email = data.get('email')
        display_name = data.get('displayName')
        avatar_url = data.get('photoURL')

        if not id_token:
            return jsonify({
                "error": "idToken is required",
                "error_code": "id_token_required",
            }), 400

        # Try to verify with Firebase Admin SDK
        firebase_uid = None
        try:
            firebase_app = get_firebase_app()
            if firebase_app:
                from firebase_admin import auth as firebase_auth
                decoded_token = firebase_auth.verify_id_token(id_token)
                firebase_uid = decoded_token.get('uid')
                email = decoded_token.get('email', email)
                # Get profile data from token if not provided in request
                if not display_name:
                    display_name = decoded_token.get('name')
                if not avatar_url:
                    avatar_url = decoded_token.get('picture')
            elif not Config.DEBUG:
                # Distinguish config errors (500) from transient errors (503)
                global _firebase_error_type
                if _firebase_error_type == 'config':
                    return jsonify({
                        "error": "Firebase configuration error - missing dependencies",
                        "error_code": "firebase_admin_misconfigured",
                    }), 500
                else:
                    return jsonify({
                        "error": "Firebase auth temporarily unavailable",
                        "error_code": "firebase_admin_unavailable",
                    }), 503
        except Exception as e:
            print(f"Firebase token verification failed: {e}")
            # In development, allow fallback to email-only sync
            if not email:
                return jsonify({
                    "error": "Could not verify Firebase token",
                    "error_code": "firebase_token_unverified",
                }), 401
            if not Config.DEBUG:
                return jsonify({
                    "error": "Could not verify Firebase token",
                    "error_code": "firebase_token_unverified",
                }), 401

        if not email:
            return jsonify({
                "error": "Email is required",
                "error_code": "email_required",
            }), 400

        email = email.strip().lower()

        # Find or create user
        user = User.query.filter_by(email=email).first()

        if not user:
            # Create new user with Firebase auth and profile data
            user = User(
                email=email,
                firebase_uid=firebase_uid,
                password_hash='firebase_auth',  # Placeholder - not used for Firebase auth
                plan_tier='free',
                display_name=display_name,
                avatar_url=avatar_url
            )
            db.session.add(user)
            db.session.commit()
        else:
            # Update existing user - link Firebase UID and update profile if changed
            needs_update = False
            if firebase_uid and not user.firebase_uid:
                user.firebase_uid = firebase_uid
                needs_update = True
            # Always update profile from OAuth (may have changed on Google side)
            if display_name and display_name != user.display_name:
                user.display_name = display_name
                needs_update = True
            if avatar_url and avatar_url != user.avatar_url:
                user.avatar_url = avatar_url
                needs_update = True
            if needs_update:
                db.session.commit()

        # Generate JWT for API calls
        token = generate_token(user.id, user.email)

        entitlement = user.entitlement_info()
        access_expires_at = entitlement.get("access_expires_at")

        response = jsonify({
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
        })
        return issue_auth_cookies(response, token), 200

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

        token = get_auth_token_from_request()
        if not token:
            return jsonify({"error": "Authorization required"}), 401
        user_id = verify_token(token)

        if not user_id:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

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
        # Verify JWT
        token = get_auth_token_from_request()
        if not token:
            return jsonify({"error": "Authorization required"}), 401
        user_id = verify_token(token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

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

        response = jsonify({
            "message": "Account deleted successfully"
        })
        return clear_auth_cookie(response), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Account deletion failed")
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    response = jsonify({"message": "Logged out"})
    return clear_auth_cookie(response), 200


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
        "cookies": {
            "auth_cookie_samesite": _cookie_samesite(),
            "auth_cookie_secure": _cookie_secure(),
        },
    }), 200
