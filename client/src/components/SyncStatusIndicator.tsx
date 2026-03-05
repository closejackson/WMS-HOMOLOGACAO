/**
 * Indicador visual de status de sincronização offline
 * 
 * Estados:
 * - 🟢 Verde: Online e sincronizado
 * - 🟡 Amarelo: Sincronizando operações pendentes
 * - 🔴 Vermelho: Offline com operações pendentes
 */

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export function SyncStatusIndicator() {
  const { syncStatus, pendingCount } = useOfflineSync();

  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'online':
        return {
          icon: Wifi,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'Online',
          description: 'Todas as operações sincronizadas',
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          label: 'Sincronizando',
          description: `${pendingCount} operação${pendingCount !== 1 ? 'ões' : ''} pendente${pendingCount !== 1 ? 's' : ''}`,
        };
      case 'offline':
        return {
          icon: WifiOff,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'Offline',
          description: `${pendingCount} operação${pendingCount !== 1 ? 'ões' : ''} aguardando conexão`,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bgColor} ${config.borderColor}`}
    >
      <Icon
        className={`h-4 w-4 ${config.color} ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
      />
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${config.color}`}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {config.description}
        </span>
      </div>
    </div>
  );
}

/**
 * Versão compacta para header
 */
export function SyncStatusBadge() {
  const { syncStatus, pendingCount } = useOfflineSync();

  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'online':
        return {
          icon: Wifi,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
        };
      case 'offline':
        return {
          icon: WifiOff,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bgColor}`}>
      <Icon
        className={`h-3.5 w-3.5 ${config.color} ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
      />
      {pendingCount > 0 && (
        <span className={`text-xs font-medium ${config.color}`}>
          {pendingCount}
        </span>
      )}
    </div>
  );
}
