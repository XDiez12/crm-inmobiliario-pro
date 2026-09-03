# 🏡 CRM Inmobiliario Pro

Sistema CRM profesional y moderno diseñado específicamente para agentes y asesores inmobiliarios. Permite gestionar clientes, agendar visitas y llamadas sincronizadas con Google Calendar, registrar eventos, seguimiento de prospectos y planes mensuales de marketing con sincronización en tiempo real en la nube.

---

## ✨ Características Principales

- **👥 Gestión Completa de Clientes (CRUD):**
  - Registro de clientes con datos de contacto, presupuesto, tipo de inmueble de interés y notas detalladas.
  - Clasificación por temperatura de interés: 🔥 Caliente, ☀️ Tibio, ❄️ Frío.
  - Historial de conversaciones y notas rápidas con un clic.

- **📅 Sincronización Directa con Google Calendar:**
  - Agendamiento en un solo clic para Visitas Inmobiliarias, Llamadas y Seguimientos.
  - Vinculado directamente a tu cuenta de Google.
  - Reserva automáticamente la fecha, hora, dirección del inmueble y datos de contacto del cliente.

- **☁️ Sincronización en Tiempo Real con Firebase Firestore:**
  - Guarda automáticamente todos los cambios en la nube.
  - Sincronización instantánea entre múltiples pestañas, dispositivos y móviles.
  - Indicador visual en vivo: `🟢 En tiempo real`.
  - Respaldo local automático con `localStorage` en caso de no tener conexión.

- **📊 Planes Mensuales de Marketing e Ideas de Contenido:**
  - Planificador de estrategias mensuales con metas, presupuestos y canales (Redes Sociales, Email, Eventos, Ads).
  - Tablero Kanban para Ideas de Contenido (Ideas, En producción, En revisión, Publicado).

- **📥 Importación y Exportación a Excel (.xlsx / .csv):**
  - Exporta tu base de datos de clientes con formato limpio a Excel.
  - Importa listas de clientes desde archivos Excel o CSV con detección inteligente de columnas.
  - Respaldo y restauración completa en formato JSON.

- **🔔 Notificaciones y Sonido Acústico:**
  - Alertas automáticas de visitas y llamadas programadas.
  - Sonido agradable tipo campanilla de hotel sintetizado con Web Audio API.

- **📱 PWA (Progressive Web App):**
  - Compatible con instalación en PC, Mac, Android y iPhone como aplicación de escritorio o móvil.
  - Funciona sin conexión gracias a Service Worker.

---

## 🚀 Cómo Usar

1. **Uso directo:**
   - Abre `index.html` en cualquier navegador web moderno (Google Chrome, Edge, Safari, Brave).
2. **Servidor local (opcional):**
   ```bash
   node server.js
   ```
   Y abre `http://localhost:3000` en tu navegador.

---

## 🛠️ Tecnologías

- **HTML5 semántico**
- **Vanilla CSS3** (Diseño moderno, modo oscuro, responsive y componentes pulidos)
- **JavaScript Moderno (ES6+)**
- **Firebase Firestore v12** (Base de datos NoSQL en tiempo real)
- **SheetJS (xlsx)** (Procesamiento de archivos Excel)
- **Web Audio API** (Efectos de sonido armónicos)
- **Service Worker & Manifest** (PWA)

---

Desarrollado para **XDiez12**.
