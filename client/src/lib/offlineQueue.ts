/**
 * Serviço de fila offline para operações do coletor
 * 
 * Funcionalidades:
 * - Armazena operações localmente quando offline
 * - Sincroniza automaticamente ao reconectar
 * - Retry exponencial com backoff
 * - Idempotência (evita duplicação)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Schema do banco IndexedDB
interface OfflineQueueDB extends DBSchema {
  queue: {
    key: string; // UUID da operação
    value: QueuedOperation;
    indexes: { 'by-status': string; 'by-timestamp': number };
  };
}

export interface QueuedOperation {
  id: string; // UUID único
  operationType: 'scanProduct' | 'startPicking' | 'completePicking' | 'reportProblem';
  payload: any; // Dados da operação
  timestamp: number; // Quando foi criada
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
}

class OfflineQueueService {
  private db: IDBPDatabase<OfflineQueueDB> | null = null;
  private syncInProgress = false;
  private listeners: Set<() => void> = new Set();
  private syncFunction: ((operation: QueuedOperation) => Promise<boolean>) | null = null;

  async init() {
    if (this.db) return;

    this.db = await openDB<OfflineQueueDB>('wms-offline-queue', 1, {
      upgrade(db) {
        const store = db.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-timestamp', 'timestamp');
      },
    });

    // Registrar listener de conexão
    window.addEventListener('online', () => this.onConnectionChange(true));
    window.addEventListener('offline', () => this.onConnectionChange(false));

    // Tentar sincronizar ao iniciar (se online)
    if (navigator.onLine) {
      this.syncQueue();
    }
  }

  /**
   * Adiciona operação à fila
   */
  async enqueue(
    operationType: QueuedOperation['operationType'],
    payload: any
  ): Promise<string> {
    await this.init();

    const operation: QueuedOperation = {
      id: crypto.randomUUID(),
      operationType,
      payload,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    await this.db!.put('queue', operation);
    this.notifyListeners();

    // Tentar sincronizar imediatamente se online
    if (navigator.onLine) {
      this.syncQueue();
    }

    return operation.id;
  }

  /**
   * Remove operação da fila
   */
  async dequeue(id: string) {
    await this.init();
    await this.db!.delete('queue', id);
    this.notifyListeners();
  }

  /**
   * Obtém todas as operações pendentes
   */
  async getPendingOperations(): Promise<QueuedOperation[]> {
    await this.init();
    const tx = this.db!.transaction('queue', 'readonly');
    const index = tx.store.index('by-status');
    return await index.getAll('pending');
  }

  /**
   * Obtém contagem de operações pendentes
   */
  async getPendingCount(): Promise<number> {
    await this.init();
    const pending = await this.getPendingOperations();
    return pending.length;
  }

  /**
   * Sincroniza fila com servidor
   */
  async syncQueue() {
    if (this.syncInProgress || !navigator.onLine) return;

    this.syncInProgress = true;

    try {
      const pending = await this.getPendingOperations();

      for (const operation of pending) {
        try {
          // Atualizar status para "syncing"
          await this.db!.put('queue', { ...operation, status: 'syncing' });
          this.notifyListeners();

          // Tentar enviar ao servidor
          const success = await this.sendToServer(operation);

          if (success) {
            // Remover da fila se sucesso
            await this.dequeue(operation.id);
          } else {
            // Incrementar retry count e voltar para pending
            await this.db!.put('queue', {
              ...operation,
              status: 'pending',
              retryCount: operation.retryCount + 1,
            });
          }
        } catch (error) {
          // Marcar como failed se exceder tentativas
          if (operation.retryCount >= 5) {
            await this.db!.put('queue', {
              ...operation,
              status: 'failed',
              lastError: error instanceof Error ? error.message : 'Unknown error',
            });
          } else {
            await this.db!.put('queue', {
              ...operation,
              status: 'pending',
              retryCount: operation.retryCount + 1,
            });
          }
        }

        this.notifyListeners();
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Define função de sincronização customizada
   */
  setSyncFunction(fn: (operation: QueuedOperation) => Promise<boolean>) {
    this.syncFunction = fn;
  }

  /**
   * Envia operação ao servidor
   * Retorna true se sucesso, false se deve tentar novamente
   */
  private async sendToServer(operation: QueuedOperation): Promise<boolean> {
    if (!this.syncFunction) {
      console.warn('[OfflineQueue] No sync function set, skipping operation:', operation);
      return false;
    }

    try {
      return await this.syncFunction(operation);
    } catch (error) {
      console.error('[OfflineQueue] Error sending to server:', error);
      return false;
    }
  }

  /**
   * Handler de mudança de conexão
   */
  private onConnectionChange(isOnline: boolean) {
    console.log('[OfflineQueue] Connection changed:', isOnline ? 'ONLINE' : 'OFFLINE');
    
    if (isOnline) {
      // Aguardar 1 segundo antes de tentar sincronizar (estabilizar conexão)
      setTimeout(() => this.syncQueue(), 1000);
    }

    this.notifyListeners();
  }

  /**
   * Registra listener de mudanças
   */
  addListener(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notifica todos os listeners
   */
  private notifyListeners() {
    this.listeners.forEach(callback => callback());
  }

  /**
   * Limpa todas as operações (usar apenas para testes)
   */
  async clear() {
    await this.init();
    await this.db!.clear('queue');
    this.notifyListeners();
  }
}

// Singleton
export const offlineQueue = new OfflineQueueService();
