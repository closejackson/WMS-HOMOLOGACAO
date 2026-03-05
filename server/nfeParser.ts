/**
 * Parser de XML de NF-e (Nota Fiscal Eletrônica)
 * Extrai dados de produtos e informações da nota fiscal
 */

import { parseStringPromise, processors } from "xml2js";

export interface NFEProduct {
  codigo: string; // cProd - Código do produto do fornecedor
  descricao: string; // xProd - Descrição do produto
  ean: string | null; // cEAN - Código de barras
  eanTributavel: string | null; // cEANTrib - Código de barras tributável
  unidade: string; // uCom - Unidade comercial
  quantidade: number; // qCom - Quantidade comercial
  valorUnitario: number; // vUnCom - Valor unitário comercial
  valorTotal: number; // vProd - Valor total bruto
  ncm: string | null; // NCM - Nomenclatura Comum do Mercosul
  lote: string | null; // Número do lote (tag rastro/nLote)
  validade: string | null; // Data de validade (tag rastro/dVal)
}

export interface NFEData {
  chaveAcesso: string; // Chave de acesso da NF-e
  numero: string; // Número da nota fiscal
  serie: string; // Série da nota fiscal
  dataEmissao: string; // Data de emissão
  fornecedor: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
  };
  destinatario: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    municipio: string | null;
    uf: string | null;
  } | null;
  volumes: number; // Quantidade de volumes transportados
  pesoB: number; // Peso bruto em kg
  valorTotal: number; // Valor total da NF-e
  produtos: NFEProduct[];
}

/**
 * Extrai valor de um campo do XML, tratando arrays e valores undefined
 */
function extractValue(obj: any, defaultValue: any = null): any {
  if (!obj) return defaultValue;
  if (Array.isArray(obj)) return obj[0] || defaultValue;
  return obj;
}

/**
 * Parse de XML de NF-e e extração de dados estruturados
 */
export async function parseNFE(xmlContent: string): Promise<NFEData> {
  try {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false, // Não forçar arrays para tags únicas
      mergeAttrs: true,
      trim: true,
      tagNameProcessors: [processors.stripPrefix], // Remove namespace prefixes
      ignoreAttrs: false,
    });

    // Navegar na estrutura do XML da NF-e
    // Suporta diferentes estruturas:
    // 1. <nfeProc><NFe>... (NF-e processada com protocolo)
    // 2. <NFe>... (NF-e sem envelope)
    // 3. Com namespace: <nfe:nfeProc><nfe:NFe>...
    let nfe = null;
    
    // Tentar encontrar a tag NFe em diferentes caminhos
    if (parsed.nfeProc?.NFe) {
      nfe = parsed.nfeProc.NFe;
    } else if (parsed.NFe) {
      nfe = parsed.NFe;
    } else {
      // Log da estrutura para debug
      console.error('[NFE Parser] Estrutura do XML:', JSON.stringify(Object.keys(parsed), null, 2));
      throw new Error("Estrutura de NF-e inválida: tag NFe não encontrada. Verifique se o arquivo é um XML de NF-e válido.");
    }

    const infNFe = Array.isArray(nfe.infNFe) ? nfe.infNFe[0] : nfe.infNFe;
    if (!infNFe) {
      throw new Error("Estrutura de NF-e inválida: tag infNFe não encontrada");
    }

    // Extrair chave de acesso
    // O atributo Id tem formato "NFe" + 44 dígitos (ex: "NFe43220631...")
    // Usamos replace(/^NFe/,'') para remover apenas o prefixo inicial
    // e slice(-44) como fallback para garantir exatamente 44 dígitos
    const chaveAcessoRaw = Array.isArray(infNFe.Id) ? infNFe.Id[0] : infNFe.Id;
    const chaveAcessoFull = String(chaveAcessoRaw || "").replace(/^NFe/, "");
    const chaveAcesso = chaveAcessoFull.length > 44
      ? chaveAcessoFull.slice(-44)
      : chaveAcessoFull;

    // Extrair dados da identificação da nota
    const ide = Array.isArray(infNFe.ide) ? infNFe.ide[0] : infNFe.ide;
    // Garantir que numero e serie sejam sempre strings (xml2js pode retornar número 0 para série "0")
    const numero = String(extractValue(ide?.nNF, ""));
    const serie = String(extractValue(ide?.serie, "0"));
    const dataEmissao = extractValue(ide?.dhEmi, "");

    // Extrair dados do fornecedor (emitente)
    const emit = Array.isArray(infNFe.emit) ? infNFe.emit[0] : infNFe.emit;
    const fornecedor = {
      cnpj: extractValue(emit?.CNPJ, ""),
      razaoSocial: extractValue(emit?.xNome, ""),
      nomeFantasia: extractValue(emit?.xFant, null),
    };

    // Extrair dados do destinatário
    const dest = Array.isArray(infNFe.dest) ? infNFe.dest[0] : infNFe.dest;
    const enderDest = dest?.enderDest;
    const destinatario = dest ? {
      cnpj: extractValue(dest?.CNPJ, ""),
      razaoSocial: extractValue(dest?.xNome, ""),
      nomeFantasia: extractValue(dest?.xFant, null),
      municipio: extractValue(enderDest?.xMun, null),
      uf: extractValue(enderDest?.UF, null),
    } : null;

    // Extrair volumes transportados e peso bruto
    const transp = Array.isArray(infNFe.transp) ? infNFe.transp[0] : infNFe.transp;
    // vol pode ser array (múltiplos volumes) ou objeto único
    const volRaw = transp?.vol;
    const vol = Array.isArray(volRaw) ? volRaw[0] : volRaw;
    const volumes = vol ? (parseInt(String(extractValue(vol?.qVol, "1"))) || 1) : 1;
    const pesoB = vol ? (parseFloat(String(extractValue(vol?.pesoB, "0"))) || 0) : 0;

    // Extrair valor total da NF-e
    const total = Array.isArray(infNFe.total) ? infNFe.total[0] : infNFe.total;
    const ICMSTot = Array.isArray(total?.ICMSTot) ? total.ICMSTot[0] : total?.ICMSTot;
    const valorTotal = parseFloat(extractValue(ICMSTot?.vNF, "0"));

    // Extrair produtos (detalhes da nota)
    const detalhes = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);
    const produtos: NFEProduct[] = detalhes.map((det: any, index: number) => {
      const prod = Array.isArray(det.prod) ? det.prod[0] : det.prod;
      
      const codigo = extractValue(prod?.cProd, "");
      
      // Extrair dados de rastreabilidade (lote e validade)
      // A tag <rastro> pode ser um array ou objeto único
      const rastro = prod?.rastro;
      let lote = null;
      let validade = null;
      
      if (rastro) {
        const rastroArray = Array.isArray(rastro) ? rastro : [rastro];
        // Pegar o primeiro registro de rastreabilidade
        if (rastroArray.length > 0) {
          lote = extractValue(rastroArray[0]?.nLote, null);
          validade = extractValue(rastroArray[0]?.dVal, null);
        }
      }
      
      return {
        codigo,
        descricao: extractValue(prod?.xProd, ""),
        ean: extractValue(prod?.cEAN, null) || null,
        eanTributavel: extractValue(prod?.cEANTrib, null) || null,
        unidade: extractValue(prod?.uCom, "UN"),
        quantidade: parseFloat(extractValue(prod?.qCom, "0")),
        valorUnitario: parseFloat(extractValue(prod?.vUnCom, "0")),
        valorTotal: parseFloat(extractValue(prod?.vProd, "0")),
        ncm: extractValue(prod?.NCM, null),
        lote,
        validade,
      };
    });

    return {
      chaveAcesso,
      numero,
      serie,
      dataEmissao,
      fornecedor,
      destinatario,
      volumes,
      pesoB,
      valorTotal,
      produtos,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Erro ao fazer parse do XML da NF-e: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao fazer parse do XML da NF-e");
  }
}

/**
 * Valida se o XML é uma NF-e válida
 */
export function isValidNFE(xmlContent: string): boolean {
  return (
    xmlContent.includes("<NFe") ||
    xmlContent.includes("<nfeProc") ||
    xmlContent.includes("nfe.xsd")
  );
}
