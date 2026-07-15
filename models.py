"""
FlexSpace — Database Models & Helpers
SQLite relational schema with Users, Facilities, Bookings, and Player Requests.
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = '/tmp/flexspace.db'


def get_db():
    """Get a database connection with row_factory set to sqlite3.Row."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            email       TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            flat_no     TEXT DEFAULT '',
            role        TEXT NOT NULL DEFAULT 'resident' CHECK(role IN ('resident', 'admin')),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS facilities (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            category    TEXT NOT NULL,
            capacity    INTEGER DEFAULT 1,
            parent_id   INTEGER DEFAULT NULL,
            emoji       TEXT DEFAULT '🏟️',
            image       TEXT DEFAULT '',
            description TEXT DEFAULT '',
            is_sport    INTEGER DEFAULT 1,
            FOREIGN KEY (parent_id) REFERENCES facilities(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            facility_id INTEGER NOT NULL,
            date        TEXT NOT NULL,
            start_time  INTEGER NOT NULL,
            end_time    INTEGER NOT NULL,
            status      TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled')),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
        );

        -- Unique constraint to prevent double-booking of the same slot
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_booking
            ON bookings(facility_id, date, start_time)
            WHERE status = 'confirmed';

        -- Player Requests table
        CREATE TABLE IF NOT EXISTS player_requests (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id      INTEGER NOT NULL,
            creator_user_id INTEGER NOT NULL,
            players_needed  INTEGER NOT NULL CHECK(players_needed > 0 AND players_needed <= 20),
            description     TEXT DEFAULT '',
            skill_level     TEXT NOT NULL DEFAULT 'any' CHECK(skill_level IN ('any', 'beginner', 'intermediate', 'advanced')),
            status          TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'FILLED', 'CLOSED', 'CANCELLED')),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
            FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Player Request Members table
        CREATE TABLE IF NOT EXISTS player_request_members (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            player_request_id   INTEGER NOT NULL,
            user_id             INTEGER NOT NULL,
            status              TEXT NOT NULL DEFAULT 'JOINED' CHECK(status IN ('JOINED', 'LEFT', 'REMOVED')),
            joined_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_request_id) REFERENCES player_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Visitor Requests table (non-resident community visit bookings)
        CREATE TABLE IF NOT EXISTS visitor_requests (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            email           TEXT NOT NULL,
            phone           TEXT NOT NULL,
            visit_date      TEXT NOT NULL,
            visit_time      TEXT NOT NULL,
            visitors_count  INTEGER NOT NULL DEFAULT 1,
            purpose         TEXT DEFAULT '',
            status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Migration: add flat_no column to existing databases
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN flat_no TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Migration: add is_sport column to existing databases
    try:
        cursor.execute("ALTER TABLE facilities ADD COLUMN is_sport INTEGER DEFAULT 1")
        conn.commit()
    except Exception:
        pass  # Column already exists

    conn.commit()
    conn.close()


# ─── Query Helpers ───────────────────────────────────────

def get_user_by_email(email):
    """Fetch a user by email. Returns dict or None."""
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(user) if user else None


def get_user_by_id(user_id):
    """Fetch a user by id. Returns dict or None."""
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def create_user(name, email, password_hash, role='resident', flat_no=''):
    """Insert a new user. Returns the new user id."""
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, role, flat_no) VALUES (?, ?, ?, ?, ?)",
            (name, email, password_hash, role, flat_no)
        )
        conn.commit()
        user_id = cursor.lastrowid
        return user_id
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_all_facility_groups():
    """
    Get all top-level facilities (parent_id IS NULL) along with their sub-units.
    Returns a list of dicts with a 'units' key containing child facilities.
    """
    conn = get_db()

    parents = conn.execute(
        "SELECT * FROM facilities WHERE parent_id IS NULL ORDER BY id"
    ).fetchall()

    result = []
    for p in parents:
        parent_dict = dict(p)
        children = conn.execute(
            "SELECT * FROM facilities WHERE parent_id = ? ORDER BY id",
            (p['id'],)
        ).fetchall()
        parent_dict['units'] = [dict(c) for c in children]
        result.append(parent_dict)

    conn.close()
    return result


def get_facility_by_id(facility_id):
    """Fetch a single facility by id."""
    conn = get_db()
    facility = conn.execute("SELECT * FROM facilities WHERE id = ?", (facility_id,)).fetchone()
    conn.close()
    return dict(facility) if facility else None


def is_facility_sport(facility_id):
    """Check if a facility (or its parent) is a sport facility."""
    conn = get_db()
    facility = conn.execute("SELECT * FROM facilities WHERE id = ?", (facility_id,)).fetchone()
    if not facility:
        conn.close()
        return False

    # If it's a child unit, check the parent's is_sport flag
    if facility['parent_id']:
        parent = conn.execute("SELECT is_sport FROM facilities WHERE id = ?", (facility['parent_id'],)).fetchone()
        conn.close()
        return bool(parent and parent['is_sport'])

    conn.close()
    return bool(facility['is_sport'])


def get_bookings_for_facility(facility_id, date):
    """Get all confirmed bookings for a facility on a given date."""
    conn = get_db()
    rows = conn.execute(
        """SELECT b.*, u.name as user_name, u.email as user_email, u.flat_no as user_flat_no
           FROM bookings b
           JOIN users u ON b.user_id = u.id
           WHERE b.facility_id = ? AND b.date = ? AND b.status = 'confirmed'
           ORDER BY b.start_time""",
        (facility_id, date)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_booking(user_id, facility_id, date, start_time, end_time):
    """
    Create a new booking. Returns booking id on success, None if slot already taken.
    """
    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO bookings (user_id, facility_id, date, start_time, end_time, status)
               VALUES (?, ?, ?, ?, ?, 'confirmed')""",
            (user_id, facility_id, date, start_time, end_time)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_user_bookings(user_id):
    """Get all confirmed bookings for a user, joined with facility info."""
    conn = get_db()
    rows = conn.execute(
        """SELECT b.*, f.name as facility_name, f.emoji as facility_emoji,
                  f.parent_id, f.is_sport as facility_is_sport,
                  pf.name as parent_name, pf.emoji as parent_emoji,
                  pf.is_sport as parent_is_sport
           FROM bookings b
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           WHERE b.user_id = ? AND b.status = 'confirmed'
           ORDER BY b.date, b.start_time""",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def cancel_booking(booking_id, user_id=None, is_admin=False):
    """
    Cancel a booking. If is_admin is False, only the booking owner can cancel.
    Also cancels any linked player request.
    Returns True on success, False otherwise.
    """
    conn = get_db()

    if is_admin:
        result = conn.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'confirmed'",
            (booking_id,)
        )
    else:
        result = conn.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'confirmed'",
            (booking_id, user_id)
        )

    success = result.rowcount > 0

    if success:
        # Cancel any linked player request
        conn.execute(
            """UPDATE player_requests SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
               WHERE booking_id = ? AND status IN ('OPEN', 'FILLED')""",
            (booking_id,)
        )
        # Remove all active members from cancelled player requests
        conn.execute(
            """UPDATE player_request_members SET status = 'REMOVED'
               WHERE player_request_id IN (
                   SELECT id FROM player_requests WHERE booking_id = ? AND status = 'CANCELLED'
               ) AND status = 'JOINED'""",
            (booking_id,)
        )

    conn.commit()
    conn.close()
    return success


def get_all_bookings_for_date(date):
    """Admin: get all confirmed bookings for a given date, with user and facility info."""
    conn = get_db()
    rows = conn.execute(
        """SELECT b.*, u.name as user_name, u.email as user_email, u.flat_no as user_flat_no,
                  f.name as facility_name, f.emoji as facility_emoji,
                  f.parent_id, pf.name as parent_name, pf.emoji as parent_emoji
           FROM bookings b
           JOIN users u ON b.user_id = u.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           WHERE b.date = ? AND b.status = 'confirmed'
           ORDER BY f.name, b.start_time""",
        (date,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_booking_by_id(booking_id):
    """Fetch a single booking by id."""
    conn = get_db()
    row = conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Player Request Query Helpers ────────────────────────

def create_player_request(booking_id, creator_user_id, players_needed, description='', skill_level='any'):
    """Create a new player request linked to a booking. Returns request id or None."""
    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO player_requests (booking_id, creator_user_id, players_needed, description, skill_level)
               VALUES (?, ?, ?, ?, ?)""",
            (booking_id, creator_user_id, players_needed, description, skill_level)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_player_request_by_id(request_id):
    """Fetch a player request with booking + facility + creator info."""
    conn = get_db()
    row = conn.execute(
        """SELECT pr.*,
                  b.facility_id, b.date, b.start_time, b.end_time, b.status as booking_status,
                  f.name as facility_name, f.emoji as facility_emoji, f.parent_id,
                  pf.name as parent_name, pf.emoji as parent_emoji,
                  u.name as creator_name, u.flat_no as creator_flat_no
           FROM player_requests pr
           JOIN bookings b ON pr.booking_id = b.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           JOIN users u ON pr.creator_user_id = u.id
           WHERE pr.id = ?""",
        (request_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_player_request_by_booking(booking_id):
    """Get the player request for a booking (if any)."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM player_requests WHERE booking_id = ? AND status != 'CANCELLED'",
        (booking_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_player_request_members(request_id):
    """Get all active (JOINED) members of a player request."""
    conn = get_db()
    rows = conn.execute(
        """SELECT prm.*, u.name as user_name
           FROM player_request_members prm
           JOIN users u ON prm.user_id = u.id
           WHERE prm.player_request_id = ? AND prm.status = 'JOINED'
           ORDER BY prm.joined_at""",
        (request_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_joined_count(request_id):
    """Get the count of active JOINED members for a player request."""
    conn = get_db()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM player_request_members WHERE player_request_id = ? AND status = 'JOINED'",
        (request_id,)
    ).fetchone()
    conn.close()
    return row['cnt'] if row else 0


def get_open_player_requests(sport_filter=None, date_filter=None, skill_filter=None):
    """
    Get all OPEN player requests for upcoming bookings.
    Returns list of dicts with booking/facility/creator info and joined count.
    """
    conn = get_db()

    query = """
        SELECT pr.*,
               b.facility_id, b.date, b.start_time, b.end_time,
               f.name as facility_name, f.emoji as facility_emoji, f.parent_id, f.category,
               pf.name as parent_name, pf.emoji as parent_emoji,
               u.name as creator_name,
               (SELECT COUNT(*) FROM player_request_members prm
                WHERE prm.player_request_id = pr.id AND prm.status = 'JOINED') as joined_count
        FROM player_requests pr
        JOIN bookings b ON pr.booking_id = b.id
        JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN facilities pf ON f.parent_id = pf.id
        JOIN users u ON pr.creator_user_id = u.id
        WHERE pr.status = 'OPEN'
          AND b.status = 'confirmed'
          AND (b.date > date('now') OR (b.date = date('now') AND b.start_time > strftime('%H', 'now', 'localtime')))
    """
    params = []

    if sport_filter:
        query += " AND (LOWER(pf.name) = LOWER(?) OR (pf.id IS NULL AND LOWER(f.name) = LOWER(?)))"
        params.extend([sport_filter, sport_filter])

    if date_filter:
        query += " AND b.date = ?"
        params.append(date_filter)

    if skill_filter:
        query += " AND pr.skill_level = ?"
        params.append(skill_filter)

    query += " ORDER BY b.date ASC, b.start_time ASC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def join_player_request(request_id, user_id):
    """
    Concurrency-safe join: uses BEGIN IMMEDIATE to serialize access.
    Returns: ('success', None) | ('error', 'message')
    """
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")

        # Fetch request inside transaction
        pr = conn.execute(
            "SELECT * FROM player_requests WHERE id = ?", (request_id,)
        ).fetchone()

        if not pr:
            conn.rollback()
            return ('error', 'Player request not found.')

        if pr['status'] != 'OPEN':
            conn.rollback()
            return ('error', 'This game is no longer accepting players.')

        if pr['creator_user_id'] == user_id:
            conn.rollback()
            return ('error', 'You cannot join your own game.')

        # Check booking is still valid
        booking = conn.execute(
            "SELECT * FROM bookings WHERE id = ?", (pr['booking_id'],)
        ).fetchone()

        if not booking or booking['status'] != 'confirmed':
            conn.rollback()
            return ('error', 'The associated booking has been cancelled.')

        # Check if booking time has passed
        from datetime import date as date_type
        booking_date = date_type.fromisoformat(booking['date'])
        today = date_type.today()
        if booking_date < today:
            conn.rollback()
            return ('error', 'This game has already passed.')
        if booking_date == today:
            now_hour = datetime.now().hour
            if booking['start_time'] <= now_hour:
                conn.rollback()
                return ('error', 'This game has already started.')

        # Check if user already joined
        existing = conn.execute(
            "SELECT * FROM player_request_members WHERE player_request_id = ? AND user_id = ? AND status = 'JOINED'",
            (request_id, user_id)
        ).fetchone()

        if existing:
            conn.rollback()
            return ('error', 'You have already joined this game.')

        # Count current joined members (inside transaction for safety)
        count_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM player_request_members WHERE player_request_id = ? AND status = 'JOINED'",
            (request_id,)
        ).fetchone()
        current_count = count_row['cnt']

        if current_count >= pr['players_needed']:
            conn.rollback()
            return ('error', 'This game was just filled by another resident.')

        # Check if user previously left — update their record instead of inserting
        prev = conn.execute(
            "SELECT * FROM player_request_members WHERE player_request_id = ? AND user_id = ? AND status IN ('LEFT', 'REMOVED')",
            (request_id, user_id)
        ).fetchone()

        if prev:
            conn.execute(
                "UPDATE player_request_members SET status = 'JOINED', joined_at = CURRENT_TIMESTAMP WHERE id = ?",
                (prev['id'],)
            )
        else:
            conn.execute(
                "INSERT INTO player_request_members (player_request_id, user_id, status) VALUES (?, ?, 'JOINED')",
                (request_id, user_id)
            )

        # Auto-fill if this was the last spot
        new_count = current_count + 1
        if new_count >= pr['players_needed']:
            conn.execute(
                "UPDATE player_requests SET status = 'FILLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (request_id,)
            )

        conn.commit()
        return ('success', None)

    except Exception as e:
        conn.rollback()
        return ('error', f'Failed to join game: {str(e)}')
    finally:
        conn.close()


def leave_player_request(request_id, user_id):
    """
    Leave a player request. Updates member status and potentially re-opens the request.
    Returns True on success, False otherwise.
    """
    conn = get_db()
    try:
        result = conn.execute(
            "UPDATE player_request_members SET status = 'LEFT' WHERE player_request_id = ? AND user_id = ? AND status = 'JOINED'",
            (request_id, user_id)
        )

        if result.rowcount == 0:
            conn.close()
            return False

        # Check if request was FILLED and should revert to OPEN
        pr = conn.execute("SELECT * FROM player_requests WHERE id = ?", (request_id,)).fetchone()
        if pr and pr['status'] == 'FILLED':
            # Check if the booking is still valid
            booking = conn.execute("SELECT * FROM bookings WHERE id = ?", (pr['booking_id'],)).fetchone()
            if booking and booking['status'] == 'confirmed':
                conn.execute(
                    "UPDATE player_requests SET status = 'OPEN', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (request_id,)
                )

        conn.commit()
        return True
    finally:
        conn.close()


def update_player_request(request_id, players_needed=None, description=None, skill_level=None):
    """Update editable fields of a player request. Returns True on success."""
    conn = get_db()
    try:
        updates = []
        params = []

        if players_needed is not None:
            # Validate that new players_needed >= current joined count
            count_row = conn.execute(
                "SELECT COUNT(*) as cnt FROM player_request_members WHERE player_request_id = ? AND status = 'JOINED'",
                (request_id,)
            ).fetchone()
            if count_row and count_row['cnt'] > players_needed:
                conn.close()
                return False
            updates.append("players_needed = ?")
            params.append(players_needed)

            # If players_needed increased and request was FILLED, reopen
            pr = conn.execute("SELECT * FROM player_requests WHERE id = ?", (request_id,)).fetchone()
            if pr and pr['status'] == 'FILLED' and players_needed > count_row['cnt']:
                updates.append("status = 'OPEN'")

            # If players_needed decreased and matches joined count, fill
            if count_row and count_row['cnt'] >= players_needed:
                updates.append("status = 'FILLED'")

        if description is not None:
            updates.append("description = ?")
            params.append(description)

        if skill_level is not None:
            updates.append("skill_level = ?")
            params.append(skill_level)

        if not updates:
            conn.close()
            return True

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(request_id)

        conn.execute(
            f"UPDATE player_requests SET {', '.join(updates)} WHERE id = ?",
            params
        )
        conn.commit()
        return True
    finally:
        conn.close()


def close_player_request(request_id):
    """Close a player request (host or admin action)."""
    conn = get_db()
    conn.execute(
        "UPDATE player_requests SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('OPEN', 'FILLED')",
        (request_id,)
    )
    conn.commit()
    conn.close()


def get_my_hosted_games(user_id):
    """Get all player requests created by the user."""
    conn = get_db()
    rows = conn.execute(
        """SELECT pr.*,
                  b.facility_id, b.date, b.start_time, b.end_time, b.status as booking_status,
                  f.name as facility_name, f.emoji as facility_emoji, f.parent_id,
                  pf.name as parent_name, pf.emoji as parent_emoji,
                  (SELECT COUNT(*) FROM player_request_members prm
                   WHERE prm.player_request_id = pr.id AND prm.status = 'JOINED') as joined_count
           FROM player_requests pr
           JOIN bookings b ON pr.booking_id = b.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           WHERE pr.creator_user_id = ?
           ORDER BY b.date DESC, b.start_time DESC""",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_my_joined_games(user_id):
    """Get all player requests the user has joined."""
    conn = get_db()
    rows = conn.execute(
        """SELECT pr.*,
                  b.facility_id, b.date, b.start_time, b.end_time, b.status as booking_status,
                  f.name as facility_name, f.emoji as facility_emoji, f.parent_id,
                  pf.name as parent_name, pf.emoji as parent_emoji,
                  u.name as creator_name,
                  (SELECT COUNT(*) FROM player_request_members prm2
                   WHERE prm2.player_request_id = pr.id AND prm2.status = 'JOINED') as joined_count
           FROM player_request_members prm
           JOIN player_requests pr ON prm.player_request_id = pr.id
           JOIN bookings b ON pr.booking_id = b.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           JOIN users u ON pr.creator_user_id = u.id
           WHERE prm.user_id = ? AND prm.status = 'JOINED'
           ORDER BY b.date DESC, b.start_time DESC""",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_admin_player_request_stats():
    """Get aggregate stats for admin dashboard."""
    conn = get_db()

    open_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM player_requests WHERE status = 'OPEN'"
    ).fetchone()['cnt']

    filled_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM player_requests WHERE status = 'FILLED'"
    ).fetchone()['cnt']

    joined_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM player_request_members WHERE status = 'JOINED'"
    ).fetchone()['cnt']

    # Most active sport
    most_active = conn.execute(
        """SELECT COALESCE(pf.name, f.name) as sport_name, COUNT(*) as cnt
           FROM player_requests pr
           JOIN bookings b ON pr.booking_id = b.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           WHERE pr.status IN ('OPEN', 'FILLED')
           GROUP BY sport_name
           ORDER BY cnt DESC
           LIMIT 1"""
    ).fetchone()

    conn.close()

    return {
        'open_games': open_count,
        'filled_games': filled_count,
        'residents_joined': joined_count,
        'most_active_sport': most_active['sport_name'] if most_active else '—'
    }


def get_admin_player_requests():
    """Get all player requests for admin table."""
    conn = get_db()
    rows = conn.execute(
        """SELECT pr.*,
                  b.date, b.start_time, b.end_time,
                  COALESCE(pf.name, f.name) as sport_name,
                  COALESCE(pf.emoji, f.emoji) as sport_emoji,
                  f.name as facility_name,
                  u.name as creator_name,
                  (SELECT COUNT(*) FROM player_request_members prm
                   WHERE prm.player_request_id = pr.id AND prm.status = 'JOINED') as joined_count
           FROM player_requests pr
           JOIN bookings b ON pr.booking_id = b.id
           JOIN facilities f ON b.facility_id = f.id
           LEFT JOIN facilities pf ON f.parent_id = pf.id
           JOIN users u ON pr.creator_user_id = u.id
           ORDER BY pr.created_at DESC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Visitor Request Query Helpers ───────────────────────

def create_visitor_request(name, email, phone, visit_date, visit_time, visitors_count, purpose):
    """Create a new visitor request. Returns request id or None."""
    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO visitor_requests (name, email, phone, visit_date, visit_time, visitors_count, purpose)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, email, phone, visit_date, visit_time, visitors_count, purpose)
        )
        conn.commit()
        return cursor.lastrowid
    except Exception:
        return None
    finally:
        conn.close()


def get_visitor_request_by_id(request_id):
    """Fetch a visitor request by id."""
    conn = get_db()
    row = conn.execute("SELECT * FROM visitor_requests WHERE id = ?", (request_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_visitor_requests():
    """Get all visitor requests ordered by creation date."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM visitor_requests ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]
