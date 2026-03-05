import { z } from 'zod';

/**
 * Tipos compartilhados para o sistema de Conferência Cega
 * Garantem contrato consistente entre Backend (tRPC) e Frontend (React/Coletor)
 */

// 1. O Contrato de Item Conferido (Backend -> Frontend)
// Esse tipo reflete exatamente o que sai do banco na blindConferenceItems
export const ConferenceItemSchema = z.object({
  productId: z.number(),
  batch: z.string(),
  packagesRead: z.number(),
  expectedQuantity: z.number().optional(),
  productName: z.string().optional(), // Caso você faça Join com a tabela de produtos
  productSku: z.string().optional(),
  expiryDate: z.date().nullable().optional(),
});

export type ConferenceItem = z.infer<typeof ConferenceItemSchema>;

// 2. O Contrato de Leitura (O que o frontend deve salvar para o "Undo")
export const LastReadSchema = z.object({
  productId: z.number(),
  batch: z.string(),
  scannedCode: z.string(),
});

export type LastRead = z.infer<typeof LastReadSchema>;

// 3. O Resumo da Conferência (O que alimenta a lista na UI)
export type ConferenceSummary = ConferenceItem[];

// 4. Retorno da função readLabel
export const ReadLabelResponseSchema = z.object({
  isNewLabel: z.boolean(),
  association: z.object({
    id: z.number(),
    productId: z.number(),
    productName: z.string(),
    productSku: z.string(),
    batch: z.string().nullable(),
    expiryDate: z.date().nullable().optional(),
    unitsPerBox: z.number(),
    packagesRead: z.number(),
    totalUnits: z.number(),
  }).nullable(),
});

export type ReadLabelResponse = z.infer<typeof ReadLabelResponseSchema>;
