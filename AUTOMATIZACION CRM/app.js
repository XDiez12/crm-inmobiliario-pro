/* ==============================================
   CRM INMOBILIARIO PRO — APP.JS
   Lógica completa: CRUD, agenda, seguimientos,
   conversaciones, calendario, notificaciones
   ============================================== */

'use strict';

/* ─── GOOGLE CALENDAR — SINCRONIZACIÓN EXCLUSIVA ───
   Vinculado a: antonydiezcaceres@gmail.com
   Todos los eventos, visitas, llamadas y seguimientos se gestionan
   directamente en Google Calendar sin enviar correos a la bandeja.
   ─────────────────────────────────────────────── */
const GCAL_USER_EMAIL = 'antonydiezcaceres@gmail.com';

/**
 * Genera la URL oficial de Google Calendar para agendar el evento con 1 clic
 * @param {Object} ev   — { type, date, time, address, notes }
 * @param {Object} client — { name, phone, email, interest }
 */
function getGoogleCalendarUrl(ev, client) {
  const isVisit = ev.type === 'visit';
  const typeLabel = isVisit ? '🏡 Visita Inmobiliaria' : (ev.type === 'call' ? '📞 Llamada' : '🔔 Seguimiento');
  const clientName = client ? client.name : 'Cliente';

  const title = encodeURIComponent(`${typeLabel}: ${clientName}`);

  let datesParam = '';
  if (ev.date) {
    const cleanDate = ev.date.replace(/-/g, '');
    if (ev.time) {
      const parts = ev.time.split(':');
      const h = parseInt(parts[0], 10) || 10;
      const m = parseInt(parts[1], 10) || 0;

      const startH = String(h).padStart(2, '0');
      const startM = String(m).padStart(2, '0');

      const endH = String((h + 1) % 24).padStart(2, '0');
      const endM = startM;

      datesParam = `${cleanDate}T${startH}${startM}00/${cleanDate}T${endH}${endM}00`;
    } else {
      datesParam = `${cleanDate}/${cleanDate}`;
    }
  }

  const detailsLines = [
    `👤 Cliente: ${clientName}`,
    `📞 Teléfono: ${client ? (client.phone || 'No registrado') : '—'}`,
    `✉️ Email: ${client ? (client.email || 'No registrado') : '—'}`,
    `🏠 Interés / Propiedad: ${client ? (client.interest || 'No especificado') : '—'}`,
  ];

  if (ev.address || isVisit) {
    detailsLines.push(`📍 Dirección: ${ev.address || 'No especificada'}`);
  }

  if (ev.notes) {
    detailsLines.push(`📝 Notas: ${ev.notes}`);
  }

  detailsLines.push(`\n---\nAgendado desde CRM Inmobiliario Pro`);

  const details = encodeURIComponent(detailsLines.join('\n'));
  const location = encodeURIComponent(ev.address || (client ? client.interest : '') || '');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}&location=${location}&add=${GCAL_USER_EMAIL}`;
}

/**
 * Abre un evento existente en Google Calendar
 */
function openInGoogleCalendar(evId) {
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;
  const client = getClient(ev.clientId);
  const url = getGoogleCalendarUrl(ev, client);
  window.open(url, '_blank');
  toast('Abriendo Google Calendar... 📅', 'info');
}

/**
 * Abre un recordatorio de seguimiento en Google Calendar
 */
function openFollowUpInGoogleCalendar(clientId) {
  const client = getClient(clientId);
  if (!client) return;

  const followEv = {
    type: 'followup',
    date: client.nextFollowUp || todayStr(),
    time: '09:00',
    address: client.interest ? `Inmueble: ${client.interest}` : '',
    notes: `Seguimiento periódico (${followLabel(client.followType)}). ${client.notes || ''}`
  };

  const url = getGoogleCalendarUrl(followEv, client);
  window.open(url, '_blank');
  toast(`Abriendo Google Calendar para agendar seguimiento de ${client.name}... 📅`, 'info');
}

/* ─── ESTADO GLOBAL ─────────────────────────────── */
let state = {
  clients: [],
  events: [],
  marketing: [],
  content: [],
  currentClientId: null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  clientFilter: 'all',
  eventFilter: 'all',
  fuFilter: 'all',
  mktFilter: 'all',
  contentFilter: 'all',
  mktMonth: new Date().toISOString().slice(0, 7),
  contentMonth: new Date().toISOString().slice(0, 7),
  currentTab: 'conv',
};

/* ─── PERSISTENCIA ───────────────────────────────── */

/**
 * Guarda en localStorage Y en Firestore (si está disponible).
 * La escritura en Firebase es fire-and-forget para no bloquear la UI.
 */
function save() {
  localStorage.setItem('crm_clients',   JSON.stringify(state.clients));
  localStorage.setItem('crm_events',    JSON.stringify(state.events));
  localStorage.setItem('crm_marketing', JSON.stringify(state.marketing));
  localStorage.setItem('crm_content',   JSON.stringify(state.content));
  if (window.FB) {
    window.FB.save(state.clients, state.events, state.marketing, state.content)
      .catch(err => console.warn('[CRM] Error guardando en Firebase:', err));
  }
}

const MKT_STATUS = {
  planned: 'Planificado',
  inprogress: 'En progreso',
  completed: 'Completado',
  paused: 'Pausado',
};

/**
 * Normaliza planes de marketing garantizando compatibilidad con formatos antiguos o externos
 */
function normalizeMarketing(m) {
  if (!m || typeof m !== 'object') return null;
  const clone = { ...m };
  if (!clone.id) clone.id = uid();
  // Month: si no tiene mes, asignarle el mes actual
  if (!clone.month) {
    clone.month = clone.createdAt ? clone.createdAt.slice(0, 7) : (state.mktMonth || todayStr().slice(0, 7));
  }
  // Title
  if (!clone.title) clone.title = 'Plan de Marketing';
  // Goal vs objective
  if (!clone.goal && clone.objective) clone.goal = clone.objective;
  // Type vs channel
  if (!clone.type && clone.channel) {
    const ch = String(clone.channel).toLowerCase();
    if (ch.includes('social') || ch.includes('redes')) clone.type = 'social';
    else if (ch.includes('email') || ch.includes('news')) clone.type = 'email';
    else if (ch.includes('event')) clone.type = 'event';
    else if (ch.includes('ad') || ch.includes('publi')) clone.type = 'ads';
    else if (ch.includes('cont')) clone.type = 'content';
    else clone.type = 'other';
  }
  if (!clone.type) clone.type = 'social';
  // Status: in-progress -> inprogress
  if (clone.status === 'in-progress') clone.status = 'inprogress';
  if (!clone.status || !MKT_STATUS[clone.status]) clone.status = 'planned';
  // Budget
  if (clone.budget === undefined || clone.budget === null) clone.budget = '';
  else clone.budget = String(clone.budget);

  return clone;
}

/**
 * Carga desde localStorage (inmediato) y, en paralelo,
 * intenta traer datos actualizados desde Firestore.
 */
function load() {
  try {
    state.clients   = JSON.parse(localStorage.getItem('crm_clients'))   || [];
    state.events    = JSON.parse(localStorage.getItem('crm_events'))    || [];
    state.marketing = (JSON.parse(localStorage.getItem('crm_marketing')) || []).map(normalizeMarketing).filter(Boolean);
    state.content   = JSON.parse(localStorage.getItem('crm_content'))   || [];
  } catch (e) {
    state.clients   = [];
    state.events    = [];
    state.marketing = [];
    state.content   = [];
  }
  loadFromFirebase();
}

function updateCloudStatus(online) {
  const badge = document.getElementById('cloud-sync-badge');
  if (!badge) return;
  if (online) {
    badge.innerHTML = '🟢 En tiempo real';
    badge.style.color = '#2ed573';
    badge.style.background = 'rgba(46,213,115,0.12)';
    badge.style.borderColor = 'rgba(46,213,115,0.3)';
    badge.title = 'Sincronizado en tiempo real con Firestore en la nube';
  } else {
    badge.innerHTML = '🟡 Modo local';
    badge.style.color = '#ffa502';
    badge.style.background = 'rgba(255,165,2,0.12)';
    badge.style.borderColor = 'rgba(255,165,2,0.3)';
    badge.title = 'Modo local activo (sin conexión con Firebase)';
  }
}

/**
 * Carga asíncrona desde Firestore y vincula listener en tiempo real.
 */
async function loadFromFirebase() {
  let attempts = 0;
  while (!window.FB && attempts < 25) {
    await new Promise(r => setTimeout(r, 200));
    attempts++;
  }

  if (!window.FB) {
    console.warn('[CRM] Firebase no disponible — usando solo localStorage');
    updateCloudStatus(false);
    return;
  }

  try {
    // 1. Cargar estado inicial desde Firestore
    const data = await window.FB.load();
    if (data) {
      syncFromFirebase(data);
    }

    // 2. Suscribir inmediatamente a cambios en tiempo real
    if (typeof window.FB.onSync === 'function') {
      window.FB.onSync((syncData) => {
        syncFromFirebase(syncData);
        updateCloudStatus(true);
      });
      console.log('[CRM] 🔄 Sincronización en tiempo real con Firestore conectada');
      updateCloudStatus(true);
    }
  } catch (err) {
    console.warn('[CRM] No se pudo conectar con Firestore:', err);
    updateCloudStatus(false);
  }
}

// Escuchar evento directo si Firebase cargó después
window.addEventListener('firebase-ready', () => {
  if (window.FB && typeof window.FB.onSync === 'function') {
    window.FB.onSync(syncFromFirebase);
    updateCloudStatus(true);
  }
});

// Sincronización instantánea entre pestañas abiertas en el mismo navegador
window.addEventListener('storage', (e) => {
  if (['crm_clients', 'crm_events', 'crm_marketing', 'crm_content'].includes(e.key)) {
    try {
      state.clients   = JSON.parse(localStorage.getItem('crm_clients'))   || [];
      state.events    = JSON.parse(localStorage.getItem('crm_events'))    || [];
      state.marketing = (JSON.parse(localStorage.getItem('crm_marketing')) || []).map(normalizeMarketing).filter(Boolean);
      state.content   = JSON.parse(localStorage.getItem('crm_content'))   || [];
      refreshAll();
      updateBadges();
      console.log('[CRM] ⚡ Actualizado instantáneamente desde otra pestaña');
    } catch (err) { }
  }
});

/**
 * Fusiona datos provenientes de Firestore con el estado local.
 */
function syncFromFirebase(data) {
  if (!data) return;
  const clients   = Array.isArray(data.clients)   ? data.clients   : [];
  const events    = Array.isArray(data.events)    ? data.events    : [];
  const marketing = (Array.isArray(data.marketing) ? data.marketing : []).map(normalizeMarketing).filter(Boolean);
  const content   = Array.isArray(data.content)   ? data.content   : [];

  const sameClients = JSON.stringify(state.clients)   === JSON.stringify(clients);
  const sameEvents  = JSON.stringify(state.events)    === JSON.stringify(events);
  const sameMkt     = JSON.stringify(state.marketing) === JSON.stringify(marketing);
  const sameContent = JSON.stringify(state.content)   === JSON.stringify(content);
  if (sameClients && sameEvents && sameMkt && sameContent) return;

  state.clients   = clients;
  state.events    = events;
  state.marketing = marketing;
  state.content   = content;

  localStorage.setItem('crm_clients',   JSON.stringify(state.clients));
  localStorage.setItem('crm_events',    JSON.stringify(state.events));
  localStorage.setItem('crm_marketing', JSON.stringify(state.marketing));
  localStorage.setItem('crm_content',   JSON.stringify(state.content));

  refreshAll();
  updateBadges();
}

/* ─── UTILIDADES ─────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(dateStr, timeStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const datePart = d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
  return timeStr ? `${datePart} · ${timeStr}` : datePart;
}

function fmtTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function statusLabel(s) {
  return { hot: '🔥 Caliente', warm: '🌡️ Tibio', cold: '❄️ Frío' }[s] || s;
}

function followLabel(t) {
  return { weekly: '📆 Semanal', monthly: '🗒️ Mensual' }[t] || t;
}

function daysFromNow(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getClient(id) {
  return state.clients.find(c => c.id === id);
}

/* ─── NAVEGACIÓN ─────────────────────────────────── */
const viewTitles = {
  dashboard: 'Dashboard',
  clients:   'Clientes',
  agenda:    'Agenda',
  calendar:  'Calendario',
  followups: 'Seguimientos',
  content:   'Ideas de Contenido',
};

const viewActions = {
  dashboard: { label: '+ Nuevo Cliente', fn: 'openAddClientModal()' },
  clients:   { label: '+ Nuevo Cliente', fn: 'openAddClientModal()' },
  agenda:    { label: '+ Nuevo Evento',  fn: 'openAddEventModal()' },
  calendar:  { label: '+ Nuevo Evento',  fn: 'openAddEventModal()' },
  followups: { label: '+ Nuevo Cliente', fn: 'openAddClientModal()' },
  content:   { label: '+ Nueva Idea',    fn: 'openAddContentModal()' },
};

function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`[data-view="${view}"]`);
  if (nav) nav.classList.add('active');

  const now = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('topbar-title').innerHTML =
    `${viewTitles[view]} <span>${view === 'dashboard' ? now : ''}</span>`;

  const action = viewActions[view];
  const btn = document.getElementById('topbar-action-btn');
  btn.textContent = action.label;
  btn.setAttribute('onclick', action.fn);

  if (view === 'dashboard')  renderDashboard();
  if (view === 'clients')    renderClients();
  if (view === 'agenda')     renderEvents();
  if (view === 'calendar')   renderCalendar();
  if (view === 'followups')  renderFollowUps();
  if (view === 'content')    renderContent();
}

/* ─── TOAST ──────────────────────────────────────── */
function toast(msg, type = 'success', icon = null) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icon || icons[type]}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ─── CONFIRM DIALOG ─────────────────────────────── */
let confirmResolve = null;

function confirm(title, msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-ok-btn').textContent = okLabel;
    document.getElementById('confirm-overlay').classList.add('open');
  });
}

function closeConfirm(result) {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

/* ─── MODALES ────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) closeModal(this.id);
  });
});

/* ─── DRAWER ─────────────────────────────────────── */
function openDrawer(clientId) {
  state.currentClientId = clientId;
  renderDrawer(clientId);
  document.getElementById('client-drawer').classList.add('open');
}

function closeDrawer() {
  document.getElementById('client-drawer').classList.remove('open');
  state.currentClientId = null;
}

document.getElementById('client-drawer').addEventListener('click', function(e) {
  if (e.target === this) closeDrawer();
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.drawer-tab').forEach((t, i) => {
    const tabs = ['conv', 'events', 'info'];
    if (tabs[i] === tab) t.classList.add('active');
  });
}

/* ─── CLIENTES — CRUD ────────────────────────────── */
function openAddClientModal(prefill = {}) {
  document.getElementById('client-modal-title').textContent = '➕ Nuevo Cliente';
  document.getElementById('client-id').value = '';
  document.getElementById('client-name').value = prefill.name || '';
  document.getElementById('client-phone').value = prefill.phone || '';
  document.getElementById('client-email').value = prefill.email || '';
  document.getElementById('client-interest').value = prefill.interest || '';
  document.getElementById('client-notes').value = prefill.notes || '';
  document.getElementById('status-warm').checked = true;
  document.getElementById('follow-weekly').checked = true;
  openModal('client-modal');
  setTimeout(() => document.getElementById('client-name').focus(), 200);
}

function openEditClientModal(id) {
  const c = getClient(id);
  if (!c) return;
  document.getElementById('client-modal-title').textContent = '✏️ Editar Contacto';
  document.getElementById('client-id').value = c.id;
  document.getElementById('client-name').value = c.name || '';
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-email').value = c.email || '';
  document.getElementById('client-interest').value = c.interest || '';
  document.getElementById('client-notes').value = c.notes || '';

  // Seleccionar estado de forma segura
  const statusVal = c.status && ['hot', 'warm', 'cold'].includes(c.status) ? c.status : 'warm';
  const statusRadio = document.querySelector(`input[name="client-status"][value="${statusVal}"]`) || document.querySelector('input[name="client-status"][value="warm"]');
  if (statusRadio) statusRadio.checked = true;

  // Seleccionar seguimiento de forma segura
  const followVal = c.followType && ['weekly', 'monthly'].includes(c.followType) ? c.followType : 'weekly';
  const followRadio = document.querySelector(`input[name="follow-type"][value="${followVal}"]`) || document.querySelector('input[name="follow-type"][value="weekly"]');
  if (followRadio) followRadio.checked = true;

  openModal('client-modal');
  // Enfocar directamente en el campo de teléfono para que el usuario pueda escribir de inmediato
  setTimeout(() => {
    const phoneInput = document.getElementById('client-phone');
    if (phoneInput) {
      phoneInput.focus();
      phoneInput.select();
    }
  }, 220);
}

function saveClient() {
  const name = document.getElementById('client-name').value.trim();
  if (!name) { toast('El nombre del cliente es requerido', 'error'); return; }

  const id       = document.getElementById('client-id').value;
  const statusEl = document.querySelector('input[name="client-status"]:checked');
  const status   = statusEl ? statusEl.value : 'warm';
  const followEl = document.querySelector('input[name="follow-type"]:checked');
  const follow   = followEl ? followEl.value : 'weekly';
  const today    = todayStr();

  if (id) {
    // Edit
    const c = getClient(id);
    if (!c) return;
    c.name       = name;
    c.phone      = document.getElementById('client-phone').value.trim();
    c.email      = document.getElementById('client-email').value.trim();
    c.status     = status;
    c.interest   = document.getElementById('client-interest').value.trim();
    c.notes      = document.getElementById('client-notes').value.trim();
    if (c.followType !== follow) {
      c.nextFollowUp = addDays(today, follow === 'weekly' ? 7 : 30);
    }
    c.followType = follow;
    toast(`Contacto "${name}" actualizado exitosamente 🎉`, 'success');
  } else {
    // New
    const days = follow === 'weekly' ? 7 : 30;
    const client = {
      id:            uid(),
      name,
      phone:         document.getElementById('client-phone').value.trim(),
      email:         document.getElementById('client-email').value.trim(),
      status,
      followType:    follow,
      interest:      document.getElementById('client-interest').value.trim(),
      notes:         document.getElementById('client-notes').value.trim(),
      nextFollowUp:  addDays(today, days),
      createdAt:     today,
      conversations: [],
    };
    state.clients.unshift(client);
    toast(`Cliente "${name}" agregado 🎉`, 'success');
  }

  save();
  closeModal('client-modal');
  refreshAll();
  updateBadges();
}

function deleteCurrentClient() {
  const c = getClient(state.currentClientId);
  if (!c) return;
  confirm(`Eliminar a ${c.name}`, 'Se eliminarán también todos sus eventos y conversaciones. Esta acción no se puede deshacer.')
    .then(ok => {
      if (!ok) return;
      state.clients = state.clients.filter(x => x.id !== c.id);
      state.events  = state.events.filter(e => e.clientId !== c.id);
      save();
      closeDrawer();
      toast(`Cliente "${c.name}" eliminado`, 'info', '🗑️');
      refreshAll();
      updateBadges();
    });
}

function editCurrentClient() {
  closeDrawer();
  openEditClientModal(state.currentClientId);
}

/* ─── CLIENTES — SELECCIÓN MASIVA Y ELIMINACIÓN ─── */
const selectedClientIds = new Set();

function handleClientCheck(clientId, checked) {
  if (checked) selectedClientIds.add(clientId);
  else selectedClientIds.delete(clientId);
  const card = document.querySelector(`.client-card[data-client-id="${clientId}"]`);
  if (card) card.classList.toggle('selected', checked);
  updateBulkClientsBar();
}

function toggleSelectAllClients(checked) {
  const visibleCards = document.querySelectorAll('.client-card[data-client-id]');
  visibleCards.forEach(card => {
    const id = card.getAttribute('data-client-id');
    if (checked) selectedClientIds.add(id);
    else selectedClientIds.delete(id);
    const cb = card.querySelector('.client-checkbox');
    if (cb) cb.checked = checked;
    card.classList.toggle('selected', checked);
  });
  updateBulkClientsBar();
}

function updateBulkClientsBar() {
  const count = selectedClientIds.size;
  const countNum = document.getElementById('bulk-count-num');
  const counterSpan = document.getElementById('selected-counter');
  const btnDelete = document.getElementById('btn-delete-bulk');
  const selectAllCb = document.getElementById('select-all-clients');

  if (countNum) countNum.textContent = count;
  if (counterSpan) {
    counterSpan.textContent = `${count} ${count === 1 ? 'contacto seleccionado' : 'contactos seleccionados'}`;
    counterSpan.style.display = count > 0 ? 'inline' : 'none';
  }
  if (btnDelete) {
    btnDelete.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  const visibleCards = document.querySelectorAll('.client-card[data-client-id]');
  if (selectAllCb) {
    if (!visibleCards.length) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else {
      const allSelected = Array.from(visibleCards).every(c => selectedClientIds.has(c.getAttribute('data-client-id')));
      const someSelected = Array.from(visibleCards).some(c => selectedClientIds.has(c.getAttribute('data-client-id')));
      selectAllCb.checked = allSelected;
      selectAllCb.indeterminate = !allSelected && someSelected;
    }
  }
}

function deleteSingleClient(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  confirm(`Eliminar a ${c.name}`, 'Se eliminarán también todos sus eventos y conversaciones asociadas. Esta acción no se puede deshacer.')
    .then(ok => {
      if (!ok) return;
      state.clients = state.clients.filter(x => x.id !== c.id);
      state.events  = state.events.filter(e => e.clientId !== c.id);
      selectedClientIds.delete(c.id);
      save();
      if (state.currentClientId === c.id) closeDrawer();
      toast(`Contacto "${c.name}" eliminado`, 'info', '🗑️');
      refreshAll();
      updateBadges();
    });
}

function deleteSelectedClients() {
  const count = selectedClientIds.size;
  if (!count) return;

  const msg = count === 1
    ? '¿Estás seguro de que deseas eliminar este contacto seleccionado? Esta acción no se puede deshacer.'
    : `¿Estás seguro de que deseas eliminar los ${count} contactos seleccionados? Se eliminarán también todos sus eventos asociados y no se puede deshacer.`;

  confirm(`Eliminar ${count} ${count === 1 ? 'contacto' : 'contactos'}`, msg, `Eliminar (${count})`)
    .then(ok => {
      if (!ok) return;
      const idsToDelete = new Set(selectedClientIds);
      state.clients = state.clients.filter(c => !idsToDelete.has(c.id));
      state.events  = state.events.filter(e => !idsToDelete.has(e.clientId));
      selectedClientIds.clear();
      save();
      if (idsToDelete.has(state.currentClientId)) closeDrawer();
      toast(`Se eliminaron ${count} ${count === 1 ? 'contacto' : 'contactos'} exitosamente`, 'info', '🗑️');
      refreshAll();
      updateBadges();
    });
}

/* ─── CLIENTES — RENDER ──────────────────────────── */
function renderClients() {
  const grid   = document.getElementById('clients-grid');
  const search = document.getElementById('client-search').value.toLowerCase();
  const filter = state.clientFilter;
  const today  = todayStr();

  // Limpiar IDs de clientes seleccionados que ya no existen
  const currentIds = new Set(state.clients.map(c => c.id));
  for (const id of selectedClientIds) {
    if (!currentIds.has(id)) selectedClientIds.delete(id);
  }

  let list = state.clients.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search) &&
        !(c.phone || '').includes(search) &&
        !(c.email || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">👥</div>
      <h3>Sin clientes</h3>
      <p>Agrega tu primer cliente con el botón "+ Nuevo Cliente"</p>
    </div>`;
    updateBulkClientsBar();
    return;
  }

  grid.innerHTML = list.map(c => {
    const overdue = c.nextFollowUp < today;
    const clientEvents = state.events.filter(e => e.clientId === c.id && !e.completed && e.date >= today);
    const nextEvent = clientEvents.sort((a,b) => a.date.localeCompare(b.date))[0];
    const isChecked = selectedClientIds.has(c.id);

    return `
    <div class="client-card ${isChecked ? 'selected' : ''}" data-client-id="${c.id}" onclick="openDrawer('${c.id}')">
      <div class="card-top">
        <div class="client-select-wrap" onclick="event.stopPropagation()">
          <input type="checkbox" class="client-checkbox" ${isChecked ? 'checked' : ''} onchange="handleClientCheck('${c.id}', this.checked)" title="Seleccionar para eliminar" />
        </div>
        <div class="client-avatar ${c.status}">${initials(c.name)}</div>
        <div class="client-info">
          <div class="client-name">${escapeHtml(c.name)}</div>
          <div class="client-contact">${escapeHtml(c.phone || c.email || 'Sin contacto')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="status-badge ${c.status}">${statusLabel(c.status)}</span>
          <button class="client-card-edit-btn" onclick="event.stopPropagation(); openEditClientModal('${c.id}')" title="Editar contacto y teléfono">✏️</button>
          <button class="client-card-delete-btn" onclick="event.stopPropagation(); deleteSingleClient('${c.id}')" title="Eliminar este contacto">🗑️</button>
        </div>
      </div>
      <div class="card-meta">
        <div class="meta-row">
          <span class="meta-icon">🔔</span>
          <span>${followLabel(c.followType)}</span>
          ${overdue
            ? `<span class="overdue-chip">⚠️ Vencido</span>`
            : `<span class="follow-chip">📅 ${fmtDate(c.nextFollowUp)}</span>`
          }
        </div>
        ${nextEvent ? `
        <div class="meta-row">
          <span class="meta-icon">${nextEvent.type === 'call' ? '📞' : '🏡'}</span>
          <span>${nextEvent.type === 'call' ? 'Llamada' : 'Visita'}: ${fmtDateTime(nextEvent.date, nextEvent.time)}</span>
        </div>` : ''}
        ${c.interest ? `
        <div class="meta-row">
          <span class="meta-icon">🏠</span>
          <span>${escapeHtml(c.interest)}</span>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');

  updateBulkClientsBar();
}

function setFilter(filter, btn) {
  state.clientFilter = filter;
  document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderClients();
}

/* ─── CONVERSACIONES ─────────────────────────────── */
function addConversation() {
  const text = document.getElementById('new-conv-text').value.trim();
  if (!text) { toast('Escribe el contenido de la conversación', 'warning'); return; }
  const c = getClient(state.currentClientId);
  if (!c) return;
  if (!c.conversations) c.conversations = [];
  c.conversations.unshift({ id: uid(), ts: Date.now(), text });
  save();
  document.getElementById('new-conv-text').value = '';
  renderConversations(c);
  toast('Conversación registrada 💬', 'success');
}

function deleteConversation(convId) {
  const c = getClient(state.currentClientId);
  if (!c) return;
  confirm('Eliminar entrada', '¿Eliminar esta nota de conversación?').then(ok => {
    if (!ok) return;
    c.conversations = c.conversations.filter(cv => cv.id !== convId);
    save();
    renderConversations(c);
    toast('Nota eliminada', 'info');
  });
}

function renderConversations(client) {
  const list = document.getElementById('conv-list');
  if (!client.conversations || !client.conversations.length) {
    list.innerHTML = `<div class="empty-state" style="padding:30px 0">
      <div class="empty-icon">💬</div>
      <p>Aún no hay conversaciones registradas</p>
    </div>`;
    return;
  }
  list.innerHTML = client.conversations.map(cv => `
    <div class="conv-entry" id="conv-${cv.id}">
      <div class="conv-date">🕐 ${fmtTimestamp(cv.ts)}</div>
      <div class="conv-text">${escapeHtml(cv.text)}</div>
      <div class="conv-actions">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteConversation('${cv.id}')" title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── DRAWER RENDER ──────────────────────────────── */
function renderDrawer(clientId) {
  const c = getClient(clientId);
  if (!c) return;

  // Header
  const avatar = document.getElementById('drawer-avatar');
  avatar.textContent = initials(c.name);
  avatar.className = `drawer-avatar ${c.status}`;
  document.getElementById('drawer-name').textContent = c.name;

  const badge = document.getElementById('drawer-status-badge');
  badge.textContent = statusLabel(c.status);
  badge.className = `status-badge ${c.status}`;

  const meta = [];
  if (c.phone) meta.push(`📞 ${c.phone}`);
  if (c.email) meta.push(`✉️ ${c.email}`);
  meta.push(`🔔 ${followLabel(c.followType)}`);
  meta.push(`📅 Próximo: ${fmtDate(c.nextFollowUp)}`);
  document.getElementById('drawer-meta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');

  // Conversations
  renderConversations(c);

  // Events
  renderDrawerEvents(c);

  // Info
  renderClientInfoPanel(c);

  // Reset tab
  switchTab('conv');
}

function renderDrawerEvents(client) {
  const list = document.getElementById('drawer-events-list');
  const clientEvents = state.events
    .filter(e => e.clientId === client.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  if (!clientEvents.length) {
    list.innerHTML = `<div class="empty-state" style="padding:30px 0">
      <div class="empty-icon">📅</div>
      <p>Sin eventos programados</p>
    </div>`;
    return;
  }

  list.innerHTML = clientEvents.map(ev => buildEventHTML(ev, true)).join('');
}

function renderClientInfoPanel(client) {
  const panel = document.getElementById('client-info-panel');
  const overdue = client.nextFollowUp < todayStr();
  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group" style="margin:0">
        <label class="form-label">Estado</label>
        <p>${statusLabel(client.status)}</p>
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Seguimiento</label>
        <p>${followLabel(client.followType)}</p>
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Próximo seguimiento</label>
        <p class="${overdue ? 'due-overdue' : ''}">${fmtDate(client.nextFollowUp)} ${overdue ? '⚠️ Vencido' : ''}</p>
      </div>
      ${client.interest ? `<div class="form-group" style="margin:0">
        <label class="form-label">Interés / Propiedad</label>
        <p>${escapeHtml(client.interest)}</p>
      </div>` : ''}
      ${client.notes ? `<div class="form-group" style="margin:0">
        <label class="form-label">Notas generales</label>
        <p style="white-space:pre-wrap;line-height:1.7">${escapeHtml(client.notes)}</p>
      </div>` : ''}
      <div class="form-group" style="margin:0">
        <label class="form-label">Cliente desde</label>
        <p>${fmtDate(client.createdAt)}</p>
      </div>
      <div class="divider"></div>
      <button class="btn btn-primary" onclick="completeFollowUp('${client.id}')">✅ Marcar seguimiento completado</button>
      <button class="btn btn-secondary" onclick="openFollowUpInGoogleCalendar('${client.id}')" style="margin-top:6px">📅 Agendar seguimiento en Google Calendar</button>
    </div>
  `;
}

/* ─── EVENTOS — CRUD ─────────────────────────────── */
function openAddEventModal() {
  document.getElementById('event-modal-title').textContent = '📅 Nuevo Evento';
  document.getElementById('event-id').value = '';
  document.getElementById('event-client-id').value = '';
  document.getElementById('etype-call').checked = true;
  document.getElementById('event-date').value = todayStr();
  document.getElementById('event-time').value = '10:00';
  document.getElementById('event-address').value = '';
  document.getElementById('event-notes').value = '';
  document.getElementById('visit-address-group').style.display = 'none';
  populateClientSelect('');
  openModal('event-modal');
}

function openAddEventForClient() {
  openAddEventModal();
  const c = getClient(state.currentClientId);
  if (c) {
    document.getElementById('event-client-id').value = c.id;
    const sel = document.getElementById('event-client-select');
    sel.value = c.id;
  }
}

function populateClientSelect(selectedId) {
  const sel = document.getElementById('event-client-select');
  sel.innerHTML = '<option value="">— Seleccionar cliente —</option>' +
    state.clients.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}

// Show/hide address on type change
document.querySelectorAll('input[name="event-type"]').forEach(r => {
  r.addEventListener('change', () => {
    const isVisit = document.getElementById('etype-visit').checked;
    document.getElementById('visit-address-group').style.display = isVisit ? '' : 'none';
  });
});

function saveEvent() {
  const date = document.getElementById('event-date').value;
  const time = document.getElementById('event-time').value;
  if (!date || !time) { toast('Fecha y hora son requeridas', 'error'); return; }
  const clientId = document.getElementById('event-client-select').value;
  if (!clientId) { toast('Selecciona un cliente', 'error'); return; }

  const id      = document.getElementById('event-id').value;
  const type    = document.querySelector('input[name="event-type"]:checked').value;
  const address = document.getElementById('event-address').value.trim();
  const notes   = document.getElementById('event-notes').value.trim();
  const client  = state.clients.find(c => c.id === clientId);

  const syncGCal = document.getElementById('event-sync-gcal') ? document.getElementById('event-sync-gcal').checked : true;

  if (id) {
    const ev = state.events.find(e => e.id === id);
    if (ev) { ev.type = type; ev.clientId = clientId; ev.date = date; ev.time = time; ev.address = address; ev.notes = notes; }
    toast('Evento actualizado en CRM 📅', 'success');
  } else {
    state.events.push({ id: uid(), type, clientId, date, time, address, notes, completed: false });
    toast('Evento guardado en el CRM 🎉', 'success');
  }

  save();
  closeModal('event-modal');
  refreshAll();

  // Sincronizar automáticamente con Google Calendar
  if (syncGCal) {
    setTimeout(() => {
      const gcalUrl = getGoogleCalendarUrl({ type, date, time, address, notes }, client);
      window.open(gcalUrl, '_blank');
      toast('Abriendo Google Calendar para agendar en antonydiezcaceres@gmail.com 📅', 'info');
    }, 350);
  }

  // Verificar notificaciones de inmediato para el nuevo evento
  checkNotifications();
}

function toggleEventComplete(evId) {
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;
  ev.completed = !ev.completed;
  save();
  refreshAll();
  if (ev.completed) toast('Evento marcado como completado ✅', 'success');
}

function deleteEvent(evId) {
  confirm('Eliminar evento', '¿Eliminar este evento de la agenda?').then(ok => {
    if (!ok) return;
    state.events = state.events.filter(e => e.id !== evId);
    save();
    refreshAll();
    toast('Evento eliminado', 'info');
  });
}

function editEvent(evId) {
  const ev = state.events.find(e => e.id === evId);
  if (!ev) return;
  document.getElementById('event-modal-title').textContent = '✏️ Editar Evento';
  document.getElementById('event-id').value = ev.id;
  document.querySelector(`input[name="event-type"][value="${ev.type}"]`).checked = true;
  document.getElementById('event-date').value = ev.date;
  document.getElementById('event-time').value = ev.time;
  document.getElementById('event-address').value = ev.address || '';
  document.getElementById('event-notes').value = ev.notes || '';
  document.getElementById('visit-address-group').style.display = ev.type === 'visit' ? '' : 'none';
  populateClientSelect(ev.clientId);
  openModal('event-modal');
}

/* ─── EVENTOS — RENDER ───────────────────────────── */
function buildEventHTML(ev, mini = false) {
  const c = getClient(ev.clientId);
  const today = todayStr();
  const overdue = !ev.completed && ev.date < today;
  const typeIcon = ev.type === 'call' ? '📞' : '🏡';
  const typeLabel = ev.type === 'call' ? 'Llamada' : 'Visita Guiada';

  return `
  <div class="event-item ${ev.completed ? 'completed' : ''} ${overdue ? 'event-overdue' : ''}">
    <div class="event-type-icon ${ev.type}">${typeIcon}</div>
    <div class="event-info">
      <div class="event-title">${typeLabel}${c ? ` — ${c.name}` : ''}</div>
      <div class="event-meta">
        ${ev.address ? `<span>📍 ${ev.address}</span>` : ''}
        ${ev.notes ? `<span>📝 ${ev.notes.slice(0,60)}${ev.notes.length>60?'…':''}</span>` : ''}
        ${overdue ? `<span style="color:var(--hot);font-weight:600">⚠️ Vencido</span>` : ''}
      </div>
    </div>
    <div class="event-datetime">
      <div class="event-date-val">${fmtDate(ev.date)}</div>
      <div class="event-time-val">${ev.time || '—'}</div>
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0">
      <button class="btn btn-ghost btn-icon btn-sm" onclick="openInGoogleCalendar('${ev.id}')" title="Agendar en Google Calendar" style="color:var(--primary)">📅</button>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="toggleEventComplete('${ev.id}')" title="${ev.completed ? 'Reabrir' : 'Completar'}">
        ${ev.completed ? '↩️' : '✅'}
      </button>
      ${!mini ? `<button class="btn btn-ghost btn-icon btn-sm" onclick="editEvent('${ev.id}')" title="Editar">✏️</button>` : ''}
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteEvent('${ev.id}')" title="Eliminar">🗑️</button>
    </div>
  </div>`;
}

function setEventFilter(filter, btn) {
  state.eventFilter = filter;
  document.querySelectorAll('.filter-btn[data-event-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

function renderEvents() {
  const list = document.getElementById('events-list');
  const today = todayStr();
  const filter = state.eventFilter;

  let evs = [...state.events].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  if (filter === 'call')    evs = evs.filter(e => e.type === 'call');
  if (filter === 'visit')   evs = evs.filter(e => e.type === 'visit');
  if (filter === 'pending') evs = evs.filter(e => !e.completed);
  if (filter === 'today')   evs = evs.filter(e => e.date === today);

  if (!evs.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <h3>Sin eventos</h3>
      <p>Agrega llamadas o visitas desde "+ Nuevo Evento"</p>
    </div>`;
    return;
  }

  list.innerHTML = evs.map(ev => buildEventHTML(ev)).join('');
}

/* ─── SEGUIMIENTOS ───────────────────────────────── */
function completeFollowUp(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  const days = c.followType === 'weekly' ? 7 : 30;
  c.nextFollowUp = addDays(todayStr(), days);
  save();
  renderClientInfoPanel(c);
  renderFollowUps();
  updateBadges();
  renderDashboard();
  toast(`Seguimiento completado. Próximo: ${fmtDate(c.nextFollowUp)} 📅`, 'success');
}

function setFuFilter(filter, btn) {
  state.fuFilter = filter;
  document.querySelectorAll('.filter-btn[data-fu-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFollowUps();
}

function renderFollowUps() {
  const list = document.getElementById('followups-list');
  const today = todayStr();
  const filter = state.fuFilter;

  let clients = [...state.clients].sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

  if (filter === 'overdue') clients = clients.filter(c => c.nextFollowUp < today);
  if (filter === 'soon')    clients = clients.filter(c => c.nextFollowUp >= today && daysFromNow(c.nextFollowUp) <= 3);
  if (filter === 'weekly')  clients = clients.filter(c => c.followType === 'weekly');
  if (filter === 'monthly') clients = clients.filter(c => c.followType === 'monthly');

  if (!clients.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">✅</div>
      <h3>Todo al día</h3>
      <p>No hay seguimientos pendientes</p>
    </div>`;
    return;
  }

  list.innerHTML = clients.map(c => {
    const days = daysFromNow(c.nextFollowUp);
    let dueClass, dueText;
    if (days < 0)     { dueClass = 'due-overdue'; dueText = `⚠️ Vencido hace ${Math.abs(days)} día${Math.abs(days)!==1?'s':''}`; }
    else if (days === 0) { dueClass = 'due-overdue'; dueText = '🔴 Hoy'; }
    else if (days <= 3)  { dueClass = 'due-soon';    dueText = `⏰ En ${days} día${days!==1?'s':''}`; }
    else                 { dueClass = 'due-ok';       dueText = `${fmtDate(c.nextFollowUp)}`; }

    return `
    <div class="followup-item" onclick="openDrawer('${c.id}')" style="cursor:pointer">
      <div class="fi-avatar ${c.status}">${initials(c.name)}</div>
      <div class="fi-info">
        <div class="fi-name">${c.name}</div>
        <div class="fi-meta">
          <span>${statusLabel(c.status)}</span>
          <span>${followLabel(c.followType)}</span>
          ${c.phone ? `<span>📞 ${c.phone}</span>` : ''}
        </div>
      </div>
      <div class="fi-due">
        <div class="${dueClass}">${dueText}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="event.stopPropagation(); openFollowUpInGoogleCalendar('${c.id}')" title="Agendar seguimiento en Google Calendar" style="color:var(--primary)">📅</button>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); completeFollowUp('${c.id}')">✅ Hecho</button>
      </div>
    </div>`;
  }).join('');
}

/* ─── DASHBOARD ──────────────────────────────────── */
function renderDashboard() {
  const today = todayStr();
  const hot   = state.clients.filter(c => c.status === 'hot').length;
  const warm  = state.clients.filter(c => c.status === 'warm').length;
  const cold  = state.clients.filter(c => c.status === 'cold').length;
  const callsToday  = state.events.filter(e => e.type === 'call' && e.date === today && !e.completed).length;
  const visitsToday = state.events.filter(e => e.type === 'visit' && e.date === today && !e.completed).length;

  document.getElementById('stat-hot').textContent = hot;
  document.getElementById('stat-warm').textContent = warm;
  document.getElementById('stat-cold').textContent = cold;
  document.getElementById('stat-calls-today').textContent = callsToday;
  document.getElementById('stat-visits-today').textContent = visitsToday;

  // Upcoming events (next 7 days)
  const upcoming = state.events
    .filter(e => !e.completed && e.date >= today && e.date <= addDays(today, 7))
    .sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 6);

  const upcomingList = document.getElementById('upcoming-list');
  if (!upcoming.length) {
    upcomingList.innerHTML = `<div class="empty-state" style="padding:30px 0"><div class="empty-icon">📭</div><p>Sin eventos próximos</p></div>`;
  } else {
    upcomingList.innerHTML = upcoming.map(ev => {
      const c = getClient(ev.clientId);
      return `
      <div class="upcoming-item" onclick="openDrawer('${ev.clientId}')" style="cursor:pointer">
        <div class="upcoming-dot ${ev.type}"></div>
        <div class="upcoming-content">
          <div class="upcoming-title">${ev.type === 'call' ? '📞 Llamada' : '🏡 Visita'} — ${c ? c.name : '?'}</div>
          <div class="upcoming-sub">${ev.address || ev.notes || (c ? c.phone : '') || ''}</div>
        </div>
        <div class="upcoming-time">${ev.date === today ? 'Hoy' : fmtDate(ev.date)} ${ev.time}</div>
      </div>`;
    }).join('');
  }

  // Dashboard follow-ups (overdue + next 3 days)
  const overdue = state.clients
    .filter(c => c.nextFollowUp <= addDays(today, 3))
    .sort((a,b) => a.nextFollowUp.localeCompare(b.nextFollowUp))
    .slice(0, 5);

  const dashFu = document.getElementById('dash-followups');
  if (!overdue.length) {
    dashFu.innerHTML = `<div class="empty-state" style="padding:30px 0"><div class="empty-icon">✅</div><p>Todo al día</p></div>`;
  } else {
    dashFu.innerHTML = overdue.map(c => {
      const days = daysFromNow(c.nextFollowUp);
      let dueClass, dueText;
      if (days < 0)      { dueClass = 'due-overdue'; dueText = `Vencido hace ${Math.abs(days)}d`; }
      else if (days === 0) { dueClass = 'due-overdue'; dueText = 'Hoy'; }
      else                 { dueClass = 'due-soon';    dueText = `En ${days}d`; }
      return `
      <div class="upcoming-item" onclick="openDrawer('${c.id}')" style="cursor:pointer">
        <div class="upcoming-dot followup"></div>
        <div class="upcoming-content">
          <div class="upcoming-title">${c.name}</div>
          <div class="upcoming-sub">${statusLabel(c.status)} · ${followLabel(c.followType)}</div>
        </div>
        <div class="upcoming-time ${dueClass}">${dueText}</div>
      </div>`;
    }).join('');
  }
}

/* ─── CALENDARIO ─────────────────────────────────── */
function renderCalendar() {
  const year = state.calYear;
  const month = state.calMonth;

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-title').textContent = `${months[month]} ${year}`;

  const grid = document.getElementById('calendar-grid');
  // Remove day cells (keep labels)
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // Event lookup by date string
  const eventsByDate = {};
  state.events.forEach(ev => {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  });

  const totalCells = Math.ceil((first + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';

    let dayNum, dateStr, otherMonth = false;
    if (i < first) {
      dayNum = daysInPrev - first + i + 1;
      dateStr = `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      otherMonth = true;
    } else if (i >= first + daysInMonth) {
      dayNum = i - first - daysInMonth + 1;
      dateStr = `${year}-${String(month + 2).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      otherMonth = true;
    } else {
      dayNum = i - first + 1;
      dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    }

    if (otherMonth) cell.classList.add('other-month');

    const cellDate = new Date(dateStr + 'T00:00:00');
    if (cellDate.getTime() === today.getTime()) cell.classList.add('today');

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = dayNum;
    cell.appendChild(numEl);

    const dayEvents = eventsByDate[dateStr] || [];
    if (dayEvents.length > 0) {
      cell.classList.add('has-events');
      const dots = document.createElement('div');
      dayEvents.slice(0,4).forEach(ev => {
        const dot = document.createElement('span');
        dot.className = `cal-dot ${ev.type}`;
        dot.title = `${ev.type === 'call' ? 'Llamada' : 'Visita'} ${ev.time}`;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
      cell.addEventListener('click', () => showCalDayDetail(dateStr, dayEvents));
    }

    grid.appendChild(cell);
  }
}

function showCalDayDetail(dateStr, events) {
  document.getElementById('cal-day-detail').style.display = '';
  document.getElementById('cal-detail-title').textContent = `📅 Eventos: ${fmtDate(dateStr)}`;
  document.getElementById('cal-day-events').innerHTML = events.map(ev => buildEventHTML(ev)).join('');
}

function calNav(dir) {
  state.calMonth += dir;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  if (state.calMonth < 0)  { state.calMonth = 11; state.calYear--; }
  renderCalendar();
}

function calToday() {
  state.calYear  = new Date().getFullYear();
  state.calMonth = new Date().getMonth();
  renderCalendar();
}

/* ─── BADGES ─────────────────────────────────────── */
function updateBadges() {
  const today = todayStr();
  const pending = state.clients.filter(c => c.nextFollowUp <= today).length;
  const badge = document.getElementById('followup-badge');
  const prevCount = parseInt(badge.textContent) || 0;
  badge.textContent = pending;
  badge.classList.toggle('show', pending > 0);
  // Suena cuando aparecen nuevos pendientes
  if (pending > 0 && pending > prevCount) {
    playSound('reminder');
  }
  // Mobile badge
  const mobBadge = document.getElementById('mob-followup-badge');
  if (mobBadge) {
    mobBadge.textContent = pending || '';
    mobBadge.classList.toggle('show', pending > 0);
  }
}

/* ─── EXPORTAR / IMPORTAR (EXCEL & JSON) ────────── */
function openExportModal() {
  openModal('export-modal');
}

/**
 * Asegura que la librería SheetJS (XLSX) esté disponible.
 * Si falló la carga inicial desde jsdelivr, intenta cargarla dinámicamente desde CDNs alternativos.
 */
async function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return true;

  const cdns = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];

  for (const src of cdns) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
      if (typeof XLSX !== 'undefined') return true;
    } catch (_) {
      // Intentar siguiente CDN
    }
  }

  return typeof XLSX !== 'undefined';
}

/**
 * Convierte cualquier formato de fecha proveniente de Excel (Date, serial numérico, DD/MM/AAAA)
 * al formato estándar YYYY-MM-DD del CRM.
 */
function parseExcelDate(raw, defaultDays = 7) {
  if (!raw) return addDays(todayStr(), defaultDays);

  if (raw instanceof Date && !isNaN(raw)) {
    return raw.toISOString().slice(0, 10);
  }

  // Número serial de Excel (ej: 45621)
  if (typeof raw === 'number' || (/^\d{4,5}$/.test(String(raw).trim()) && Number(raw) > 10000 && Number(raw) < 70000)) {
    const num = Number(raw);
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date)) return date.toISOString().slice(0, 10);
  }

  const str = String(raw).trim();
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Formato YYYY/MM/DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return addDays(todayStr(), defaultDays);
}

/**
 * Parser nativo para archivos CSV en caso de que SheetJS no esté disponible o para imports directos
 */
function parseCsvRows(text) {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detectar delimitador (; o , o \t)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : (headerLine.includes('\t') ? '\t' : ',');

  const parseLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Descarga una plantilla oficial en formato Excel (.xlsx) con filas de ejemplo,
 * ideal para que el usuario pueda rellenarla e importar sus clientes fácilmente.
 */
async function downloadExcelTemplate() {
  await ensureXLSX();

  const templateRows = [
    {
      'Nombre Completo':     'Carlos Mendoza',
      'Teléfono':            '+57 300 123 4567',
      'Correo Electrónico':  'carlos.mendoza@email.com',
      'Estado':              'Caliente',
      'Seguimiento':         'Semanal',
      'Próximo Seguimiento': addDays(todayStr(), 7),
      'Propiedad / Interés': 'Apartamento 3 hab Chapinero',
      'Notas':               'Interesado en entrega inmediata. Presupuesto $450M.',
    },
    {
      'Nombre Completo':     'Laura Restrepo',
      'Teléfono':            '+57 312 987 6543',
      'Correo Electrónico':  'laura.restrepo@email.com',
      'Estado':              'Tibio',
      'Seguimiento':         'Mensual',
      'Próximo Seguimiento': addDays(todayStr(), 30),
      'Propiedad / Interés': 'Casa campestre en Chía',
      'Notas':               'Evaluando opciones de crédito hipotecario.',
    },
    {
      'Nombre Completo':     'Andrés Gómez',
      'Teléfono':            '+57 310 555 7890',
      'Correo Electrónico':  'andres.gomez@email.com',
      'Estado':              'Frío',
      'Seguimiento':         'Mensual',
      'Próximo Seguimiento': addDays(todayStr(), 30),
      'Propiedad / Interés': 'Oficina comercial 80m2',
      'Notas':               'Contactar a fin de trimestre.',
    }
  ];

  const fileName = `Plantilla_Importar_Clientes.xlsx`;

  if (typeof XLSX !== 'undefined') {
    try {
      const ws = XLSX.utils.json_to_sheet(templateRows);
      ws['!cols'] = [
        { wch: 24 }, // Nombre
        { wch: 18 }, // Teléfono
        { wch: 28 }, // Email
        { wch: 12 }, // Estado
        { wch: 14 }, // Seguimiento
        { wch: 20 }, // Próximo Seguimiento
        { wch: 32 }, // Interés
        { wch: 45 }, // Notas
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Clientes');
      triggerExcelDownload(wb, fileName);
      toast('Plantilla Excel (.xlsx) descargada exitosamente 📋', 'success');
      playSound('success');
      return;
    } catch (err) {
      console.warn('[CRM] Falló exportación con SheetJS:', err);
    }
  }

  // Fallback CSV si XLSX no estuviera disponible
  const headers = ['Nombre Completo', 'Teléfono', 'Correo Electrónico', 'Estado', 'Seguimiento', 'Próximo Seguimiento', 'Propiedad / Interés', 'Notas'];
  const csvContent = '\uFEFF' + [
    headers.join(';'),
    ...templateRows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  ].join('\r\n');

  triggerTextDownload(csvContent, `Plantilla_Importar_Clientes.csv`, 'text/csv');
  toast('Plantilla descargada en formato CSV compatible con Excel 📋', 'success');
}

/**
 * Descarga un libro de Excel (.xlsx) garantizando compatibilidad total tanto en servidores web
 * como en apertura directa local (file:///), evitando que Chrome o Edge le asignen nombres UUID sin extensión.
 */
function triggerExcelDownload(wb, fileName) {
  try {
    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const dataUri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = dataUri;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
  } catch (err) {
    console.warn('[CRM] Fallback a XLSX.writeFile:', err);
    XLSX.writeFile(wb, fileName);
  }
}

/**
 * Descarga archivos de texto plano (CSV o JSON) respetando el nombre y extensión del archivo.
 */
function triggerTextDownload(content, fileName, mimeType = 'text/plain') {
  try {
    const dataUri = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = dataUri;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
  } catch (err) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Exporta la lista de clientes a un archivo Excel (.xlsx) real.
 * Si no hay clientes registrados, descarga automáticamente la plantilla para poder importar.
 */
async function exportClientsToExcel() {
  if (!state.clients || !state.clients.length) {
    toast('No hay clientes registrados aún. Se descargará la plantilla Excel para importar clientes 📋', 'info');
    await downloadExcelTemplate();
    return;
  }

  await ensureXLSX();

  const rows = state.clients.map(c => ({
    'Nombre Completo':     c.name || '',
    'Teléfono':            c.phone || '',
    'Correo Electrónico':  c.email || '',
    'Estado':              c.status === 'hot' ? 'Caliente' : c.status === 'cold' ? 'Frío' : 'Tibio',
    'Seguimiento':         c.followType === 'monthly' ? 'Mensual' : 'Semanal',
    'Próximo Seguimiento': c.nextFollowUp || '',
    'Propiedad / Interés': c.interest || '',
    'Notas':               c.notes || '',
    'Fecha de Registro':   c.createdAt || '',
  }));

  const fileName = `Clientes_CRM_${todayStr()}.xlsx`;

  if (typeof XLSX !== 'undefined') {
    try {
      const ws = XLSX.utils.json_to_sheet(rows);

      // Ajustar ancho de columnas automáticamente
      const colWidths = [
        { wch: 26 }, // Nombre
        { wch: 18 }, // Teléfono
        { wch: 28 }, // Email
        { wch: 12 }, // Estado
        { wch: 14 }, // Seguimiento
        { wch: 20 }, // Próximo Seguimiento
        { wch: 32 }, // Interés
        { wch: 35 }, // Notas
        { wch: 16 }, // Fecha Registro
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      triggerExcelDownload(wb, fileName);
      toast(`Exportados ${rows.length} clientes a Excel (.xlsx) exitosamente 📊`, 'success');
      playSound('success');
      return;
    } catch (err) {
      console.warn('[CRM] Error con SheetJS al exportar, usando fallback CSV:', err);
    }
  }

  // Fallback CSV (compatible con Excel con BOM UTF-8)
  const headers = ['Nombre Completo', 'Teléfono', 'Correo Electrónico', 'Estado', 'Seguimiento', 'Próximo Seguimiento', 'Propiedad / Interés', 'Notas', 'Fecha de Registro'];
  const csvContent = '\uFEFF' + [
    headers.join(';'),
    ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  ].join('\r\n');

  triggerTextDownload(csvContent, `Clientes_CRM_${todayStr()}.csv`, 'text/csv');
  toast(`Exportados ${rows.length} clientes en formato CSV para Excel 📊`, 'success');
}

/** Dispara el selector de archivo oculto para importar desde la vista de clientes */
function triggerImportExcel() {
  const input = document.getElementById('excel-import-input');
  if (input) input.click();
}

/** Lee el archivo seleccionado desde el input de la vista de clientes */
function importClientsFromExcel(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  processExcelFile(file);
  e.target.value = '';
}

/** Lee el archivo seleccionado desde el modal de exportación/importación */
function importClientsFromModalExcel() {
  const input = document.getElementById('modal-excel-file');
  const file = input && input.files && input.files[0];
  if (!file) {
    toast('Selecciona un archivo Excel (.xlsx, .xls) o CSV', 'warning');
    return;
  }
  processExcelFile(file, 'export-modal');
  input.value = '';
}

/**
 * Procesa un archivo Excel (.xlsx, .xls) o CSV e importa los clientes al CRM
 * @param {File} file
 * @param {string|null} modalId
 */
async function processExcelFile(file, modalId = null) {
  if (!file) return;

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const hasXlsx = await ensureXLSX();

  if (!hasXlsx && !isCsv) {
    toast('Cargando librería Excel, por favor intenta en unos segundos o utiliza un archivo .csv', 'warning');
    return;
  }

  // Si es CSV y no está XLSX disponible, procesar vía FileReader texto nativo
  if (isCsv && typeof XLSX === 'undefined') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rawRows = parseCsvRows(text);
        finishImportRows(rawRows, modalId);
      } catch (err) {
        console.error('[CRM CSV Import]', err);
        toast('Error al procesar archivo CSV: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
    return;
  }

  // Procesamiento principal con SheetJS (soporta .xlsx, .xls, .csv)
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      finishImportRows(rawRows, modalId);
    } catch (err) {
      console.error('[CRM Import]', err);
      toast('Error al procesar el archivo Excel: ' + (err.message || 'Formato no soportado'), 'error');
    }
  };

  reader.onerror = () => {
    toast('Error al leer el archivo desde el disco', 'error');
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Normaliza e inserta las filas importadas en el estado de clientes
 */
function finishImportRows(rawRows, modalId = null) {
  if (!rawRows || !rawRows.length) {
    toast('El archivo no contiene filas o datos de clientes', 'warning');
    return;
  }

  let importedCount = 0;
  const today = todayStr();

  rawRows.forEach(row => {
    // Normalizar nombres de columnas a minúsculas sin acentos
    const normalized = {};
    Object.keys(row).forEach(k => {
      const cleanKey = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      normalized[cleanKey] = row[k];
    });

    // Buscar campos con variantes comunes
    const nameVal = normalized['nombre completo'] || normalized['nombre'] || normalized['nombres'] || normalized['cliente'] || normalized['name'] || normalized['prospecto'] || normalized['contacto'];
    const name = String(nameVal || '').trim();
    if (!name) return; // Si no tiene nombre, se ignora la fila

    const phoneRaw = normalized['telefono'] || normalized['celular'] || normalized['movil'] || normalized['phone'] || normalized['tel'] || normalized['numero'] || normalized['numero de telefono'] || normalized['numero celular'] || normalized['whatsapp'] || normalized['wsp'] || normalized['contacto'] || normalized['nro'] || normalized['telf'] || '';
    const phone = String(phoneRaw || '').trim();

    const emailRaw = normalized['correo electronico'] || normalized['correo'] || normalized['email'] || normalized['mail'] || normalized['e-mail'] || '';
    const email = String(emailRaw || '').trim();

    const interestRaw = normalized['propiedad / interes'] || normalized['propiedad'] || normalized['interes'] || normalized['inmueble'] || normalized['proyecto'] || normalized['interesado en'] || '';
    const interest = String(interestRaw || '').trim();

    const notesRaw = normalized['notas'] || normalized['observaciones'] || normalized['comentarios'] || normalized['notes'] || normalized['nota'] || normalized['detalle'] || '';
    const notes = String(notesRaw || '').trim();

    // Detectar estado (hot, warm, cold)
    let status = 'warm';
    const rawStatus = String(normalized['estado'] || normalized['status'] || normalized['etapa'] || '').toLowerCase();
    if (rawStatus.includes('caliente') || rawStatus.includes('hot')) {
      status = 'hot';
    } else if (rawStatus.includes('frio') || rawStatus.includes('cold')) {
      status = 'cold';
    }

    // Detectar seguimiento (weekly, monthly)
    let followType = 'weekly';
    const rawFollow = String(normalized['seguimiento'] || normalized['frecuencia'] || normalized['periodo'] || '').toLowerCase();
    if (rawFollow.includes('mensual') || rawFollow.includes('month')) {
      followType = 'monthly';
    }

    // Próximo seguimiento con soporte para fechas de Excel
    const rawDate = normalized['proximo seguimiento'] || normalized['fecha seguimiento'] || normalized['siguiente seguimiento'] || normalized['fecha'] || '';
    const nextFollowUp = parseExcelDate(rawDate, followType === 'weekly' ? 7 : 30);

    // Crear cliente
    const newClient = {
      id:            uid(),
      name,
      phone,
      email,
      status,
      followType,
      interest,
      notes,
      nextFollowUp,
      createdAt:     today,
      conversations: [],
    };

    state.clients.unshift(newClient);
    importedCount++;
  });

  if (importedCount === 0) {
    toast('No se encontraron clientes válidos en el archivo (asegúrate de incluir una columna "Nombre")', 'warning');
    return;
  }

  save();
  refreshAll();
  updateBadges();

  if (modalId) closeModal(modalId);

  toast(`¡Se importaron ${importedCount} clientes desde Excel exitosamente! 🎉`, 'success');
  playSound('success');
}

function exportData() {
  const data = JSON.stringify({
    clients:   state.clients,
    events:    state.events,
    marketing: state.marketing,
    content:   state.content,
  }, null, 2);
  const fileName = `crm-backup-${todayStr()}.json`;
  triggerTextDownload(data, fileName, 'application/json');
  toast('Datos exportados exitosamente 💾', 'success');
}

function importData() {
  const file = document.getElementById('import-file').files[0];
  if (!file) { toast('Selecciona un archivo JSON', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.clients || !Array.isArray(data.clients)) throw new Error('Formato inválido');
      state.clients   = data.clients;
      state.events    = data.events || [];
      state.marketing = data.marketing || [];
      state.content   = data.content || [];
      save();
      refreshAll();
      updateBadges();
      closeModal('export-modal');
      toast(`Importados ${state.clients.length} clientes, ${state.events.length} eventos y ${state.content.length} ideas de contenido 🎉`, 'success');
    } catch (err) {
      toast('Error al leer el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ─── SONIDO DE NOTIFICACIÓN (Web Audio API) ────── */
let audioCtx = null;
let soundMuted = localStorage.getItem('crm_muted') === 'true';

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Reanudar si el navegador lo suspendó (política autoplay)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Desbloquear AudioContext al primer gesto del usuario.
 * Los navegadores bloquean el audio hasta que haya una interacción.
 */
function setupAudioUnlock() {
  const unlock = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    } else if (!audioCtx) {
      // Crear el contexto en el momento de interacción para asegurar que quede desbloqueado
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  };
  document.addEventListener('click',     unlock, { once: false });
  document.addEventListener('touchstart', unlock, { once: false });
  document.addEventListener('keydown',    unlock, { once: false });
}

/**
 * Toca un sonido de campanilla suave de hotel / chime profesional (estilo Slack/Desk Bell).
 * type: 'alert' (doble campanada ding-dong) | 'reminder' (campanilla suave) | 'success' (acorde campanada)
 */
function playSound(type = 'reminder') {
  if (soundMuted) return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // Función auxiliar para sintetizar un golpe de campanilla acústica con armónicos
    const strikeBell = (freq, time, vol = 1.0) => {
      const partials = [
        { ratio: 1.0,   gain: 0.22 * vol, decay: 1.2 },  // Fundamental cálido y sostenido
        { ratio: 2.01,  gain: 0.07 * vol, decay: 0.65 }, // Octava metálica
        { ratio: 2.98,  gain: 0.035 * vol, decay: 0.35 },// Armónico medio
        { ratio: 4.15,  gain: 0.025 * vol, decay: 0.12 },// Toque de percutor inicial (clink)
      ];

      partials.forEach(({ ratio, gain, decay }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * ratio, now + time);

        // Ataque instantáneo y decaimiento exponencial natural de campana
        gainNode.gain.setValueAtTime(0, now + time);
        gainNode.gain.linearRampToValueAtTime(gain, now + time + 0.003);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + decay);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + decay + 0.05);
      });
    };

    if (type === 'alert') {
      // Ding-Dong de recepción elegante (1318 Hz -> 1046 Hz)
      strikeBell(1318.5, 0,    1.0);
      strikeBell(1046.5, 0.26, 0.95);
    } else if (type === 'success') {
      // Campanada armónica ascendente (1046 Hz -> 1318 Hz)
      strikeBell(1046.5, 0,    0.85);
      strikeBell(1318.5, 0.14, 0.9);
    } else {
      // Reminder: Campanilla suave y única (1174.6 Hz - Re6)
      strikeBell(1174.6, 0, 1.0);
    }
  } catch (e) {
    console.warn('[CRM Audio]', e);
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  localStorage.setItem('crm_muted', soundMuted);
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = soundMuted ? '🔇 Sonido: OFF' : '🔔 Sonido: ON';
  if (!soundMuted) playSound('reminder');
}

function setupMuteButton() {
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = soundMuted ? '🔇 Sonido: OFF' : '🔔 Sonido: ON';
}

/* ─── NOTIFICACIONES DEL NAVEGADOR ──────────────── */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* Guardamos IDs ya notificados para no duplicar en la misma sesión */
const _notifiedIds = new Set();

/**
 * Verificación al arrancar: toca sonido si hay eventos de hoy o seguimientos
 * vencidos/pendientes. Se llama después de la primera interacción del usuario
 * para garantizar que el AudioContext esté desbloqueado.
 */
function checkStartupNotifications() {
  const today = todayStr();
  let hasUrgent  = false;
  let hasReminder = false;

  // Eventos de hoy no completados
  state.events.forEach(ev => {
    if (!ev.completed && ev.date === today) hasUrgent = true;
    // Eventos vencidos (pasados y no completados)
    if (!ev.completed && ev.date < today)  hasReminder = true;
  });

  // Seguimientos vencidos o de hoy
  state.clients.forEach(c => {
    if (c.nextFollowUp <= today) hasReminder = true;
  });

  if (hasUrgent) {
    playSound('alert');
  } else if (hasReminder) {
    playSound('reminder');
  }
}

function checkNotifications() {
  const today = todayStr();
  const now   = new Date();
  let soundPlayed = false;

  state.events.forEach(ev => {
    if (ev.completed) return;

    const isToday   = ev.date === today;
    const isOverdue = ev.date < today;

    // ── Eventos VENCIDOS (fecha pasada, sin completar) ──
    if (isOverdue) {
      const key = `${ev.id}-overdue`;
      if (!_notifiedIds.has(key)) {
        _notifiedIds.add(key);
        const c = getClient(ev.clientId);
        const label = ev.type === 'call' ? 'Llamada' : 'Visita';
        if (!soundPlayed) { playSound('alert'); soundPlayed = true; }
        showBrowserNotification(
          `⚠️ ${label} vencida`,
          c ? `Cliente: ${c.name} · ${fmtDate(ev.date)} ${ev.time}` : fmtDate(ev.date),
          'urgent'
        );
      }
      return;
    }

    if (!isToday) return; // Eventos futuros: solo se alertan por tiempo

    const [h, m] = (ev.time || '').split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      // Sin hora definida → notificar al inicio del día
      const keyDay = `${ev.id}-day`;
      if (!_notifiedIds.has(keyDay)) {
        _notifiedIds.add(keyDay);
        const c = getClient(ev.clientId);
        const label = ev.type === 'call' ? 'Llamada' : 'Visita';
        if (!soundPlayed) { playSound('reminder'); soundPlayed = true; }
        showBrowserNotification(
          `📅 ${label} programada para hoy`,
          c ? `Cliente: ${c.name}` : '',
          'normal'
        );
      }
      return;
    }

    const evTime = new Date(); evTime.setHours(h, m, 0, 0);
    const diff = (evTime - now) / 60000; // minutos

    // Visita: alerta a 60 min
    if (ev.type === 'visit') {
      const key60 = `${ev.id}-60`;
      if (diff >= 55 && diff <= 65 && !_notifiedIds.has(key60)) {
        _notifiedIds.add(key60);
        const c = getClient(ev.clientId);
        if (!soundPlayed) { playSound('alert'); soundPlayed = true; }
        showBrowserNotification(
          `🏡 Visita Guiada en 1 hora`,
          c ? `Cliente: ${c.name} · ${ev.time}${ev.address ? '\n' + ev.address : ''}` : ev.time,
          'urgent'
        );
      }
    }

    // ⏰ Alerta a los 30 minutos antes
    const key30 = `${ev.id}-30m`;
    if (diff >= 25 && diff <= 33 && !_notifiedIds.has(key30)) {
      _notifiedIds.add(key30);
      const c = getClient(ev.clientId);
      const label = ev.type === 'call' ? 'Llamada' : 'Visita Guiada';
      if (!soundPlayed) { playSound('alert'); soundPlayed = true; }
      showBrowserNotification(
        `⏰ En 30 minutos: ${label}`,
        c ? `Cliente: ${c.name} · Hora: ${ev.time}${ev.address ? '\n' + ev.address : ''}` : `Hora: ${ev.time}`,
        'urgent'
      );
      toast(`⏰ Recordatorio: ${label} con ${c ? c.name : 'cliente'} en 30 minutos (${ev.time})`, 'warning');
    }

    // 🚨 Alerta en el momento del evento (¡Es la hora!)
    const keyNow = `${ev.id}-now`;
    if (diff >= -5 && diff <= 3 && !_notifiedIds.has(keyNow)) {
      _notifiedIds.add(keyNow);
      const c = getClient(ev.clientId);
      const label = ev.type === 'call' ? 'Llamada' : 'Visita Guiada';
      if (!soundPlayed) { playSound('alert'); soundPlayed = true; }
      showBrowserNotification(
        `🚨 ¡Es la hora! ${label}`,
        c ? `Cliente: ${c.name} · ${ev.time}` : ev.time,
        'urgent'
      );
      toast(`🚨 ¡Es la hora! ${label} con ${c ? c.name : 'cliente'} (${ev.time})`, 'error');
    }
  });

  // ── Seguimientos: vencidos o de hoy ──
  state.clients.forEach(c => {
    const isOverdue = c.nextFollowUp < today;
    const isToday   = c.nextFollowUp === today;
    if (!isOverdue && !isToday) return;

    const key = `fu-${c.id}-${today}`;
    if (!_notifiedIds.has(key)) {
      _notifiedIds.add(key);
      if (!soundPlayed) { playSound('reminder'); soundPlayed = true; }
      const msg = isOverdue
        ? `Seguimiento vencido desde ${fmtDate(c.nextFollowUp)}`
        : `Debes dar seguimiento a ${c.name} hoy.`;
      showBrowserNotification(
        `🔔 Seguimiento pendiente — ${c.name}`,
        msg,
        isOverdue ? 'urgent' : 'normal'
      );
    }
  });
}

function showBrowserNotification(title, body, urgency = 'normal') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: urgency === 'urgent' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    tag: title, // evita notificaciones duplicadas del sistema
  });
  // Auto-cerrar después de 8 segundos
  setTimeout(() => n.close(), 8000);
}

/* ─── REFRESH ALL ────────────────────────────────── */
function refreshAll() {
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  const id = activeView.id.replace('view-', '');
  if (id === 'dashboard')  renderDashboard();
  if (id === 'clients')    renderClients();
  if (id === 'agenda')     renderEvents();
  if (id === 'calendar')   renderCalendar();
  if (id === 'followups')  renderFollowUps();
  if (id === 'content')    renderContent();
  if (state.currentClientId && document.getElementById('client-drawer').classList.contains('open')) {
    renderDrawer(state.currentClientId);
  }
}

/* ─── AGENT NAME ─────────────────────────────────── */
function setupAgentName() {
  const saved = localStorage.getItem('crm_agent_name') || 'Mi Agente';
  document.getElementById('agent-name').textContent = saved;
  document.getElementById('agent-avatar').textContent = initials(saved);
}

/* ─── TOPBAR DATE ────────────────────────────────── */
function setTopbarDate() {
  const now = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('topbar-date').textContent = now;
}

/* ─── MOBILE SIDEBAR ──────────────────────────────── */
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const isOpen  = sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', !isOpen);
  overlay.classList.toggle('show', !isOpen);
}

function setMobActive(btn) {
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* ─── KEYBOARD SHORTCUTS ─────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    if (document.getElementById('client-drawer').classList.contains('open')) closeDrawer();
  }
});

function fmtMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${months[m - 1]} ${y}`;
}

/* ─── IDEAS DE CONTENIDO — TABLERO KANBAN ────────── */

const CONTENT_TYPES = {
  post:      { icon: '🖼️',  label: 'Post / Imagen' },
  reel:      { icon: '🎬',  label: 'Reel / Video' },
  story:     { icon: '⭕',  label: 'Story' },
  carousel:  { icon: '🎠',  label: 'Carrusel' },
  blog:      { icon: '📝',  label: 'Blog / Artículo' },
  email:     { icon: '📧',  label: 'Email / Newsletter' },
  live:      { icon: '🔴',  label: 'Live / Directo' },
  idea:      { icon: '💡',  label: 'Idea general' },
};

const CONTENT_PLATFORMS = {
  instagram:  { icon: '📸', label: 'Instagram' },
  facebook:   { icon: '👤', label: 'Facebook' },
  tiktok:     { icon: '🎵', label: 'TikTok' },
  linkedin:   { icon: '💼', label: 'LinkedIn' },
  whatsapp:   { icon: '💬', label: 'WhatsApp' },
  youtube:    { icon: '▶️', label: 'YouTube' },
  blog:       { icon: '🌐', label: 'Blog / Web' },
  all:        { icon: '📡', label: 'Multicanal' },
};

const CONTENT_COLS = [
  { key: 'idea',        icon: '💡', label: 'Ideas',         color: '#7c5cfc' },
  { key: 'production',  icon: '⚙️', label: 'En producción', color: '#ffa502' },
  { key: 'review',      icon: '👀', label: 'En revisión',   color: '#1e90ff' },
  { key: 'published',   icon: '✅', label: 'Publicado',     color: '#2ed573' },
];

/* ── CRUD ── */
function openAddContentModal(prefillStatus = 'idea') {
  document.getElementById('cnt-modal-title').textContent = '💡 Nueva Idea de Contenido';
  document.getElementById('cnt-id').value       = '';
  document.getElementById('cnt-title').value    = '';
  document.getElementById('cnt-month').value    = state.contentMonth;
  document.getElementById('cnt-type').value     = 'post';
  document.getElementById('cnt-platform').value = 'instagram';
  document.getElementById('cnt-status').value   = prefillStatus;
  document.getElementById('cnt-caption').value  = '';
  document.getElementById('cnt-hashtags').value = '';
  document.getElementById('cnt-notes').value    = '';
  openModal('cnt-modal');
  setTimeout(() => document.getElementById('cnt-title').focus(), 200);
}

function openEditContentModal(id) {
  const item = state.content.find(x => x.id === id);
  if (!item) return;
  document.getElementById('cnt-modal-title').textContent = '✏️ Editar Idea';
  document.getElementById('cnt-id').value       = item.id;
  document.getElementById('cnt-title').value    = item.title;
  document.getElementById('cnt-month').value    = item.month;
  document.getElementById('cnt-type').value     = item.type;
  document.getElementById('cnt-platform').value = item.platform;
  document.getElementById('cnt-status').value   = item.status;
  document.getElementById('cnt-caption').value  = item.caption  || '';
  document.getElementById('cnt-hashtags').value = item.hashtags || '';
  document.getElementById('cnt-notes').value    = item.notes    || '';
  openModal('cnt-modal');
}

function saveContent() {
  const title = document.getElementById('cnt-title').value.trim();
  if (!title) { toast('El título de la idea es requerido', 'error'); return; }

  const id       = document.getElementById('cnt-id').value;
  const month    = document.getElementById('cnt-month').value || state.contentMonth;
  const type     = document.getElementById('cnt-type').value;
  const platform = document.getElementById('cnt-platform').value;
  const status   = document.getElementById('cnt-status').value;
  const caption  = document.getElementById('cnt-caption').value.trim();
  const hashtags = document.getElementById('cnt-hashtags').value.trim();
  const notes    = document.getElementById('cnt-notes').value.trim();

  if (id) {
    const item = state.content.find(x => x.id === id);
    if (item) Object.assign(item, { title, month, type, platform, status, caption, hashtags, notes });
    toast(`Idea "${title}" actualizada`, 'success');
  } else {
    state.content.unshift({ id: uid(), title, month, type, platform, status, caption, hashtags, notes, createdAt: todayStr() });
    toast(`Idea "${title}" agregada 💡`, 'success');
  }

  save();
  closeModal('cnt-modal');
  renderContent();
}

function deleteContent(id) {
  const item = state.content.find(x => x.id === id);
  if (!item) return;
  confirm(`Eliminar "${item.title}"`, '¿Eliminar esta idea de contenido?').then(ok => {
    if (!ok) return;
    state.content = state.content.filter(x => x.id !== id);
    save();
    renderContent();
    toast('Idea eliminada', 'info');
  });
}

function moveContent(id, newStatus) {
  const item = state.content.find(x => x.id === id);
  if (!item || item.status === newStatus) return;
  item.status = newStatus;
  save();
  renderContent();
  const col = CONTENT_COLS.find(c => c.key === newStatus);
  toast(`Movido a "${col ? col.label : newStatus}" ✅`, 'success');
}

function contentNavMonth(dir) {
  const [y, m] = state.contentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  state.contentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderContent();
}

/* ── RENDER ── */
function renderContent() {
  const container = document.getElementById('cnt-board');
  if (!container) return;

  // Actualizar label del mes
  const lbl = document.getElementById('cnt-month-display');
  if (lbl) lbl.textContent = fmtMonthLabel(state.contentMonth);

  // Filtrar por mes
  const items = state.content.filter(x => x.month === state.contentMonth);

  // Stats rápidas
  CONTENT_COLS.forEach(col => {
    const el = document.getElementById(`cnt-count-${col.key}`);
    if (el) el.textContent = items.filter(x => x.status === col.key).length;
  });

  // Render columnas
  container.innerHTML = CONTENT_COLS.map(col => {
    const colItems = items.filter(x => x.status === col.key);
    return `
    <div class="cnt-col">
      <div class="cnt-col-header" style="border-color:${col.color}">
        <span>${col.icon} ${col.label}</span>
        <span class="cnt-col-count" style="background:${col.color}20;color:${col.color}">${colItems.length}</span>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openAddContentModal('${col.key}')" title="Agregar aquí" style="margin-left:auto">+</button>
      </div>
      <div class="cnt-col-body">
        ${colItems.length ? colItems.map(item => buildContentCard(item, col)).join('') : `
          <div class="cnt-empty">
            <span>${col.icon}</span>
            <p>Sin ideas aquí</p>
            <button class="btn btn-ghost btn-sm" onclick="openAddContentModal('${col.key}')">+ Agregar</button>
          </div>`}
      </div>
    </div>`;
  }).join('');
}

function buildContentCard(item, col) {
  const t = CONTENT_TYPES[item.type]     || CONTENT_TYPES.idea;
  const p = CONTENT_PLATFORMS[item.platform] || CONTENT_PLATFORMS.all;

  // Columnas a las que se puede mover
  const moveOpts = CONTENT_COLS.filter(c => c.key !== item.status)
    .map(c => `<button class="cnt-move-btn" onclick="moveContent('${item.id}','${c.key}')" title="Mover a ${c.label}">${c.icon}</button>`)
    .join('');

  return `
  <div class="cnt-card">
    <div class="cnt-card-badges">
      <span class="cnt-badge">${t.icon} ${t.label}</span>
      <span class="cnt-badge">${p.icon} ${p.label}</span>
    </div>
    <div class="cnt-card-title">${escapeHtml(item.title)}</div>
    ${item.caption ? `<div class="cnt-card-caption">${escapeHtml(item.caption.slice(0,100))}${item.caption.length > 100 ? '…' : ''}</div>` : ''}
    ${item.hashtags ? `<div class="cnt-card-hashtags">${escapeHtml(item.hashtags)}</div>` : ''}
    ${item.notes ? `<div class="cnt-card-notes">📎 ${escapeHtml(item.notes.slice(0,80))}${item.notes.length > 80 ? '…' : ''}</div>` : ''}
    <div class="cnt-card-actions">
      <div class="cnt-move-group" title="Mover a...">${moveOpts}</div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditContentModal('${item.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteContent('${item.id}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

/* ─── INIT ───────────────────────────────────────── */

function init() {
  load();
  setupAgentName();
  setTopbarDate();
  setupMuteButton();
  setupAudioUnlock();           // Desbloquea AudioContext al primer gesto
  requestNotificationPermission();
  navigate('dashboard');
  updateBadges();

  // Tocar sonido de alerta al primer click/tap (post carga)
  // El navegador requiere interacción para reproducir audio
  const onFirstInteraction = () => {
    checkStartupNotifications();
    document.removeEventListener('click',     onFirstInteraction);
    document.removeEventListener('touchstart', onFirstInteraction);
  };
  document.addEventListener('click',     onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction);

  // Verificar notificaciones periódicamente cada 30 segundos (máxima precisión)
  setInterval(checkNotifications, 30 * 1000);
  // Primera verificación a los 3 segundos
  setTimeout(checkNotifications, 3000);
}

document.addEventListener('DOMContentLoaded', init);
