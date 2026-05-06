# 🎯 Gambir-Cideng Sales Command Center

> Field-sales PWA for Telkom Indibiz B2B sales — Gambir & Cideng, Jakarta

[![Live](https://img.shields.io/badge/Live-Cloudflare-blue)](https://song-tricks-copyrights-matters.trycloudflare.com/)
[![Leads](https://img.shields.io/badge/Leads-459-green)]()
[![Visited](https://img.shields.io/badge/Visited-55-success)]()

---

## ⚡ Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/gambir-cideng-sales.git
cd gambir-cideng-sales

# 2. Install
npm install

# 3. Optional: Restore database (visit history + geocoded coordinates)
# If you have sqlite3 CLI:
sqlite3 data/gambir_sales.db < database_dump.sql
# Or let the app auto-create a fresh DB on first run

# 4. Run
node server/index.js

# 5. Open
# http://localhost:3456
```

---

## 📱 What This Is

A **Progressive Web App** designed for mobile field sales:

- 📊 **Dashboard** — Live stats (visited, WA available, actions needed, deals)
- 📋 **Lead List** — 459 Indibiz prospects, searchable/filterable by cluster
- 🗺️ **Map** — All leads pinned on OpenStreetMap (38 clusters across Gambir-Cideng)
- 💬 **WhatsApp** — One-tap outreach with pre-filled templates
- 📍 **Visit Logging** — GPS check-in + photo evidence
- 📈 **Real-time Sync** — Pulls latest leads from Google Sheets automatically

**Built for:** Telkom Witel Jakarta Centrum — Gambir/Cideng territory

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Google Sheets  │────→│  Express API │←────│   SQLite    │
│  (Public CSV)   │     │   (Merge)    │     │  (Visits)   │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │
                               ↓
                        ┌──────────────┐
                        │  PWA Frontend │
                        │  (Dashboard)  │
                        └──────────────┘
```

**Data Flow:**
1. Google Sheets publishes a public CSV (no auth needed)
2. Server fetches CSV on every request, merges with SQLite (lat/lng + visit status)
3. Frontend gets a clean JSON array of 459 leads

---

## 📦 Project Structure

```
├── server/
│   ├── index.js          # Express server + CSV parser + SQLite merge
│   ├── sheets.js         # Google Sheets API (optional fallback)
│   └── clusters.js       # 38 cluster lat/lng mappings
├── public/
│   ├── index.html        # Dashboard + Lead list + Map (SPA)
│   ├── app.js            # Frontend logic
│   └── style.css         # Telkom red theme, mobile-first
├── database_dump.sql     # Full DB backup (459 leads + 55 visits)
├── AGENT_HANDOFF.md      # Complete docs for coding agents
└── README.md             # This file
```

---

## 🔗 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Server health check |
| `GET /api/sheets/leads` | All leads (CSV + SQLite merged) |
| `GET /api/sheets/stats` | Dashboard statistics |
| `GET /api/sheets/map-data` | Map pins with lat/lng |
| `POST /api/visit` | Log a visit (GPS + photo) |
| `POST /api/wa-outreach` | Log WA message sent |

---

## 🗃️ Database

**SQLite** — `data/gambir_sales.db` (auto-created)

Tables:
- `leads` — 459 records with geocoded coordinates
- `visits` — 55 visit logs with GPS + timestamp
- `wa_outreach` — WA message history
- `agents` — Sales agent profiles
- `sales_queue` — Lead assignment queue

**Sacred rule:** `database_dump.sql` is the only backup of visit history. Don't lose it.

---

## 🌐 Live Instance

**URL:** https://song-tricks-copyrights-matters.trycloudflare.com/

*(Cloudflare tunnel — may change on restart)*

---

## 🚀 Deployment

### Local Development
```bash
node server/index.js
```

### Production (Server)
```bash
# Run in background
screen -dmS gambir node server/index.js

# Cloudflare tunnel
screen -dmS tunnel cloudflared tunnel --url http://localhost:3456
```

---

## 🤝 Agent Handoff

**For Claude Code, Codex CLI, or any coding agent:**

Read `AGENT_HANDOFF.md` first. It contains:
- Full technical architecture
- How the CSV → SQLite merge works
- 38 cluster coordinates
- Known pitfalls
- Testing checklist

**DO NOT:**
- Delete `database_dump.sql`
- Change port 3456 without updating the tunnel
- Reset the database without backing up
- Rebuild the app from scratch (it's already production-ready)

---

## 📞 Contact

**Maintainer:** King (Budi Santoso) — Telkom B2B Sales, Gambir-Cideng

**Built with:** Express.js, better-sqlite3, Leaflet.js, Google Sheets (public CSV)

---

*Exported from Kimi Claw session — May 6, 2026*
