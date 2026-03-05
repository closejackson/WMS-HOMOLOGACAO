/**
 * Validação e formatação de códigos de endereços
 * 
 * Formato: RUA-PRÉDIO-ANDAR[QUADRANTE]
 * 
 * Exemplos:
 * - Whole (Inteira): A10-01-73 (RUA-PRÉDIO-ANDAR)
 * - Fraction (Fração): BI-A201-1D (RUA-PRÉDIO-ANDAR+QUADRANTE, sem hífen antes do quadrante)
 */

export type LocationType = "whole" | "fraction";

export interface LocationCodeParts {
  aisle: string;      // Rua (ex: A10, BI, T01)
  rack: string;       // Prédio (ex: 01, A201)
  level: string;      // Andar (ex: 73, 01, 1)
  position?: string;  // Quadrante (ex: A, B, C, D - apenas para fraction)
}

export interface LocationCodeValidation {
  isValid: boolean;
  code?: string;
  parts?: LocationCodeParts;
  error?: string;
}

/**
 * Valida e formata código de endereço
 * 
 * @param code - Código do endereço (ex: A10-01-73 ou BI-A201-1D)
 * @param locationType - Tipo do endereço (whole ou fraction)
 * @returns Resultado da validação com código formatado e partes
 */
export function validateLocationCode(
  code: string,
  locationType: LocationType
): LocationCodeValidation {
  if (!code || typeof code !== "string") {
    return {
      isValid: false,
      error: "Código de endereço é obrigatório",
    };
  }

  // Remove espaços e converte para maiúsculas
  const cleanCode = code.trim().toUpperCase();

  // Regex para validação (alfanumérico flexível)
  const wholeRegex = /^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)$/; // Ex: A10-01-73
  const fractionRegex = /^([A-Z0-9]+)-([A-Z0-9]+)-([A-Z0-9]+)([A-Z])$/; // Ex: BI-A201-1D

  if (locationType === "whole") {
    const match = cleanCode.match(wholeRegex);
    
    if (!match) {
      return {
        isValid: false,
        error: "Código inválido para endereço Inteiro. Formato esperado: RUA-PRÉDIO-ANDAR (ex: A10-01-73)",
      };
    }

    const [, aisle, rack, level] = match;

    return {
      isValid: true,
      code: cleanCode,
      parts: {
        aisle,
        rack,
        level,
      },
    };
  } else if (locationType === "fraction") {
    const match = cleanCode.match(fractionRegex);
    
    if (!match) {
      return {
        isValid: false,
        error: "Código inválido para endereço Fração. Formato esperado: RUA-PRÉDIO-ANDAR+QUADRANTE (ex: BI-A201-1D)",
      };
    }

    const [, aisle, rack, level, position] = match;

    // Validar quadrante (A, B, C, D)
    if (!["A", "B", "C", "D"].includes(position)) {
      return {
        isValid: false,
        error: "Quadrante inválido. Valores permitidos: A, B, C, D",
      };
    }

    return {
      isValid: true,
      code: cleanCode,
      parts: {
        aisle,
        rack,
        level,
        position,
      },
    };
  }

  return {
    isValid: false,
    error: "Tipo de endereço inválido",
  };
}

/**
 * Gera código de endereço a partir das partes
 * 
 * @param parts - Partes do código (aisle, rack, level, position)
 * @param locationType - Tipo do endereço (whole ou fraction)
 * @returns Código formatado ou null se inválido
 */
export function generateLocationCode(
  parts: LocationCodeParts,
  locationType: LocationType
): string | null {
  const { aisle, rack, level, position } = parts;

  if (!aisle || !rack || !level) {
    return null;
  }

  if (locationType === "whole") {
    // Formato: A10-01-73
    return `${aisle}-${rack}-${level}`;
  } else if (locationType === "fraction") {
    if (!position) {
      return null;
    }
    // Formato: BI-A201-1D (sem hífen antes do quadrante)
    return `${aisle}-${rack}-${level}${position}`;
  }

  return null;
}

/**
 * Extrai partes do código de endereço
 * 
 * @param code - Código do endereço
 * @param locationType - Tipo do endereço
 * @returns Partes do código ou null se inválido
 */
export function parseLocationCode(
  code: string,
  locationType: LocationType
): LocationCodeParts | null {
  const validation = validateLocationCode(code, locationType);
  
  if (!validation.isValid || !validation.parts) {
    return null;
  }

  return validation.parts;
}

/**
 * Valida se quadrante é obrigatório para o tipo de endereço
 * 
 * @param locationType - Tipo do endereço
 * @param position - Quadrante (opcional)
 * @returns true se válido, false caso contrário
 */
export function validateQuadrantRequirement(
  locationType: LocationType,
  position?: string
): boolean {
  if (locationType === "fraction") {
    // Quadrante é obrigatório para fração
    return !!position && ["A", "B", "C", "D"].includes(position);
  } else if (locationType === "whole") {
    // Quadrante não deve existir para inteiro
    return !position;
  }
  
  return false;
}
