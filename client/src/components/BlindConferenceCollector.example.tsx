/**
 * EXEMPLO DE COMPONENTE REACT PARA CONFERÊNCIA CEGA
 * 
 * Este componente demonstra como usar a nova API refatorada de conferência cega
 * com etiquetas permanentes e rastreabilidade por lote.
 * 
 * MUDANÇAS PRINCIPAIS:
 * - Usa `conferenceId` em vez de `sessionId`
 * - Armazena `productId + batch` para permitir undo preciso
 * - Consome `blindConferenceItems` via `getSummary`
 */

import React, { useState } from 'react';
import { trpc } from '../lib/trpc';

// Importar tipos compartilhados do backend
type LastRead = {
  productId: number;
  batch: string;
  scannedCode: string;
};

interface ConferenceCollectorProps {
  conferenceId: number;
}

export const BlindConferenceCollector: React.FC<ConferenceCollectorProps> = ({ conferenceId }) => {
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  const [scannedCode, setScannedCode] = useState('');
  const utils = trpc.useUtils();

  // 1. Mutation de Leitura (Refatorada)
  const readMutation = trpc.blindConference.readLabel.useMutation({
    onSuccess: (data) => {
      if (!data.isNewLabel && data.association) {
        // Armazena o último item para permitir o UNDO preciso
        setLastRead({
          productId: data.association.productId,
          batch: data.association.batch || '',
          scannedCode: scannedCode,
        });
        // Atualiza a lista de resumo na tela
        utils.blindConference.getSummary.invalidate({ conferenceId });
        setScannedCode('');
      } else {
        alert('Etiqueta não encontrada no sistema. Associe primeiro!');
      }
    },
    onError: (err) => alert(err.message),
  });

  // 2. Mutation de Desfazer (Usando o novo contrato de Lote)
  const undoMutation = trpc.blindConference.undoLastReading.useMutation({
    onSuccess: () => {
      setLastRead(null);
      utils.blindConference.getSummary.invalidate({ conferenceId });
      alert("Último item removido!");
    },
    onError: (err) => alert(err.message),
  });

  // 3. Query do resumo da conferência
  const { data: summary, isLoading } = trpc.blindConference.getSummary.useQuery({
    conferenceId,
  });

  const handleScan = (code: string) => {
    if (!code.trim()) return;
    readMutation.mutate({ conferenceId, labelCode: code });
  };

  const handleUndo = () => {
    if (lastRead) {
      undoMutation.mutate({
        conferenceId,
        productId: lastRead.productId,
        batch: lastRead.batch,
      });
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Conferência #{conferenceId}</h2>
      
      {/* Input de Bipagem */}
      <input 
        value={scannedCode}
        onChange={(e) => setScannedCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleScan(scannedCode);
          }
        }}
        placeholder="Bipe a etiqueta..."
        className="border p-2 w-full mt-4"
        autoFocus
      />

      {/* Botão de Desfazer (Só aparece se houver algo para desfazer) */}
      {lastRead && (
        <button 
          onClick={handleUndo}
          className="bg-yellow-500 text-white p-2 mt-2 rounded w-full"
          disabled={undoMutation.isPending}
        >
          Desfazer: {lastRead.scannedCode} (Lote: {lastRead.batch || 'sem lote'})
        </button>
      )}

      {/* Resumo da Conferência (Consumindo blindConferenceItems) */}
      <div className="mt-6">
        <h3 className="font-semibold">Itens Conferidos:</h3>
        {isLoading && <p>Carregando...</p>}
        {summary && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">
              Total: {summary.conferenceItems.reduce((sum, i) => sum + i.unitsRead, 0)} unidades conferidas
            </p>
            <ul className="mt-2 space-y-2">
              {summary.conferenceItems.map((item) => (
                <li key={`${item.productId}-${item.batch}`} className="border p-2 rounded">
                  <div className="font-medium">{item.productName}</div>
                  <div className="text-sm text-gray-600">
                    SKU: {item.productSku} | Lote: {item.batch || 'sem lote'}
                  </div>
                  <div className="text-sm">
                    Embalagens: {item.packagesRead}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
