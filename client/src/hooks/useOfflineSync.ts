/**
 * Hook para gerenciar sincronização offline
 * 
 * Funcionalidades:
 * - Detecta mudanças de conexão
 * - Monitora status de sincronização
 * - Fornece feedback visual
 */

import { useState, useEffect } from 'react';
import { offlineQueue } from '@/lib/offlineQueue';

export type SyncStatus = 'online' | 'offline' | 'syncing';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('online');

  useEffect(() => {
    // Atualizar contagem inicial
    updatePendingCount();

    // Listener de mudanças na fila
    const unsubscribe = offlineQueue.addListener(() => {
      updatePendingCount();
    });

    // Listeners de conexão
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('syncing');
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = async () => {
    const count = await offlineQueue.getPendingCount();
    setPendingCount(count);

    // Atualizar status baseado na contagem
    if (count === 0 && isOnline) {
      setSyncStatus('online');
    } else if (count > 0 && isOnline) {
      setSyncStatus('syncing');
    } else if (!isOnline) {
      setSyncStatus('offline');
    }
  };

  return {
    isOnline,
    pendingCount,
    syncStatus,
  };
}
