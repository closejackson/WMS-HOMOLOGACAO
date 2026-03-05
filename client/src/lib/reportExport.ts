/**
 * Utilit\u00e1rios para exporta\u00e7\u00e3o de relat\u00f3rios em m\u00faltiplos formatos
 */

/**
 * Exporta dados para CSV
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  // Extrair cabe\u00e7alhos
  const headers = Object.keys(data[0]);
  
  // Criar linhas CSV
  const csvRows = [
    headers.join(','), // Cabe\u00e7alho
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escapar v\u00edrgulas e aspas
        const escaped = String(value ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];

  // Criar blob e download
  const csvContent = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM para UTF-8
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta dados para Excel (usando HTML table)
 * Nota: Para exporta\u00e7\u00e3o real de .xlsx, seria necess\u00e1rio usar biblioteca como xlsx ou exceljs
 */
export function exportToExcel(data: any[], filename: string, reportTitle: string) {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  const headers = Object.keys(data[0]);
  
  // Criar HTML table
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .timestamp { font-size: 12px; color: #666; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="title">${reportTitle}</div>
      <div class="timestamp">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              ${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  // Criar blob e download
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta dados para PDF (usando print)
 * Nota: Para PDF real, seria necess\u00e1rio usar biblioteca como jsPDF ou pdfmake
 */
export function exportToPDF(data: any[], filename: string, reportTitle: string) {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  const headers = Object.keys(data[0]);
  
  // Criar HTML para impress\u00e3o
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Bloqueador de pop-up impediu a abertura. Por favor, permita pop-ups para este site.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${reportTitle}</title>
      <style>
        @media print {
          body { margin: 0; }
          @page { size: A4 landscape; margin: 1cm; }
        }
        body { font-family: Arial, sans-serif; }
        .header { text-align: center; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: bold; }
        .timestamp { font-size: 12px; color: #666; margin-top: 5px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #4CAF50; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${reportTitle}</div>
        <div class="timestamp">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
      </div>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              ${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `);

  printWindow.document.close();
  
  // Aguardar carregamento e imprimir
  printWindow.onload = () => {
    printWindow.print();
    // N\u00e3o fechar automaticamente para permitir visualiza\u00e7\u00e3o
    // printWindow.close();
  };
}

/**
 * Formata valor para exibi\u00e7\u00e3o (datas, n\u00fameros, etc)
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  return String(value);
}
