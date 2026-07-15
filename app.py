"""
FlexSpace — Flask Backend Application
Handles API routing, authentication, and serves the frontend.
"""

import os
import io
import json
import queue
import functools
from datetime import date, timedelta

import qrcode
from flask import Flask, request, jsonify, session, send_from_directory, send_file, Response
from flask_bcrypt import Bcrypt  # type: ignore
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from models import (
    init_db, get_user_by_email, get_user_by_id, create_user,
    get_all_facility_groups, get_facility_by_id, is_facility_sport,
    get_bookings_for_facility, create_booking, get_user_bookings,
    cancel_booking, get_all_bookings_for_date, get_booking_by_id,
    create_player_request, get_player_request_by_id, get_player_request_by_booking,
    get_player_request_members, get_joined_count, get_open_player_requests,
    join_player_request, leave_player_request, update_player_request,
    close_player_request, get_my_hosted_games, get_my_joined_games,
    get_admin_player_request_stats, get_admin_player_requests, get_db,
    create_visitor_request
)
from seed import seed

# ─── App Setup ───────────────────────────────────────────

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'flexspace-dev-secret-key-change-in-production')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

bcrypt = Bcrypt(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ensure schema and seed data exist when running under WSGI servers (e.g., gunicorn on Render).
try:
    seed()
except Exception as exc:
    app.logger.exception("Startup seed failed: %s", exc)

# ─── SSE Client Queues ──────────────────────────────────
sse_clients = []


def broadcast_sse(data):
    """Broadcast a JSON message to all SSE clients."""
    msg = json.dumps(data)
    for q in sse_clients:
        q.put(msg)


# ─── Auth Decorators ────────────────────────────────────

def login_required(f):
    """Decorator: requires authenticated user in session."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator: requires authenticated admin user."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        user = get_user_by_id(session['user_id'])
        if not user or user['role'] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ─── Page Routes ─────────────────────────────────────────

@app.route('/')
def landing():
    """Serve the premium landing page."""
    return send_file(os.path.join(BASE_DIR, 'landing.html'))


@app.route('/app')
def index():
    """Serve the main SPA page."""
    return send_file(os.path.join(BASE_DIR, 'index.html'))


@app.route('/admin')
def admin_page():
    """Serve the admin dashboard page."""
    return send_file(os.path.join(BASE_DIR, 'admin.html'))


@app.route('/explore')
def explore_page():
    """Serve the Explore Community page."""
    return send_file(os.path.join(BASE_DIR, 'explore.html'))


# ─── Static Files ────────────────────────────────────────

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'assets'), filename)


@app.route('/styles.css')
def serve_css():
    return send_file(os.path.join(BASE_DIR, 'styles.css'), mimetype='text/css')


@app.route('/landing.css')
def serve_landing_css():
    return send_file(os.path.join(BASE_DIR, 'landing.css'), mimetype='text/css')


@app.route('/app.js')
def serve_js():
    return send_file(os.path.join(BASE_DIR, 'app.js'), mimetype='application/javascript')


@app.route('/landing.js')
def serve_landing_js():
    return send_file(os.path.join(BASE_DIR, 'landing.js'), mimetype='application/javascript')


@app.route('/admin.js')
def serve_admin_js():
    return send_file(os.path.join(BASE_DIR, 'admin.js'), mimetype='application/javascript')


@app.route('/explore.css')
def serve_explore_css():
    return send_file(os.path.join(BASE_DIR, 'explore.css'), mimetype='text/css')


@app.route('/explore.js')
def serve_explore_js():
    return send_file(os.path.join(BASE_DIR, 'explore.js'), mimetype='application/javascript')


# ═══════════════════════════════════════════════════════════
#  AUTH API
# ═══════════════════════════════════════════════════════════

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new resident user."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    flat_no = (data.get('flat_no') or '').strip().upper()

    # Validation
    errors = []
    if not name or len(name) < 2:
        errors.append('Name must be at least 2 characters.')
    if not email or '@' not in email:
        errors.append('A valid email is required.')
    if len(password) < 6:
        errors.append('Password must be at least 6 characters.')
    if not flat_no:
        errors.append('Flat number is required.')

    if errors:
        return jsonify({'error': ' '.join(errors)}), 400

    # Check duplicate email
    if get_user_by_email(email):
        return jsonify({'error': 'An account with this email already exists.'}), 409

    # Create user
    pw_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    user_id = create_user(name, email, pw_hash, role='resident', flat_no=flat_no)

    if not user_id:
        return jsonify({'error': 'Registration failed. Please try again.'}), 500

    # Auto-login after registration
    session['user_id'] = user_id
    session['user_role'] = 'resident'

    return jsonify({
        'message': 'Account created successfully!',
        'user': {'id': user_id, 'name': name, 'email': email, 'role': 'resident', 'flat_no': flat_no}
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate a user."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'Invalid email or password.'}), 401

    if not bcrypt.check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    # Set session
    session['user_id'] = user['id']
    session['user_role'] = user['role']

    return jsonify({
        'message': 'Login successful!',
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'flat_no': user.get('flat_no', '')
        }
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Log out the current user."""
    session.clear()
    return jsonify({'message': 'Logged out successfully.'})


@app.route('/api/auth/me')
def me():
    """Get the currently authenticated user's info."""
    if 'user_id' not in session:
        return jsonify({'user': None})

    user = get_user_by_id(session['user_id'])
    if not user:
        session.clear()
        return jsonify({'user': None})

    return jsonify({
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'flat_no': user.get('flat_no', '')
        }
    })


@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    """Authenticate a user via Firebase Google Sign-In.

    Expects JSON body: { "id_token": "<Firebase ID token>" }
    Verifies the token against Google's public keys, then either
    logs in the existing user or creates a new account.
    """
    data = request.get_json()
    if not data or not data.get('id_token'):
        return jsonify({'error': 'Missing id_token'}), 400

    token = data['id_token']

    try:
        # Verify the Firebase ID token against Google's public keys.
        # The audience is the Firebase project ID.
        idinfo = google_id_token.verify_firebase_token(
            token, google_requests.Request()
        )

        email = idinfo.get('email', '').strip().lower()
        name = idinfo.get('name', email.split('@')[0])

        if not email:
            return jsonify({'error': 'Google account has no email.'}), 400

    except ValueError as e:
        return jsonify({'error': f'Invalid token: {str(e)}'}), 401

    # Check if user already exists
    user = get_user_by_email(email)

    if user:
        # Existing user — log them in
        session['user_id'] = user['id']
        session['user_role'] = user['role']
        return jsonify({
            'message': 'Login successful!',
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'role': user['role'],
                'flat_no': user.get('flat_no', '')
            }
        })
    else:
        # New user — create account with a placeholder password hash
        # (Google users authenticate via token, never via password)
        placeholder_hash = bcrypt.generate_password_hash('__google_auth__').decode('utf-8')
        user_id = create_user(name, email, placeholder_hash, role='resident', flat_no='')

        if not user_id:
            return jsonify({'error': 'Account creation failed.'}), 500

        session['user_id'] = user_id
        session['user_role'] = 'resident'

        return jsonify({
            'message': 'Account created successfully!',
            'user': {
                'id': user_id,
                'name': name,
                'email': email,
                'role': 'resident',
                'flat_no': ''
            },
            'new_user': True
        }), 201


# ═══════════════════════════════════════════════════════════
#  FACILITIES API
# ═══════════════════════════════════════════════════════════

@app.route('/api/facilities')
def list_facilities():
    """List all facility groups with their sub-units."""
    groups = get_all_facility_groups()
    return jsonify({'facilities': groups})


@app.route('/api/facilities/<int:facility_id>/slots')
def facility_slots(facility_id):
    """
    Get time slots for a facility on a given date.
    Query params: ?date=YYYY-MM-DD
    Returns slots with availability info.
    """
    date_str = request.args.get('date')
    if not date_str:
        # Default to today
        date_str = date.today().isoformat()

    facility = get_facility_by_id(facility_id)
    if not facility:
        return jsonify({'error': 'Facility not found'}), 404

    # Get existing bookings for this facility on this date
    bookings = get_bookings_for_facility(facility_id, date_str)
    booked_hours = {b['start_time']: b for b in bookings}

    # Determine current hour to filter past slots for today
    from datetime import datetime
    is_today = (date_str == date.today().isoformat())
    current_hour = datetime.now().hour if is_today else 0

    # Generate time slots (6 AM to 10 PM), skipping past slots for today
    slots = []
    for h in range(6, 22):
        # Skip slots that have already passed today
        if is_today and h <= current_hour:
            continue

        booking = booked_hours.get(h)
        slot = {
            'start': h,
            'end': h + 1,
            'label': f"{format_hour(h)} — {format_hour(h + 1)}",
            'available': booking is None,
        }
        if booking:
            booked_by = booking['user_name']
            flat = booking.get('user_flat_no', '')
            if flat:
                booked_by = f"{booked_by} ({flat})"
            slot['booked_by'] = booked_by
            slot['booking_id'] = booking['id']
        slots.append(slot)

    return jsonify({
        'facility': dict(facility) if not isinstance(facility, dict) else facility,
        'date': date_str,
        'slots': slots
    })


def format_hour(h):
    """Format 24h hour to 12h AM/PM string."""
    suffix = 'PM' if h >= 12 else 'AM'
    hour12 = h % 12 or 12
    return f"{hour12}:00 {suffix}"


# ═══════════════════════════════════════════════════════════
#  BOOKINGS API
# ═══════════════════════════════════════════════════════════

@app.route('/api/bookings', methods=['POST'])
@login_required
def make_booking():
    """Create a new booking. Requires authentication."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    facility_id = data.get('facility_id')
    date_str = data.get('date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')

    # Validation
    if not all([facility_id, date_str, start_time is not None, end_time is not None]):
        return jsonify({'error': 'Missing required fields: facility_id, date, start_time, end_time'}), 400

    # Verify facility exists
    facility = get_facility_by_id(facility_id)
    if not facility:
        return jsonify({'error': 'Facility not found'}), 404

    # Verify the date is today or in the future
    try:
        booking_date = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

    if booking_date < date.today():
        return jsonify({'error': 'Cannot book slots in the past.'}), 400

    # Verify time range
    if not (6 <= start_time < 22 and start_time < end_time <= 22):
        return jsonify({'error': 'Invalid time range. Slots are available from 6 AM to 10 PM.'}), 400

    # Attempt to create booking (unique constraint will catch double-booking)
    booking_id = create_booking(
        user_id=session['user_id'],
        facility_id=facility_id,
        date=date_str,
        start_time=start_time,
        end_time=end_time
    )

    if not booking_id:
        return jsonify({'error': 'This time slot is already booked. Please choose another.'}), 409

    # Notify all SSE clients of the slot change
    broadcast_sse({"updated": True})

    # Check if this is a sport facility to include in response
    sport = is_facility_sport(facility_id)

    user = get_user_by_id(session['user_id'])
    return jsonify({
        'message': f"Booking confirmed for {user['name']}!",
        'booking': {
            'id': booking_id,
            'facility_id': facility_id,
            'facility_name': facility['name'],
            'date': date_str,
            'start_time': start_time,
            'end_time': end_time,
            'status': 'confirmed',
            'is_sport': sport
        }
    }), 201


@app.route('/api/bookings/me')
@login_required
def my_bookings():
    """Get the current user's confirmed bookings."""
    bookings = get_user_bookings(session['user_id'])

    # Format bookings for frontend
    result = []
    for b in bookings:
        display_name = b['facility_name']
        if b['parent_name']:
            display_name = f"{b['parent_name']} — {b['facility_name'].split(' — ')[-1]}"
        emoji = b.get('parent_emoji') or b.get('facility_emoji', '🏟️')

        # Determine if this is a sport facility
        is_sport = bool(b.get('parent_is_sport') or b.get('facility_is_sport'))

        # Check if a player request already exists for this booking
        pr = get_player_request_by_booking(b['id'])

        result.append({
            'id': b['id'],
            'facility_id': b['facility_id'],
            'facility_name': display_name,
            'facility_emoji': emoji,
            'date': b['date'],
            'start_time': b['start_time'],
            'end_time': b['end_time'],
            'label': f"{format_hour(b['start_time'])} — {format_hour(b['end_time'])}",
            'status': b['status'],
            'created_at': b['created_at'],
            'is_sport': is_sport,
            'has_player_request': pr is not None,
            'player_request_id': pr['id'] if pr else None,
            'player_request_status': pr['status'] if pr else None
        })

    return jsonify({'bookings': result})


@app.route('/api/bookings/<int:booking_id>', methods=['DELETE'])
@login_required
def cancel_my_booking(booking_id):
    """Cancel a booking. Users can only cancel their own; admins can cancel any."""
    is_admin = session.get('user_role') == 'admin'
    success = cancel_booking(booking_id, user_id=session['user_id'], is_admin=is_admin)

    if success:
        # Notify all SSE clients of the slot change
        broadcast_sse({"updated": True, "type": "booking_cancelled", "booking_id": booking_id})
        return jsonify({'message': 'Booking cancelled successfully.'})
    else:
        return jsonify({'error': 'Booking not found or you do not have permission to cancel it.'}), 404


# ═══════════════════════════════════════════════════════════
#  PLAYER REQUESTS API
# ═══════════════════════════════════════════════════════════

@app.route('/api/player-requests', methods=['POST'])
@login_required
def create_player_request_route():
    """Create a new player request for a sport booking."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    booking_id = data.get('booking_id')
    players_needed = data.get('players_needed')
    description = (data.get('description') or '').strip()
    skill_level = data.get('skill_level', 'any')

    # Validation
    if not booking_id:
        return jsonify({'error': 'Booking ID is required.'}), 400

    if not players_needed or not isinstance(players_needed, int) or players_needed < 1:
        return jsonify({'error': 'Players needed must be a positive number.'}), 400

    if players_needed > 20:
        return jsonify({'error': 'Players needed cannot exceed 20.'}), 400

    if skill_level not in ('any', 'beginner', 'intermediate', 'advanced'):
        return jsonify({'error': 'Invalid skill level.'}), 400

    if len(description) > 300:
        return jsonify({'error': 'Message must be 300 characters or fewer.'}), 400

    # Verify booking exists and belongs to user
    booking = get_booking_by_id(booking_id)
    if not booking:
        return jsonify({'error': 'Booking not found.'}), 404

    if booking['user_id'] != session['user_id']:
        return jsonify({'error': 'You can only create player requests for your own bookings.'}), 403

    if booking['status'] != 'confirmed':
        return jsonify({'error': 'Cannot create a player request for a cancelled booking.'}), 400

    # Verify facility is a sport
    if not is_facility_sport(booking['facility_id']):
        return jsonify({'error': 'Player requests are only available for sports facilities.'}), 400

    # Check booking is in the future
    try:
        booking_date = date.fromisoformat(booking['date'])
    except ValueError:
        return jsonify({'error': 'Invalid booking date.'}), 400

    if booking_date < date.today():
        return jsonify({'error': 'Cannot create a player request for a past booking.'}), 400

    # Check if a player request already exists for this booking
    existing = get_player_request_by_booking(booking_id)
    if existing:
        return jsonify({'error': 'A player request already exists for this booking.'}), 409

    # Create the request
    req_id = create_player_request(booking_id, session['user_id'], players_needed, description, skill_level)
    if not req_id:
        return jsonify({'error': 'Failed to create player request.'}), 500

    # Broadcast SSE update
    broadcast_sse({
        "type": "player_request",
        "action": "PLAYER_REQUEST_CREATED",
        "request_id": req_id,
        "updated": True
    })

    return jsonify({
        'message': 'Player request published!',
        'player_request': {'id': req_id}
    }), 201


@app.route('/api/player-requests', methods=['GET'])
def list_player_requests():
    """List all open player requests for discovery."""
    sport_filter = request.args.get('sport')
    date_filter = request.args.get('date')
    skill_filter = request.args.get('skill')

    requests = get_open_player_requests(sport_filter, date_filter, skill_filter)

    result = []
    for r in requests:
        display_name = r['facility_name']
        sport_name = r['facility_name']
        if r['parent_name']:
            display_name = f"{r['parent_name']} — {r['facility_name'].split(' — ')[-1]}"
            sport_name = r['parent_name']
        emoji = r.get('parent_emoji') or r.get('facility_emoji', '🏟️')

        spots_remaining = r['players_needed'] - r['joined_count']

        result.append({
            'id': r['id'],
            'booking_id': r['booking_id'],
            'sport_name': sport_name,
            'facility_name': display_name,
            'facility_emoji': emoji,
            'date': r['date'],
            'start_time': r['start_time'],
            'end_time': r['end_time'],
            'start_label': format_hour(r['start_time']),
            'end_label': format_hour(r['end_time']),
            'creator_name': r['creator_name'],
            'skill_level': r['skill_level'],
            'players_needed': r['players_needed'],
            'joined_count': r['joined_count'],
            'spots_remaining': spots_remaining,
            'description': r['description'],
            'status': r['status'],
            'created_at': r['created_at']
        })

    # Also get list of unique sports for filter dropdown
    conn = get_db()
    sports = conn.execute(
        """SELECT DISTINCT COALESCE(pf.name, f.name) as sport_name
           FROM facilities f
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           WHERE f.is_sport = 1 AND f.parent_id IS NOT NULL
           UNION
           SELECT name as sport_name FROM facilities WHERE is_sport = 1 AND parent_id IS NULL
           ORDER BY sport_name"""
    ).fetchall()
    conn.close()

    return jsonify({
        'requests': result,
        'sports': [s['sport_name'] for s in sports]
    })


@app.route('/api/player-requests/<int:request_id>', methods=['GET'])
def get_player_request_details(request_id):
    """Get detailed info about a player request."""
    pr = get_player_request_by_id(request_id)
    if not pr:
        return jsonify({'error': 'Player request not found.'}), 404

    members = get_player_request_members(request_id)
    joined_count = len(members)
    spots_remaining = pr['players_needed'] - joined_count

    display_name = pr['facility_name']
    sport_name = pr['facility_name']
    if pr['parent_name']:
        display_name = f"{pr['parent_name']} — {pr['facility_name'].split(' — ')[-1]}"
        sport_name = pr['parent_name']
    emoji = pr.get('parent_emoji') or pr.get('facility_emoji', '🏟️')

    # Check if current user is the host, a member, or neither
    current_user_id = session.get('user_id')
    is_host = current_user_id == pr['creator_user_id']
    is_member = any(m['user_id'] == current_user_id for m in members)

    return jsonify({
        'request': {
            'id': pr['id'],
            'booking_id': pr['booking_id'],
            'sport_name': sport_name,
            'facility_name': display_name,
            'facility_emoji': emoji,
            'date': pr['date'],
            'start_time': pr['start_time'],
            'end_time': pr['end_time'],
            'start_label': format_hour(pr['start_time']),
            'end_label': format_hour(pr['end_time']),
            'creator_name': pr['creator_name'],
            'creator_user_id': pr['creator_user_id'],
            'skill_level': pr['skill_level'],
            'players_needed': pr['players_needed'],
            'joined_count': joined_count,
            'spots_remaining': spots_remaining,
            'description': pr['description'],
            'status': pr['status'],
            'booking_status': pr['booking_status'],
            'created_at': pr['created_at']
        },
        'members': [{'user_id': m['user_id'], 'name': m['user_name'], 'joined_at': m['joined_at']} for m in members],
        'is_host': is_host,
        'is_member': is_member
    })


@app.route('/api/player-requests/<int:request_id>', methods=['PUT'])
@login_required
def edit_player_request(request_id):
    """Edit a player request (host only)."""
    pr = get_player_request_by_id(request_id)
    if not pr:
        return jsonify({'error': 'Player request not found.'}), 404

    if pr['creator_user_id'] != session['user_id']:
        return jsonify({'error': 'Only the host can edit this request.'}), 403

    if pr['status'] in ('CLOSED', 'CANCELLED'):
        return jsonify({'error': 'Cannot edit a closed or cancelled request.'}), 400

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    players_needed = data.get('players_needed')
    description = data.get('description')
    skill_level = data.get('skill_level')

    if players_needed is not None:
        if not isinstance(players_needed, int) or players_needed < 1 or players_needed > 20:
            return jsonify({'error': 'Players needed must be between 1 and 20.'}), 400

    if skill_level is not None and skill_level not in ('any', 'beginner', 'intermediate', 'advanced'):
        return jsonify({'error': 'Invalid skill level.'}), 400

    if description is not None and len(description) > 300:
        return jsonify({'error': 'Message must be 300 characters or fewer.'}), 400

    success = update_player_request(request_id, players_needed, description, skill_level)
    if not success:
        return jsonify({'error': 'Cannot reduce players needed below the current number of joined players.'}), 400

    broadcast_sse({
        "type": "player_request",
        "action": "PLAYER_REQUEST_UPDATED",
        "request_id": request_id,
        "updated": True
    })

    return jsonify({'message': 'Player request updated.'})


@app.route('/api/player-requests/<int:request_id>/close', methods=['POST'])
@login_required
def close_player_request_route(request_id):
    """Close a player request (host only)."""
    pr = get_player_request_by_id(request_id)
    if not pr:
        return jsonify({'error': 'Player request not found.'}), 404

    if pr['creator_user_id'] != session['user_id']:
        return jsonify({'error': 'Only the host can close this request.'}), 403

    close_player_request(request_id)

    broadcast_sse({
        "type": "player_request",
        "action": "PLAYER_REQUEST_CANCELLED",
        "request_id": request_id,
        "updated": True
    })

    return jsonify({'message': 'Player request closed.'})


@app.route('/api/player-requests/<int:request_id>/join', methods=['POST'])
@login_required
def join_player_request_route(request_id):
    """Join a player request."""
    status, error = join_player_request(request_id, session['user_id'])

    if status == 'error':
        return jsonify({'error': error}), 400

    # Get updated info
    pr = get_player_request_by_id(request_id)
    joined_count = get_joined_count(request_id)

    action = "PLAYER_JOINED"
    if pr and pr['status'] == 'FILLED':
        action = "PLAYER_REQUEST_FILLED"

    broadcast_sse({
        "type": "player_request",
        "action": action,
        "request_id": request_id,
        "updated": True
    })

    return jsonify({
        'message': "You're in!",
        'request': {
            'id': request_id,
            'status': pr['status'] if pr else 'OPEN',
            'joined_count': joined_count,
            'spots_remaining': (pr['players_needed'] - joined_count) if pr else 0,
            'facility_name': pr.get('facility_name', '') if pr else '',
            'date': pr.get('date', '') if pr else '',
            'start_time': pr.get('start_time', 0) if pr else 0,
            'end_time': pr.get('end_time', 0) if pr else 0,
        }
    })


@app.route('/api/player-requests/<int:request_id>/leave', methods=['POST'])
@login_required
def leave_player_request_route(request_id):
    """Leave a player request."""
    pr = get_player_request_by_id(request_id)
    if not pr:
        return jsonify({'error': 'Player request not found.'}), 404

    if pr['creator_user_id'] == session['user_id']:
        return jsonify({'error': 'The host cannot leave their own game. Close the request instead.'}), 400

    success = leave_player_request(request_id, session['user_id'])
    if not success:
        return jsonify({'error': 'You are not a member of this game.'}), 400

    broadcast_sse({
        "type": "player_request",
        "action": "PLAYER_LEFT",
        "request_id": request_id,
        "updated": True
    })

    return jsonify({'message': 'You have left the game.'})


@app.route('/api/player-requests/my-games')
@login_required
def my_games():
    """Get the current user's hosted and joined games."""
    hosted = get_my_hosted_games(session['user_id'])
    joined = get_my_joined_games(session['user_id'])

    def format_game(g, is_hosted=False):
        display_name = g['facility_name']
        sport_name = g['facility_name']
        if g['parent_name']:
            display_name = f"{g['parent_name']} — {g['facility_name'].split(' — ')[-1]}"
            sport_name = g['parent_name']
        emoji = g.get('parent_emoji') or g.get('facility_emoji', '🏟️')

        result = {
            'id': g['id'],
            'sport_name': sport_name,
            'facility_name': display_name,
            'facility_emoji': emoji,
            'date': g['date'],
            'start_time': g['start_time'],
            'end_time': g['end_time'],
            'start_label': format_hour(g['start_time']),
            'end_label': format_hour(g['end_time']),
            'skill_level': g['skill_level'],
            'players_needed': g['players_needed'],
            'joined_count': g['joined_count'],
            'spots_remaining': g['players_needed'] - g['joined_count'],
            'status': g['status'],
            'description': g['description'],
        }
        if not is_hosted:
            result['creator_name'] = g.get('creator_name', '')
        return result

    return jsonify({
        'hosted': [format_game(g, is_hosted=True) for g in hosted],
        'joined': [format_game(g) for g in joined]
    })


# ═══════════════════════════════════════════════════════════
#  ADMIN API
# ═══════════════════════════════════════════════════════════

@app.route('/api/admin/bookings')
@admin_required
def admin_all_bookings():
    # Fetch ALL confirmed bookings, ignoring the date query
    conn = get_db()
    rows = conn.execute("""
        SELECT b.*, u.name as user_name, u.email as user_email, u.flat_no as user_flat_no,
               f.name as facility_name, f.emoji as facility_emoji,
               f.parent_id, pf.name as parent_name, pf.emoji as parent_emoji
        FROM bookings b JOIN users u ON b.user_id = u.id JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN facilities pf ON f.parent_id = pf.id
        WHERE b.status = 'confirmed' ORDER BY b.date DESC, b.start_time DESC
    """).fetchall()
    conn.close()
    bookings = [dict(r) for r in rows]

    date_str = request.args.get('date', date.today().isoformat())

    result = []
    for b in bookings:
        display_name = b['facility_name']
        if b['parent_name']:
            display_name = f"{b['parent_name']} — {b['facility_name'].split(' — ')[-1]}"
        emoji = b.get('parent_emoji') or b.get('facility_emoji', '🏟️')

        result.append({
            'id': b['id'],
            'user_name': b['user_name'],
            'user_email': b['user_email'],
            'user_flat_no': b.get('user_flat_no', ''),
            'facility_name': display_name,
            'facility_emoji': emoji,
            'date': b['date'],
            'start_time': b['start_time'],
            'end_time': b['end_time'],
            'label': f"{format_hour(b['start_time'])} — {format_hour(b['end_time'])}",
            'status': b['status'],
            'created_at': b['created_at']
        })

    return jsonify({'bookings': result, 'date': date_str})


@app.route('/api/admin/bookings/<int:booking_id>', methods=['DELETE'])
@admin_required
def admin_cancel_booking(booking_id):
    """Admin: cancel any booking."""
    success = cancel_booking(booking_id, is_admin=True)
    if success:
        broadcast_sse({"updated": True, "type": "booking_cancelled", "booking_id": booking_id})
        return jsonify({'message': 'Booking cancelled by admin.'})
    else:
        return jsonify({'error': 'Booking not found or already cancelled.'}), 404


@app.route('/api/admin/player-requests')
@admin_required
def admin_player_requests():
    """Admin: get player request stats and list."""
    stats = get_admin_player_request_stats()
    requests = get_admin_player_requests()

    result = []
    for r in requests:
        result.append({
            'id': r['id'],
            'sport_name': r['sport_name'],
            'sport_emoji': r['sport_emoji'],
            'facility_name': r['facility_name'],
            'creator_name': r['creator_name'],
            'date': r['date'],
            'start_time': r['start_time'],
            'end_time': r['end_time'],
            'time_label': f"{format_hour(r['start_time'])} — {format_hour(r['end_time'])}",
            'players_needed': r['players_needed'],
            'joined_count': r['joined_count'],
            'status': r['status'],
            'created_at': r['created_at']
        })

    return jsonify({'stats': stats, 'requests': result})


@app.route('/api/admin/player-requests/<int:request_id>/close', methods=['POST'])
@admin_required
def admin_close_player_request(request_id):
    """Admin: close a player request."""
    pr = get_player_request_by_id(request_id)
    if not pr:
        return jsonify({'error': 'Player request not found.'}), 404

    close_player_request(request_id)

    broadcast_sse({
        "type": "player_request",
        "action": "PLAYER_REQUEST_CANCELLED",
        "request_id": request_id,
        "updated": True
    })

    return jsonify({'message': 'Player request closed by admin.'})


# ═══════════════════════════════════════════════════════════
#  QR CODE GATE PASS & VERIFICATION
# ═══════════════════════════════════════════════════════════

@app.route('/api/bookings/<int:booking_id>/qr')
@login_required
def booking_qr(booking_id):
    """Generate a QR code gate pass image for a booking."""
    booking = get_booking_by_id(booking_id)
    if not booking:
        return jsonify({'error': 'Booking not found'}), 404

    # Only the booking owner can view their gate pass
    if booking['user_id'] != session['user_id']:
        return jsonify({'error': 'Access denied'}), 403

    if booking['status'] != 'confirmed':
        return jsonify({'error': 'Booking is not active'}), 400

    # Build a URL payload for the interactive demo verification
    base_url = request.host_url.rstrip('/')
    payload = f"{base_url}/verify/{booking_id}"

    # Generate QR code image
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color='#1e1b4b', back_color='#f5f3ff')

    # Serve as PNG
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png', download_name=f'gatepass-{booking_id}.png')


@app.route('/verify/<int:booking_id>')
def verify_pass(booking_id):
    """Public route for security guards/judges to verify a scanned QR pass."""
    booking = get_booking_by_id(booking_id)

    # 1. Invalid or Cancelled Pass UI
    if not booking or booking['status'] != 'confirmed':
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Invalid Pass</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800&display=swap" rel="stylesheet" />
        </head>
        <body style="font-family: 'Inter', sans-serif; background: #07060e; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
            <div style="text-align: center; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.3); padding: 40px 20px; border-radius: 24px; max-width: 400px; width: 100%;">
                <div style="font-size: 60px; margin-bottom: 20px;">❌</div>
                <h1 style="color: #ef4444; margin: 0 0 10px 0; font-weight: 800; letter-spacing: 1px;">PASS INVALID</h1>
                <p style="color: #9b97ad; margin: 0; font-weight: 600;">This booking is expired, cancelled, or does not exist.</p>
            </div>
        </body>
        </html>
        """, 404

    # 2. Get Data for Valid Pass
    facility = get_facility_by_id(booking['facility_id'])
    user = get_user_by_id(booking['user_id'])

    # Build full facility name to include parent category (e.g., "Snooker — Board 1")
    facility_name = facility['name']
    if facility.get('parent_id'):
        parent = get_facility_by_id(facility['parent_id'])
        if parent:
            facility_name = f"{parent['name']} — {facility['name'].split(' — ')[-1]}"

    # Format the variables for display
    time_slot = f"{format_hour(booking['start_time'])} — {format_hour(booking['end_time'])}"
    flat_no = user.get('flat_no') or 'N/A'
    booking_date = booking['date']
    booking_ref = f"FLX-{booking['id']:04d}"

    # 3. Valid Pass Premium UI
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Gate Pass Verified</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet" />
        <style>
            body {{
                font-family: 'Inter', sans-serif;
                background: #07060e;
                margin: 0;
                padding: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                box-sizing: border-box;
            }}
            .verify-card {{
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(52, 211, 153, 0.4);
                border-radius: 24px;
                padding: 40px 24px;
                max-width: 420px;
                width: 100%;
                text-align: center;
                box-shadow: 0 20px 40px rgba(52, 211, 153, 0.08);
            }}
            .icon-wrap {{
                width: 80px;
                height: 80px;
                background: rgba(52, 211, 153, 0.15);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px auto;
                font-size: 36px;
                border: 2px solid rgba(52, 211, 153, 0.4);
                box-shadow: 0 0 20px rgba(52, 211, 153, 0.2);
                animation: pulse 2s infinite;
            }}
            @keyframes pulse {{
                0% {{ box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.4); }}
                70% {{ box-shadow: 0 0 0 20px rgba(52, 211, 153, 0); }}
                100% {{ box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }}
            }}
            .status-text {{
                font-family: 'Poppins', sans-serif;
                color: #34d399;
                font-size: 26px;
                font-weight: 800;
                margin: 0 0 6px 0;
                letter-spacing: 1px;
            }}
            .system-text {{
                color: #5d5875;
                font-size: 13px;
                margin: 0 0 32px 0;
                text-transform: uppercase;
                letter-spacing: 2px;
                font-weight: 600;
            }}
            .detail-box {{
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                padding: 16px 20px;
                text-align: left;
            }}
            .detail-row {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }}
            .detail-row:last-child {{ border-bottom: none; padding-bottom: 0; }}
            .detail-row:first-child {{ padding-top: 0; }}
            .detail-label {{ 
                color: #9b97ad; 
                font-size: 13px; 
                font-weight: 600; 
                text-transform: uppercase; 
                letter-spacing: 0.5px; 
            }}
            .detail-value {{ 
                color: #f1f0f5; 
                font-size: 15px; 
                font-weight: 600; 
                text-align: right; 
                max-width: 60%;
            }}
            .highlight-value {{ color: #a855f7; font-weight: 700; }}
        </style>
    </head>
    <body>
        <div class="verify-card">
            <div class="icon-wrap">✓</div>
            <h1 class="status-text">ENTRY APPROVED</h1>
            <p class="system-text">FlexSpace Security System</p>
            
            <div class="detail-box">
                <div class="detail-row">
                    <span class="detail-label">Resident</span>
                    <span class="detail-value">{user['name']}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Flat No</span>
                    <span class="detail-value">{flat_no}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Facility</span>
                    <span class="detail-value highlight-value">{facility['emoji']} {facility_name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Date</span>
                    <span class="detail-value">{booking_date}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time</span>
                    <span class="detail-value">{time_slot}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Ref ID</span>
                    <span class="detail-value" style="color: #6366f1;">{booking_ref}</span>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


# ═══════════════════════════════════════════════════════════
#  SERVER-SENT EVENTS (SSE) — Real-Time Slot Updates
# ═══════════════════════════════════════════════════════════

@app.route('/api/stream/slots')
def stream_slots():
    """SSE endpoint: pushes updates when bookings change."""
    def event_stream():
        q = queue.Queue()
        sse_clients.append(q)
        try:
            while True:
                # Blocks until a message is put in the queue
                msg = q.get()
                yield f"data: {msg}\n\n"
        finally:
            # Clean up when the client disconnects
            sse_clients.remove(q)

    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


# ═══════════════════════════════════════════════════════════
#  VISITOR REQUEST API
# ═══════════════════════════════════════════════════════════

@app.route('/api/visitor-requests', methods=['POST'])
def submit_visitor_request():
    """Submit a non-resident community visit request.

    Expects JSON body with: name, email, phone, visit_date, visit_time,
    visitors_count, purpose.
    The request is saved with status 'pending' for admin approval.
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    visit_date = (data.get('visit_date') or '').strip()
    visit_time = (data.get('visit_time') or '').strip()
    visitors_count = data.get('visitors_count', 1)
    purpose = (data.get('purpose') or '').strip()

    # Validation
    errors = []
    if not name or len(name) < 2:
        errors.append('Full name is required.')
    if not email or '@' not in email:
        errors.append('A valid email is required.')
    if not phone or len(phone) < 7:
        errors.append('A valid phone number is required.')
    if not visit_date:
        errors.append('Visit date is required.')
    if not visit_time:
        errors.append('Time slot is required.')
    if not isinstance(visitors_count, int) or visitors_count < 1 or visitors_count > 10:
        errors.append('Number of visitors must be between 1 and 10.')
    if not purpose:
        errors.append('Purpose of visit is required.')

    if errors:
        return jsonify({'error': ' '.join(errors)}), 400

    # Verify date is today or in the future
    try:
        visit_d = date.fromisoformat(visit_date)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

    if visit_d < date.today():
        return jsonify({'error': 'Visit date must be today or in the future.'}), 400

    # Create the visitor request
    req_id = create_visitor_request(name, email, phone, visit_date, visit_time, visitors_count, purpose)

    if not req_id:
        return jsonify({'error': 'Failed to submit request. Please try again.'}), 500

    return jsonify({
        'message': 'Visit request submitted successfully!',
        'request': {
            'id': req_id,
            'name': name,
            'email': email,
            'visit_date': visit_date,
            'visit_time': visit_time,
            'visitors_count': visitors_count,
            'purpose': purpose,
            'status': 'pending'
        }
    }), 201


# ═══════════════════════════════════════════════════════════
#  STARTUP
# ═══════════════════════════════════════════════════════════

if __name__ == '__main__':
    # Initialize and seed database on first run
    print("[*] Starting FlexSpace server...")
    seed()
    print("[*] Server running at http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
