"""
Payment Routes - Stripe Checkout Integration

Endpoints:
- POST /api/payments/create-checkout - Create Stripe Checkout session
- POST /api/payments/webhook - Handle Stripe webhook events
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import os
from models.database import db
from models.user import User
from routes.auth import verify_token, get_auth_token_from_request

payments_bp = Blueprint('payments', __name__)

# Stripe configuration (lazy import)
_stripe = None


def get_stripe():
    """Lazy initialize Stripe"""
    global _stripe
    if _stripe is not None:
        return _stripe

    try:
        import stripe
        stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
        _stripe = stripe
        return _stripe
    except Exception as e:
        print(f"Stripe initialization failed: {e}")
        return None


# Plan configuration
PLAN_PRICES = {
    'quarterly': os.getenv('STRIPE_PRICE_QUARTERLY'),
    'annual': os.getenv('STRIPE_PRICE_ANNUAL'),
}

PLAN_DURATIONS = {
    'quarterly': timedelta(days=90),
    'annual': timedelta(days=365),
}


@payments_bp.route("/create-checkout", methods=["POST"])
def create_checkout():
    """
    Create a Stripe Checkout session for subscription payment.

    Request body:
    - plan_id: 'quarterly' or 'annual'
    - success_url: URL to redirect after successful payment
    - cancel_url: URL to redirect if user cancels

    Returns:
    - checkout_url: Stripe Checkout URL to redirect user to
    """
    try:
        stripe = get_stripe()
        if not stripe:
            return jsonify({"error": "Payment system not configured"}), 503

        # Verify JWT
        token = get_auth_token_from_request()
        if not token:
            return jsonify({"error": "Authorization required"}), 401
        user_id = verify_token(token)
        if not user_id:
            return jsonify({"error": "Invalid token"}), 401

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Parse request
        data = request.get_json()
        plan_id = data.get('plan_id')
        success_url = data.get('success_url')
        cancel_url = data.get('cancel_url')

        if plan_id not in PLAN_PRICES:
            return jsonify({"error": f"Invalid plan: {plan_id}"}), 400

        price_id = PLAN_PRICES[plan_id]
        if not price_id:
            return jsonify({"error": f"Price not configured for plan: {plan_id}"}), 503

        # Create or get Stripe customer
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={'user_id': str(user.id)}
            )
            user.stripe_customer_id = customer.id
            db.session.commit()

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=success_url or 'https://www.sgpropertytrend.com/market-pulse?upgraded=true',
            cancel_url=cancel_url or 'https://www.sgpropertytrend.com/pricing',
            metadata={
                'user_id': str(user.id),
                'plan_id': plan_id
            }
        )

        return jsonify({
            "checkout_url": session.url,
            "session_id": session.id
        }), 200

    except Exception as e:
        print(f"Checkout creation error: {e}")
        return jsonify({"error": str(e)}), 500


@payments_bp.route("/webhook", methods=["POST"])
def stripe_webhook():
    """
    Handle Stripe webhook events.

    Events handled:
    - checkout.session.completed: User completed payment
    - customer.subscription.deleted: Subscription cancelled/expired
    - customer.subscription.updated: Subscription changed
    """
    stripe = get_stripe()
    if not stripe:
        return jsonify({"error": "Payment system not configured"}), 503

    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

    # Verify webhook signature
    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        else:
            # In development without webhook secret
            import json
            event = json.loads(payload)
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({"error": "Invalid signature"}), 400

    event_type = event.get('type') if isinstance(event, dict) else event['type']
    event_id = event.get('id') if isinstance(event, dict) else event['id']
    event_data = event.get('data', {}).get('object') if isinstance(event, dict) else event['data']['object']

    print(f"Stripe webhook received: {event_type} (id: {event_id})")

    # IDEMPOTENCY: Check if we've already processed this event (DB-backed)
    from models.processed_webhook import ProcessedWebhook
    if ProcessedWebhook.is_processed(event_id):
        print(f"Event {event_id} already processed, skipping")
        return jsonify({"received": True, "skipped": True}), 200

    try:
        # Handle checkout.session.completed
        if event_type == 'checkout.session.completed':
            session = event_data
            user_id = session.get('metadata', {}).get('user_id')
            plan_id = session.get('metadata', {}).get('plan_id')

            if user_id and plan_id:
                user = User.query.get(int(user_id))
                if user:
                    user.plan_tier = 'premium'
                    user.subscription_status = 'active'
                    user.subscription_ends_at = datetime.utcnow() + PLAN_DURATIONS.get(plan_id, timedelta(days=90))
                    db.session.commit()
                    print(f"User {user.email} upgraded to premium via {plan_id}")

        # Handle subscription deletion/cancellation
        elif event_type == 'customer.subscription.deleted':
            subscription = event_data
            customer_id = subscription.get('customer')

            if customer_id:
                user = User.query.filter_by(stripe_customer_id=customer_id).first()
                if user:
                    user.plan_tier = 'free'
                    user.subscription_status = None
                    user.subscription_ends_at = None
                    db.session.commit()
                    print(f"User {user.email} subscription deleted")

        # Handle subscription updates (status changes)
        elif event_type == 'customer.subscription.updated':
            subscription = event_data
            customer_id = subscription.get('customer')
            status = subscription.get('status')

            if customer_id:
                user = User.query.filter_by(stripe_customer_id=customer_id).first()
                if user:
                    # Always update the status from Stripe
                    user.subscription_status = status

                    # Update end date from subscription
                    current_period_end = subscription.get('current_period_end')
                    if current_period_end:
                        user.subscription_ends_at = datetime.fromtimestamp(current_period_end)

                    # Set tier based on status
                    if status in ('active', 'trialing'):
                        user.plan_tier = 'premium'
                    elif status == 'canceled':
                        # Canceled but still has access until period end
                        # Keep tier as premium, is_subscribed() will check dates
                        pass  # Don't change tier yet
                    elif status in ('unpaid', 'incomplete', 'incomplete_expired'):
                        user.plan_tier = 'free'
                    # past_due: keep premium tier but is_subscribed() handles grace

                    db.session.commit()
                    print(f"User {user.email} subscription updated: {status}")

        # Handle invoice payment failed
        elif event_type == 'invoice.payment_failed':
            invoice = event_data
            customer_id = invoice.get('customer')

            if customer_id:
                user = User.query.filter_by(stripe_customer_id=customer_id).first()
                if user:
                    # Update status to past_due (Stripe will send subscription.updated too)
                    print(f"Payment failed for user {user.email}")

        # IDEMPOTENCY: Mark event as processed in database
        ProcessedWebhook.mark_processed(event_id, event_type)

        return jsonify({"received": True}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Webhook processing error: {e}")
        return jsonify({"error": str(e)}), 500


@payments_bp.route("/portal", methods=["POST"])
def create_portal_session():
    """
    Create a Stripe Customer Portal session for subscription management.

    Returns URL where user can manage their subscription.
    """
    try:
        stripe = get_stripe()
        if not stripe:
            return jsonify({"error": "Payment system not configured"}), 503

        # Verify JWT
        token = get_auth_token_from_request()
        if not token:
            return jsonify({"error": "Authorization required"}), 401
        user_id = verify_token(token)
        if not user_id:
            return jsonify({"error": "Invalid token"}), 401

        user = User.query.get(user_id)
        if not user or not user.stripe_customer_id:
            return jsonify({"error": "No subscription found"}), 404

        data = request.get_json() or {}
        return_url = data.get('return_url', 'https://www.sgpropertytrend.com/market-pulse')

        # Create portal session
        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=return_url
        )

        return jsonify({
            "portal_url": session.url
        }), 200

    except Exception as e:
        print(f"Portal session error: {e}")
        return jsonify({"error": str(e)}), 500
