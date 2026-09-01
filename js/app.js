// js/app.js
/**
 * Xplore 3571 - Core Application Orchestrator
 * Sesuai Arsitektur DDS-Lite (Domain-Driven Structure Lite)
 */
import { UI } from './ui/ui.js';
import { MapEngine } from './domains/map/map.module.js';
import { TableEngine } from './domains/table/table.module.js';
import { Router } from './core/router.js';
import { Store } from './core/store.js';
import { DbService } from './core/services/db.service.js';
import { ListenerManager } from './core/listenerManager.js';

async function loadComponent(containerId, filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Gagal mengambil berkas komponen: ${filePath}`);
    const htmlText = await response.text();
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = htmlText;
  } catch (error) {
    console.error('Orchestration component error:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔄 Memuat fragmentasi komponen modular...');

  // 1. Injeksi Navbar dan Sidebar secara paralel dari templates/
  await Promise.all([
    loadComponent('navbar-container', 'templates/navbar.html'),
    loadComponent('sidebar-container', 'templates/sidebar.html')
  ]);

  console.log('✔ Seluruh fragmen UI masuk DOM.');

  // 2. Inisialisasi peta Leaflet
  const isMapReady = MapEngine.init('map-container');
  if (!isMapReady) {
    MapEngine.init('map');
  }

  // 3. Bangun ulang cache element dan daftarkan Event Listener UI
  UI.reCacheElements();
  UI.init();

  // 4. Inisialisasi Table Engine
  TableEngine.init();

  // 5. Inisialisasi PWA IndexedDB & Hydrate Dataset Offline Cache
  await DbService.init();
  await Store.loadStoredDatasets();

  // 6. Daftarkan semua global event listener via ListenerManager
  ListenerManager.init();

  // 7. Inisialisasi SPA Router
  Router.init();
});