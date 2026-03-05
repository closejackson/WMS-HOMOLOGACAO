/**
 * Utilitários para geração e manipulação de uniqueCode (SKU+Lote)
 * 
 * uniqueCode é uma chave única que combina SKU e Lote para garantir
 * rastreabilidade ANVISA e evitar agrupamentos incorretos.
 * 
 * Formato: "SKU-LOTE" (ex: "401460P-22D08LB108")
 * Quando batch é null/undefined: "SKU-null" (ex: "401460P-null")
 */

/**
 * Gera uniqueCode a partir de SKU e Lote
 * @param sku - Código SKU do produto
 * @param batch - Lote do produto (opcional)
 * @returns uniqueCode no formato "SKU-LOTE"
 */
export function getUniqueCode(sku: string, batch?: string | null): string {
  // Normaliza: remove espaços, trata string 'null' literal e vazio como ausência de lote
  const cleanBatch = batch && batch.trim() !== '' && batch.trim() !== 'null' ? batch.trim() : 'null';
  return `${sku.trim()}-${cleanBatch}`;
}

/**
 * Extrai SKU do uniqueCode
 * @param uniqueCode - Código único no formato "SKU-LOTE"
 * @returns SKU extraído
 */
export function extractSku(uniqueCode: string): string {
  const parts = uniqueCode.split('-');
  // Remove o último elemento (lote) e junta o resto (SKU pode conter -)
  parts.pop();
  return parts.join('-');
}

/**
 * Extrai Lote do uniqueCode
 * @param uniqueCode - Código único no formato "SKU-LOTE"
 * @returns Lote extraído (null se for "null")
 */
export function extractBatch(uniqueCode: string): string | null {
  const parts = uniqueCode.split('-');
  const batch = parts[parts.length - 1];
  return batch === 'null' ? null : batch;
}

/**
 * Valida se uniqueCode está no formato correto
 * @param uniqueCode - Código único para validar
 * @returns true se válido
 */
export function isValidUniqueCode(uniqueCode: string): boolean {
  return uniqueCode.includes('-') && uniqueCode.length > 2;
}
