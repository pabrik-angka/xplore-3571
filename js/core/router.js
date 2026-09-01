// js/core/router.js
/**
 * Xplore 3571 - Hash-based SPA Router
 * Dipindahkan dari js/router.js ke js/core/ sesuai arsitektur DDS-Lite.
 *
 * Navigasi domain dilakukan via EventBus.emit('router:navigate', { hash })
 * agar domain tidak perlu import router langsung.
 */
import { EventBus } from './event-bus.js';

export const Router = {
  routes: {
    '#map': 'view-map',
    '#table': 'view-table',
    '#dashboard': 'view-dashboard'
  },

  defaultRoute: '#map',

  init() {
    // Subscribe ke EventBus untuk navigasi programatik dari domain lain
    EventBus.on('router:navigate', ({ hash }) => {
      if (hash) window.location.hash = hash;
    });

    window.addEventListener('hashchange', () => this.handleRouting());
    // Initial routing on load
    this.handleRouting();
    console.log('✔ SPA Router initialized.');
  },

  handleRouting() {
    let hash = window.location.hash;

    // Fallback ke rute default jika kosong atau tidak dikenal
    if (!hash || !this.routes[hash]) {
      window.location.hash = this.defaultRoute;
      return;
    }

    const targetViewId = this.routes[hash];

    // Sembunyikan semua view, tampilkan view aktif
    Object.values(this.routes).forEach(viewId => {
      const el = document.getElementById(viewId);
      if (el) {
        if (viewId === targetViewId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // Update status tombol navigasi di UI
    this.updateNavigationUI(hash);

    // KASUS KHUSUS: Handler per rute
    if (hash === '#map') {
      import('../domains/map/map.module.js').then(({ MapEngine }) => {
        setTimeout(() => {
          MapEngine.resize();
        }, 100);
      });
    } else if (hash === '#table') {
      import('../domains/table/table.module.js').then(({ TableEngine }) => {
        TableEngine.render();
      });
    }
  },

  updateNavigationUI(activeHash) {
    const navLinks = document.querySelectorAll('[data-route]');
    navLinks.forEach(link => {
      const route = link.getAttribute('data-route');
      if (route === activeHash) {
        link.classList.add('btn-active', 'btn-primary');
        link.classList.remove('btn-outline');
      } else {
        link.classList.remove('btn-active', 'btn-primary');
      }
    });
  }
};
