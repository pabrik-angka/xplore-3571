// js/core/workers/parser.worker.js
/**
 * Xplore 3571 - Dedicated Background Data Web Worker
 * Dipindahkan dari js/workers/data-worker.js ke js/core/workers/ sesuai arsitektur DDS-Lite.
 *
 * Tanggung jawab MURNI: Parsing file → kirim raw data ke Main Thread.
 *
 * Transformasi data (toLayerConfig, popup HTML, searchKeyword) dilakukan di Main Thread
 * oleh handler masing-masing data-module via store.js — bukan di sini.
 *
 * Tugas Worker:
 * 1. Parsing CSV (PapaParse Streaming) & GeoJSON
 * 2. Mengirim rawBatch (array objek mentah) per chunk ke Main Thread
 * 3. Mengirim tableRowsBatch (properties flat) untuk tampilan tabel
 */

// Memuat PapaParse di Web Worker Thread
importScripts('https://unpkg.com/papaparse@5.4.1/papaparse.min.js');

self.onmessage = function (e) {
  const { action, file, layerId, fileType, sourceName } = e.data;

  if (action === 'PARSE_BUILDING_FILE') {
    parseBuildingFileInWorker(file, layerId, fileType, sourceName);
  }
};

/**
 * Mem-parse file CSV atau GeoJSON secara streaming dan mengirim hasilnya ke Main Thread.
 * Tidak melakukan transformasi field — seluruh transformasi dilakukan di store.js (Main Thread).
 */
function parseBuildingFileInWorker(file, layerId, fileType, sourceName) {
  const fileSize = file.size;
  let totalParsed = 0;
  let isFirstBatch = true;

  /**
   * Memproses satu chunk data mentah dan mengirimkannya ke Main Thread.
   * @param {Array} rawChunk - Array row mentah (CSV flat objects atau GeoJSON features)
   * @param {boolean} isComplete - Flag penanda parsing selesai
   * @param {number} bytesProcessed - Jumlah byte yang sudah diproses (untuk progress bar)
   */
  const processChunk = (rawChunk, isComplete = false, bytesProcessed = 0) => {
    if (rawChunk && rawChunk.length > 0) {
      const rawBatch = [];
      const tableRowsBatch = [];

      rawChunk.forEach(item => {
        // rawBatch: objek mentah penuh (CSV flat object atau GeoJSON Feature)
        rawBatch.push(item);

        // tableRowsBatch: properti flat untuk tampilan tabel
        // Untuk GeoJSON: ambil .properties; untuk CSV: gunakan objek langsung
        const props = fileType === 'geojson' ? (item.properties || {}) : item;
        tableRowsBatch.push(props);
      });

      totalParsed += rawChunk.length;
      const percent = fileSize > 0 ? Math.min(99, (bytesProcessed / fileSize) * 100) : 50;

      self.postMessage({
        type: 'CHUNK',
        layerId,
        sourceName,
        fileName: file.name,
        rawBatch,
        tableRowsBatch,
        totalParsed,
        percent,
        isFirstBatch
      });

      isFirstBatch = false;
    }

    if (isComplete) {
      self.postMessage({
        type: 'COMPLETE',
        layerId,
        sourceName,
        fileName: file.name,
        totalParsed
      });
    }
  };

  // ── CSV Parsing dengan PapaParse Streaming ──
  if (fileType === 'csv') {
    let bytesRead = 0;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 512, // 512KB per chunk
      chunk: (results) => {
        bytesRead += results.meta.cursor || 0;
        processChunk(results.data, false, bytesRead);
      },
      complete: () => {
        processChunk([], true, fileSize);
      },
      error: (err) => {
        self.postMessage({ type: 'ERROR', message: 'Gagal parsing CSV di Worker: ' + err.message });
      }
    });
  } else {
    // ── GeoJSON Parsing (sync via FileReaderSync) ──
    const reader = new FileReaderSync();
    try {
      const text = reader.readAsText(file);
      const geojson = JSON.parse(text);
      const features = geojson.features || [];
      processChunk(features, true, fileSize);
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: 'Format GeoJSON tidak valid di Worker: ' + err.message });
    }
  }
}
