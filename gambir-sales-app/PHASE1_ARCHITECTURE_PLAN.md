# 🏗️ PHASE 1 — ARCHITECTURE & BUILD PLAN
## Gambir-Cideng Sales Command Center

---

## 1. DATA AUDIT SUMMARY (Already Complete)

**Source:** Google Sheet "Gambir Cideng Hit List 200426"
**URL:** https://docs.google.com/spreadsheets/d/1S4arxemmkG-_WV3Yw5Nz0KWustZYB9p6v1cbS5TUS9E/

| Metric | Value |
|--------|-------|
| Total rows in sheet | 999 |
| Actual leads (with business name) | 459 |
| Blank/empty rows | 540 |
| Columns | 72 |
| Visited/field-checked | ~31-55 |
| Missing phone | 685 (68.6%) |
| Missing email | 940 (94.1%) |
| Missing BOTH phone+email | 681 |
| Duplicate business names | 541 (mostly blanks) |
| Leads with coordinates | **0** |
| Clusters | 20+ distinct |
| Segments | 20+ distinct |
| Pipeline Stage = Not Contacted | 404 |
| Pipeline Stage = Visited | 31 |
| Pipeline Stage = Proposal Needed | 5 |
| HOT signals | 10 |
| WARM signals | 236 |

**Critical Finding:** Zero leads have latitude/longitude. Geocoding is mandatory for the map view.

---

## 2. PROPOSED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    GAMBIR-CIDENG SALES COMMAND CENTER        │
├─────────────────────────────────────────────────────────────┤
│  FRONTEND (PWA — Mobile-First)                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │Dashboard│ │  Map    │ │ Lead    │ │ WhatsApp│         │
│  │  (PC)   │ │(PC+Mob) │ │ List    │ │ Outreach│         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │  Lead   │ │  Field  │ │Follow-up│ │Templates│         │
│  │ Detail  │ │ Capture │ │  Queue  │ │ Manager │         │
│  │(PC+Mob) │ │ (Mob)   │ │(PC+Mob) │ │ (Admin) │         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
├─────────────────────────────────────────────────────────────┤
│  BACKEND (Node.js + Express + SQLite)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   REST API  │  │   SQLite    │  │   File      │        │
│  │   Server    │  │   Database  │  │   Storage   │        │
│  │  (Port 3456)│  │  (gambir.db)│  │  (uploads)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
├─────────────────────────────────────────────────────────────┤
│  EXTERNAL SERVICES (Future/Optional)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │Google Maps  │  │  WhatsApp   │  │  Google     │        │
│  │Geocoding API│  │ Business API│  │  Sheets API │        │
│  │  (Optional) │  │  (Future)   │  │ (Sync back) │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

**Stack Choice Rationale:**
- **Node.js + Express:** Fast to build, single-language stack, works on your VPS
- **SQLite:** Zero-config, file-based, portable, sufficient for 459 leads
- **Vanilla HTML/JS (no React):** Faster loading on mobile, easier to modify, no build step
- **Leaflet.js + OpenStreetMap:** Free, no API key needed, offline tile caching possible
- **PWA manifest:** Installable on Android home screen, works offline partially

---

## 3. DATABASE SCHEMA

### `leads` — Core customer data
| Field | Type | Source | Notes |
|-------|------|--------|-------|
| id | INTEGER PK | Auto | Internal ID |
| lead_id | TEXT | Sheet "Lead ID" | Original sheet ID |
| business_name | TEXT | Sheet "Business Name" | Required |
| segment | TEXT | Sheet "Segment" | Normalized category |
| cluster | TEXT | Sheet "Cluster" | Territory group |
| kelurahan | TEXT | Sheet "Kelurahan" | Sub-district |
| address | TEXT | Sheet "Address" | Full address |
| lat | REAL | Geocoding | Computed from address |
| lng | REAL | Geocoding | Computed from address |
| phone_primary | TEXT | Sheet "Existing Phone Primary" | Best contact |
| phone_all | TEXT | Sheet "Existing Phone All" | All known numbers |
| email | TEXT | Sheet "Existing Email" | |
| preferred_channel | TEXT | Sheet "Preferred Channel" | Visit/Call/WA |
| current_provider | TEXT | Sheet "Current Provider" | Biznet/IndiHome/etc |
| pain_point | TEXT | Sheet "Pain Point" | |
| sales_signal | TEXT | Sheet "Sales Signal" | HOT/WARM/UNKNOWN |
| pipeline_stage | TEXT | Sheet "Pipeline Stage" | Not Contacted/Visited/etc |
| sales_motion | TEXT | Computed | Migration/Upgrade/etc |
| product_offered | TEXT | Sheet "Product Offered" | |
| est_mrc | TEXT | Sheet "Est. MRC" | Estimated monthly cost |
| probability | REAL | Sheet "Probability" | 0-1 |
| priority_score | REAL | Sheet "Total Score" | |
| pre_visit_priority | TEXT | Sheet "Pre-Visit Priority" | Tier A/B/C/D |
| next_action | TEXT | Sheet "Next Action" | |
| next_action_date | TEXT | Sheet "Next Action Date" | ISO format |
| pic_owner | TEXT | Sheet "PIC Owner" | Assigned person |
| internal_notes | TEXT | Sheet "Internal Notes" | |
| desk_notes | TEXT | Sheet "Desk Notes" | |
| source_url | TEXT | Sheet "Source URL" | Google Maps/etc |
| discovery_keyword | TEXT | Sheet "Discovery Keyword" | How found |
| import_batch | TEXT | Sheet "Import Batch" | |
| visit_status | INTEGER | Computed | 0=not visited, 1=visited |
| outreach_status | TEXT | Computed | not_sent/sent/replied/no_response |
| wa_sent_count | INTEGER | Computed | Total WA sent |
| last_contact_date | TEXT | Computed | Last WA/call/visit |
| last_visit_date | TEXT | Computed | From visits table |
| claimed_by | TEXT | Sheet "Claimed By" | |
| claimed_at | TEXT | Sheet "Claimed At" | |
| created_at | TEXT | Auto | Import timestamp |
| updated_at | TEXT | Auto | Last change |

### `visits` — Field agent visit logs
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| lead_id | TEXT FK | References leads.lead_id |
| agent_name | TEXT | Who visited |
| visit_date | TEXT | YYYY-MM-DD |
| visit_time | TEXT | HH:MM |
| outcome | TEXT | Interested/Not Interested/etc |
| provider_identified | TEXT | What provider they have |
| contact_captured | TEXT | PIC phone/WA |
| contact_name | TEXT | PIC name |
| contact_role | TEXT | Owner/Manager/etc |
| pain_noted | TEXT | Speed issue/Price/etc |
| next_action | TEXT | Revisit/Proposal/etc |
| next_action_date | TEXT | When to follow up |
| notes | TEXT | Free text |
| gps_lat | REAL | Agent GPS at visit time |
| gps_lng | REAL | Agent GPS at visit time |
| photo_path | TEXT | Path to uploaded photo |
| created_at | TEXT | Auto |

### `wa_outreach` — WhatsApp message tracking
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| lead_id | TEXT FK | |
| template_name | TEXT | Which template used |
| message_text | TEXT | Full generated message |
| sent_at | TEXT | When sent |
| sent_by | TEXT | Who sent it |
| status | TEXT | draft/sent/delivered/read/replied/no_response |
| response_text | TEXT | What they replied |
| response_at | TEXT | When replied |
| follow_up_needed | INTEGER | 0/1 |
| created_at | TEXT | Auto |

### `sales_queue` — Action items
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| lead_id | TEXT FK | |
| sales_motion | TEXT | Formal proposal/Migration/Revisit/etc |
| recommended_product | TEXT | |
| recommended_pitch | TEXT | |
| channel | TEXT | WhatsApp/Call/Visit/Email |
| priority_reason | TEXT | Why this is priority |
| deadline | TEXT | When due |
| assigned_to | TEXT | Who should do it |
| status | TEXT | open/done/drop |
| completed_at | TEXT | |
| created_at | TEXT | Auto |

### `status_history` — Audit trail
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| lead_id | TEXT FK | |
| old_status | TEXT | |
| new_status | TEXT | |
| changed_by | TEXT | |
| changed_at | TEXT | Auto |
| reason | TEXT | |

### `agents` — Field agent registry
| Field | Type | Notes |
|-------|------|-------|
| id | INTEGER PK | |
| name | TEXT | |
| phone | TEXT | |
| role | TEXT | field_agent/admin |
| active | INTEGER | 0/1 |
| created_at | TEXT | Auto |

---

## 4. PAGE LIST & USER FLOWS

### Page 1 — Dashboard (Admin/PC Primary)
**Purpose:** Command center overview
**Widgets:**
- Total leads count
- Visited vs Not Contacted donut chart
- HOT/WARM/UNKNOWN bar chart
- Leads by cluster (top 5)
- Leads by segment (top 5)
- Leads by provider (known)
- Open action items count
- WA sent today / this week
- Visit productivity (visits per agent)
- Conversion funnel: Not Contacted → Visited → Interested → Proposal → Converted

### Page 2 — Map View (All Users)
**Purpose:** Territory visualization
**Features:**
- Leaflet map centered on Gambir-Cideng
- Dots for every lead (cluster-based jitter for visual separation)
- Color coding by status:
  - 🔴 Not contacted
  - 🟡 WhatsApp sent
  - 🟢 Visited
  - 🔵 Interested
  - 🟣 Follow-up needed
  - ⚫ Converted
  - ⚪ Drop/invalid
- Click dot → popup with:
  - Business name
  - Segment, Cluster
  - Phone (clickable tel: link)
  - Provider, Status
  - Next action
  - Buttons: View Detail, Open Maps, Mark for Visit, Create WhatsApp
- Filter by cluster, segment, status
- Search by business name

### Page 3 — Lead List (All Users)
**Purpose:** Searchable database
**Columns:** Business name, Segment, Cluster, Phone, Provider, Status, Next Action, Owner, Last Updated
**Filters:** Cluster, Segment, Status, Provider, Contact available, Visited, WA sent, Follow-up needed
**Sort:** Last updated, Priority score, Cluster, Status
**Bulk actions:** (future) Assign to agent, Mark status change

### Page 4 — Lead Detail (All Users)
**Purpose:** Single lead full profile
**Sections:**
- Header: Name, segment, cluster, status badge
- Contact: Phone (click to call/WA), email
- Map: Mini map with location
- Provider info
- Field history: All visits
- WA history: All outreach attempts
- Status history: Audit trail
- Photos: Grid of visit photos
- Actions panel:
  - Generate WhatsApp message
  - Mark as visited (opens visit form)
  - Change status
  - Assign to agent
  - Schedule follow-up
  - Open Google Maps directions

### Page 5 — WhatsApp Outreach (All Users)
**Purpose:** Generate and track WA messages
**Flow:**
1. Select template (dropdown by segment)
2. App auto-fills business name, cluster, segment, provider
3. Generated message shown in textarea
4. "Copy to clipboard" button
5. "Open WhatsApp" button (wa.me link if phone exists)
6. "Mark as Sent" button → logs to database
7. "Log Response" buttons:
   - No response
   - Replied (show text input)
   - Interested
   - Asked proposal
   - Not interested
   - Wrong number
   - Follow-up later
8. History table: past messages, status, dates

### Page 6 — Field Capture / Mobile View (Field Agents)
**Purpose:** Android browser visit logging
**Screen flow:**
1. Login (simple name entry)
2. Dashboard: "My assigned leads" + "Nearby leads"
3. Lead card: Name, address, distance
4. "Start Visit" button
5. Visit form:
   - Outcome dropdown (Interested / Not Interested / Already Has Internet / Asked Proposal / Need Revisit / PIC Not Available / Business Closed / Cannot Install / Drop)
   - Provider dropdown (IndiHome / Biznet / MyRepublic / First Media / MNC / Unknown / None)
   - PIC name
   - PIC phone/WA
   - PIC email
   - Objection dropdown (Price / Speed / Contract / No Need / Satisfied / Other)
   - Next action dropdown
   - Next action date
   - Notes textarea
   - Photo upload (camera input)
   - GPS capture (auto)
   - Agent name (auto)
   - Timestamp (auto)
6. "Submit Visit" → saves to DB, updates lead status

### Page 7 — Follow-up Queue (All Users)
**Purpose:** Action-oriented work list
**Tabs:**
- Proposal requested
- WhatsApp replied / needs follow-up
- Need revisit
- PIC not available
- Interested but not closed
- Migration targets (has competitor)
- Data gaps (missing provider/PIC)
**Columns:** Business, Motion, Channel, Deadline, Owner, Actions
**Actions:** Generate WA, Schedule visit, Mark done, Assign

### Page 8 — Templates Manager (Admin)
**Purpose:** Manage WhatsApp templates
**Features:**
- Template list by segment
- Edit template (textarea with {{business_name}} {{cluster}} variables)
- Preview with sample data
- Test send (to your own number)
- Add new template
- Archive old template

---

## 5. WIREFRAME / UI PLAN

**Mobile-First Design Principles:**
- Bottom navigation bar (4 tabs): Map, My Leads, Visit, Queue
- Top bar: Search + filter icon
- Cards, not tables (on mobile)
- Big touch targets (min 48px)
- Swipe gestures where natural
- Offline form saving (localStorage → sync when online)

**Desktop Design Principles:**
- Side navigation (collapsed on mobile)
- Dashboard grid layout
- Data tables with sorting/filtering
- Split view: Map on left, lead list on right
- Keyboard shortcuts (Ctrl+K search, Esc close)

**Color System:**
- Primary: Telkom blue-ish #1a73e8
- Success: Green #34a853 (converted, visited)
- Warning: Orange #fbbc04 (warm, revisit)
- Danger: Red #ea4335 (hot urgent, drop)
- Neutral: Gray #5f6368 (not contacted)
- Background: White #ffffff
- Surface: Light gray #f8f9fa

---

## 6. TECH STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 22 | Already installed on your VPS |
| Server | Express 4.18 | Lightweight, battle-tested |
| Database | SQLite (better-sqlite3) | Zero-config, file-based, fast |
| Frontend | Vanilla HTML5 + CSS3 + JS | No build step, fast loading |
| Map | Leaflet 1.9 + OpenStreetMap | Free, no API key |
| Icons | Font Awesome 6 (CDN) | Standard icon set |
| Charts | Chart.js 4 (CDN) | Simple dashboard charts |
| PWA | manifest.json + service worker | Installable on Android |
| Auth | Simple session-based | No complex auth for MVP |
| Upload | Multer + local disk | Photo storage |

---

## 7. CREDENTIALS / API KEYS NEEDED

**Required for MVP (None):**
- The app runs entirely self-hosted
- No external APIs needed for core functionality

**Optional / Future:**
| Service | Purpose | Cost | When Needed |
|---------|---------|------|-------------|
| Google Maps Geocoding API | Convert addresses to lat/lng | $5 per 1000 requests | Phase 2 (Map accuracy) |
| WhatsApp Business API | Automated sending | ~$0.005-0.08/message | Phase 4 (After manual MVP proven) |
| Google Sheets API | Two-way sync | Free (within limits) | Phase 5 (If you want to keep sheet as source) |

**WhatsApp Business API Requirements (for future):**
- Meta Business account verification
- Business phone number (not personal WA)
- Message templates pre-approved by Meta
- Webhook endpoint for delivery status
- BSP (Business Solution Provider) or direct Cloud API
- Compliance: opt-out, rate limits, 24h rule

---

## 8. DEPLOYMENT PLAN

**Phase 1A — Local Development (Now)**
- Run on your VPS at port 3456
- Access via http://YOUR_VPS_IP:3456
- SQLite file stored in ./data/

**Phase 1B — Reverse Proxy (Optional)**
- Nginx reverse proxy for domain name
- SSL certificate (Let's Encrypt)
- Domain: sales.yourdomain.com or similar

**Phase 1C — PWA Install (Android)**
- Add to home screen from Chrome
- Works offline for form filling
- Syncs when back online

**Phase 1D — Backup Strategy**
- Daily sqlite dump to GitHub repo
- Or rsync to backup location
- Google Sheet remains source of truth for now

---

## 9. WHAT CAN BE DONE LOCALLY FIRST

✅ **Can build NOW without any external service:**
1. SQLite database + schema
2. Data import from CSV (already downloaded)
3. All 8 pages (HTML + CSS + JS)
4. REST API endpoints
5. WhatsApp message generation (no sending)
6. Visit form capture
7. Photo upload to local disk
8. Dashboard metrics
9. Map view with cluster-based coordinates
10. PWA manifest

⏳ **Needs external service:**
1. Accurate map coordinates (Google Maps Geocoding API)
2. Two-way Google Sheet sync (Google Sheets API)
3. Real WhatsApp sending (WhatsApp Business API)
4. Real-time notifications (WebSockets or Push API)

---

## 10. WHAT WILL BE LIVE AND USABLE

**After BUILD STEP 1-2 (This session):**
- ✅ Full lead database (459 leads)
- ✅ Searchable/filterable lead list
- ✅ Lead detail page
- ✅ Basic map view (cluster-based dots)
- ✅ Dashboard with counts

**After BUILD STEP 3-4 (Next session):**
- ✅ WhatsApp message generation
- ✅ Manual send tracking
- ✅ Template system

**After BUILD STEP 5-6 (Next session):**
- ✅ Mobile field visit form
- ✅ Photo upload
- ✅ GPS capture

**After BUILD STEP 7-8 (Next session):**
- ✅ Follow-up queue
- ✅ Agent assignment
- ✅ Sales motion tracking

---

## 11. RISKS

| Risk | Impact | Mitigation |
|------|--------|------------|
| No coordinates | Map inaccurate | Geocoding API or manual pin placement |
| Missing phone numbers | Can't WA 68% of leads | Focus on visited leads first; use address-based outreach |
| No real-time WA status | Can't confirm delivery | Manual status update; future API integration |
| Photo storage growth | Disk space | Limit file size; compress; periodic cleanup |
| Multiple agents editing | Data conflicts | Optimistic locking; last-write-wins for MVP |
| Mobile browser quirks | Forms break | Test on Android Chrome; use standard inputs |
| VPS restart | Service down | PM2 process manager; systemd service |
| Data loss | SQLite corruption | WAL mode; daily backups; Git sync |
| WhatsApp API ban | Number blocked | Never use unofficial API; always official |

---

## 12. WHAT I NEED YOU TO APPROVE

**A. Architecture Approval**
- Node.js + Express + SQLite + Vanilla JS — approved?
- Port 3456 for development — approved?
- Self-hosted (no cloud SaaS) — approved?

**B. Data Handling Approval**
- Import 459 leads into SQLite (read-only from sheet for now) — approved?
- Create approximate map coordinates from cluster names (jittered) — approved?
- No phone numbers exposed in public (only visible when logged in) — approved?

**C. Build Order Approval**
- BUILD STEP 1: Data import + database + lead list + dashboard
- BUILD STEP 2: Map view + lead detail
- BUILD STEP 3: WhatsApp generation + tracking
- BUILD STEP 4: Field visit capture (mobile)
- BUILD STEP 5: Photo upload + GPS
- BUILD STEP 6: Follow-up queue + templates

**D. WhatsApp Approach Approval**
- PHASE A: Manual send (generate text, copy, user sends, mark status) — approved?
- PHASE B: Research official API but do NOT implement until explicit approval — approved?

**E. Any Changes?**
- Different port?
- Different stack?
- Different features first?
- Skip anything?

---

## NEXT STEP

**Once you approve the plan above, I will immediately start BUILD STEP 1:**
1. Run database setup
2. Import 459 leads with all 72 columns preserved
3. Generate approximate coordinates
4. Detect and flag duplicates, invalid rows, missing contacts
5. Create the first 3 pages: Dashboard + Lead List + Lead Detail
6. Start the server
7. Send you the URL to test

**Reply with:**
- "Approved — build now" → I start immediately
- "Change X" → I adjust and resubmit
- "Build step Y first" → I skip to that step
- "Show me the data first" → I present the cleaned import before building UI

---

*Prepared by: Gambir-Cideng Sales Command Center AI*
*Date: 2026-05-04*
*Data source: Google Sheet (459 active leads, 0 coordinates, 31 visited)*
