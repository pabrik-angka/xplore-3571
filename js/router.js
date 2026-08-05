/**
 * Xplore 3571 - Hash-based SPA Router
 */
export const Router = {
  routes: {
    '#map': 'view-map',
    '#table': 'view-table',
    '#dashboard': 'view-dashboard'
  },
  
  defaultRoute: '#map',

  init() {
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

    // KASUS KHUSUS: Resize peta jika kembali ke view-map
    if (hash === '#map') {
      import('./map.js').then(({ MapEngine }) => {
        setTimeout(() => {
          MapEngine.resize();
        }, 100);
      });
    }
  },

  updateNavigationUI(activeHash) {
    // Cari elemen-elemen link navigasi yang bertipe a atau button dengan atribut data-route
    const navLinks = document.querySelectorAll('[data-route]');
    navLinks.forEach(link => {
      const route = link.getAttribute('data-route');
      if (route === activeHash) {
        link.classList.add('btn-active', 'btn-primary');
        // Hapus styling outline jika ada
        link.classList.remove('btn-outline');
      } else {
        link.classList.remove('btn-active', 'btn-primary');
        // Berikan status netral / outline jika bukan aktif
        if (link.classList.contains('btn-sm')) {
          // Tetap biarkan styling default button
        }
      }
    });
  }
};
