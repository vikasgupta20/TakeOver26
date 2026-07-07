<h1 align="center">🏟️ FlexSpace</h1>

<p align="center">
  <b>Book It. Scan It. Play.</b><br/>
  <i>A smart facility booking system for residential communities — built at Takeover '26.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-Flask-000?style=for-the-badge&logo=flask" />
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite" />
  <img src="https://img.shields.io/badge/Real--Time-SSE-34d399?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel" />
</p>

---

## 💡 The Problem

In most housing societies, booking shared facilities like badminton courts, snooker tables, or cricket pitches is a mess — **paper registers, WhatsApp groups, double bookings, and arguments at the gate.**

There's no transparency, no accountability, and no way to know what's available right now.

---

## 🚀 Our Solution

**FlexSpace** gives every resident a clean, real-time booking experience — and gives society admins full control.

> Browse facilities → Pick a slot → Get a QR gate pass → Walk in.

That's it. No calls. No conflicts. No confusion.

---

## ✨ What Makes It Special

🔒 **No Double Bookings — Ever**
Database-level constraints guarantee that once a slot is taken, it can't be booked by anyone else.

⚡ **Real-Time Availability**
Using Server-Sent Events, all users see slot changes **instantly** — no refreshing needed.

📲 **QR-Code Gate Pass**
Every booking generates a unique QR code. Security scans it at the facility entrance to verify the resident, slot, and time — replacing manual registers entirely.

🛡️ **Admin Dashboard**
Society managers get a dedicated panel to view all bookings across facilities, filter by date, and cancel reservations when needed.

🏸 **Multi-Unit Support**
Facilities with multiple units (e.g., *Badminton → Court 1, Court 2, Court 3*) are handled seamlessly — each unit has its own independent slots.

🎨 **Premium UI**
A dark-themed, glassmorphism interface with smooth animations — built to feel like a product, not a prototype.

---

## 🛠️ Built With

**Backend:** Python · Flask · SQLite · Flask-Bcrypt · QR Code generation
**Frontend:** Vanilla HTML · CSS · JavaScript (no frameworks)
**Real-Time:** Server-Sent Events (SSE)
**Deployment:** Vercel / Gunicorn

---

## ⚡ Quick Start

```bash
git clone https://github.com/<your-username>/Takeover_hackathon.git
cd Takeover_hackathon
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000** — the database seeds itself on first run.

---

## 🔮 What's Next

- 💳 Payment integration for premium facility charges
- 🔁 Recurring weekly/monthly slot reservations
- 📊 Usage analytics and occupancy heatmaps for admins
- 📱 Companion mobile app with QR wallet

---

<p align="center">
  Built with ❤️ at <b>Takeover '26 Hackathon</b>
</p>
