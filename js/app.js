/**
 * Xplore 3571 - Core Application Orchestrator
 */
import { UI } from './ui.js';

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

  // 1. Injeksi Navbar dan Sidebar secara paralel
  await Promise.all([
    loadComponent('navbar-container', 'components/navbar.html'),
    loadComponent('sidebar-container', 'components/sidebar.html')
  ]);
  
  console.log('✔ Seluruh fragmen UI masuk DOM.');

  // 2. Bangun ulang cache element dan daftarkan Event Listener
  UI.reCacheElements();
  UI.init();
});