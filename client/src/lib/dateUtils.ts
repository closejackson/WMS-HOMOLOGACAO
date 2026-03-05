/**
 * Formata uma data para o formato brasileiro dd/MM/yyyy
 * @param date - Data em qualquer formato aceito por Date()
 * @returns String no formato dd/MM/yyyy ou string vazia se inválida
 */
export function formatDateBR(date: string | Date | null | undefined): string {
  if (!date) return '';
  
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
}

/**
 * Converte data do formato brasileiro dd/MM/yyyy para yyyy-MM-dd (HTML input date)
 * @param dateBR - Data no formato dd/MM/yyyy
 * @returns String no formato yyyy-MM-dd ou string vazia se inválida
 */
export function parseDateBR(dateBR: string): string {
  if (!dateBR) return '';
  
  const parts = dateBR.split('/');
  if (parts.length !== 3) return '';
  
  const [day, month, year] = parts;
  if (!day || !month || !year) return '';
  
  // Validar se é uma data válida
  const date = new Date(`${year}-${month}-${day}`);
  if (isNaN(date.getTime())) return '';
  
  return `${year}-${month}-${day}`;
}

/**
 * Converte data do formato yyyy-MM-dd (HTML input date) para dd/MM/yyyy
 * @param dateISO - Data no formato yyyy-MM-dd
 * @returns String no formato dd/MM/yyyy ou string vazia se inválida
 */
export function isoToBR(dateISO: string): string {
  if (!dateISO) return '';
  
  const parts = dateISO.split('-');
  if (parts.length !== 3) return '';
  
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Converte data do formato dd/MM/yyyy para yyyy-MM-dd (alias para parseDateBR)
 * @param dateBR - Data no formato dd/MM/yyyy
 * @returns String no formato yyyy-MM-dd ou string vazia se inválida
 */
export function brToISO(dateBR: string): string {
  return parseDateBR(dateBR);
}
