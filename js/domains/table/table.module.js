// js/domains/table/table.module.js
/**
 * Xplore 3571 - Table Domain Orchestrator
 * Dipindahkan dari js/table.js ke js/domains/table/ sesuai arsitektur DDS-Lite.
 *
 * Tanggung jawab: Mengendalikan Tampilan DaisyUI Table, Sticky Columns/Headers,
 * Tab Navigasi, Debouncing Search, Multi-column Sorting, Pagination, dan Export CSV.
 */
import { Store } from '../../core/store.js';
import { DataFormatters } from '../../helpers/formatters.js';
import { openPivotModal } from '../../ui/components/pivot-modal.js';
import { EventBus } from '../../core/event-bus.js';

export const TableEngine = {
  _initialized: false,
  _searchDebounceTimer: null,

  init() {
    if (this._initialized) return;

    // Listener Event Reaktif State Store via EventBus
    EventBus.on('tabulation:changed', () => this.render());

    // 1. Pivot Modal Trigger Button
    document.getElementById('btn-trigger-pivot-modal')
      ?.addEventListener('click', () => openPivotModal());

    // 2. Global Search Input dengan Debounce 300ms
    const searchInput = document.getElementById('table-global-search');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => {
        const activeTab = Store.getActiveTabContext();
        if (activeTab) {
          activeTab.filterState.search = e.target.value;
          activeTab.pagination.page = 1; // Reset ke hal 1
          this.renderTableBody();
        }
      }, 300);
    });

    // 3. Page Size Change
    document.getElementById('table-page-size')?.addEventListener('change', (e) => {
      const activeTab = Store.getActiveTabContext();
      if (activeTab) {
        activeTab.pagination.pageSize = parseInt(e.target.value, 10) || 100;
        activeTab.pagination.page = 1;
        this.renderTableBody();
      }
    });

    // 4. Pagination Buttons
    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      const activeTab = Store.getActiveTabContext();
      if (activeTab && activeTab.pagination.page > 1) {
        activeTab.pagination.page--;
        this.renderTableBody();
      }
    });

    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      const activeTab = Store.getActiveTabContext();
      if (activeTab) {
        const filteredData = this._getFilteredAndSortedData(activeTab);
        const maxPage = Math.ceil(filteredData.length / activeTab.pagination.pageSize) || 1;
        if (activeTab.pagination.page < maxPage) {
          activeTab.pagination.page++;
          this.renderTableBody();
        }
      }
    });

    // 5. Export CSV Button
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportCSV());

    this._initialized = true;
    console.log('✔ TableEngine (DaisyUI Table) initialized.');
  },

  /**
   * Main Render Lifecycle
   */
  render() {
    this.renderTabBar();
    this.renderTableBody();
  },

  /**
   * Render Top Tab Bar Navigasi (DaisyUI Tabs)
   */
  renderTabBar() {
    const tabBarEl = document.getElementById('tabulation-tab-bar');
    if (!tabBarEl) return;

    const tabs = Array.from(Store.tabulationSets.values());
    if (tabs.length === 0) {
      tabBarEl.innerHTML = `<span class="text-xs text-base-content/40 italic p-2">Belum ada dataset yang dimuat.</span>`;
      return;
    }

    tabBarEl.innerHTML = tabs.map(tab => {
      const isActive = tab.id === Store.activeTabId;
      const count = (tab.rawData || []).length;
      const activeClass = isActive ? 'tab-active font-bold text-accent' : 'text-base-content/70';
      const isPivot = tab.type === 'pivot';
      const badgeClass = isPivot ? 'badge-accent' : 'badge-ghost';
      // Tombol close hanya untuk tab pivot/custom, bukan tab core data module
      const closeBtn = isPivot
        ? `<span class="btn-close-tab hover:text-error ml-1 px-1 rounded transition-colors" data-close-id="${tab.id}">✕</span>`
        : '';

      return `
        <button class="tab ${activeClass} gap-2 flex-none whitespace-nowrap transition-colors" data-tab-id="${tab.id}">
          <span>${tab.title}</span>
          <span class="badge badge-xs sm:badge-sm ${badgeClass}">${count.toLocaleString('id')}</span>
          ${closeBtn}
        </button>
      `;
    }).join('');

    // Event Listener Klik Switch Tab & Close Tab
    tabBarEl.querySelectorAll('.tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-close-tab')) {
          e.stopPropagation();
          const closeId = e.target.getAttribute('data-close-id');
          Store.removeTabulationSet(closeId);
        } else {
          const tabId = tabBtn.getAttribute('data-tab-id');
          Store.setActiveTabId(tabId);
        }
      });
    });
  },

  /**
   * Render Table Head & Table Body berdasarkan activeTabContext
   */
  renderTableBody() {
    const headEl = document.getElementById('table-head');
    const bodyEl = document.getElementById('table-body');
    const countInfoEl = document.getElementById('table-row-count-info');
    const statusEl = document.getElementById('pagination-status');
    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');
    const searchInput = document.getElementById('table-global-search');

    if (!headEl || !bodyEl) return;

    const activeTab = Store.getActiveTabContext();

    if (activeTab) {
      if (!activeTab.filterState) activeTab.filterState = {};
      if (!activeTab.sortState) activeTab.sortState = [];
      if (!activeTab.pagination) activeTab.pagination = { page: 1, pageSize: 100 };
    }

    if (!activeTab || !activeTab.rawData || activeTab.rawData.length === 0) {
      headEl.innerHTML = '';
      bodyEl.innerHTML = `<tr><td colspan="100%" class="text-center py-8 text-base-content/40 italic">Tidak ada data untuk ditampilkan.</td></tr>`;
      if (countInfoEl) countInfoEl.textContent = '0 baris';
      if (statusEl) statusEl.textContent = 'Halaman 1 dari 1';
      return;
    }

    if (searchInput && document.activeElement !== searchInput) {
      searchInput.value = activeTab.filterState.search || '';
    }

    const columns = activeTab.columns && activeTab.columns.length > 0
      ? activeTab.columns
      : Object.keys(activeTab.rawData[0]).map((k, i) => ({ key: k, label: k.toUpperCase(), isStub: i === 0 }));

    // 1. Render Table Head
    headEl.innerHTML = `
      <tr>
        <th class="text-center bg-base-200 border-b border-r border-base-300">#</th>
        ${columns.map((col, idx) => {
          const isStub = col.isStub || idx === 0;
          const sortObj = (activeTab.sortState || []).find(s => s.field === col.key);
          const sortIcon = sortObj ? (sortObj.dir === 'asc' ? ' ▲' : ' ▼') : '';
          const stubClass = isStub ? 'bg-base-200 border-r border-base-300' : 'bg-base-200';

          return `
            <th class="cursor-pointer hover:bg-base-300 transition-colors border-b border-base-300 whitespace-nowrap px-3 py-2 ${stubClass}" data-sort-key="${col.key}">
              <div class="flex items-center justify-between gap-1">
                <span>${col.label || col.key}</span>
                <span class="text-accent font-bold text-[10px]">${sortIcon}</span>
              </div>
            </th>
          `;
        }).join('')}
      </tr>
    `;

    // Event Sorting pada Header Kolom
    headEl.querySelectorAll('th[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (!key) return;

        if (!activeTab.sortState) activeTab.sortState = [];
        const existingIdx = activeTab.sortState.findIndex(s => s.field === key);

        if (existingIdx >= 0) {
          if (activeTab.sortState[existingIdx].dir === 'asc') {
            activeTab.sortState[existingIdx].dir = 'desc';
          } else {
            activeTab.sortState.splice(existingIdx, 1);
          }
        } else {
          activeTab.sortState.push({ field: key, dir: 'asc' });
        }

        this.renderTableBody();
      });
    });

    // 2. Filter & Multi-Sort Processing
    const filteredData = this._getFilteredAndSortedData(activeTab);

    // 3. Pagination Slicing
    const pageSize = activeTab.pagination.pageSize || 100;
    const totalRows = filteredData.length;
    const maxPage = Math.ceil(totalRows / pageSize) || 1;

    if (activeTab.pagination.page > maxPage) activeTab.pagination.page = maxPage;
    const currentPage = activeTab.pagination.page || 1;

    const startIndex = (currentPage - 1) * pageSize;
    const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

    if (countInfoEl) countInfoEl.textContent = `${totalRows.toLocaleString('id')} baris`;
    if (statusEl) statusEl.textContent = `Halaman ${currentPage} dari ${maxPage}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= maxPage;

    if (paginatedData.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="100%" class="text-center py-8 text-base-content/40 italic">Tidak ada data yang cocok dengan kriteria pencarian.</td></tr>`;
      return;
    }

    // 4. Render Table Body (DocumentFragment untuk Performa High-speed)
    const fragment = document.createDocumentFragment();

    paginatedData.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-base-200/60 transition-colors cursor-pointer text-xs';

      const absoluteIndex = startIndex + rowIdx + 1;

      const lat = parseFloat(row.latitude || row.lat || row.y || NaN);
      const lng = parseFloat(row.longitude || row.lng || row.x || NaN);
      const hasCoords = !isNaN(lat) && !isNaN(lng);

      if (hasCoords) {
        tr.setAttribute('title', 'Klik untuk melihat lokasi di Peta');
        tr.addEventListener('click', () => {
          // Navigasi via EventBus — tidak langsung manipulasi hash
          EventBus.emit('router:navigate', { hash: '#map' });
          setTimeout(() => {
            EventBus.emit('explore:flyto', { lat, lng });
          }, 100);
        });
      }

      const tdNum = document.createElement('td');
      tdNum.className = 'text-center font-mono text-[11px] text-base-content/60 border-b border-r border-base-200 bg-base-100';
      tdNum.textContent = absoluteIndex;
      tr.appendChild(tdNum);

      columns.forEach((col, idx) => {
        const td = document.createElement('td');
        const isStub = col.isStub || idx === 0;
        const val = row[col.key] ?? '-';

        let cellClass = 'border-b border-base-200 whitespace-nowrap px-3 py-2 bg-base-100';
        if (isStub) {
          cellClass += ' font-semibold text-accent border-r border-base-200';
        }
        if (col.type === 'number' || typeof val === 'number') {
          cellClass += ' text-right font-mono';
        }
        if (col.isBold) {
          cellClass += ' font-bold text-secondary';
        }

        td.className = cellClass;
        td.textContent = typeof val === 'number' ? val.toLocaleString('id') : String(val);
        tr.appendChild(td);
      });

      fragment.appendChild(tr);
    });

    bodyEl.innerHTML = '';
    bodyEl.appendChild(fragment);
  },

  /**
   * Dynamic Filtering & Multi-Column Sorting Helper
   */
  _getFilteredAndSortedData(activeTab) {
    let data = [...(activeTab.rawData || [])];

    const searchKw = (activeTab.filterState.search || '').toLowerCase().trim();
    if (searchKw) {
      data = data.filter(row => {
        return Object.values(row).some(val =>
          String(val ?? '').toLowerCase().includes(searchKw)
        );
      });
    }

    const sortState = activeTab.sortState || [];
    if (sortState.length > 0) {
      data.sort((a, b) => {
        for (const { field, dir } of sortState) {
          let valA = a[field] ?? '';
          let valB = b[field] ?? '';

          const numA = parseFloat(valA);
          const numB = parseFloat(valB);
          const isNum = !isNaN(numA) && !isNaN(numB);

          if (isNum) {
            valA = numA;
            valB = numB;
          }

          if (valA !== valB) {
            const factor = dir === 'asc' ? 1 : -1;
            return (valA > valB ? 1 : -1) * factor;
          }
        }
        return 0;
      });
    }

    return data;
  },

  /**
   * Export CSV dari Dataset / View Aktif
   */
  exportCSV() {
    const activeTab = Store.getActiveTabContext();
    if (!activeTab || !activeTab.rawData || activeTab.rawData.length === 0) {
      alert('Tidak ada data untuk di-export!');
      return;
    }

    const filteredData = this._getFilteredAndSortedData(activeTab);
    if (filteredData.length === 0) {
      alert('Tidak ada baris data yang cocok!');
      return;
    }

    const csvString = DataFormatters.arrayToCsv(filteredData, activeTab.columns || []);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvString);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `${activeTab.title.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};
