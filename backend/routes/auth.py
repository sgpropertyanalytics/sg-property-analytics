"""
Authentication Routes - JWT-based user authentication

Includes:
- Email/password authentication
- Firebase/Google OAuth sync
- Subscription status endpoints
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import jwt
import os
from models.database import db
from models.user import User
from config import Config

auth_bp = Blueprint('auth', __name__)

# Firebase Admin SDK (lazy initialization)
_firebase_app = None


def get_firebase_app():
    """Lazy initialize Firebase Admin SDK"""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    try:
        import firebase_admin
        from firebase_admin import credentials

        # Check for service account path
        service_account_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH')
        if service_account_path and os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            _firebase_app = firebase_admin.initialize_app(cred)
        else:
            # Try to initialize with default credentials (for Cloud Run, etc.)
            _firebase_app = firebase_admin.initialize_app()
        return _firebase_app
    except Exception as e:
        print(f"Firebase Admin SDK initialization failed: {e}")
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
        user = User(email=email, tier='free')
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Generate token
        token = generate_token(user.id, user.email)
        
        return jsonify({
            "message": "User registered successfully",
            "user": user.to_dict(),
            "token": token
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/login", methods=["POST"])
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
        
        return jsonify({
            "message": "Login successful",
            "user": user.to_dict(),
            "token": token
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    """Get current user info (requires authentication)"""
    try:
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization header required"}), 401

        token = auth_header.split(' ')[1]
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
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/firebase-sync", methods=["POST"])
def firebase_sync():
    """
    Sync Firebase user with backend User model.

    Called after successful Google OAuth sign-in on frontend.
    Creates user if doesn't exist, returns JWT for API calls.
    """
    try:
        data = request.get_json()
        id_token = data.get('idToken')
        email = data.get('email')

        if not id_token:
            return jsonify({"error": "idToken is required"}), 400

        # Try to verify with Firebase Admin SDK
        firebase_uid = None
        try:
            firebase_app = get_firebase_app()
            if firebase_app:
                from firebase_admin import auth as firebase_auth
                decoded_token = firebase_auth.verify_id_token(id_token)
                firebase_uid = decoded_token.get('uid')
                email = decoded_token.get('email', email)
        except Exception as e:
            print(f"Firebase token verification failed: {e}")
            # In development, allow fallback to email-only sync
            if not email:
                return jsonify({"error": "Could not verify Firebase token"}), 401

        if not email:
            return jsonify({"error": "Email is required"}), 400

        email = email.strip().lower()

        # Find or create user
        user = User.query.filter_by(email=email).first()

        if not user:
            # Create new user with Firebase auth
            user = User(
                email=email,
                firebase_uid=firebase_uid,
                password_hash='firebase_auth',  # Placeholder - not used for Firebase auth
                tier='free'
            )
            db.session.add(user)
            db.session.commit()
        elif firebase_uid and not user.firebase_uid:
            # Link Firebase UID to existing user
            user.firebase_uid = firebase_uid
            db.session.commit()

        # Generate JWT for API calls
        token = generate_token(user.id, user.email)

        return jsonify({
            "message": "Sync successful",
            "token": token,
            "user": user.to_dict(),
            "subscription": {
                "tier": user.tier,
                "subscribed": user.is_subscribed(),
                "ends_at": user.subscription_ends_at.isoformat() if user.subscription_ends_at else None
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Firebase sync error: {e}")
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/subscription", methods=["GET"])
def get_subscription():
    """Get current user's subscription status"""
    try:
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization header required"}), 401

        token = auth_header.split(' ')[1]
        user_id = verify_token(token)

        if not user_id:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "tier": user.tier,
            "subscribed": user.is_subscribed(),
            "ends_at": user.subscription_ends_at.isoformat() if user.subscription_ends_at else None
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

