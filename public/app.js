const API = '/api';
const USE_SHEETS = true; // Toggle: true = Google Sheets, false = SQLite
let allLeads = [];
let currentLeads = [];
let currentLead = null;
let page = 0;
const perPage = 25;
let map = null;
let markers = [];

// Init
async function init() {
  await loadStats();
  await loadFilters();
  await loadLeads();
  await loadQueue();
  initMap();
}

// Stats
async function loadStats() {
  try {
    const endpoint = USE_SHEETS ? `${API}/sheets/stats` : `${API}/stats`;
    const r = await fetch(endpoint);
    const s = await r.json();
    if (s.error) { console.warn('Stats error:', s.error); return; }
    document.getElementById('statTotal').textContent = s.total || s.totalLeads || 0;
    document.getElementById('statVisited').textContent = s.visited || 0;
    document.getElementById('statNotVisited').textContent = s.notVisited || (s.total - s.visited) || 0;
    document.getElementById('statWAAvailable').textContent = s.waAvailable || 0;
    document.getElementById('statWASent').textContent = s.waSent || 0;
    document.getElementById('statNeedActions').textContent = s.needActions || 0;
    document.getElementById('statSuccess').textContent = s.success || 0;
  } catch(e) { console.error('stats error', e); }
}

// Filters
async function loadFilters() {
  try {
    const endpoint = USE_SHEETS ? `${API}/sheets/leads` : `${API}/leads?limit=999`;
    const r = await fetch(endpoint);
    const data = await r.json();
    if (data.error) { console.warn('Filters error:', data.error); return; }
    allLeads = data.leads || [];
    // Normalize lat/lng field names for map markers
    allLeads.forEach(l => {
      if (l.lat !== undefined && l.latitude === undefined) l.latitude = l.lat;
      if (l.lng !== undefined && l.longitude === undefined) l.longitude = l.lng;
    });

    const clusters = [...new Set(allLeads.map(l => l.cluster).filter(Boolean))].sort();
    const segments = [...new Set(allLeads.map(l => l.segment).filter(Boolean))].sort();

    const cSel = document.getElementById('clusterFilter');
    clusters.forEach(c => cSel.add(new Option(c, c)));

    const sSel = document.getElementById('segmentFilter');
    segments.forEach(s => sSel.add(new Option(s, s)));
  } catch(e) { console.error('filters error', e); }
}

// Leads
async function loadLeads() {
  try {
    let leads = [];
    let total = 0;

    if (USE_SHEETS) {
      // Sheets mode: fetch all, filter client-side, paginate client-side
      const r = await fetch(`${API}/sheets/leads`);
      const data = await r.json();
      if (data.error) { console.warn('Sheets leads error:', data.error); return; }
      let all = data.leads || [];
      // Normalize lat/lng
      all.forEach(l => {
        if (l.lat !== undefined && l.latitude === undefined) l.latitude = l.lat;
        if (l.lng !== undefined && l.longitude === undefined) l.longitude = l.lng;
      });

      const cluster = document.getElementById('clusterFilter')?.value;
      const segment = document.getElementById('segmentFilter')?.value;
      const stage = document.getElementById('statusFilter')?.value;
      const search = document.getElementById('searchInput')?.value?.toLowerCase();

      if (cluster && cluster !== 'all') all = all.filter(l => l.cluster === cluster);
      if (segment && segment !== 'all') all = all.filter(l => l.segment === segment);
      if (stage && stage !== 'all') all = all.filter(l => l.pipeline_stage === stage);
      if (search) all = all.filter(l => (l.business_name + ' ' + (l.address||'') + ' ' + (l.phone_primary||'')).toLowerCase().includes(search));

      total = all.length;
      leads = all.slice(page * perPage, (page + 1) * perPage);
    } else {
      // SQLite mode: server-side filtering + pagination
      const params = new URLSearchParams();
      params.set('limit', perPage);
      params.set('offset', page * perPage);

      const cluster = document.getElementById('clusterFilter')?.value;
      const segment = document.getElementById('segmentFilter')?.value;
      const stage = document.getElementById('statusFilter')?.value;
      const search = document.getElementById('searchInput')?.value;

      if (cluster && cluster !== 'all') params.set('cluster', cluster);
      if (segment && segment !== 'all') params.set('segment', segment);
      if (stage && stage !== 'all') params.set('stage', stage);
      if (search) params.set('search', search);

      const r = await fetch(`${API}/leads?${params}`);
      const data = await r.json();
      leads = data.leads || [];
      total = data.total || 0;
    }

    currentLeads = leads;
    currentLeads.forEach(l => {
      if (l.lat !== undefined && l.latitude === undefined) l.latitude = l.lat;
      if (l.lng !== undefined && l.longitude === undefined) l.longitude = l.lng;
    });
    renderLeads(currentLeads);
    renderPagination(total);
  } catch(e) { console.error('leads error', e); }
}

function getLeadStatus(l) {
  if (l.pipeline_stage?.match(/Success|Deal|Converted/i)) return { cls: 'badge-success', text: 'SUKSES', color: '#00C853' };
  if (l.sales_signal === 'DROP' || l.pipeline_stage?.match(/Drop|Lost/i)) return { cls: 'badge-drop', text: 'DROP', color: '#6B7280' };
  // VISITED takes priority — always green
  if (l.visit_status) {
    const needAction = l.sales_signal === 'HOT' || l.sales_signal === 'WARM' || l.next_action;
    return { cls: 'badge-visited', text: needAction ? 'DIKUNJUNGI · TINDAKAN' : 'DIKUNJUNGI', color: '#00C853' };
  }
  if (l.sales_signal === 'HOT' || l.next_action) return { cls: 'badge-need-actions', text: 'BUTUH TINDAKAN', color: '#FF1744' };
  if (l.sales_signal === 'WARM') return { cls: 'badge-warm', text: 'WARM', color: '#FFAB00' };
  const mobile = l.phone_primary?.match(/^(08|628|\+628)/);
  if (mobile) return { cls: 'badge-wa-available', text: 'BISA WA', color: '#2979FF' };
  return { cls: 'badge-not-visited', text: 'BELUM', color: '#9CA3AF' };
}

function renderLeads(leads) {
  const el = document.getElementById('leadsList');
  if (!el) { console.error('leadsList element not found'); return; }
  if (!leads.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#9aa0a6">Tidak ada lead ditemukan</div>';
    return;
  }
  el.innerHTML = leads.map(l => {
    const st = getLeadStatus(l);
    const phone = l.phone_primary || l.phone_all?.split(',')[0] || '';
    const statusKey = st.cls.replace('badge-','').replace('need-actions','HOT');
    return `
      <div class="lead-card" data-status="${statusKey}" onclick="openLead('${l.lead_id}')">
        <div class="lead-header">
          <div class="lead-name">${escapeHtml(l.business_name)}</div>
          <div class="lead-badges">
            <span class="badge ${st.cls}">${st.text}</span>
          </div>
        </div>
        <div class="lead-meta">
          <span>📍 ${escapeHtml(l.cluster || 'Tidak diketahui')}</span>
          <span>🏷️ ${escapeHtml(l.segment || 'Tidak diketahui')}</span>
          ${l.current_provider ? `<span>📡 ${escapeHtml(l.current_provider)}</span>` : ''}
          ${phone ? `<span>📞 ${escapeHtml(phone)}</span>` : ''}
        </div>
        <div class="lead-actions" onclick="event.stopPropagation()">
          ${phone ? `<a href="https://wa.me/${formatWA(phone)}" target="_blank" class="btn-small btn-wa">WA</a>` : ''}
          ${phone ? `<a href="tel:${phone}" class="btn-small btn-call">Telepon</a>` : ''}
          ${l.lat ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}" target="_blank" class="btn-small btn-maps">Maps</a>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination(total) {
  const pages = Math.ceil(total / perPage);
  const el = document.getElementById('pageInfo');
  if (!el) return;
  if (pages <= 1) { el.innerHTML = 'Halaman 1'; return; }

  let html = '';
  for (let i = 0; i < pages; i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="goPage(${i})">${i + 1}</button>`;
  }
  el.innerHTML = html;
}

function goPage(p) { 
  if (p < 0) p = 0;
  page = p; 
  loadLeads(); 
}
function filterLeads() { page = 0; loadLeads(); }
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clusterFilter').value = 'all';
  document.getElementById('segmentFilter').value = 'all';
  document.getElementById('statusFilter').value = 'all';
  page = 0; loadLeads();
}
function toggleSearch() {
  document.getElementById('searchPanel').classList.toggle('hidden');
}

// Lead Detail
async function openLead(id) {
  try {
    const r = await fetch(`${API}/leads/${id}`);
    const lead = await r.json();
    currentLead = lead;

    document.getElementById('modalTitle').textContent = lead.business_name;
    document.getElementById('modalBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-label">Segmen</span><span class="detail-value">${escapeHtml(lead.segment || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Cluster</span><span class="detail-value">${escapeHtml(lead.cluster || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Kelurahan</span><span class="detail-value">${escapeHtml(lead.kelurahan || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Alamat</span><span class="detail-value">${escapeHtml(lead.address || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Telepon</span><span class="detail-value">${lead.phone_primary ? `<a href="tel:${lead.phone_primary}">${escapeHtml(lead.phone_primary)}</a>` : '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${lead.email ? `<a href="mailto:${lead.email}">${escapeHtml(lead.email)}</a>` : '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Provider</span><span class="detail-value">${escapeHtml(lead.current_provider || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Pain Point</span><span class="detail-value">${escapeHtml(lead.pain_point || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Sinyal Sales</span><span class="detail-value" style="color:${lead.sales_signal==='HOT'?'#ea4335':lead.sales_signal==='WARM'?'#fbbc04':'#5f6368'}">${escapeHtml(lead.sales_signal || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Pipeline</span><span class="detail-value">${escapeHtml(lead.pipeline_stage || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Tindakan Selanjutnya</span><span class="detail-value">${escapeHtml(lead.next_action || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">PIC</span><span class="detail-value">${escapeHtml(lead.pic_owner || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Estimasi MRC</span><span class="detail-value">${escapeHtml(lead.est_mrc || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">Skor Prioritas</span><span class="detail-value">${lead.priority_score || 0}</span></div>
        <div class="detail-row"><span class="detail-label">Catatan Internal</span><span class="detail-value">${escapeHtml(lead.internal_notes || '-')}</span></div>
      </div>
    `;
    document.getElementById('leadModal').classList.remove('hidden');
  } catch(e) { console.error('openLead error', e); }
}

function closeModal() { document.getElementById('leadModal').classList.add('hidden'); }
function openMaps() {
  if (currentLead?.lat) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentLead.lat},${currentLead.lng}`, '_blank');
  }
}

// WhatsApp
function generateWA() {
  if (!currentLead) return;
  document.getElementById('leadModal').classList.add('hidden');
  updateWAMessage();
  document.getElementById('waModal').classList.remove('hidden');
}

function closeWAModal() { document.getElementById('waModal').classList.add('hidden'); }

async function updateWAMessage() {
  if (!currentLead) return;
  const templateType = document.getElementById('waTemplate').value;
  try {
    const r = await fetch(`${API}/generate-wa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: currentLead.lead_id || currentLead.id, template_type: templateType })
    });
    const data = await r.json();
    if (data.message) {
      document.getElementById('waMessage').value = data.message;
      const phone = (currentLead.phone_primary || currentLead.phone_all || '').replace(/\D/g, '');
      const waLink = phone ? `https://wa.me/62${phone.replace(/^0/, '')}?text=${encodeURIComponent(data.message)}` : '#';
      document.getElementById('waLink').href = waLink;
    }
  } catch(e) { console.error('updateWAMessage error', e); }
}

function copyWA() {
  const msg = document.getElementById('waMessage').value;
  navigator.clipboard.writeText(msg).then(() => {
    alert('Disalin ke clipboard!');
  });
}

async function markWASent() {
  if (!currentLead) return;
  try {
    const r = await fetch(`${API}/wa-outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: currentLead.lead_id || currentLead.id,
        message_text: document.getElementById('waMessage').value,
        sent_by: 'agent',
        status: 'sent'
      })
    });
    const data = await r.json();
    if (data.success) {
      alert('WA ditandai terkirim!');
      closeWAModal();
      loadStats();
    }
  } catch(e) { console.error('markWASent error', e); }
}

function openVisit() {
  if (!currentLead) return;
  window.open(`visit.html?id=${currentLead.lead_id || currentLead.id}`, '_blank');
}

// Map
function initMap() {
  if (map) return;
  map = L.map('mapContainer').setView([-6.18, 106.83], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(map);
  renderMapMarkers();
  addMapLegend();
}

function addMapLegend() {
  document.querySelectorAll('.leaflet-legend').forEach(el => el.remove());
  const legend = L.control({position: 'bottomright'});
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'leaflet-legend');
    div.innerHTML = `
      <div style="background:#fff;padding:12px 14px;border-radius:12px;border:2px solid #D30000;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;font-weight:700;color:#1A1A2E;min-width:180px;">
        <div style="margin-bottom:8px;font-weight:800;color:#D30000;font-size:14px;">Keterangan</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#9CA3AF;display:inline-block;"></span> Belum</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#2979FF;display:inline-block;"></span> Bisa WA</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#00C853;display:inline-block;"></span> Dikunjungi</div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#00C853;border:2px solid #FF1744;display:inline-block;box-sizing:border-box;"></span> Dikunjungi + Perlu Tindakan</div>
      </div>
    `;
    return div;
  };
  legend.addTo(map);
}

function getMapMarkerStyle(l) {
  // Visited = green, with red border if needs action
  if (l.visit_status) {
    const needAction = l.sales_signal === 'HOT' || l.sales_signal === 'WARM' || l.next_action;
    return {
      fillColor: '#00C853',
      color: needAction ? '#FF1744' : '#fff',
      weight: needAction ? 3 : 2,
      radius: needAction ? 8 : 6
    };
  }
  // Has mobile phone = blue (WA available)
  const mobile = l.phone_primary?.match(/^(08|628|\+628)/);
  if (mobile) {
    return { fillColor: '#2979FF', color: '#fff', weight: 2, radius: 6 };
  }
  // Default = grey (Belum)
  return { fillColor: '#9CA3AF', color: '#fff', weight: 2, radius: 6 };
}

function renderMapMarkers() {
  if (!map || !allLeads.length) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  allLeads.forEach(l => {
    if (!l.lat || !l.lng) return;
    const style = getMapMarkerStyle(l);
    const marker = L.circleMarker([l.lat, l.lng], {
      radius: style.radius,
      fillColor: style.fillColor,
      color: style.color,
      weight: style.weight,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(l.business_name)}</b><br>${escapeHtml(l.cluster || '')}<br>${escapeHtml(l.segment || '')}<br>${l.phone_primary ? '📞 ' + escapeHtml(l.phone_primary) : ''}`);
    marker.on('click', () => openLead(l.lead_id));
    markers.push(marker);
  });
}

// Queue
async function loadQueue() {
  try {
    const r = await fetch(`${API}/queue`);
    const data = await r.json();
    const el = document.getElementById('queueList');
    if (!data.queue?.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:#9aa0a6">Tidak ada tindakan terbuka</div>';
      return;
    }
    el.innerHTML = data.queue.map(q => `
      <div class="lead-card" onclick="openLead('${q.lead_id}')">
        <div class="lead-header">
          <div class="lead-name">${escapeHtml(q.lead_id)}</div>
          <span class="badge ${q.channel === 'WhatsApp' ? 'badge-hot' : q.channel === 'Call' ? 'badge-warm' : 'badge-visited'}">${q.channel || 'Tindakan'}</span>
        </div>
        <div class="lead-meta">
          <span>🎯 ${escapeHtml(q.sales_motion || '')}</span>
          <span>📦 ${escapeHtml(q.recommended_product || '')}</span>
          <span>📅 ${escapeHtml(q.deadline || 'SEGERA')}</span>
        </div>
        <div style="font-size:12px;color:#5f6368;margin-top:6px">${escapeHtml(q.priority_reason || '')}</div>
      </div>
    `).join('');
  } catch(e) { console.error('queue error', e); }
}

// Tabs
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
}

// Utils
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatWA(phone) {
  return String(phone).replace(/[^0-9]/g, '').replace(/^0/, '62');
}
function refreshData() {
  loadStats(); loadLeads(); loadQueue();
  const btn = event.target;
  btn.style.animation = 'spin 1s';
  setTimeout(() => btn.style.animation = '', 1000);
}

// Init on load
init();