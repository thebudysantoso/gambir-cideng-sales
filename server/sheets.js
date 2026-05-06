const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Load credentials from service account JSON file
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS || path.join(__dirname, 'credentials.json');
const SHEET_ID = process.env.GOOGLE_SHEET_ID || null;

let authClient = null;
let sheetsApi = null;

function initSheets() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.warn('⚠️ Google credentials file not found:', CREDENTIALS_PATH);
    return false;
  }
  if (!SHEET_ID) {
    console.warn('⚠️ GOOGLE_SHEET_ID not set');
    return false;
  }
  
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    sheetsApi = google.sheets({ version: 'v4', auth: authClient });
    console.log('✅ Google Sheets API initialized');
    return true;
  } catch (e) {
    console.error('❌ Failed to init Google Sheets:', e.message);
    return false;
  }
}

// Map sheet column headers to lead fields
// Assumes header row is row 1, data starts row 2
async function fetchLeads(range = 'Leads!A1:Z') {
  if (!sheetsApi) return null;
  
  try {
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    
    const rows = res.data.values;
    if (!rows || rows.length < 2) return [];
    
    const headers = rows[0];
    const leads = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const lead = {};
      headers.forEach((h, idx) => {
        const key = h.toLowerCase().trim().replace(/\s+/g, '_');
        lead[key] = row[idx] !== undefined ? row[idx] : null;
      });
      leads.push(normalizeLead(lead));
    }
    
    return leads;
  } catch (e) {
    console.error('❌ Sheets fetch error:', e.message);
    return null;
  }
}

// Normalize field names and types
function normalizeLead(raw) {
  const l = {};
  
  // Field name mapping (support various header naming conventions)
  const fieldMap = {
    'business_name': ['business_name', 'nama_usaha', 'nama_bisnis', 'business', 'name'],
    'segment': ['segment', 'kategori', 'category'],
    'cluster': ['cluster', 'area', 'wilayah'],
    'kelurahan': ['kelurahan', 'desa'],
    'address': ['address', 'alamat', 'location', 'lokasi'],
    'phone_primary': ['phone_primary', 'phone', 'telepon', 'no_hp', 'hp', 'whatsapp', 'wa'],
    'phone_all': ['phone_all', 'phones', 'all_phones'],
    'email': ['email', 'e-mail', 'mail'],
    'current_provider': ['current_provider', 'provider', 'isp'],
    'pain_point': ['pain_point', 'pain', 'problem', 'keluhan'],
    'sales_signal': ['sales_signal', 'signal', 'status', 'hot_warm_cold'],
    'pipeline_stage': ['pipeline_stage', 'stage', 'funnel'],
    'next_action': ['next_action', 'action', 'follow_up'],
    'next_action_date': ['next_action_date', 'follow_up_date', 'due_date'],
    'pic_owner': ['pic_owner', 'pic', 'owner', 'sales'],
    'visit_status': ['visit_status', 'visited', 'sudah_dikunjungi', 'dikunjungi'],
    'est_mrc': ['est_mrc', 'mrc', 'revenue', 'estimasi'],
    'probability': ['probability', 'prob', 'chance'],
    'priority_score': ['priority_score', 'score', 'prioritas'],
    'pre_visit_priority': ['pre_visit_priority', 'pre_visit'],
    'internal_notes': ['internal_notes', 'notes', 'catatan'],
    'desk_notes': ['desk_notes', 'desk_research'],
    'lead_id': ['lead_id', 'id', 'no'],
    'latitude': ['latitude', 'lat'],
    'longitude': ['longitude', 'lng', 'lon'],
    'product_offered': ['product_offered', 'product', 'produk'],
    'preferred_channel': ['preferred_channel', 'channel'],
    'import_batch': ['import_batch', 'batch'],
    'source_url': ['source_url', 'source', 'url'],
    'discovery_keyword': ['discovery_keyword', 'keyword']
  };
  
  // Map fields
  for (const [target, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      if (raw[alias] !== undefined) {
        l[target] = raw[alias];
        break;
      }
    }
  }
  
  // Type conversions
  if (l.visit_status) {
    const v = String(l.visit_status).toLowerCase().trim();
    l.visit_status = (v === '1' || v === 'true' || v === 'yes' || v === 'sudah' || v === 'visited') ? 1 : 0;
  } else {
    l.visit_status = 0;
  }
  
  if (l.latitude) l.lat = parseFloat(l.latitude);
  if (l.longitude) l.lng = parseFloat(l.longitude);
  if (l.probability) l.probability = parseFloat(l.probability);
  if (l.priority_score) l.priority_score = parseFloat(l.priority_score);
  
  // Generate lead_id if missing
  if (!l.lead_id && l.business_name) {
    l.lead_id = l.business_name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40);
  }
  
  return l;
}

function getStats(leads) {
  if (!leads) return null;
  return {
    total: leads.length,
    visited: leads.filter(l => l.visit_status).length,
    notVisited: leads.filter(l => !l.visit_status).length,
    hot: leads.filter(l => l.sales_signal === 'HOT').length,
    warm: leads.filter(l => l.sales_signal === 'WARM').length,
    cold: leads.filter(l => l.sales_signal === 'COLD').length,
    drop: leads.filter(l => l.sales_signal === 'DROP').length,
    waAvailable: leads.filter(l => {
      const p = l.phone_primary || '';
      return p.match(/^(08|628|\+628)/);
    }).length,
    waSent: leads.filter(l => l.wa_sent).length,
    needActions: leads.filter(l => l.next_action && !l.visit_status).length,
    success: leads.filter(l => l.pipeline_stage?.match(/Success|Deal|Converted/i)).length
  };
}

module.exports = { initSheets, fetchLeads, getStats, SHEET_ID };
