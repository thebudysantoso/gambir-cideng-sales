const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3456;
const DB_PATH = path.join(__dirname, '../data/gambir_sales.db');

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

function getDb() {
  return new Database(DB_PATH);
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Stats dashboard
app.get('/api/stats', (req, res) => {
  const db = getDb();
  try {
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    const visited = db.prepare("SELECT COUNT(*) as count FROM leads WHERE visit_status = 1").get().count;
    const notVisited = db.prepare("SELECT COUNT(*) as count FROM leads WHERE visit_status = 0 OR visit_status IS NULL").get().count;
    const waAvailable = db.prepare("SELECT COUNT(*) as count FROM leads WHERE (phone_primary LIKE '08%' OR phone_primary LIKE '628%' OR phone_primary LIKE '+628%')").get().count;
    const waSent = db.prepare("SELECT COUNT(DISTINCT lead_id) as count FROM wa_outreach WHERE status = 'sent'").get().count;
    const needActions = db.prepare("SELECT COUNT(*) as count FROM leads WHERE visit_status = 1 AND pipeline_stage NOT LIKE '%Drop%' AND pipeline_stage NOT LIKE '%Lost%' AND (sales_signal IN ('HOT','WARM') OR (next_action IS NOT NULL AND next_action != ''))").get().count;
    const success = db.prepare("SELECT COUNT(*) as count FROM leads WHERE pipeline_stage LIKE '%Success%' OR pipeline_stage LIKE '%Deal%' OR pipeline_stage LIKE '%Converted%'").get().count;
    const openQueue = db.prepare("SELECT COUNT(*) as count FROM sales_queue WHERE status = 'open'").get().count;
    const waReplied = db.prepare("SELECT COUNT(*) as count FROM wa_outreach WHERE status = 'replied'").get().count;
    
    res.json({
      totalLeads, visited, notVisited, waAvailable, waSent, needActions, success,
      openQueue, waReplied
    });
  } finally {
    db.close();
  }
});

// List leads with filters
app.get('/api/leads', (req, res) => {
  const db = getDb();
  try {
    const { cluster, segment, stage, signal, search, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    
    if (cluster && cluster !== 'all') {
      sql += ' AND cluster = ?';
      params.push(cluster);
    }
    if (segment && segment !== 'all') {
      sql += ' AND segment = ?';
      params.push(segment);
    }
    if (stage && stage !== 'all') {
      sql += ' AND pipeline_stage = ?';
      params.push(stage);
    }
    if (signal && signal !== 'all') {
      sql += ' AND sales_signal = ?';
      params.push(signal);
    }
    if (search) {
      sql += ' AND (business_name LIKE ? OR address LIKE ? OR phone_primary LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    
    sql += ' ORDER BY priority_score DESC, sales_signal DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const leads = db.prepare(sql).all(...params);
    
    // Get counts for pagination
    let countSql = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    if (cluster && cluster !== 'all') { countSql += ' AND cluster = ?'; countParams.push(cluster); }
    if (segment && segment !== 'all') { countSql += ' AND segment = ?'; countParams.push(segment); }
    if (stage && stage !== 'all') { countSql += ' AND pipeline_stage = ?'; countParams.push(stage); }
    if (signal && signal !== 'all') { countSql += ' AND sales_signal = ?'; countParams.push(signal); }
    if (search) {
      countSql += ' AND (business_name LIKE ? OR address LIKE ? OR phone_primary LIKE ?)';
      const like = `%${search}%`;
      countParams.push(like, like, like);
    }
    const total = db.prepare(countSql).get(...countParams).total;
    
    res.json({ leads, total, limit: parseInt(limit), offset: parseInt(offset) });
  } finally {
    db.close();
  }
});

// Get single lead
app.get('/api/leads/:id', (req, res) => {
  const db = getDb();
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ? OR id = ?').get(req.params.id, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    // Get visits
    const visits = db.prepare('SELECT * FROM visits WHERE lead_id = ? ORDER BY visit_date DESC').all(lead.lead_id || lead.id);
    // Get WA outreach
    const waHistory = db.prepare('SELECT * FROM wa_outreach WHERE lead_id = ? ORDER BY created_at DESC').all(lead.lead_id || lead.id);
    // Get status history
    const statusHistory = db.prepare('SELECT * FROM status_history WHERE lead_id = ? ORDER BY changed_at DESC').all(lead.lead_id || lead.id);
    // Get queue item
    const queueItem = db.prepare("SELECT * FROM sales_queue WHERE lead_id = ? AND status = 'open'").get(lead.lead_id || lead.id);
    
    res.json({ ...lead, visits, waHistory, statusHistory, queueItem });
  } finally {
    db.close();
  }
});

// Update lead
app.patch('/api/leads/:id', (req, res) => {
  const db = getDb();
  try {
    const { pipeline_stage, next_action, sales_signal, current_provider, visit_status } = req.body;
    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ? OR id = ?').get(req.params.id, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const updates = [];
    const params = [];
    if (pipeline_stage) { updates.push('pipeline_stage = ?'); params.push(pipeline_stage); }
    if (next_action) { updates.push('next_action = ?'); params.push(next_action); }
    if (sales_signal) { updates.push('sales_signal = ?'); params.push(sales_signal); }
    if (current_provider) { updates.push('current_provider = ?'); params.push(current_provider); }
    if (visit_status !== undefined) { updates.push('visit_status = ?'); params.push(visit_status ? 1 : 0); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(lead.lead_id || lead.id);
    
    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE lead_id = ? OR id = ?`).run(...params, lead.lead_id || lead.id);
    
    // Log status change
    if (pipeline_stage && pipeline_stage !== lead.pipeline_stage) {
      db.prepare('INSERT INTO status_history (lead_id, old_status, new_status, changed_by, reason) VALUES (?, ?, ?, ?, ?)')
        .run(lead.lead_id || lead.id, lead.pipeline_stage, pipeline_stage, 'api', 'User updated via app');
    }
    
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// Get clusters/segments for filters
app.get('/api/filters', (req, res) => {
  const db = getDb();
  try {
    const clusters = db.prepare('SELECT DISTINCT cluster FROM leads WHERE cluster IS NOT NULL AND cluster != "" ORDER BY cluster').all().map(r => r.cluster);
    const segments = db.prepare('SELECT DISTINCT segment FROM leads WHERE segment IS NOT NULL AND segment != "" ORDER BY segment').all().map(r => r.segment);
    const stages = db.prepare('SELECT DISTINCT pipeline_stage FROM leads WHERE pipeline_stage IS NOT NULL AND pipeline_stage != "" ORDER BY pipeline_stage').all().map(r => r.pipeline_stage);
    const signals = db.prepare('SELECT DISTINCT sales_signal FROM leads WHERE sales_signal IS NOT NULL AND sales_signal != "" ORDER BY sales_signal').all().map(r => r.sales_signal);
    res.json({ clusters, segments, stages, signals });
  } finally {
    db.close();
  }
});

// Get sales queue
app.get('/api/queue', (req, res) => {
  const db = getDb();
  try {
    const { motion, status = 'open' } = req.query;
    let sql = `
      SELECT q.*, l.business_name, l.cluster, l.segment, l.phone_primary, l.current_provider, l.sales_signal
      FROM sales_queue q
      JOIN leads l ON q.lead_id = l.lead_id OR q.lead_id = l.id
      WHERE q.status = ?
    `;
    const params = [status];
    if (motion) {
      sql += ' AND q.sales_motion = ?';
      params.push(motion);
    }
    sql += ' ORDER BY q.created_at DESC';
    const items = db.prepare(sql).all(...params);
    res.json({ queue: items });
  } finally {
    db.close();
  }
});

// Log visit with optional photo
app.post('/api/visits', upload.single('photo'), (req, res) => {
  const db = getDb();
  try {
    const { lead_id, agent_name, outcome, provider_identified, contact_captured, contact_name, pain_noted, next_action, next_action_date, notes, gps_lat, gps_lng } = req.body;
    const photo_path = req.file ? '/uploads/' + req.file.filename : null;
    
    const result = db.prepare(`
      INSERT INTO visits (lead_id, agent_name, visit_date, visit_time, outcome, provider_identified, contact_captured, contact_name, pain_noted, next_action, next_action_date, notes, photo_path, gps_lat, gps_lng)
      VALUES (?, ?, date('now'), time('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lead_id, agent_name || 'Unknown', outcome, provider_identified || null, contact_captured || null, contact_name || null, pain_noted || null, next_action || null, next_action_date || null, notes || null, photo_path, gps_lat || null, gps_lng || null);
    
    // Update lead fields based on visit outcome
    const updates = ['visit_status = 1'];
    const uParams = [];
    if (provider_identified) { updates.push('current_provider = ?'); uParams.push(provider_identified); }
    if (contact_captured) { updates.push('phone_primary = ?'); uParams.push(contact_captured); }
    if (contact_name) { updates.push('pic_owner = ?'); uParams.push(contact_name); }
    if (next_action) { updates.push('next_action = ?'); uParams.push(next_action); }
    if (next_action_date) { updates.push('next_action_date = ?'); uParams.push(next_action_date); }
    if (outcome === 'interested' || outcome === 'asked_proposal') { updates.push('sales_signal = ?'); uParams.push('HOT'); }
    else if (outcome === 'has_internet' || outcome === 'need_revisit') { updates.push('sales_signal = ?'); uParams.push('WARM'); }
    else if (outcome === 'not_interested' || outcome === 'drop' || outcome === 'business_closed') { updates.push('sales_signal = ?'); uParams.push('COLD'); updates.push('pipeline_stage = ?'); uParams.push('Drop'); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    uParams.push(lead_id, lead_id);
    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE lead_id = ? OR id = ?`).run(...uParams);
    
    res.json({ success: true, visitId: result.lastInsertRowid, photo: photo_path });
  } finally {
    db.close();
  }
});

// Log WA outreach
app.post('/api/wa-outreach', (req, res) => {
  const db = getDb();
  try {
    const { lead_id, message_template, message_text, sent_by, status = 'draft' } = req.body;
    
    const result = db.prepare(`
      INSERT INTO wa_outreach (lead_id, message_template, message_text, sent_by, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(lead_id, message_template, message_text, sent_by, status);
    
    res.json({ success: true, outreachId: result.lastInsertRowid });
  } finally {
    db.close();
  }
});

// Update WA outreach status
app.patch('/api/wa-outreach/:id', (req, res) => {
  const db = getDb();
  try {
    const { status, response_text } = req.body;
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (response_text) { updates.push('response_text = ?'); params.push(response_text); }
    if (status === 'sent') { updates.push('sent_at = CURRENT_TIMESTAMP'); }
    if (status === 'replied') { updates.push('response_at = CURRENT_TIMESTAMP'); }
    params.push(req.params.id);
    
    db.prepare(`UPDATE wa_outreach SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// Generate WhatsApp message
app.post('/api/generate-wa', (req, res) => {
  const db = getDb();
  try {
    const { lead_id, template_type } = req.body;
    const lead = db.prepare('SELECT * FROM leads WHERE lead_id = ? OR id = ?').get(lead_id, lead_id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const contact = lead.phone_primary || lead.phone_all || '';
    const business = lead.business_name;
    const cluster = lead.cluster || 'area ini';
    const nama = (lead.contact_name || lead.contact_captured || 'Bapak/Ibu').split(' ')[0] || 'Bapak/Ibu';
    const segment = (lead.segment || '').toLowerCase();
    const provider = (lead.current_provider || '').toLowerCase();
    
    // Safe templates — main aman, no overpromise
    const templates = {
      observer: {
        name: 'The Observer',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Kami sering lewat area ${cluster} dan notice banyak bisnis masih pakai koneksi rumahan untuk operasional. Padahal untuk bisnis, ada layanan khusus dengan dukungan teknis 24 jam dan jaminan lebih stabil. Bisa kami cek apakah ${business} sudah pakai layanan bisnis atau masih layanan rumahan? Gratis, nggak ada kewajiban. 🙏`
      },
      insider: {
        name: 'The Insider',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Bulan ini ada program pemasangan baru untuk bisnis di area ${cluster} dengan biaya pasang lebih ringan. Paket internet bisnis mulai Rp320rb/bulan, unlimited tanpa batasan. Kalau ${business} tertarik cek ketersediaan, bisa reply WA ini. 🙏`
      },
      problem_solver: {
        name: 'The Problem Solver',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Untuk bisnis di area ${cluster}, koneksi stabil penting buat kelancaran transaksi harian — terutama yang pakai QRIS atau order online. Indibiz pakai fiber dengan upload-download 1:1, jadi upload juga kencang. Bisa kami bantu cek jaringan di lokasi ${business}? 🙏`
      },
      social_proof: {
        name: 'The Social Proof',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Beberapa bisnis di sekitar ${cluster} yang kami bantu bulan lalu merasa lebih tenang operasionalnya setelah pakai koneksi khusus bisnis. Kalau ${business} mau lihat perbandingan paket, saya bisa kirim via WA. 🙏`
      },
      minimalist: {
        name: 'The Minimalist',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Kami punya layanan internet khusus bisnis di area ${cluster}, mulai Rp320rb/bulan unlimited. Mau saya kirimkan detail paketnya? 🙏`
      },
      fnb: {
        name: 'F&B Specific',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Untuk resto/cafe di area ${cluster}, koneksi stabil itu penting — QRIS, order online, dan komunikasi dengan driver ojek. Indibiz pakai fiber dengan upload-download 1:1, jadi semua lancar. Bisa kami cek jaringan di ${business}? 🙏`
      },
      kantor: {
        name: 'Kantor/Professional',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Untuk kantor di area ${cluster}, koneksi bisnis dengan SLA lebih cepat dan upload-download 1:1 itu penting — terutama buat video call dan kirim file besar. Bisa kami cek ketersediaan jaringan untuk ${business}? 🙏`
      },
      migration: {
        name: 'Migration',
        text: `Halo ${nama}. Kami dari Indibiz Telkom Area Jakarta Pusat. Kami lihat ${business} sudah terpasang internet. Kalau ada keluhan lambat atau biaya bulanan naik, Indibiz punya paket khusus bisnis unlimited tanpa FUP dengan upload-download 1:1. Bisa kami bantu bandingkan paket saat ini? 🙏`
      }
    };
    
    // Auto-select template if not specified
    let selected = template_type;
    if (!selected || !templates[selected]) {
      if (segment.includes('restoran') || segment.includes('cafe') || segment.includes('f&b') || segment.includes('warung') || segment.includes('food')) {
        selected = 'fnb';
      } else if (segment.includes('klinik') || segment.includes('apotek') || segment.includes('rumah sakit')) {
        selected = 'problem_solver'; // klinik pakai problem solver
      } else if (segment.includes('kantor') || segment.includes('jasa') || segment.includes('consultant')) {
        selected = 'kantor';
      } else if (provider.includes('indihome') || provider.includes('biznet') || provider.includes('myrepublic') || provider.includes('first media')) {
        selected = 'migration';
      } else if (lead.visit_status === 1) {
        selected = 'social_proof';
      } else {
        selected = 'observer'; // default paling aman
      }
    }
    
    const template = templates[selected] || templates.observer;
    const message = template.text;
    
    // Save to wa_outreach as draft
    const result = db.prepare(`
      INSERT INTO wa_outreach (lead_id, message_template, message_text, sent_by, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(lead_id, template.name, message, 'system', 'draft');
    
    res.json({
      lead_id,
      template_name: template.name,
      template_key: selected,
      message,
      contact,
      business,
      wa_link: contact ? `https://wa.me/${contact.replace(/\D/g, '')}?text=${encodeURIComponent(message)}` : null,
      outreach_id: result.lastInsertRowid
    });
  } finally {
    db.close();
  }
});

// List available WhatsApp templates
app.get('/api/whatsapp-templates', (req, res) => {
  res.json({
    templates: [
      { key: 'observer', name: 'The Observer', desc: 'Paling aman, untuk lead baru atau status tidak jelas' },
      { key: 'insider', name: 'The Insider', desc: 'Promo approach, ada urgency' },
      { key: 'problem_solver', name: 'The Problem Solver', desc: 'Fokus masalah operasional, untuk F&B/retail' },
      { key: 'social_proof', name: 'The Social Proof', desc: 'Referensi dari tetangga' },
      { key: 'minimalist', name: 'The Minimalist', desc: 'Singkat, untuk follow-up' },
      { key: 'fnb', name: 'F&B Specific', desc: 'Khusus resto/cafe/warung' },
      { key: 'kantor', name: 'Kantor/Professional', desc: 'Khusus kantor/jasa profesional' },
      { key: 'migration', name: 'Migration', desc: 'Untuk yang sudah punya internet kompetitor' }
    ]
  });
});

// Get map data (leads with coordinates or cluster-based approximations)
app.get('/api/map-data', (req, res) => {
  const db = getDb();
  try {
    // For now, return all leads with cluster-based approximate coordinates
    // In production, you'd geocode addresses
    const clusterCoords = {
      'Pecenongan': { lat: -6.1675, lng: 106.8235 },
      'Harmoni/Majapahit/Suryopranoto': { lat: -6.1600, lng: 106.8200 },
      'Petojo-Cideng': { lat: -6.1650, lng: 106.8150 },
      'Gambir–Cideng': { lat: -6.1750, lng: 106.8250 },
      'Atrium Senen': { lat: -6.1800, lng: 106.8400 },
      'Pasar Baru': { lat: -6.1700, lng: 106.8350 },
      'Gajah Mada–Hayam Wuruk–Harmoni hotel corridor': { lat: -6.1550, lng: 106.8200 },
      'Gambir office-commercial strip': { lat: -6.1800, lng: 106.8250 },
      'ITC Roxy Mas / Roxy cluster': { lat: -6.1900, lng: 106.8000 },
      'Senen': { lat: -6.1850, lng: 106.8450 }
    };
    
    const leads = db.prepare('SELECT lead_id, business_name, segment, cluster, address, phone_primary, pipeline_stage, sales_signal, current_provider, lat, lng FROM leads WHERE business_name IS NOT NULL').all();
    
    const mapPoints = leads.map(l => {
      const coords = clusterCoords[l.cluster] || { lat: -6.17 + (Math.random() * 0.04 - 0.02), lng: 106.82 + (Math.random() * 0.04 - 0.02) };
      return {
        id: l.lead_id,
        name: l.business_name,
        segment: l.segment,
        cluster: l.cluster,
        address: l.address,
        phone: l.phone_primary,
        stage: l.pipeline_stage,
        signal: l.sales_signal,
        provider: l.current_provider,
        lat: l.lat || coords.lat + (Math.random() * 0.002 - 0.001),
        lng: l.lng || coords.lng + (Math.random() * 0.002 - 0.001)
      };
    });
    
    res.json({ points: mapPoints });
  } finally {
    db.close();
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gambir-Cideng Sales Command Center running on port ${PORT}`);
  console.log(`📱 Open http://0.0.0.0:${PORT} on your device`);
  console.log(`💻 Or http://$(hostname -I | awk '{print $1}'):${PORT} from local network`);
});
