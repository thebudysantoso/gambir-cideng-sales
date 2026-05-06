function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const headers = parseLine(lines[0]);
  const rows = [];

  // Get SQLite DB for merging lat/lng and visit status
  const db = getDb();
  const sqliteLeads = {};
  if (db) {
    try {
      const all = db.prepare('SELECT business_name, lat, lng, visit_status, phone_primary, sales_signal, pipeline_stage FROM leads').all();
      all.forEach(l => { sqliteLeads[l.business_name] = l; });
    } catch (e) {}
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < 3) continue;
    const row = {};
    headers.forEach((h, j) => {
      const key = h.toLowerCase().trim().replace(/\s+/g, '_');
      row[key] = values[j] || '';
    });

    // Filter data sampah: skip empty business_name
    if (!row.business_name || !row.business_name.trim()) continue;

    // Normalize field names
    row.phone_primary = row.existing_phone_primary || row.phone_primary || '';
    row.phone_all = row.existing_phone_all || row.phone_all || '';
    row.email = row.existing_email || row.email || '';
    row.est_mrc = row['est._mrc'] || row.est_mrc || '';

    // Merge with SQLite data (geocoded lat/lng + visit status)
    const sqlite = sqliteLeads[row.business_name];
    if (sqlite) {
      if (sqlite.lat) row.lat = sqlite.lat;
      if (sqlite.lng) row.lng = sqlite.lng;
      if (sqlite.phone_primary) row.phone_primary = sqlite.phone_primary;
      row.visit_status = sqlite.visit_status === 1 ? 1 : 0;
      if (sqlite.sales_signal) row.sales_signal = sqlite.sales_signal;
      if (sqlite.pipeline_stage) row.pipeline_stage = sqlite.pipeline_stage;
    } else {
      // New lead from CSV: set visit_status from CSV string
      const vs = String(row.visit_status || '').toLowerCase().trim();
      row.visit_status = (vs === 'true' || vs === '1' || vs === 'yes' || vs === 'visited') ? 1 : 0;
    }

    // Add cluster-based lat/lng if still missing
    const cluster = row.cluster || '';
    const coords = clusterCoords[cluster];
    if (coords && !row.lat && !row.latitude) {
      row.lat = coords.lat + (Math.random() * 0.002 - 0.001);
      row.lng = coords.lng + (Math.random() * 0.002 - 0.001);
    }

    rows.push(row);
  }

  if (db) db.close();
  return rows;
}
