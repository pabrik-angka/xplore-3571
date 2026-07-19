// js/components/search.js
import { Store } from '../store.js';
import { MapEngine } from '../map.js';

export const SearchComponent = {
  currentSearchResults: [],
  currentPage: 1,
  itemsPerPage: 10,
  containerId: 'search-dropdown-container',
  inputId: 'search-building',

  init() {
    const searchInput = document.getElementById(this.inputId);
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value;
      if (keyword.trim() === '') {
        this.hideDropdown();
        return;
      }
      
      this.currentSearchResults = Store.searchBuildings(keyword);
      this.currentPage = 1;
      this.renderDropdown();
    });
    
    // Jangan tutup dropdown saat klik di luar (sesuai permintaan user: "tidak hilang kecuali di klik button close")
  },

  hideDropdown() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.classList.add('hidden');
    }
  },

  renderDropdown() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Tampilkan kontainer
    container.classList.remove('hidden');

    const totalItems = this.currentSearchResults.length;
    const totalPages = Math.ceil(totalItems / this.itemsPerPage) || 1;
    
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
    const paginatedItems = this.currentSearchResults.slice(startIndex, endIndex);

    let listHtml = `
      <ul class="list bg-base-100 rounded-box shadow-md relative pb-12 min-h-[150px]">
        
        <!-- Header & Close Button -->
        <li class="p-4 pb-2 flex justify-between items-center border-b border-base-200">
          <span class="text-xs font-bold uppercase tracking-wide opacity-60">
            Hasil: ${totalItems} ditemukan
          </span>
          <button id="btn-close-search" class="btn btn-xs btn-ghost btn-circle text-base-content/60 hover:text-error">
            ✕
          </button>
        </li>
    `;

    if (totalItems === 0) {
      listHtml += `
        <li class="p-8 text-center text-sm opacity-50 italic">
          Tidak ada titik bangunan yang cocok.
        </li>
      `;
    } else {
      paginatedItems.forEach((item, idx) => {
        const itemNumber = (startIndex + idx + 1).toString().padStart(2, '0');
        
        // Memanfaatkan escape html dasar untuk properti string
        const safeTitle = item.title.replace(/"/g, '&quot;');
        
        listHtml += `
          <li class="list-row hover:bg-base-200/50 transition-colors">
            <div class="text-2xl font-thin opacity-30 tabular-nums">${itemNumber}</div>
            <div class="list-col-grow">
              <div class="font-bold text-sm truncate w-40 md:w-56" title="${safeTitle}">${safeTitle}</div>
              <div class="text-[10px] uppercase font-semibold text-primary opacity-80 truncate w-40 md:w-56" title="${item.sourceName}">${item.sourceName}</div>
            </div>
            <button class="btn btn-square btn-ghost text-secondary hover:bg-secondary/20 btn-point-to-map" 
              data-layer="${item.layerId}" 
              data-lat="${item.lat}" 
              data-lng="${item.lng}">
              <svg class="size-[1.2em]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none" stroke="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"></path></g></svg>
            </button>
          </li>
        `;
      });
    }

    // Pagination Footer (Absolute di bagian bawah list)
    listHtml += `
        <li class="absolute bottom-0 left-0 w-full p-2 bg-base-100/90 backdrop-blur border-t border-base-200 flex justify-between items-center rounded-b-box">
          <button id="btn-search-prev" class="btn btn-xs btn-outline" ${this.currentPage === 1 ? 'disabled' : ''}>← Prev</button>
          <span class="text-[10px] font-medium opacity-60">Hal ${this.currentPage} dari ${totalPages}</span>
          <button id="btn-search-next" class="btn btn-xs btn-outline" ${this.currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>Next →</button>
        </li>
      </ul>
    `;

    container.innerHTML = listHtml;

    // Attach Event Listeners
    this.attachEvents();
  },

  attachEvents() {
    const btnClose = document.getElementById('btn-close-search');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.hideDropdown();
      });
    }

    const btnPrev = document.getElementById('btn-search-prev');
    if (btnPrev && !btnPrev.disabled) {
      btnPrev.addEventListener('click', () => {
        this.currentPage--;
        this.renderDropdown();
      });
    }

    const btnNext = document.getElementById('btn-search-next');
    if (btnNext && !btnNext.disabled) {
      btnNext.addEventListener('click', () => {
        this.currentPage++;
        this.renderDropdown();
      });
    }

    // Attach click events to all "Point to map" buttons
    const mapButtons = document.querySelectorAll('.btn-point-to-map');
    mapButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const layerId = targetBtn.getAttribute('data-layer');
        const lat = parseFloat(targetBtn.getAttribute('data-lat'));
        const lng = parseFloat(targetBtn.getAttribute('data-lng'));
        
        // Dapatkan popupHtml aslinya dari currentSearchResults
        const pointData = this.currentSearchResults.find(item => item.layerId === layerId && item.lat === lat && item.lng === lng);
        const popupHtml = pointData ? pointData.popupHtml : 'Info Bangunan';

        // Panggil map engine
        MapEngine.focusToBuilding(layerId, lat, lng, popupHtml);
      });
    });
  }
};
