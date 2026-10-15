// ══════════════════════════════════════════════
// 🛰️ CORE DATABASE INITIALIZATION & STATE GLOBALS
// ══════════════════════════════════════════════
const SUPABASE_URL      = 'https://ebconnpnrssabyvdwrgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViY29ubnBucnNzYWJ5dmR3cmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTk2OTIsImV4cCI6MjA4ODc3NTY5Mn0.Oy2TVKjfsULidfS_esh-w6zuzRv2l_eX4pFkDfD1NyA';
const { createClient }  = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentRole = null;
let tickets = [];
let unitMachineMaster = [];
let plantUnits = [];
let realtimeChannel = null;
let pollingInterval = null;
let currentView = '';
let openModalTicketId = null;

// Analytics Dynamic Filters
let selectedAnalyticsUnit = 'ALL';
let analyticsStartDate = null;
let analyticsEndDate = null;
let costAnalyticsStartDate = null;
let costAnalyticsEndDate = null;
let downtimeModalStartDate = null;
let downtimeModalEndDate = null;
let costModalStartDate = null;
let costModalEndDate = null;

// Core Dynamic View Loader
async function loadView(viewName) {
  try {
    const res = await fetch(`features/${viewName}.html`);
    const html = await res.text();
    document.getElementById('view-mount-point').innerHTML = html;
    
    if(viewName === 'login-view') { 
      attachLoginKeyListeners();
    } else if(viewName === 'admin-view') {
      populatePlantUnitDropdowns();
      renderMachineMatrixView();
      if(currentView === 'admin-analytics') {
        requestAnimationFrame(() => setTimeout(executeAnalyticsDashboardGeneration, 100));
      }
    }
  } catch(e) { console.error("Layout mounting fault:", e); }
}

function attachLoginKeyListeners() {
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doLogin();
    }
  };

  const adminU = document.getElementById('admin-username');
  const adminP = document.getElementById('admin-password');
  if (adminU) adminU.addEventListener('keydown', handleEnter);
  if (adminP) adminP.addEventListener('keydown', handleEnter);
}

window.addEventListener('DOMContentLoaded', () => { loadView('login-view'); });

function toggleMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  } else {
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('active');
  }
}

// ══════════════════════════════════════════════
// 🔐 SINGLE HARDCODED ADMIN AUTHENTICATION
// ══════════════════════════════════════════════
async function doLogin(){
  const usernameInput = document.getElementById('admin-username')?.value.trim();
  const passwordInput = document.getElementById('admin-password')?.value;

  if (!usernameInput || !passwordInput) {
    showToast('Please enter both username and password', 'error');
    return;
  }

  function togglePasswordVisibility() {
    const pwdInput = document.getElementById('admin-password');
    const eyeIcon = document.getElementById('eye-icon');
    if (!pwdInput) return;
  
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      if (eyeIcon) {
        // Eye crossed out SVG
        eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
      }
    } else {
      pwdInput.type = 'password';
      if (eyeIcon) {
        // Standard open eye SVG
        eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
      }
    }
  }
  window.togglePasswordVisibility = togglePasswordVisibility;
  

  // Strictly authenticate admin with local credentials
  if (usernameInput.toLowerCase() === 'admin' && passwordInput === 'admin123') {
    currentUser = 'admin';
    currentRole = 'admin';

    await loadView('admin-view');
    currentView = 'admin-dashboard';
    await loadAllTickets();
    await loadPlantUnits();
    await loadUnitMachineMaster();
    subscribeRealtime();
    showToast('Signed in successfully as Administrator');
  } else {
    showToast('Invalid administrator credentials', 'error');
  }
}

function logout(){
  if(realtimeChannel){ try{ db.removeChannel(realtimeChannel); }catch(e){} realtimeChannel = null; }
  if(pollingInterval){ clearInterval(pollingInterval); pollingInterval = null; }
  currentUser = null; currentRole = null; 
  tickets = []; unitMachineMaster = []; plantUnits = []; currentView = ''; openModalTicketId = null;
  selectedAnalyticsUnit = 'ALL';
  analyticsStartDate = null; analyticsEndDate = null; costAnalyticsStartDate = null; costAnalyticsEndDate = null;
  downtimeModalStartDate = null; downtimeModalEndDate = null; costModalStartDate = null; costModalEndDate = null;
  loadView('login-view');
}

// ══════════════════════════════════════════════
// 🏢 PLANT UNITS & MACHINE MASTER SYNC
// ══════════════════════════════════════════════
async function loadPlantUnits() {
  const { data, error } = await db.from('plant_units').select('*').order('unit_name', { ascending: true });
  if (!error && data && data.length > 0) {
    plantUnits = data;
  } else {
    plantUnits = [
      { unit_name: 'Packfine', location: 'Main Plant Sector' },
      { unit_name: 'Well Pack', location: 'Sarsan Khopoli' },
      { unit_name: 'Wani', location: 'Wani Kelavli' }
    ];
  }
  populatePlantUnitDropdowns();
}

async function loadUnitMachineMaster() {
  const { data, error } = await db.from('unit_machine_master').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    unitMachineMaster = data;
  } else {
    unitMachineMaster = [];
  }
  renderMachineMatrixView();
}

function populatePlantUnitDropdowns() {
  const unitFilterAdmin = document.getElementById('a-filter-unit');
  if (unitFilterAdmin) {
    const currentFilter = unitFilterAdmin.value;
    unitFilterAdmin.innerHTML = '<option value="">🏢 All Plant Units</option>' + 
      plantUnits.map(u => `<option value="${u.unit_name}">${u.unit_name}</option>`).join('');
    if (currentFilter) unitFilterAdmin.value = currentFilter;
  }

  const unitAnalyticsSelector = document.getElementById('analytics-plant-unit-selector');
  if (unitAnalyticsSelector) {
    const currentAnalyticsUnit = unitAnalyticsSelector.value;
    unitAnalyticsSelector.innerHTML = '<option value="ALL">🏢 All Plant Units Combined</option>' + 
      plantUnits.map(u => `<option value="${u.unit_name}">${u.unit_name}</option>`).join('');
    if (currentAnalyticsUnit) unitAnalyticsSelector.value = currentAnalyticsUnit;
  }

  const unitCatModal = document.getElementById('cat-modal-unit-filter');
  if (unitCatModal) {
    const currentVal = unitCatModal.value;
    unitCatModal.innerHTML = '<option value="ALL">All Plant Units</option>' + 
      plantUnits.map(u => `<option value="${u.unit_name}">${u.unit_name}</option>`).join('');
    if (currentVal) unitCatModal.value = currentVal;
  }
}

// ══════════════════════════════════════════════
// 🛰️ DATA RETRIEVAL & REAL-TIME SYNC
// ══════════════════════════════════════════════
async function loadAllTickets(){
  let query = db.from('tickets_v2').select('*').order('created_at', { ascending: false });
  const { data, error } = await query;
  if(error){ showToast('DB error: ' + error.message, 'error'); return; }
  tickets = data || [];
  refreshAllUI();
}

function subscribeRealtime(){
  if(realtimeChannel){ try{ db.removeChannel(realtimeChannel); }catch(e){} realtimeChannel = null; }
  startPolling();
}

function startPolling(){
  if(pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    if(!currentRole) return;
    await loadAllTickets();
    await loadUnitMachineMaster();
    await loadPlantUnits();
  }, 5000);
}

function refreshAllUI(){
  refreshAdminData();
  if(currentView === 'admin-tickets')   renderAdminTickets();
  if(currentView === 'admin-machines')  renderMachineMatrixView();
  if(currentView === 'admin-analytics') renderAnalytics();
}

// ══════════════════════════════════════════════
// 📑 COLLABORATIVE INTERVENTION MODAL
// ══════════════════════════════════════════════
function viewTicket(id){
  const t = tickets.find(x => x.id === id);
  if(!t) return;
  openModalTicketId = id;

  let timeline = [];
  try { timeline = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : (t.timeline || []); } catch(e){}

  const unitOptions = plantUnits.length 
    ? plantUnits.map(u => `<option value="${u.unit_name}" ${t.unit_name === u.unit_name ? 'selected' : ''}>${u.unit_name}</option>`).join('')
    : `<option value="Packfine">Packfine</option><option value="Well Pack">Well Pack</option><option value="Wani">Wani</option>`;

  document.getElementById('modal-ticket-title').innerHTML = `<span class="ticket-id">${t.ticket_id}</span> &nbsp; ${t.machine_name || '—'} [${t.status}]`;
  document.getElementById('modal-ticket-body').innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
       <div class="form-group">
          <label>Plant Unit</label>
          <select id="md-unit">${unitOptions}</select>
       </div>
       <div class="form-group">
          <label>Ticket Category</label>
          <select id="md-category">
             <option value="Downtime" ${(t.ticket_category||'').toLowerCase().includes('down') ? 'selected' : ''}>Downtime</option>
             <option value="Preventive" ${(t.ticket_category||'').toLowerCase().includes('prev') ? 'selected' : ''}>Preventive Maintenance</option>
          </select>
       </div>
       <div class="form-group"><label>Machine Component</label><input type="text" id="md-comp" value="${t.machine_component||''}"></div>
       <div class="form-group"><label>Sub Component</label><input type="text" id="md-sub" value="${t.sub_component||''}"></div>
       <div class="form-group"><label>Failure Mode</label><input type="text" id="md-fail" value="${t.failure_mode||''}"></div>
       <div class="form-group"><label>Failure Reason in Detail</label><input type="text" id="md-reason" value="${t.maintenance_type||''}"></div>
       <div class="form-group"><label>Start Time</label><input type="time" id="md-start" value="${t.start_time||''}"></div>
       <div class="form-group"><label>End Time</label><input type="time" id="md-end" value="${t.end_time||''}"></div>
       <div class="form-group"><label>Production Loss</label><input type="text" id="md-loss" value="${t.production_loss||''}"></div>
       <div class="form-group"><label>Parts Used</label><input type="text" id="md-part" value="${t.part_used||''}"></div>
       <div class="form-group"><label>Parts Cost (₹)</label><input type="number" id="md-pcost" value="${t.parts_cost||0}"></div>
       <div class="form-group"><label>Labour Cost (₹)</label><input type="number" id="md-lcost" value="${t.labour_cost||0}"></div>
       <div class="form-group"><label>Next Maintenance Date</label><input type="date" id="md-pm" value="${t.next_pm_due||''}"></div>
       <div class="form-group">
          <label>Operational Status *</label>
          <select id="md-status">
             <option ${t.status==='Open'?'selected':''}>Open</option>
             <option ${t.status==='In Progress'?'selected':''}>In Progress</option>
             <option ${t.status==='Pending Spare Parts'?'selected':''}>Pending Spare Parts</option>
             <option ${t.status==='Resolved / Done'?'selected':''}>Resolved / Done</option>
          </select>
       </div>
    </div>
    <div class="form-group"><label>Action Taken Summary</label><textarea id="md-action" rows="2">${t.action_taken||''}</textarea></div>
    <div class="form-group"><label>Remarks / Notes</label><input type="text" id="md-remarks" value="${t.remarks||''}"></div>
    <div class="detail-section">
       <h4>Ticket Event Logs</h4>
       <small style="color:var(--text-muted)">Reported by: <strong>${t.reported_by || 'Unknown'}</strong> · Unit: <strong>${t.unit_name || 'Packfine'}</strong></small>
       <div class="timeline" style="margin-top:0.5rem;">
          ${timeline.map(e => `
            <div class="timeline-item">
              <div class="tl-dot ${e.color||'blue'}"></div>
              <div><div>${e.text}</div><div class="tl-time">${fmtDateFull(e.time)}</div></div>
            </div>`).join('')}
       </div>
    </div>
    <div style="text-align:right; margin-top:1rem;">
       <button class="btn btn-primary" style="width:auto;" onclick="saveTicketCollaborative('${t.id}')">💾 Save Changes</button>
    </div>`;
  openModal('modal-ticket');
}

async function saveTicketCollaborative(id) {
  const t = tickets.find(x => x.id === id);
  if(!t) return;

  const editorName = 'System Admin';
  const nextStatus = document.getElementById('md-status').value;
  const nextUnit = document.getElementById('md-unit').value;
  const nextCategory = document.getElementById('md-category').value;
  const nextAction = document.getElementById('md-action').value.trim();
  const start = document.getElementById('md-start').value;
  const end = document.getElementById('md-end').value;
  
  let mins = null;
  if(start && end) {
     const [sh, sm] = start.split(':').map(Number);
     const [eh, em] = end.split(':').map(Number);
     let sMins = sh * 60 + sm, eMins = eh * 60 + em;
     if(eMins < sMins) eMins += 24 * 60;
     mins = eMins - sMins;
  }

  let timeline = [];
  try { timeline = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : (t.timeline || []); } catch(e){}
  
  let structuralChangeLogged = false;

  if(t.status !== nextStatus) {
     timeline.push({ time: new Date().toISOString(), text: `Status updated to [${nextStatus}] by ${editorName}`, color: 'green' });
     structuralChangeLogged = true;
  }
  
  if(t.unit_name !== nextUnit) {
     timeline.push({ time: new Date().toISOString(), text: `Plant Unit transferred to [${nextUnit}] by ${editorName}`, color: 'yellow' });
     structuralChangeLogged = true;
  }

  if((t.action_taken || '').trim() !== nextAction) {
     const shortSummary = nextAction.length > 60 ? nextAction.substring(0, 57) + '...' : nextAction;
     timeline.push({ 
       time: new Date().toISOString(), 
       text: nextAction ? `Action details updated: "${shortSummary}" by ${editorName}` : `Action summary removed by ${editorName}`, 
       color: 'purple' 
     });
     structuralChangeLogged = true;
  }

  if(!structuralChangeLogged) {
     timeline.push({ time: new Date().toISOString(), text: `Modifications committed by ${editorName}`, color: 'yellow' });
  }

  const { error } = await db.from('tickets_v2').update({
    unit_name: nextUnit,
    ticket_category: nextCategory,
    machine_component: document.getElementById('md-comp').value,
    sub_component: document.getElementById('md-sub').value.trim(),
    failure_mode: document.getElementById('md-fail').value,
    maintenance_type: document.getElementById('md-reason').value.trim(),
    start_time: start,
    end_time: end || null,
    downtime: mins,
    production_loss: document.getElementById('md-loss').value.trim(),
    part_used: document.getElementById('md-part').value.trim(),
    parts_cost: parseFloat(document.getElementById('md-pcost').value || 0),
    labour_cost: parseFloat(document.getElementById('md-lcost').value || 0),
    status: nextStatus,
    next_pm_due: document.getElementById('md-pm').value || null,
    action_taken: nextAction,
    remarks: document.getElementById('md-remarks').value.trim(),
    timeline: JSON.stringify(timeline)
  }).eq('id', id);

  if(error) { showToast('Update fault: ' + error.message, 'error'); return; }
  
  showToast('Ticket record updated successfully!');
  closeModal('modal-ticket');
  await loadAllTickets();
}

function switchView(el){
  const vid = el.dataset.view; 
  currentView = vid;
  el.closest('.sidebar').querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  el.closest('.app-shell').querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  
  const targetView = document.getElementById('view-'+vid);
  if (targetView) targetView.classList.add('active');
  
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }

  if (vid === 'admin-analytics') {
    requestAnimationFrame(() => {
      setTimeout(executeAnalyticsDashboardGeneration, 100);
    });
  }

  if (vid === 'admin-machines') {
    renderMachineMatrixView();
  }
  
  refreshAllUI();
}

function filterAdminTickets() {
  const query = document.getElementById('a-search')?.value.toLowerCase().trim() || '';
  const selectedUnit = document.getElementById('a-filter-unit')?.value || '';
  const selectedCategory = document.getElementById('a-filter-cat')?.value || '';

  const filtered = tickets.filter(t => {
    const idMatch = t.ticket_id ? t.ticket_id.toLowerCase().includes(query) : false;
    const machineMatch = t.machine_name ? t.machine_name.toLowerCase().includes(query) : false;
    const componentMatch = t.machine_component ? t.machine_component.toLowerCase().includes(query) : false;
    const operatorMatch = t.reported_by ? t.reported_by.toLowerCase().includes(query) : false;
    const statusMatch = t.status ? t.status.toLowerCase().includes(query) : false;
    const textPass = !query || idMatch || machineMatch || componentMatch || operatorMatch || statusMatch;

    const unitPass = !selectedUnit || (t.unit_name && t.unit_name.toLowerCase() === selectedUnit.toLowerCase());
    const catPass = !selectedCategory || (t.ticket_category && t.ticket_category.toLowerCase().includes(selectedCategory.toLowerCase()));

    return textPass && unitPass && catPass;
  });

  renderAdminTickets(filtered);
}

function refreshAdminData(){
  if (!document.getElementById('a-stat-total')) return;

  const openCount      = tickets.filter(t => t.status === 'Open').length;
  const pendingParts   = tickets.filter(t => t.status === 'Pending Spare Parts').length;
  const inProgress     = tickets.filter(t => t.status === 'In Progress').length;
  const resolvedDone   = tickets.filter(t => t.status === 'Resolved / Done').length;

  document.getElementById('a-stat-total').textContent    = tickets.length;
  document.getElementById('a-stat-open').textContent     = openCount;
  document.getElementById('a-stat-received').textContent = pendingParts;
  document.getElementById('a-stat-inprog').textContent   = inProgress;
  document.getElementById('a-stat-critical').textContent = openCount + inProgress;
  document.getElementById('a-stat-nfix').textContent     = pendingParts;
  document.getElementById('a-stat-resolved').textContent = resolvedDone;
  document.getElementById('a-badge-open').textContent    = openCount + pendingParts + inProgress;

  const criticalTbody = document.getElementById('a-critical-tbody');
  if(criticalTbody) {
    const activeIssues = tickets.filter(t => t.status !== 'Resolved / Done');
    criticalTbody.innerHTML = activeIssues.length 
      ? activeIssues.slice(0, 5).map(t => `
          <tr onclick="viewTicket('${t.id}')" style="cursor:pointer">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td><strong>${t.machine_name || 'Unassigned'}</strong></td>
            <td>${t.reported_by ? t.reported_by.split(' ')[0] : '—'}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1rem">No critical running updates.</div></td></tr>';
  }

  const latestTbody = document.getElementById('a-latest-tbody');
  if(latestTbody) {
    latestTbody.innerHTML = tickets.length
      ? tickets.slice(0, 5).map(t => `
          <tr onclick="viewTicket('${t.id}')" style="cursor:pointer">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td>${t.machine_name || '—'}</td>
            <td>${t.unit_name || 'Packfine'}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1rem">No records registered.</div></td></tr>';
  }
}

function renderAdminTickets(list){
  const data = list || [...tickets];
  const adminTable = document.getElementById('a-tickets-tbody');
  if(!adminTable) return;

  adminTable.innerHTML = data.length 
    ? data.map(t => `<tr>
        <td><span class="ticket-id" onclick="viewTicket('${t.id}')" style="cursor:pointer; font-weight:600; color:var(--accent2);">${t.ticket_id}</span></td>
        <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${t.unit_name || 'Packfine'}</span></td>
        <td><span class="badge ${String(t.ticket_category||'').toLowerCase().includes('prev') ? 'badge-received' : 'badge-open'}">${t.ticket_category || 'Downtime'}</span></td>
        <td><strong>${t.machine_name || '—'}</strong></td>
        <td>${t.machine_component || '—'}</td>
        <td>${t.reported_by || '—'}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}')">Manage</button></td>
      </tr>`).join('')
    : '<tr><td colspan="9"><div class="empty-state">No matching tickets found.</div></td></tr>';
}

// ══════════════════════════════════════════════
// 🔧 READ-ONLY MACHINERY & COMPONENT MATRIX VIEW
// ══════════════════════════════════════════════
function renderMachineMatrixView() {
  const tbody = document.getElementById('a-machines-matrix-tbody');
  if (!tbody) return;

  tbody.innerHTML = unitMachineMaster.length
    ? unitMachineMaster.map(m => {
        let compArray = [];
        try {
          compArray = Array.isArray(m.components) ? m.components : (typeof m.components === 'string' ? JSON.parse(m.components) : []);
        } catch(e) {}

        let partsArray = [];
        try {
          partsArray = Array.isArray(m.spare_parts) ? m.spare_parts : (typeof m.spare_parts === 'string' ? JSON.parse(m.spare_parts) : []);
        } catch(e) {}

        const relatedTickets = tickets.filter(t => t.machine_name && t.machine_name.toLowerCase() === (m.machine_name || '').toLowerCase());
        const activeTicketsCount = relatedTickets.filter(t => t.status !== 'Resolved / Done').length;

        return `
          <tr>
            <td><span class="ticket-id">${m.machine_id || '—'}</span></td>
            <td><strong>${m.machine_name}</strong></td>
            <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${m.unit_name || 'Packfine'}</span></td>
            <td><span class="pri-badge pri-low">${m.brand || 'Standard OEM'}</span></td>
            <td style="max-width:260px;">
              ${compArray.length 
                ? compArray.map(c => `<span class="badge badge-received" style="margin:2px;">${c}</span>`).join('') 
                : '<small style="color:var(--text-muted)">No components assigned</small>'}
            </td>
            <td>
              <span class="badge badge-inprog">${partsArray.length} Parts Cataloged</span>
            </td>
            <td>
              <span class="badge ${activeTicketsCount > 0 ? 'badge-cannotfix' : 'badge-resolved'}">${activeTicketsCount} Active</span>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="7"><div class="empty-state">No machinery matrix records configured in unit_machine_master.</div></td></tr>';
}

function renderMachines(){ refreshAdminData(); renderMachineMatrixView(); }
function renderAnalytics(){ refreshAdminData(); executeAnalyticsDashboardGeneration(); }

// ══════════════════════════════════════════════
// 📈 DYNAMIC REAL-TIME ANALYTICS DASHBOARD ENGINE
// ══════════════════════════════════════════════
function ensureCanvasDimensions(canvas, defaultW, defaultH) {
  if (!canvas) return { W: defaultW, H: defaultH };
  
  const parent = canvas.parentElement;
  let computedW = 0;
  if (parent) {
    computedW = parent.clientWidth || parent.getBoundingClientRect().width;
  }
  
  // Enforce reliable positive rendering dimensions
  const w = computedW > 120 ? Math.floor(computedW) : defaultW;
  const h = defaultH;

  canvas.width = w;
  canvas.height = h;
  return { W: w, H: h };
}

function onAnalyticsUnitChanged() {
  const sel = document.getElementById('analytics-plant-unit-selector');
  selectedAnalyticsUnit = sel ? sel.value : 'ALL';
  executeAnalyticsDashboardGeneration();
}

function getFilteredAnalyticsTickets() {
  if (!selectedAnalyticsUnit || selectedAnalyticsUnit === 'ALL') {
    return [...tickets];
  }
  return tickets.filter(t => (t.unit_name || '').toLowerCase().includes(selectedAnalyticsUnit.toLowerCase()));
}

function executeAnalyticsDashboardGeneration() {
  const analyticsView = document.getElementById('view-admin-analytics');
  if (!analyticsView || !analyticsView.classList.contains('active')) {
    return;
  }

  const dataset = getFilteredAnalyticsTickets();

  // 1. Maintenance Mode Breakdown
  const downtimeCount = dataset.filter(t => (t.ticket_category || '').toLowerCase().includes('down') || !t.ticket_category).length;
  const preventiveCount = dataset.filter(t => (t.ticket_category || '').toLowerCase().includes('prev')).length;
  const totalCategoryTickets = downtimeCount + preventiveCount || 1;

  drawNativePieChart('chart-category-donut', 'legend-category-donut', {
    'Downtime Issues': downtimeCount,
    'Preventive PMs': preventiveCount
  }, ['#ef4444', '#059669'], true);

  const catContainer = document.getElementById('category-summary-container');
  if (catContainer) {
    catContainer.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.9rem;">
        <div style="background:var(--surface2); padding:0.9rem 1.2rem; border-radius:8px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#ef4444;">🔴 Unplanned Downtime Logs:</span>
            <span style="font-weight:700; font-size:1.1rem;">${downtimeCount} (${Math.round((downtimeCount/totalCategoryTickets)*100)}%)</span>
          </div>
          <small style="color:var(--text-muted)">Unscheduled machine breakdowns requiring emergency repairs.</small>
        </div>
        <div style="background:var(--surface2); padding:0.9rem 1.2rem; border-radius:8px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#059669;">🟢 Scheduled Preventive PMs:</span>
            <span style="font-weight:700; font-size:1.1rem;">${preventiveCount} (${Math.round((preventiveCount/totalCategoryTickets)*100)}%)</span>
          </div>
          <small style="color:var(--text-muted)">Routine inspections, lubrication, and scheduled part changes.</small>
        </div>
      </div>
    `;
  }

  // 2. Machine Volume Breakdown
  const machineCounts = {};
  dataset.forEach(t => { 
    if(t.machine_name) machineCounts[t.machine_name] = (machineCounts[t.machine_name] || 0) + 1; 
  });
  const sortedMachines = Object.entries(machineCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
  
  const listContainer = document.getElementById('top-machines-list');
  if(listContainer) {
    listContainer.innerHTML = sortedMachines.length
      ? sortedMachines.map(([name, count]) => `
          <div style="margin-bottom: 0.75rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem; font-size:0.85rem;">
              <span style="font-weight:600;">🔧 ${name}</span>
              <span style="color:var(--text-muted); font-weight:700;">${count} Tickets</span>
            </div>
            <div style="background:#e5e7eb; height:8px; border-radius:4px; overflow:hidden;">
              <div style="background:var(--accent2); height:100%; width: ${Math.min((count / (dataset.length || 1)) * 100, 100)}%;"></div>
            </div>
          </div>`).join('')
      : '<div class="empty-state">No recorded tickets for selected unit.</div>';
  }

  // 3. Status Distribution (Pie)
  drawNativePieChart('chart-status-pie', 'legend-status-pie', {
    'Open': dataset.filter(t => t.status === 'Open').length,
    'In Progress': dataset.filter(t => t.status === 'In Progress').length,
    'Pending Spare Parts': dataset.filter(t => t.status === 'Pending Spare Parts').length,
    'Resolved': dataset.filter(t => t.status === 'Resolved / Done').length,
  }, ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'], false);

  // 4. Failure Mode Categories
  const failureModeCounts = {};
  dataset.forEach(t => {
    const mode = t.failure_mode || 'General Breakdown';
    failureModeCounts[mode] = (failureModeCounts[mode] || 0) + 1;
  });
  const topFailureModes = Object.fromEntries(
    Object.entries(failureModeCounts).sort((a,b) => b[1] - a[1]).slice(0, 4)
  );
  drawNativeBarChart('chart-issue-bar', Object.keys(topFailureModes).length ? topFailureModes : { 'General Breakdown': dataset.length }, '#6366f1');

  // 5. Critical Priority Ratio
  const unhandledCount = dataset.filter(t => t.status !== 'Resolved / Done').length;
  const resolvedCount = dataset.filter(t => t.status === 'Resolved / Done').length;
  drawNativePieChart('chart-priority-donut', 'legend-priority-donut', {
    'Active Unresolved': unhandledCount,
    'Resolved Closed': resolvedCount
  }, ['#dc2626', '#10b981'], true);

  // 6. Cumulative Downtime & Cost Graphs
  drawMachineDowntimeChart('chart-machine-downtime');
  drawMachineCostChart('chart-machine-cost');
}

function drawNativePieChart(canvasId, legendId, data, colors, isDonut = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const { W, H } = ensureCanvasDimensions(canvas, 260, 210);
  ctx.clearRect(0, 0, W, H);
  
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const keys = Object.keys(data);
  
  if (total === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data recorded', W / 2, H / 2);
    return;
  }

  let startAngle = -0.5 * Math.PI;
  keys.forEach((key, idx) => {
    const val = data[key];
    const sliceAngle = (val / total) * 2 * Math.PI;
    if(sliceAngle <= 0) return;
    
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 14, startAngle, startAngle + sliceAngle);
    ctx.lineTo(W / 2, H / 2);
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  if (isDonut) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  const legend = document.getElementById(legendId);
  if(legend) {
    legend.innerHTML = keys.map((k, i) => `
      <span style="display:inline-flex; align-items:center; margin-right:0.6rem; font-size:0.75rem; font-weight:600;">
        <span style="display:inline-block; width:9px; height:9px; background:${colors[i%colors.length]}; border-radius:2px; margin-right:4px;"></span>
        ${k} (${data[k] || 0})
      </span>`).join('');
  }
}

function drawNativeBarChart(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const { W, H } = ensureCanvasDimensions(canvas, 420, 240);
  ctx.clearRect(0, 0, W, H);

  const values = Object.values(data);
  const keys = Object.keys(data);
  const maxVal = Math.max(...values, 1);
  
  const paddingBottom = 30;
  const paddingTop = 25;
  const paddingSide = 30;
  const chartHeight = H - paddingBottom - paddingTop;
  const barWidth = Math.max(16, (W - paddingSide * 2) / (values.length || 1) - 16);

  keys.forEach((key, idx) => {
    const val = values[idx] || 0;
    const barHeight = (val / maxVal) * chartHeight;
    const x = paddingSide + idx * (barWidth + 16);
    const y = H - paddingBottom - barHeight;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#6b7280';
    ctx.font = '10px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(key.substring(0, 10), x + barWidth / 2, H - 10);
    
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.fillText(val, x + barWidth / 2, y - 6);
  });
}

// ══════════════════════════════════════════════
// ⚙️ CATEGORY & MODE BREAKDOWN DETAILS MODAL
// ══════════════════════════════════════════════
function openCategoryDetailsModal() {
  const unitFilter = document.getElementById('cat-modal-unit-filter');
  if (unitFilter) {
    unitFilter.value = selectedAnalyticsUnit || 'ALL';
  }
  renderCategoryModalTable();
  openModal('modal-category-details');
}

function resetCategoryModalDateFilter() {
  const s = document.getElementById('cat-modal-date-start');
  const e = document.getElementById('cat-modal-date-end');
  if (s) s.value = '';
  if (e) e.value = '';
  renderCategoryModalTable();
}

function renderCategoryModalTable() {
  const tbody = document.getElementById('cat-details-tbody');
  const unitFilter = document.getElementById('cat-modal-unit-filter')?.value || 'ALL';
  const typeFilter = document.getElementById('cat-modal-type-filter')?.value || 'ALL';
  const startVal = document.getElementById('cat-modal-date-start')?.value || null;
  const endVal = document.getElementById('cat-modal-date-end')?.value || null;

  if (!tbody) return;

  let filtered = [...tickets];

  if (unitFilter !== 'ALL') {
    filtered = filtered.filter(t => (t.unit_name || '').toLowerCase().includes(unitFilter.toLowerCase()));
  }

  if (typeFilter !== 'ALL') {
    filtered = filtered.filter(t => (t.ticket_category || '').toLowerCase().includes(typeFilter.toLowerCase()));
  }

  if (startVal) {
    const sMs = new Date(startVal).setHours(0,0,0,0);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() >= sMs);
  }
  if (endVal) {
    const eMs = new Date(endVal).setHours(23,59,59,999);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() <= eMs);
  }

  const dtCount = filtered.filter(t => (t.ticket_category || '').toLowerCase().includes('down') || !t.ticket_category).length;
  const prevCount = filtered.filter(t => (t.ticket_category || '').toLowerCase().includes('prev')).length;
  const totalLossMins = filtered.reduce((acc, t) => acc + parseInt(t.downtime || 0), 0);

  if (document.getElementById('cat-kpi-downtime')) document.getElementById('cat-kpi-downtime').textContent = dtCount;
  if (document.getElementById('cat-kpi-preventive')) document.getElementById('cat-kpi-preventive').textContent = prevCount;
  if (document.getElementById('cat-kpi-loss-mins')) document.getElementById('cat-kpi-loss-mins').textContent = `${totalLossMins.toLocaleString()} min`;

  tbody.innerHTML = filtered.length
    ? filtered.map(t => `
        <tr onclick="viewTicket('${t.id}')" style="cursor:pointer;">
          <td><span class="ticket-id">${t.ticket_id}</span></td>
          <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${t.unit_name || 'Packfine'}</span></td>
          <td><span class="badge ${String(t.ticket_category||'').toLowerCase().includes('prev') ? 'badge-received' : 'badge-open'}">${t.ticket_category || 'Downtime'}</span></td>
          <td><strong>${t.machine_name || '—'}</strong></td>
          <td>${t.machine_component || '—'}</td>
          <td><strong>${t.downtime ? t.downtime + ' min' : '0 min'}</strong></td>
          <td>${statusBadge(t.status)}</td>
          <td>${fmtDate(t.created_at)}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewTicket('${t.id}')">Manage</button></td>
        </tr>
      `).join('')
    : '<tr><td colspan="9"><div class="empty-state">No matching mode logs found matching active filters.</div></td></tr>';
}

// ══════════════════════════════════════════════
// ⏱️ DOWNTIME CALENDAR & GRAPH ENGINE
// ══════════════════════════════════════════════
function applyAnalyticsDateFilter() {
  analyticsStartDate = document.getElementById('analytics-date-start')?.value || null;
  analyticsEndDate = document.getElementById('analytics-date-end')?.value || null;
  drawMachineDowntimeChart('chart-machine-downtime');
}

function resetAnalyticsDateFilter() {
  const s = document.getElementById('analytics-date-start');
  const e = document.getElementById('analytics-date-end');
  if (s) s.value = '';
  if (e) e.value = '';
  analyticsStartDate = null;
  analyticsEndDate = null;
  drawMachineDowntimeChart('chart-machine-downtime');
}

function openDowntimeDetailsModal() {
  const s = document.getElementById('dt-modal-date-start');
  const e = document.getElementById('dt-modal-date-end');
  if (s) s.value = analyticsStartDate || '';
  if (e) e.value = analyticsEndDate || '';
  downtimeModalStartDate = analyticsStartDate;
  downtimeModalEndDate = analyticsEndDate;
  renderDowntimeModalTable();
  openModal('modal-downtime-details');
}

function applyDowntimeModalDateFilter() {
  downtimeModalStartDate = document.getElementById('dt-modal-date-start')?.value || null;
  downtimeModalEndDate = document.getElementById('dt-modal-date-end')?.value || null;
  renderDowntimeModalTable();
}

function resetDowntimeModalDateFilter() {
  const s = document.getElementById('dt-modal-date-start');
  const e = document.getElementById('dt-modal-date-end');
  if (s) s.value = '';
  if (e) e.value = '';
  downtimeModalStartDate = null;
  downtimeModalEndDate = null;
  renderDowntimeModalTable();
}

function renderDowntimeModalTable() {
  const tbody = document.getElementById('dt-details-tbody');
  const minFilter = document.getElementById('dt-modal-min-filter')?.value || 'ALL';
  if (!tbody) return;

  let filtered = getFilteredAnalyticsTickets().filter(t => t.downtime && parseInt(t.downtime) > 0);

  if (downtimeModalStartDate) {
    const startMs = new Date(downtimeModalStartDate).setHours(0,0,0,0);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() >= startMs);
  }
  if (downtimeModalEndDate) {
    const endMs = new Date(downtimeModalEndDate).setHours(23,59,59,999);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() <= endMs);
  }

  const totalMins = filtered.reduce((acc, t) => acc + parseInt(t.downtime || 0), 0);
  const criticalCount = filtered.filter(t => parseInt(t.downtime || 0) >= 60).length;

  const machineDowntimeMap = {};
  filtered.forEach(t => {
    if (t.machine_name) {
      machineDowntimeMap[t.machine_name] = (machineDowntimeMap[t.machine_name] || 0) + parseInt(t.downtime || 0);
    }
  });

  const sortedTop = Object.entries(machineDowntimeMap).sort((a,b) => b[1] - a[1]);
  const topMachineName = sortedTop.length ? sortedTop[0][0] : '—';
  const topMachineMins = sortedTop.length ? sortedTop[0][1] : 0;

  if (document.getElementById('dt-kpi-total-mins')) document.getElementById('dt-kpi-total-mins').textContent = `${totalMins.toLocaleString()} min`;
  if (document.getElementById('dt-kpi-total-hrs')) document.getElementById('dt-kpi-total-hrs').textContent = `${(totalMins / 60).toFixed(1)} Hours lost`;
  if (document.getElementById('dt-kpi-high-count')) document.getElementById('dt-kpi-high-count').textContent = criticalCount;
  if (document.getElementById('dt-kpi-top-machine')) document.getElementById('dt-kpi-top-machine').textContent = topMachineName;
  if (document.getElementById('dt-kpi-top-machine-sub')) document.getElementById('dt-kpi-top-machine-sub').textContent = sortedTop.length ? `${topMachineMins} mins total breakdown` : 'No bottlenecks identified';

  if (minFilter === 'GT30') {
    filtered = filtered.filter(t => parseInt(t.downtime || 0) >= 30);
  } else if (minFilter === 'GT60') {
    filtered = filtered.filter(t => parseInt(t.downtime || 0) >= 60);
  }

  filtered.sort((a,b) => parseInt(b.downtime || 0) - parseInt(a.downtime || 0));

  tbody.innerHTML = filtered.length
    ? filtered.map(t => {
        const d = parseInt(t.downtime || 0);
        return `
          <tr onclick="viewTicket('${t.id}')" style="cursor:pointer;">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${t.unit_name || 'Packfine'}</span></td>
            <td><span class="badge ${String(t.ticket_category||'').toLowerCase().includes('prev') ? 'badge-received' : 'badge-open'}">${t.ticket_category || 'Downtime'}</span></td>
            <td><strong>${t.machine_name || '—'}</strong></td>
            <td>
              <span class="badge ${d >= 60 ? 'badge-cannotfix' : (d >= 30 ? 'badge-pending' : 'badge-open')}">
                ${d} mins (${(d/60).toFixed(1)}h)
              </span>
            </td>
            <td>${t.production_loss || '—'}</td>
            <td><small style="color:var(--text-muted);">${t.failure_mode || 'Mechanical'}</small></td>
            <td>${statusBadge(t.status)}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewTicket('${t.id}')">Manage</button></td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="9"><div class="empty-state">No matching stoppage logs found in the selected date window.</div></td></tr>';
}

function drawMachineDowntimeChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const { W, H } = ensureCanvasDimensions(canvas, 860, 260);
  ctx.clearRect(0, 0, W, H);

  let filtered = getFilteredAnalyticsTickets().filter(t => t.machine_name && t.downtime && parseInt(t.downtime) > 0);

  if (analyticsStartDate) {
    const sMs = new Date(analyticsStartDate).setHours(0,0,0,0);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() >= sMs);
  }
  if (analyticsEndDate) {
    const eMs = new Date(analyticsEndDate).setHours(23,59,59,999);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() <= eMs);
  }

  const downtimeMap = {};
  filtered.forEach(t => {
    downtimeMap[t.machine_name] = (downtimeMap[t.machine_name] || 0) + parseInt(t.downtime);
  });

  const sortedData = Object.entries(downtimeMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!sortedData.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recorded downtime logs available for this unit/date selection.', W / 2, H / 2);
    return;
  }

  const pad = { t: 25, r: 60, b: 45, l: 140 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  
  const maxVal = Math.max(...sortedData.map(x => x[1]), 1);
  const stepY = cH / sortedData.length;
  const barHeight = Math.max(14, stepY - 14);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (i / 4) * cW;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + cH);
    ctx.stroke();
    
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round((maxVal * i) / 4) + 'm', x, pad.t + cH + 15);
  }

  sortedData.forEach(([name, mins], idx) => {
    const barWidth = (mins / maxVal) * cW;
    const x = pad.l;
    const y = pad.t + idx * stepY + (stepY / 2) - (barHeight / 2);

    const grad = ctx.createLinearGradient(x, y, x + barWidth, y);
    grad.addColorStop(0, '#ea580c');
    grad.addColorStop(1, 'rgb(5, 37, 80)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(name.substring(0, 18), x - 10, y + barHeight / 2 + 4);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mins + ' min', x + barWidth + 8, y + barHeight / 2 + 4);
  });
}

// ══════════════════════════════════════════════
// 💰 FINANCIAL COST CALENDAR & GRAPH ENGINE
// ══════════════════════════════════════════════
function applyCostAnalyticsDateFilter() {
  costAnalyticsStartDate = document.getElementById('cost-date-start')?.value || null;
  costAnalyticsEndDate = document.getElementById('cost-date-end')?.value || null;
  drawMachineCostChart('chart-machine-cost');
}

function resetCostAnalyticsDateFilter() {
  const s = document.getElementById('cost-date-start');
  const e = document.getElementById('cost-date-end');
  if (s) s.value = '';
  if (e) e.value = '';
  costAnalyticsStartDate = null;
  costAnalyticsEndDate = null;
  drawMachineCostChart('chart-machine-cost');
}

function openCostDetailsModal() {
  const s = document.getElementById('cost-modal-date-start');
  const e = document.getElementById('cost-modal-date-end');
  if (s) s.value = costAnalyticsStartDate || '';
  if (e) e.value = costAnalyticsEndDate || '';
  costModalStartDate = costAnalyticsStartDate;
  costModalEndDate = costAnalyticsEndDate;
  renderCostModalTable();
  openModal('modal-cost-details');
}

function applyCostModalDateFilter() {
  costModalStartDate = document.getElementById('cost-modal-date-start')?.value || null;
  costModalEndDate = document.getElementById('cost-modal-date-end')?.value || null;
  renderCostModalTable();
}

function resetCostModalDateFilter() {
  const s = document.getElementById('cost-modal-date-start');
  const e = document.getElementById('cost-modal-date-end');
  if (s) s.value = '';
  if (e) e.value = '';
  costModalStartDate = null;
  costModalEndDate = null;
  renderCostModalTable();
}

function drawMachineCostChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const { W, H } = ensureCanvasDimensions(canvas, 860, 260);
  ctx.clearRect(0, 0, W, H);

  let filtered = getFilteredAnalyticsTickets().filter(t => t.machine_name);

  if (costAnalyticsStartDate) {
    const sMs = new Date(costAnalyticsStartDate).setHours(0,0,0,0);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() >= sMs);
  }
  if (costAnalyticsEndDate) {
    const eMs = new Date(costAnalyticsEndDate).setHours(23,59,59,999);
    filtered = filtered.filter(t => new Date(t.created_at).getTime() <= eMs);
  }

  const costMap = {};
  filtered.forEach(t => {
    const parts = parseFloat(t.parts_cost) || 0;
    const labour = parseFloat(t.labour_cost) || 0;
    const total = parts + labour;
    if (total > 0) {
      costMap[t.machine_name] = (costMap[t.machine_name] || 0) + total;
    }
  });

  const sortedCosts = Object.entries(costMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!sortedCosts.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recorded repair cost data available for this selection.', W / 2, H / 2);
    return;
  }

  const pad = { t: 25, r: 70, b: 45, l: 140 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  
  const maxVal = Math.max(...sortedCosts.map(x => x[1]), 1000);
  const stepY = cH / sortedCosts.length;
  const barHeight = Math.max(14, stepY - 14);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (i / 4) * cW;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + cH);
    ctx.stroke();
    
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    const labelVal = Math.round((maxVal * i) / 4);
    ctx.fillText('₹' + labelVal.toLocaleString('en-IN'), x, pad.t + cH + 15);
  }

  sortedCosts.forEach(([name, cost], idx) => {
    const barWidth = (cost / maxVal) * cW;
    const x = pad.l;
    const y = pad.t + idx * stepY + (stepY / 2) - (barHeight / 2);

    const grad = ctx.createLinearGradient(x, y, x + barWidth, y);
    grad.addColorStop(0, '#059669');
    grad.addColorStop(1, '#2563eb');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(name.substring(0, 18), x - 10, y + barHeight / 2 + 4);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Tahoma, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('₹' + cost.toLocaleString('en-IN'), x + barWidth + 8, y + barHeight / 2 + 4);
  });
}

function renderCostModalTable() {
  const tbody = document.getElementById('cost-details-tbody');
  const filterVal = document.getElementById('cost-modal-status-filter')?.value || 'ALL';
  if (!tbody) return;

  let displayTickets = getFilteredAnalyticsTickets();

  if (costModalStartDate) {
    const sMs = new Date(costModalStartDate).setHours(0,0,0,0);
    displayTickets = displayTickets.filter(t => new Date(t.created_at).getTime() >= sMs);
  }
  if (costModalEndDate) {
    const eMs = new Date(costModalEndDate).setHours(23,59,59,999);
    displayTickets = displayTickets.filter(t => new Date(t.created_at).getTime() <= eMs);
  }

  let totalUnresolved = 0;
  let totalResolved = 0;
  let grandTotal = 0;

  displayTickets.forEach(t => {
    const p = parseFloat(t.parts_cost) || 0;
    const l = parseFloat(t.labour_cost) || 0;
    const tCost = p + l;
    grandTotal += tCost;
    if (t.status === 'Resolved / Done') {
      totalResolved += tCost;
    } else {
      totalUnresolved += tCost;
    }
  });

  if (document.getElementById('cost-kpi-unresolved')) document.getElementById('cost-kpi-unresolved').textContent = '₹' + totalUnresolved.toLocaleString('en-IN');
  if (document.getElementById('cost-kpi-resolved')) document.getElementById('cost-kpi-resolved').textContent = '₹' + totalResolved.toLocaleString('en-IN');
  if (document.getElementById('cost-kpi-total')) document.getElementById('cost-kpi-total').textContent = '₹' + grandTotal.toLocaleString('en-IN');

  if (filterVal === 'UNRESOLVED') {
    displayTickets = displayTickets.filter(t => t.status !== 'Resolved / Done');
  } else if (filterVal === 'RESOLVED') {
    displayTickets = displayTickets.filter(t => t.status === 'Resolved / Done');
  }

  tbody.innerHTML = displayTickets.length
    ? displayTickets.map(t => {
        const p = parseFloat(t.parts_cost) || 0;
        const l = parseFloat(t.labour_cost) || 0;
        const tCost = p + l;
        return `
          <tr onclick="viewTicket('${t.id}')" style="cursor:pointer;">
            <td><span class="ticket-id">${t.ticket_id}</span></td>
            <td><span class="badge" style="background:#eff6ff; color:#1e40af;">${t.unit_name || 'Packfine'}</span></td>
            <td><span class="badge ${String(t.ticket_category||'').toLowerCase().includes('prev') ? 'badge-received' : 'badge-open'}">${t.ticket_category || 'Downtime'}</span></td>
            <td><strong>${t.machine_name || '—'}</strong></td>
            <td>${statusBadge(t.status)}</td>
            <td><small style="color:var(--text-muted);">${t.part_used || 'None / In-house'}</small></td>
            <td>₹${p.toLocaleString('en-IN')}</td>
            <td>₹${l.toLocaleString('en-IN')}</td>
            <td><strong style="color: ${t.status === 'Resolved / Done' ? 'var(--accent3)' : 'var(--danger)'};">₹${tCost.toLocaleString('en-IN')}</strong></td>
            <td>${fmtDate(t.created_at)}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="10"><div class="empty-state">No matching expense logs found in this date window.</div></td></tr>';
}

function statusBadge(s){
  const m={Open:'badge-open', Received:'badge-received', 'In Progress':'badge-inprog', 'Pending Spare Parts':'badge-pending', 'Resolved / Done':'badge-resolved', Closed:'badge-closed'};
  return `<span class="badge ${m[s]||'badge-open'}">${s}</span>`;
}
function priBadge(p){
  const m={Critical:'pri-critical',High:'pri-high',Medium:'pri-medium',Low:'pri-low'};
  const ic={Critical:'🔴',High:'🟠',Medium:'🟡',Low:'🔵'};
  return `<span class="pri-badge ${m[p]||'pri-low'}">${ic[p]||''} ${p}</span>`;
}

// ══════════════════════════════════════════════
// 📊 EXCEL EXPORT ENGINE
// ══════════════════════════════════════════════
function exportLedgerToExcel() {
  if (!tickets || !tickets.length) {
    showToast("No data rows found available to process file extraction.", "error");
    return;
  }

  const category = document.getElementById("export-category-selector")?.value || "ALL";
  let targetRows = [...tickets];

  if (category === "OPEN") {
    targetRows = targetRows.filter(t => t.status === "Open" || t.status === "In Progress");
  } else if (category === "PARTS") {
    targetRows = targetRows.filter(t => t.status === "Pending Spare Parts");
  } else if (category === "DONE") {
    targetRows = targetRows.filter(t => t.status === "Resolved / Done");
  } else if (category === "HIGH_LOSS") {
    targetRows = targetRows.filter(t => t.downtime && parseInt(t.downtime) >= 60);
  }

  if (!targetRows.length) {
    showToast(`No matches found matching category: "${category}"`, "warn");
    return;
  }

  showToast(`Compiling ${targetRows.length} rows into styled ledger rows...`);

  const formattedLedger = targetRows.map((t, index) => {
    return {
      "Sr No": index + 1,
      "Ticket ID": t.ticket_id,
      "Plant Unit": t.unit_name || "Packfine",
      "Ticket Category": t.ticket_category || "Downtime",
      "Machine Name": t.machine_name || "—",
      "Machine Component": t.machine_component || "—",
      "Sub Component": t.sub_component || "—",
      "Failure Mode": t.failure_mode || "—",
      "Failure Reason": t.maintenance_type || "—",
      "Start Time": t.start_time || "—",
      "End Time": t.end_time || "—",
      "Downtime (Mins)": t.downtime ? Number(t.downtime) : 0,
      "Production Loss": t.production_loss || "—",
      "Spare Part Used": t.part_used || "—",
      "Parts Cost (INR)": t.parts_cost ? Number(t.parts_cost) : 0,
      "Labour Cost (INR)": t.labour_cost ? Number(t.labour_cost) : 0,
      "Total Repair Cost": (t.parts_cost ? Number(t.parts_cost) : 0) + (t.labour_cost ? Number(t.labour_cost) : 0),
      "Operational Status": t.status || "—",
      "Next Maintenance Date": t.next_pm_due ? new Date(t.next_pm_due).toLocaleDateString('en-GB') : "—",
      "Logged Operator Name": t.reported_by || "—",
      "Registration Date": new Date(t.created_at).toLocaleDateString('en-GB'),
      "Remarks / Notes": t.remarks || "—",
      "Action Taken Summary": t.action_taken || "—"
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(formattedLedger);

  const columnWidths = [];
  const keys = Object.keys(formattedLedger[0]);
  
  keys.forEach((key, colIndex) => {
    let maxLength = key.length;
    formattedLedger.forEach(row => {
      const valStr = String(row[key] || '');
      if (valStr.length > maxLength) maxLength = valStr.length;
    });
    columnWidths[colIndex] = { wch: maxLength + 4 };
  });
  worksheet["!cols"] = columnWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, "Maintenance Ledger");
  
  const fileDateStamp = new Date().toISOString().split('T')[0];
  const outputFileName = `KPFL_Maintenance_Report_${category}_${fileDateStamp}.xlsx`;

  XLSX.writeFile(workbook, outputFileName);
  showToast("File extraction complete! Check downloads directory.");
}

function fmtDate(ts){ return new Date(ts).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtDateFull(ts){ return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); openModalTicketId = null; }

document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m){ m.classList.remove('active'); openModalTicketId=null; } }));
let tt;
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.className='toast'+(type?' '+type:'');
  t.style.display='block'; clearTimeout(tt);
  tt=setTimeout(()=>t.style.display='none',3500);
}

// ══════════════════════════════════════════════
// 🔌 GLOBAL BINDINGS MOUNT POINT EXPORTS
// ══════════════════════════════════════════════
window.viewTicket = viewTicket;
window.closeModal = closeModal;
window.switchView = switchView;
window.logout = logout;
window.doLogin = doLogin;
window.saveTicketCollaborative = saveTicketCollaborative;
window.exportLedgerToExcel = exportLedgerToExcel;
window.renderMachines = renderMachines;
window.renderMachineMatrixView = renderMachineMatrixView;
window.renderAnalytics = renderAnalytics;
window.openCostDetailsModal = openCostDetailsModal;
window.renderCostModalTable = renderCostModalTable;
window.applyCostAnalyticsDateFilter = applyCostAnalyticsDateFilter;
window.resetCostAnalyticsDateFilter = resetCostAnalyticsDateFilter;
window.applyCostModalDateFilter = applyCostModalDateFilter;
window.resetCostModalDateFilter = resetCostModalDateFilter;
window.openDowntimeDetailsModal = openDowntimeDetailsModal;
window.renderDowntimeModalTable = renderDowntimeModalTable;
window.applyAnalyticsDateFilter = applyAnalyticsDateFilter;
window.resetAnalyticsDateFilter = resetAnalyticsDateFilter;
window.applyDowntimeModalDateFilter = applyDowntimeModalDateFilter;
window.resetDowntimeModalDateFilter = resetDowntimeModalDateFilter;
window.openCategoryDetailsModal = openCategoryDetailsModal;
window.renderCategoryModalTable = renderCategoryModalTable;
window.resetCategoryModalDateFilter = resetCategoryModalDateFilter;
window.onAnalyticsUnitChanged = onAnalyticsUnitChanged;
window.toggleMobileSidebar = toggleMobileSidebar;