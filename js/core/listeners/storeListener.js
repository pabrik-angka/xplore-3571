// js/core/listeners/storeListener.js
/**
 * Store Listener Helper - EventBus handler untuk event progress/toast yang dikirim oleh store.js.
 * Dipindahkan ke js/core/listeners/ sesuai arsitektur DDS-Lite.
 */
import { ToastComponent } from '../../ui/components/toast.js';
import { EventBus } from '../event-bus.js';

const _onStoreLoading = ({ show, text, percent }) => {
  ToastComponent.showLoading(show, text ?? 'Memproses data...', percent ?? null);
};

const _onStoreToast = ({ message, type }) => {
  ToastComponent.showToast(message, type ?? 'info');
};

export function initStoreListener() {
  EventBus.on('store:loading', _onStoreLoading);
  EventBus.on('store:toast', _onStoreToast);
}
