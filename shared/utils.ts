/**
 * Converte Date para formato MySQL DATE (YYYY-MM-DD)
 * @param date - Date object ou null
 * @returns String no formato YYYY-MM-DD ou null
 */
export function toMySQLDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  
  // Se já é string, normaliza para remover horas se houver
  if (typeof date === 'string') return (date as string).split(' ')[0].split('T')[0];
  
  // Converte Date para YYYY-MM-DD garantindo o dia absoluto
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Gera uniqueCode a partir de SKU e lote
 * @param sku - SKU do produto
 * @param batch - Lote do produto
 * @returns uniqueCode no formato SKU-LOTE
 */
export function getUniqueCode(sku: string, batch: string | null): string {
  // Normaliza para SKU-Lote, removendo sufixos extras e tratando nulos de forma consistente
  const cleanBatch = batch && batch !== 'null' && batch.trim() !== '' ? batch.trim() : 'null';
  return `${sku.trim()}-${cleanBatch}`;
}
