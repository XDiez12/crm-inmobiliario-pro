/* ==============================================
   FIREBASE.JS — Capa de datos Firebase
   CRM Inmobiliario Pro
   ============================================== */

import { initializeApp }              from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAnalytics }               from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

/* ─── CONFIGURACIÓN ─────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyDK4TJ8iI7G-2MH89FN9MPRozxqa7-YuSU',
  authDomain:        'crm-inmobiliario-5b510.firebaseapp.com',
  projectId:         'crm-inmobiliario-5b510',
  storageBucket:     'crm-inmobiliario-5b510.firebasestorage.app',
  messagingSenderId: '824824538776',
  appId:             '1:824824538776:web:dc4d18b7ef23f3410712ed',
  measurementId:     'G-88BKK4BBL9',
};

/* ─── INICIALIZACIÓN ─────────────────────────── */
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db        = getFirestore(app);

/* Referencia al único documento de datos */
const DATA_DOC = doc(db, 'crm', 'data');

/* ─── ESTADO INTERNO ─────────────────────────── */
let _syncCallback = null;   // función que app.js registra para recibir actualizaciones en tiempo real
let _unsubscribe  = null;   // para cancelar el listener si se necesita

/* ─── GUARDAR EN FIRESTORE ───────────────────── */
/**
 * Guarda clientes, eventos y planes de marketing en Firestore.
 * Fire-and-forget: no bloquea la UI.
 * @param {Array} clients
 * @param {Array} events
 * @param {Array} marketing
 * @param {Array} content
 */
async function fbSave(clients, events, marketing = [], content = []) {
  try {
    await setDoc(DATA_DOC, {
      clients,
      events,
      marketing,
      content,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firebase] Error al guardar:', err.message);
  }
}

/* ─── CARGAR DESDE FIRESTORE ─────────────────── */
/**
 * Carga UNA VEZ los datos desde Firestore.
 * Retorna { clients, events } o null si falla.
 */
async function fbLoad() {
  try {
    const snap = await getDoc(DATA_DOC);
    if (snap.exists()) {
      const data = snap.data();
      return {
        clients:   data.clients   || [],
        events:    data.events    || [],
        marketing: data.marketing || [],
        content:   data.content   || [],
      };
    }
    return null; // documento aún no existe (primera vez)
  } catch (err) {
    console.warn('[Firebase] Error al cargar:', err.message);
    return null;
  }
}

/* ─── SINCRONIZACIÓN EN TIEMPO REAL ─────────── */
/**
 * Suscribe un callback que se llama cada vez que
 * Firestore actualiza los datos (otro dispositivo guardó).
 * @param {Function} callback  fn({ clients, events })
 */
function fbOnSync(callback) {
  _syncCallback = callback;

  // Cancelar listener previo si existía
  if (_unsubscribe) _unsubscribe();

  _unsubscribe = onSnapshot(DATA_DOC, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (typeof _syncCallback === 'function') {
      _syncCallback({
        clients:   data.clients   || [],
        events:    data.events    || [],
        marketing: data.marketing || [],
        content:   data.content   || [],
        updatedAt: data.updatedAt,
      });
    }
  }, (err) => {
    console.warn('[Firebase] Error en listener:', err.message);
  });
}

/* ─── EXPONER AL SCOPE GLOBAL ────────────────── */
/**
 * window.FB es el punto de entrada que usa app.js
 * para interactuar con Firebase sin importaciones.
 */
window.FB = {
  save:   fbSave,
  load:   fbLoad,
  onSync: fbOnSync,
};

console.log('[Firebase] ✅ Conectado a Firestore — proyecto crm-inmobiliario-5b510');
