const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/gambir_sales.db');

function setupDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Leads table - core customer data
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT UNIQUE,
      business_name TEXT NOT NULL,
      segment TEXT,
      cluster TEXT,
      kelurahan TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      phone_primary TEXT,
      phone_all TEXT,
      email TEXT,
      preferred_channel TEXT,
      current_provider TEXT,
      pain_point TEXT,
      sales_signal TEXT,
      pipeline_stage TEXT DEFAULT 'Not Contacted',
      product_offered TEXT,
      est_mrc TEXT,
      probability REAL DEFAULT 0,
      priority_score REAL DEFAULT 0,
      pre_visit_priority TEXT,
      next_action TEXT,
      next_action_date TEXT,
      pic_owner TEXT,
      internal_notes TEXT,
      desk_notes TEXT,
      source_url TEXT,
      discovery_keyword TEXT,
      import_batch TEXT,
      visit_status INTEGER DEFAULT 0,
      claimed_by TEXT,
      claimed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Visit logs - field agent activity
  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      agent_name TEXT,
      visit_date TEXT,
      visit_time TEXT,
      outcome TEXT,
      provider_identified TEXT,
      contact_captured TEXT,
      contact_name TEXT,
      contact_role TEXT,
      pain_noted TEXT,
      next_action TEXT,
      next_action_date TEXT,
      notes TEXT,
      gps_lat REAL,
      gps_lng REAL,
      photo_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    )
  `);

  // WhatsApp outreach tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_outreach (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      message_template TEXT,
      message_text TEXT,
      sent_at TEXT,
      sent_by TEXT,
      status TEXT DEFAULT 'draft', -- draft, sent, delivered, read, replied, no_response
      response_text TEXT,
      response_at TEXT,
      follow_up_needed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    )
  `);

  // Lead status history
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      changed_by TEXT,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reason TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    )
  `);

  // Agents/technicians table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'field_agent',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sales queue / action items
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      sales_motion TEXT,
      recommended_product TEXT,
      recommended_pitch TEXT,
      channel TEXT,
      priority_reason TEXT,
      deadline TEXT,
      assigned_to TEXT,
      status TEXT DEFAULT 'open',
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id)
    )
  `);

  // Indexes for performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_cluster ON leads(cluster)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_segment ON leads(segment)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(pipeline_stage)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_signal ON leads(sales_signal)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_visits_lead ON visits(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_lead ON wa_outreach(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_queue_status ON sales_queue(status)`);

  console.log('✅ Database setup complete');
  console.log('📁 Database path:', DB_PATH);
  
  db.close();
}

setupDatabase();
