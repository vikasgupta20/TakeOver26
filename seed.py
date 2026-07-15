"""
FlexSpace — Database Seeder
Run this script to initialize the database and populate with facility data + default admin.
Usage: python seed.py
"""

from models import init_db, get_db, get_user_by_email
from datetime import date, timedelta

# We'll import bcrypt from flask_bcrypt only if available, else use a fallback
try:
    from flask_bcrypt import Bcrypt
    _bcrypt = Bcrypt()

    def hash_password(pw):
        return _bcrypt.generate_password_hash(pw).decode('utf-8')
except ImportError:
    import hashlib
    def hash_password(pw):
        return hashlib.sha256(pw.encode()).hexdigest()


FACILITY_DATA = [
    {
        'name': 'Badminton',
        'category': 'racquet',
        'capacity': 4,
        'emoji': '🏸',
        'image': 'assets/badminton.png',
        'description': 'Professional-grade indoor courts with premium flooring, LED scoreboards, and net equipment provided. Perfect for singles or doubles.',
        'units': ['Court 1', 'Court 2', 'Court 3'],
        'is_sport': 1
    },
    {
        'name': 'Box Cricket',
        'category': 'team',
        'capacity': 12,
        'emoji': '🏏',
        'image': 'assets/box_cricket.png',
        'description': 'Enclosed turf pitch with protective netting and LED floodlights. Great for quick cricket matches with friends and family.',
        'units': [],
        'is_sport': 1
    },
    {
        'name': 'Basketball Court',
        'category': 'team',
        'capacity': 10,
        'emoji': '🏀',
        'image': 'assets/basketball.png',
        'description': 'Full-size hardwood court with professional hoops, LED scoreboard, and floodlighting for evening games.',
        'units': [],
        'is_sport': 1
    },
    {
        'name': 'Volleyball Court',
        'category': 'team',
        'capacity': 12,
        'emoji': '🏐',
        'image': 'assets/volleyball.png',
        'description': 'Outdoor sand court with regulation net, LED floodlights, and spectator seating. Ideal for casual and competitive play.',
        'units': [],
        'is_sport': 1
    },
    {
        'name': 'Table Tennis',
        'category': 'racquet',
        'capacity': 4,
        'emoji': '🏓',
        'image': 'assets/table_tennis.png',
        'description': 'Climate-controlled indoor facility with competition-grade tables, paddles, and balls provided. Available for singles or doubles.',
        'units': ['Board 1', 'Board 2', 'Board 3', 'Board 4', 'Board 5'],
        'is_sport': 1
    },
    {
        'name': 'Snooker',
        'category': 'indoor',
        'capacity': 4,
        'emoji': '🎱',
        'image': 'assets/snooker.png',
        'description': 'Elegant snooker lounge with full-size tables, premium cues, and ambient pendant lighting. A refined gaming experience.',
        'units': ['Board 1', 'Board 2', 'Board 3'],
        'is_sport': 1
    },
    {
        'name': 'Pickleball Court',
        'category': 'racquet',
        'capacity': 4,
        'emoji': '🏓',
        'image': 'assets/pickleball.png',
        'description': 'Dedicated outdoor pickleball court with regulation markings, quality nets, and evening LED lighting.',
        'units': [],
        'is_sport': 1
    },
]

# Demo resident users for the Find Players feature
DEMO_USERS = [
    {'name': 'Arjun', 'email': 'arjun@email.com', 'password': 'pass123', 'flat_no': 'B-204'},
    {'name': 'Rahul', 'email': 'rahul@email.com', 'password': 'pass123', 'flat_no': 'C-102'},
    {'name': 'Priya', 'email': 'priya@email.com', 'password': 'pass123', 'flat_no': 'A-305'},
    {'name': 'Riya', 'email': 'riya@email.com', 'password': 'pass123', 'flat_no': 'D-401'},
]


def seed():
    """Initialize the database and populate with default data."""
    print("[*] Initializing database schema...")
    init_db()

    conn = get_db()
    cursor = conn.cursor()

    # ── Check if already seeded ──
    existing = cursor.execute("SELECT COUNT(*) as c FROM facilities").fetchone()
    if existing['c'] > 0:
        print("[!] Database already has facility data. Skipping facility seed.")
    else:
        print("[*] Seeding facilities...")
        for fac in FACILITY_DATA:
            # Insert parent facility
            cursor.execute(
                """INSERT INTO facilities (name, category, capacity, emoji, image, description, parent_id, is_sport)
                   VALUES (?, ?, ?, ?, ?, ?, NULL, ?)""",
                (fac['name'], fac['category'], fac['capacity'], fac['emoji'], fac['image'], fac['description'], fac.get('is_sport', 1))
            )
            parent_id = cursor.lastrowid

            # Insert sub-units if any
            for unit_name in fac.get('units', []):
                full_name = f"{fac['name']} — {unit_name}"
                cursor.execute(
                    """INSERT INTO facilities (name, category, capacity, emoji, image, description, parent_id, is_sport)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (full_name, fac['category'], fac['capacity'], fac['emoji'], fac['image'], fac['description'], parent_id, fac.get('is_sport', 1))
                )
            print(f"   [+] {fac['name']} ({len(fac.get('units', []))} units)")

        conn.commit()

    # ── Seed default admin account ──
    admin_email = 'admin@flexspace.com'
    if get_user_by_email(admin_email):
        print("[!] Admin account already exists. Skipping admin seed.")
    else:
        print("[*] Creating default admin account...")
        pw_hash = hash_password('admin123')
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role, flat_no) VALUES (?, ?, ?, ?, ?)",
            ('Admin', admin_email, pw_hash, 'admin', 'A-101')
        )
        conn.commit()
        print(f"   [+] Admin: {admin_email} / admin123")

    # ── Seed demo resident users ──
    demo_user_ids = {}
    for u in DEMO_USERS:
        if get_user_by_email(u['email']):
            # Get existing user id
            existing_user = cursor.execute("SELECT id FROM users WHERE email = ?", (u['email'],)).fetchone()
            demo_user_ids[u['email']] = existing_user['id']
            print(f"[!] Demo user {u['email']} already exists. Skipping.")
        else:
            pw_hash = hash_password(u['password'])
            cursor.execute(
                "INSERT INTO users (name, email, password_hash, role, flat_no) VALUES (?, ?, ?, ?, ?)",
                (u['name'], u['email'], pw_hash, 'resident', u['flat_no'])
            )
            demo_user_ids[u['email']] = cursor.lastrowid
            conn.commit()
            print(f"   [+] Demo user: {u['email']} / {u['password']}")

    # ── Seed demo bookings & player requests ──
    existing_requests = cursor.execute("SELECT COUNT(*) as c FROM player_requests").fetchone()
    if existing_requests['c'] > 0:
        print("[!] Player requests already seeded. Skipping.")
    else:
        print("[*] Seeding demo bookings & player requests...")

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        day_after = (date.today() + timedelta(days=2)).isoformat()

        arjun_id = demo_user_ids.get('arjun@email.com')
        rahul_id = demo_user_ids.get('rahul@email.com')
        priya_id = demo_user_ids.get('priya@email.com')
        riya_id = demo_user_ids.get('riya@email.com')

        if arjun_id and rahul_id and priya_id:
            # Find Badminton Court 2 facility id
            court2 = cursor.execute(
                "SELECT id FROM facilities WHERE name LIKE '%Badminton%Court 2%'"
            ).fetchone()

            # Find Box Cricket facility id
            cricket = cursor.execute(
                "SELECT id FROM facilities WHERE name = 'Box Cricket'"
            ).fetchone()

            # Find Badminton Court 1
            court1 = cursor.execute(
                "SELECT id FROM facilities WHERE name LIKE '%Badminton%Court 1%'"
            ).fetchone()

            # Demo 1: Arjun books Badminton Court 2 tomorrow 7-8 PM
            if court2:
                try:
                    cursor.execute(
                        """INSERT INTO bookings (user_id, facility_id, date, start_time, end_time, status)
                           VALUES (?, ?, ?, ?, ?, 'confirmed')""",
                        (arjun_id, court2['id'], tomorrow, 19, 20)
                    )
                    booking1_id = cursor.lastrowid
                    cursor.execute(
                        """INSERT INTO player_requests (booking_id, creator_user_id, players_needed, description, skill_level, status)
                           VALUES (?, ?, ?, ?, ?, 'OPEN')""",
                        (booking1_id, arjun_id, 1,
                         "Three of us are playing doubles. Looking for one more player. Friendly game.",
                         'intermediate')
                    )
                    print("   [+] Arjun's badminton game (Court 2, tomorrow 7-8 PM)")
                except Exception as e:
                    print(f"   [!] Skipping Arjun's badminton booking: {e}")

            # Demo 2: Rahul books Box Cricket day after tomorrow 6-8 AM
            if cricket:
                try:
                    cursor.execute(
                        """INSERT INTO bookings (user_id, facility_id, date, start_time, end_time, status)
                           VALUES (?, ?, ?, ?, ?, 'confirmed')""",
                        (rahul_id, cricket['id'], day_after, 6, 8)
                    )
                    booking2_id = cursor.lastrowid
                    cursor.execute(
                        """INSERT INTO player_requests (booking_id, creator_user_id, players_needed, description, skill_level, status)
                           VALUES (?, ?, ?, ?, ?, 'OPEN')""",
                        (booking2_id, rahul_id, 3,
                         "Weekend game. Need three more players.",
                         'any')
                    )
                    req2_id = cursor.lastrowid
                    # Riya has already joined the cricket game
                    if riya_id:
                        cursor.execute(
                            """INSERT INTO player_request_members (player_request_id, user_id, status)
                               VALUES (?, ?, 'JOINED')""",
                            (req2_id, riya_id)
                        )
                    print("   [+] Rahul's cricket game (Box Cricket, day after tomorrow 6-8 AM)")
                except Exception as e:
                    print(f"   [!] Skipping Rahul's cricket booking: {e}")

            # Demo 3: Priya books Badminton Court 1 tomorrow 6-7 PM
            if court1:
                try:
                    cursor.execute(
                        """INSERT INTO bookings (user_id, facility_id, date, start_time, end_time, status)
                           VALUES (?, ?, ?, ?, ?, 'confirmed')""",
                        (priya_id, court1['id'], tomorrow, 18, 19)
                    )
                    booking3_id = cursor.lastrowid
                    cursor.execute(
                        """INSERT INTO player_requests (booking_id, creator_user_id, players_needed, description, skill_level, status)
                           VALUES (?, ?, ?, ?, ?, 'OPEN')""",
                        (booking3_id, priya_id, 1,
                         "Casual practice session. Beginners welcome!",
                         'beginner')
                    )
                    print("   [+] Priya's badminton game (Court 1, tomorrow 6-7 PM)")
                except Exception as e:
                    print(f"   [!] Skipping Priya's badminton booking: {e}")

            conn.commit()

    conn.close()
    print("\n[*] Seeding complete!")


if __name__ == '__main__':
    seed()
