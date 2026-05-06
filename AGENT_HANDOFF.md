# 🤖 AGENT HANDOFF — Gambir-Cideng Sales App

> **For:** Claude Code, Codex CLI, or any coding agent  
> **From:** Kimi Claw session — 2026-05-06  
> **Status:** PRODUCTION READY — Cloudflare tunnel active

---

## 🎯 Quick Orientation

This is a **field-sales PWA** for Telkom Indibiz B2B sales in Gambir-Cideng, Jakarta.  
It runs on an Android phone, pulls leads from Google Sheets in real-time, and tracks visits + WA outreach.

**Current state:** 459 valid leads loaded, 55 visited, 459 map dots, Cloudflare tunnel live.

---

## 📁 Project Structure

```
gambir-sales-app/
├── server/
│   ├── index.js          ← MAIN SERVER — Express, routes, CSV parser
│   ├── sheets.js         ← Google Sheets API integration (optional fallback)
│   ├── clusters.js       ← NEW — 38 cluster lat/lng mappings
│   └── credentials.json  ← (optional) Google service account key
├── public/
│   ├── index.html        ← Dashboard + Lead list + Map (SPA)
│   ├── app.js            ← Frontend logic — tabs, filters, pagination, WA
│   ├── style.css         ← Telkom red theme, mobile-first
│   ├── visit.html        ← Standalone visit form (if needed)
│   └── manifest.json     ← PWA manifest
├── data/
│   ├── gambir_sales.db   ← SQLite — leads, visits, WA outreach, agents
│   └── uploads/          ← Photo evidence from visits
├── backup.sh             ← One-click backup script
└── package.json
```

---

## 🚀 How to Start

```bash
cd /root/.openclaw/workspace/gambir-sales-app
npm install   # if node_modules missing
node server/index.js   # port 3456
```

**In production:** Server runs in `screen` session named `gambir`:
```bash
screen -dmS gambir node server/index.js
```

**Tunnel** runs in `screen` session named `tunnel`:
```bash
screen -dmS tunnel cloudflared tunnel --url http://localhost:3456
```

---

## 🔗 Data Architecture (CRITICAL)

### Primary Source: Google Sheets CSV (No Auth Required)
- **URL:** `https://docs.google.com/spreadsheets/d/e/2PACX-1vSnLNGu8o3YdILFa5DJMSSbfFfI3BnojxKu2mzmocYKpIDBEkc6KUdhm9CyCstpzD8_q1r2EoTRovOt/pub?gid=1327875598&single=true&output=csv`
- **Sheet name:** "Gambir Cideng Hit List 200426"
- **Rows:** 999 total → **459 valid** (after filtering empty business_name)
- **Update frequency:** Every page load (fetchCSV called per request)

### Secondary Source: SQLite (`data/gambir_sales.db`)
- **Purpose:** Stores geocoded lat/lng + visit_status + WA outreach history
- **Why it exists:** CSV doesn't have lat/lng columns. SQLite merges geocoded coordinates + visit tracking into CSV leads.
- **Tables:** `leads` (459 rows), `visits`, `wa_outreach`, `agents`, `sales_queue`

### Merge Logic (in `server/index.js` → `parseCSV()`)
1. Fetch CSV from Google
2. Filter out rows with empty `business_name`
3. For each row: check SQLite for matching `business_name`
4. If found in SQLite: copy `lat`, `lng`, `visit_status`, `phone_primary`, `sales_signal`, `pipeline_stage`
5. If NOT in SQLite: parse `visit_status` from CSV string ("TRUE"/"FALSE")
6. If still no lat/lng: look up `clusterCoords` by cluster name, add small random offset

**This is the most important function.** If something breaks, it's probably here.

---

## 📊 API Endpoints

| Endpoint | What it does |
|----------|-------------|
| `GET /api/health` | Health check + timestamp |
| `GET /api/sheets/leads` | Returns merged CSV+SQLite leads array |
| `GET /api/sheets/stats` | Dashboard stats (visited, WA, actions, success) |
| `GET /api/sheets/map-data` | Map pin array with lat/lng |
| `GET /api/csv/leads` | Raw CSV-only leads (no SQLite merge) |
| `GET /api/csv/stats` | Raw CSV-only stats |
| `GET /api/stats` | SQLite-only stats (legacy) |
| `GET /api/leads` | SQLite-only leads (legacy) |
| `POST /api/visit` | Log a visit with GPS + photo |
| `POST /api/wa-outreach` | Log WA message sent |

---

## 🗺️ Cluster Coordinates (`server/clusters.js`)

38 clusters mapped. Key ones:
- `Pecenongan` — 55 leads
- `Petojo-Cideng` — 36 leads
- `Harmoni/Majapahit/Suryopranoto` — 32 leads
- `Atrium Senen` — 32 leads
- `Education` — 31 leads

If a new cluster appears in CSV but not in `clusters.js`, map dots will be missing for those leads. **Add new clusters to `clusters.js` immediately.**

---

## 🎨 Frontend Architecture

- **Single-page app** with 3 tabs: Dashboard, Leads, Map
- **Dashboard:** 6 stat cards (Total, Visited, Not Visited, WA Available, WA Sent, Need Actions, Success)
- **Leads:** Searchable, filterable by cluster/segment/status, paginated (25/page)
- **Map:** Leaflet.js, OpenStreetMap tiles, all 459 dots visible
- **WA Button:** Opens WhatsApp Web with pre-filled template
- **Visit Button:** Opens visit form with GPS tracking

**Key constant:** `USE_SHEETS = true` in `app.js` — toggles between Google Sheets mode and SQLite-only mode.

---

## 🔐 Credentials & Config

### Optional: Google Sheets API (for private sheets)
- File: `server/credentials.json` — service account key
- If missing: app falls back to public CSV (current working mode)
- **DO NOT commit credentials.json to git** — it's gitignored

### Required: None
Public CSV URL requires zero authentication. App works out-of-the-box.

---

## 🧪 Testing Checklist

After any code change, verify ALL of these:

```bash
# 1. Server health
curl http://localhost:3456/api/health

# 2. Stats (should show 459, 55 visited, 104 WA)
curl http://localhost:3456/api/sheets/stats

# 3. Leads (should return 459 objects)
curl http://localhost:3456/api/sheets/leads | jq '.leads | length'

# 4. Map data (should return 459 points with lat/lng)
curl http://localhost:3456/api/sheets/map-data | jq '.points | length'

# 5. Cloudflare tunnel
curl https://song-tricks-copyrights-matters.trycloudflare.com/api/sheets/stats
```

---

## ⚠️ Known Pitfalls

1. **CSV has no lat/lng columns** — lat/lng MUST come from SQLite merge or cluster fallback
2. **CSV `visit_status` is string "FALSE"** — parser converts to integer 0/1
3. **CSV `business_name` field name** — normalized from `existing_phone_primary` to `phone_primary`
4. **Field name `est._mrc`** — contains a dot, accessed as `row['est._mrc']`
5. **Cluster name variations** — `Gambir-Cideng` vs `Gambir–Cideng` (different dash chars). Both mapped.
6. **Server restart required** after any `index.js` change (no hot reload)

---

## 📦 Dependencies

```json
{
  "express": "^4.18.2",
  "better-sqlite3": "^9.4.3",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5",
  "multer": "^1.4.5-lts.1",
  "googleapis": "^133.0.0"
}
```

---

## 💾 Backup & Recovery

**Auto-backup script:** `bash backup.sh`  
Creates `BACKUP_YYYY-MM-DD-HHMM/` with all critical files.

**Database is the source of truth for:**
- Visit history
- WA outreach log
- Agent assignments
- Photo evidence paths

**Google Sheet is the source of truth for:**
- Lead list (business names, addresses, phones)
- Segment/cluster classifications

---

## 🔥 Current Live URL

**https://song-tricks-copyrights-matters.trycloudflare.com/**

If tunnel expires, restart with:
```bash
screen -dmS tunnel cloudflared tunnel --url http://localhost:3456
```

---

## 📞 Who to Ask

**Human:** King (Budi Santoso) — Telkom B2B sales, Gambir-Cideng territory  
**This agent:** Kimi Claw via Telegram @ariefputranto or this workspace

**Next task ideas:**
- Add visit photo upload to cloud storage
- Build follow-up reminder system
- Create sales performance dashboard
- Integrate with Telkom CRM API
- Add offline mode (service worker caching)

---

*Handoff complete. Good luck, agent. Don't break the 459 leads.* 🫡
