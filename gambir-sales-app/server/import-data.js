const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const DB_PATH = path.join(__dirname, '../data/gambir_sales.db');
const CSV_PATH = '/tmp/hitlist_master.csv';
const GEOCODE_PATH = '/tmp/geocode_full.json';

function importData() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('❌ CSV file not found:', CSV_PATH);
    console.log('Run the Google Sheet export first');
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  console.log(`📊 Parsed ${parsed.data.length} rows from CSV`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Load geocoded coordinates
  let geoMap = {};
  try {
    const geoData = JSON.parse(fs.readFileSync(GEOCODE_PATH, 'utf8'));
    for (const g of geoData) {
      geoMap[g.lead_id] = { lat: g.lat, lng: g.lng, score: g.score };
    }
    console.log(`📍 Loaded ${Object.keys(geoMap).length} geocoded coordinates`);
  } catch (e) {
    console.warn('⚠️ No geocode file found, proceeding without coordinates:', e.message);
  }

  // Clear existing leads for fresh import
  db.exec('DELETE FROM leads');

  const insert = db.prepare(`
    INSERT INTO leads (
      lead_id, business_name, segment, cluster, kelurahan, address,
      phone_primary, phone_all, email, preferred_channel,
      current_provider, pain_point, sales_signal, pipeline_stage,
      product_offered, est_mrc, probability, priority_score,
      pre_visit_priority, next_action, next_action_date, pic_owner,
      internal_notes, desk_notes, source_url, discovery_keyword,
      import_batch, visit_status, claimed_by, claimed_at,
      lat, lng
    ) VALUES (
      @lead_id, @business_name, @segment, @cluster, @kelurahan, @address,
      @phone_primary, @phone_all, @email, @preferred_channel,
      @current_provider, @pain_point, @sales_signal, @pipeline_stage,
      @product_offered, @est_mrc, @probability, @priority_score,
      @pre_visit_priority, @next_action, @next_action_date, @pic_owner,
      @internal_notes, @desk_notes, @source_url, @discovery_keyword,
      @import_batch, @visit_status, @claimed_by, @claimed_at,
      @lat, @lng
    )
    ON CONFLICT(lead_id) DO UPDATE SET
      business_name = excluded.business_name,
      segment = excluded.segment,
      cluster = excluded.cluster,
      pipeline_stage = excluded.pipeline_stage,
      current_provider = excluded.current_provider,
      sales_signal = excluded.sales_signal,
      next_action = excluded.next_action,
      lat = excluded.lat,
      lng = excluded.lng,
      updated_at = CURRENT_TIMESTAMP
  `);

  let imported = 0;
  let skipped = 0;

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      try {
        insert.run(row);
        imported++;
      } catch (e) {
        skipped++;
      }
    }
  });

  const rows = parsed.data
    .filter(r => {
      const name = (r['Business Name'] || '').trim();
      return name && name !== '' && name.toLowerCase() !== 'nan';
    })
    .map(r => {
      // Determine visit status from any field evidence
      const hasResult = (r['Result Category (Field Outcome)'] || '').trim() !== '';
      const hasNotes = (r['Field Notes Only'] || '').trim() !== '';
      const hasDetail = (r['Raw Field Detail Backup'] || '').trim() !== '';
      const hasTimestamp = (r['Visit Timestamp'] || '').trim() !== '';
      const visitStatus = (hasResult || hasNotes || hasDetail || hasTimestamp) ? 1 : 0;

      // Parse probability
      let prob = parseFloat(r['Probability']) || 0;
      if (prob > 1) prob = prob / 100;

      // Parse priority score
      let score = parseFloat(r['Total Score']) || 0;

      const leadId = String(r['Lead ID'] || '').trim();
      const geo = geoMap[leadId] || {};

      return {
        lead_id: leadId,
        business_name: (r['Business Name'] || '').trim(),
        segment: (r['Segment'] || '').trim(),
        cluster: (r['Cluster'] || '').trim(),
        kelurahan: (r['Kelurahan'] || '').trim(),
        address: (r['Address'] || '').trim(),
        phone_primary: (r['Existing Phone Primary'] || '').trim(),
        phone_all: (r['Existing Phone All'] || '').trim(),
        email: (r['Existing Email'] || '').trim(),
        preferred_channel: (r['Preferred Channel'] || '').trim(),
        current_provider: (r['Current Provider'] || '').trim(),
        pain_point: (r['Pain Point'] || '').trim(),
        sales_signal: (r['Sales Signal'] || '').trim(),
        pipeline_stage: (r['Pipeline Stage'] || 'Not Contacted').trim(),
        product_offered: (r['Product Offered'] || '').trim(),
        est_mrc: (r['Est. MRC'] || '').trim(),
        probability: prob,
        priority_score: score,
        pre_visit_priority: (r['Pre-Visit Priority'] || '').trim(),
        next_action: (r['Next Action'] || '').trim(),
        next_action_date: (r['Next Action Date'] || '').trim(),
        pic_owner: (r['PIC Owner'] || '').trim(),
        internal_notes: (r['Internal Notes'] || '').trim(),
        desk_notes: (r['Desk Notes / Lead Rationale'] || '').trim(),
        source_url: (r['Source URL'] || '').trim(),
        discovery_keyword: (r['Discovery Keyword / Source Type'] || '').trim(),
        import_batch: (r['Import Batch'] || '').trim(),
        visit_status: visitStatus,
        claimed_by: (r['Claimed By'] || '').trim(),
        claimed_at: (r['Claimed At'] || '').trim(),
        lat: geo.lat || null,
        lng: geo.lng || null
      };
    });

  insertMany(rows);

  console.log(`✅ Imported ${imported} leads`);
  console.log(`⏭️ Skipped ${skipped} rows`);

  // Generate sales queue automatically
  generateSalesQueue(db);

  db.close();
}

function generateSalesQueue(db) {
  console.log('\n🎯 Generating sales queue...');

  db.exec('DELETE FROM sales_queue');

  const leads = db.prepare("SELECT * FROM leads WHERE visit_status = 1 OR sales_signal IN ('HOT', 'WARM')").all();

  const insertQueue = db.prepare(`
    INSERT INTO sales_queue (lead_id, sales_motion, recommended_product, recommended_pitch, channel, priority_reason, deadline, status)
    VALUES (@lead_id, @sales_motion, @recommended_product, @recommended_pitch, @channel, @priority_reason, @deadline, 'open')
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      try { insertQueue.run(item); } catch(e) {}
    }
  });

  const items = leads.map(l => {
    const result = (l.pipeline_stage + ' ' + l.sales_signal).toLowerCase();
    const provider = (l.current_provider || '').toLowerCase();
    const segment = (l.segment || '').toLowerCase();

    let motion = 'Call/visit to qualify';
    let product = 'IndiBiz Basic 50M';
    let pitch = 'Business continuity + faster internet + dedicated support';
    let channel = 'WhatsApp';
    let reason = 'Engaged lead, needs follow-up';

    // Proposal
    if (result.includes('proposal') || result.includes('minta')) {
      motion = 'Formal proposal follow-up';
      product = 'IndiBiz Basic 50M';
      pitch = 'Kirim proposal sesuai permintaan, follow-up 24-48 jam';
      channel = 'WhatsApp';
      reason = 'Requested formal proposal';
    }
    // Migration
    else if (provider.includes('biznet') || provider.includes('myrepublic') || provider.includes('first media') || provider.includes('mnc') || provider.includes('moratel')) {
      motion = 'Migration / replacement';
      product = 'IndiBiz Basic 50M (migration)';
      pitch = 'Backup line + SLA + Telkom network + non-FUP';
      channel = 'WhatsApp';
      reason = 'Using competitor, migration opportunity';
    }
    // Winback
    else if (provider.includes('ex-indihome') || result.includes('winback')) {
      motion = 'Migration / replacement';
      product = 'IndiBiz Bisnis 1:1 (winback)';
      pitch = 'Upgrade to business, SLA garansi, dedicated CPE';
      channel = 'Call';
      reason = 'Ex-customer, winback opportunity';
    }
    // IndiHome upgrade
    else if (provider.includes('indihome')) {
      motion = 'IndiHome upgrade';
      product = 'IndiBiz Bisnis 1:1 (upgrade)';
      pitch = 'Upgrade dari residential ke business, SLA garansi';
      channel = 'Call';
      reason = 'Current IndiHome customer, upgrade opportunity';
    }
    // Revisit
    else if (result.includes('revisit') || result.includes('follow-up') || result.includes('gatekeeper') || result.includes('titip brosur')) {
      motion = 'Revisit correct timing';
      product = 'IndiBiz Basic 50M';
      pitch = 'Return visit at correct time, bring brosur + survey form';
      channel = 'Visit';
      reason = 'Gatekeeper/timing blocked first attempt';
    }
    // Drop
    else if (result.includes('invalid') || result.includes('tutup') || result.includes('closed') || result.includes('pindah')) {
      motion = 'Drop / invalid';
      product = 'N/A';
      pitch = 'Archive lead';
      channel = 'None';
      reason = 'Invalid, moved, or closed business';
    }

    // Segment-specific product
    if (segment.includes('hotel') || segment.includes('kost')) {
      product = 'IndiBiz Basic 50M + extenders';
      pitch = 'WiFi tamu, booking online, multi-device, uptime';
    } else if (segment.includes('klinik') || segment.includes('apotek') || segment.includes('kesehatan')) {
      product = 'IndiBiz Basic 50M (operational continuity)';
      pitch = 'Operasional 24 jam, BPJS/PCare, multi-device, backup line';
    } else if (segment.includes('restoran') || segment.includes('cafe') || segment.includes('f&b')) {
      product = 'IndiBiz Basic 50M + QRIS bundle';
      pitch = 'QRIS, order online, kasir cloud, WiFi pelanggan';
    } else if (segment.includes('sekolah') || segment.includes('education')) {
      product = 'IndiBiz Basic 50M or 1:1';
      pitch = 'E-learning, ujian online, admin cloud, CCTV';
    } else if (segment.includes('logistik') || segment.includes('courier') || segment.includes('cargo')) {
      product = 'IndiBiz Bisnis 1:1 (reliability)';
      pitch = 'Tracking real-time, backup line, SLA garansi';
    }

    return {
      lead_id: l.lead_id,
      sales_motion: motion,
      recommended_product: product,
      recommended_pitch: pitch,
      channel: channel,
      priority_reason: reason,
      deadline: l.next_action_date || 'ASAP'
    };
  });

  insertMany(items);
  console.log(`✅ Generated ${items.length} sales queue items`);
}

importData();
