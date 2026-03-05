import { router, protectedProcedure } from "./_core/trpc";
import { tenantProcedure, assertSameTenant } from "./_core/tenantGuard";
import { z } from "zod";
import { getDb } from "./db";
import { getUniqueCode } from "./utils/uniqueCode";
import { toMySQLDate } from "../shared/utils";
import { pickingWaves, pickingWaveItems, pickingOrders, pickingOrderItems, inventory, products, labelAssociations, pickingAllocations, warehouseLocations, labelReadings } from "../drizzle/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { createWave, getWaveById } from "./waveLogic";
import { generateWaveDocument } from "./waveDocument";
import { TRPCError } from "@trpc/server";

export const waveRouter = router({
  /**
   * Listar ondas de separação
   */
  list: tenantProcedure
    .input(z.object({
      status: z.enum(["pending", "picking", "picked", "staged", "completed", "cancelled"]).optional(),
      limit: z.number().min(1).max(500).default(100),
      tenantId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];

      // Usar effectiveTenantId do middleware; admin global pode filtrar por tenant específico
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      if (isGlobalAdmin) {
        // Admin global: filtra por tenant específico apenas se fornecido no input
        if (input.tenantId) {
          conditions.push(eq(pickingWaves.tenantId, input.tenantId));
        }
        // Sem input.tenantId: retorna todas as ondas de todos os tenants
      } else {
        // Usuário normal: filtra sempre pelo seu próprio tenant
        conditions.push(eq(pickingWaves.tenantId, effectiveTenantId));
      }

      if (input.status) {
        conditions.push(eq(pickingWaves.status, input.status));
      }

      const query = db
        .select()
        .from(pickingWaves)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pickingWaves.createdAt))
        .limit(input.limit);

      return await query;
    }),

  /**
   * Criar onda de separação consolidando múltiplos pedidos
   */
  create: tenantProcedure
    .input(z.object({
      orderIds: z.array(z.number()).min(1, "Selecione pelo menos um pedido"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      }

      return await createWave({
        orderIds: input.orderIds,
        userId: ctx.user.id,
      });
    }),

  /**
   * Buscar detalhes de uma onda
   */
  getById: tenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getWaveById(input.id);
    }),

  /**
   * Buscar progresso de execução de uma onda
   * Usado pela interface de picking para exibir status em tempo real
   */
  getPickingProgress: tenantProcedure
    .input(z.object({ waveId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar onda
      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.waveId))
        .limit(1);

      if (!wave) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      }

      // Buscar itens da onda com progresso
      // JOIN direto com pickingOrders usando pickingOrderId
      const items = await db
        .select({
          id: pickingWaveItems.id,
          waveId: pickingWaveItems.waveId,
          productId: pickingWaveItems.productId,
          productName: pickingWaveItems.productName,
          productSku: pickingWaveItems.productSku,
          totalQuantity: pickingWaveItems.totalQuantity,
          pickedQuantity: pickingWaveItems.pickedQuantity,
          unit: pickingWaveItems.unit, // Unidade do pedido original
          unitsPerBox: pickingWaveItems.unitsPerBox, // Unidades por caixa
          locationId: pickingWaveItems.locationId,
          locationCode: pickingWaveItems.locationCode,
          batch: pickingWaveItems.batch,
          expiryDate: pickingWaveItems.expiryDate,
          status: pickingWaveItems.status,
          pickedAt: pickingWaveItems.pickedAt,
          createdAt: pickingWaveItems.createdAt,
          orderNumber: pickingOrders.customerOrderNumber, // Número do pedido (cliente)
        })
        .from(pickingWaveItems)
        .leftJoin(
          pickingOrders,
          eq(pickingWaveItems.pickingOrderId, pickingOrders.id)
        )
        .where(eq(pickingWaveItems.waveId, input.waveId));

      // Buscar labelCode para cada item (da tabela labelAssociations)
      const itemsWithLabels = await Promise.all(
        items.map(async (item) => {
          if (!item.batch) return { ...item, labelCode: undefined };

          // Buscar etiqueta associada ao produto/lote
          const [label] = await db
            .select({ labelCode: labelAssociations.labelCode })
            .from(labelAssociations)
            .where(
              and(
                eq(labelAssociations.productId, item.productId),
                eq(labelAssociations.batch, item.batch)
              )
            )
            .limit(1);

          return { ...item, labelCode: label?.labelCode };
        })
      );

      // Calcular progresso
      const totalItems = itemsWithLabels.length;
      const completedItems = itemsWithLabels.filter(item => item.status === "picked").length;
      const totalQuantity = itemsWithLabels.reduce((sum, item) => sum + item.totalQuantity, 0);
      const pickedQuantity = itemsWithLabels.reduce((sum, item) => sum + item.pickedQuantity, 0);

      return {
        wave,
        items: itemsWithLabels,
        progress: {
          totalItems,
          completedItems,
          totalQuantity,
          pickedQuantity,
          percentComplete: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        },
      };
    }),

  /**
   * Registrar item separado (escanear etiqueta)
   * Atualiza quantidade separada e status do item
   */
  registerPickedItem: tenantProcedure
    .input(z.object({
      waveId: z.number(),
      itemId: z.number(), // ID do pickingWaveItem
      scannedCode: z.string(), // Código escaneado (etiqueta)
      quantity: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar item da onda
      const [waveItem] = await db
        .select({
          id: pickingWaveItems.id,
          waveId: pickingWaveItems.waveId,
          productId: pickingWaveItems.productId,
          productSku: pickingWaveItems.productSku,
          totalQuantity: pickingWaveItems.totalQuantity,
          pickedQuantity: pickingWaveItems.pickedQuantity,
          locationId: pickingWaveItems.locationId,
          batch: pickingWaveItems.batch,
          status: pickingWaveItems.status,
        })
        .from(pickingWaveItems)
        .where(eq(pickingWaveItems.id, input.itemId))
        .limit(1);

      if (!waveItem) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item da onda não encontrado" });
      }

      // 2. Validar que o código escaneado corresponde à etiqueta armazenada
      if (waveItem.batch) {
        // Buscar etiqueta associada ao produto/lote em labelAssociations
        // (tanto recebimento "R..." quanto picking "P...")
        const [labelRecord] = await db
          .select({ labelCode: labelAssociations.labelCode })
          .from(labelAssociations)
          .where(
            and(
              eq(labelAssociations.productId, waveItem.productId),
              eq(labelAssociations.batch, waveItem.batch)
            )
          )
          .limit(1);

        if (labelRecord) {
          // Se há labelCode armazenado, comparar diretamente
          if (input.scannedCode.trim() !== labelRecord.labelCode.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Etiqueta incorreta! Esperado: ${labelRecord.labelCode}, mas foi escaneado: "${input.scannedCode}"`,
            });
          }
        } else {
          // Fallback: se não houver labelCode, validar pelo SKU OU lote
          const scannedCode = input.scannedCode.trim();
          const isMatchingBatch = waveItem.batch && scannedCode === waveItem.batch;
          const isMatchingSku = scannedCode.startsWith(waveItem.productSku);
          
          if (!isMatchingBatch && !isMatchingSku) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Produto/Lote incorreto! Esperado SKU: ${waveItem.productSku}${waveItem.batch ? ` ou Lote: ${waveItem.batch}` : ''}`,
            });
          }
        }
      } else {
        // Se não há lote, validar apenas pelo SKU
        const skuLength = waveItem.productSku.length;
        const scannedSku = input.scannedCode.substring(0, skuLength);
        
        if (scannedSku !== waveItem.productSku) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Produto incorreto! Esperado SKU: ${waveItem.productSku}`,
          });
        }
      }

      // 3. Validar que não excede a quantidade alocada para este waveItem
      // A validação real de estoque é feita na reserva (criação do pedido)
      // Aqui apenas validamos que o operador não separe mais do que foi alocado

      // 4. Validar quantidade total da onda
      const newPickedQuantity = waveItem.pickedQuantity + input.quantity;
      if (newPickedQuantity > waveItem.totalQuantity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Quantidade excede o solicitado! Solicitado: ${waveItem.totalQuantity}, já separado: ${waveItem.pickedQuantity}, tentando adicionar: ${input.quantity}`,
        });
      }

      // 5. Atualizar item da onda
      const isComplete = newPickedQuantity === waveItem.totalQuantity;
      await db
        .update(pickingWaveItems)
        .set({
          pickedQuantity: newPickedQuantity,
          status: isComplete ? "picked" : "picking",
        })
        .where(eq(pickingWaveItems.id, input.itemId));

      // 🔄 SINCRONIZAÇÃO CRUZADA: Atualizar pickingAllocations correspondentes
      if (isComplete) {
        // Marcar todas as alocações deste waveItem como 'picked'
        await db
          .update(pickingAllocations)
          .set({
            status: "picked",
            pickedQuantity: sql`${pickingAllocations.quantity}`, // Marcar como totalmente separado
          })
          .where(
            and(
              eq(pickingAllocations.waveId, input.waveId),
              eq(pickingAllocations.productId, waveItem.productId),
              waveItem.batch ? eq(pickingAllocations.batch, waveItem.batch) : sql`1=1`
            )
          );
      }

      // 6. Verificar se todos os itens da onda foram completados
      const allItems = await db
        .select()
        .from(pickingWaveItems)
        .where(eq(pickingWaveItems.waveId, input.waveId));

      // Verificar se todos os itens estão completos
      // Para o item atual, usar o novo status calculado
      // Para os outros, verificar se já estão "picked"
      const allCompleted = allItems.every(item => {
        if (item.id === input.itemId) {
          return isComplete;
        } else {
          return item.status === "picked";
        }
      });

      // 7. Atualizar status da onda se todos os itens foram completados (FINALIZAÇÃO AUTOMÁTICA)
      if (allCompleted) {
        await db
          .update(pickingWaves)
          .set({ 
            status: "completed",
            pickedBy: ctx.user.id,
            pickedAt: new Date(),
          })
          .where(eq(pickingWaves.id, input.waveId));

        // Atualizar status dos pedidos associados
        await db
          .update(pickingOrders)
          .set({ 
            status: "picked",
            pickedBy: ctx.user.id,
            pickedAt: new Date(),
          })
          .where(eq(pickingOrders.waveId, input.waveId));
      } else {
        // Atualizar status da onda para "picking" se ainda não estiver
        await db
          .update(pickingWaves)
          .set({ status: "picking" })
          .where(
            and(
              eq(pickingWaves.id, input.waveId),
              eq(pickingWaves.status, "pending")
            )
          );
      }

      return {
        success: true,
        itemCompleted: isComplete,
        waveCompleted: allCompleted,
        pickedQuantity: newPickedQuantity,
        totalQuantity: waveItem.totalQuantity,
      };
    }),

  /**
   * Cancelar onda (apenas ondas pending/picking)
   */
  cancel: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Atualizar status da onda
      await db
        .update(pickingWaves)
        .set({ status: "cancelled" })
        .where(eq(pickingWaves.id, input.id));

      // Liberar pedidos associados
      await db
        .update(pickingOrders)
        .set({ status: "pending", waveId: null })
        .where(eq(pickingOrders.waveId, input.id));

      return { success: true };
    }),

  /**
   * Excluir onda separada (completed)
   * Reverte separação, libera estoque reservado e cancela onda
   */
  deleteCompleted: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar onda
      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.id))
        .limit(1);

      if (!wave) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      }

      if (wave.status !== "completed") {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Apenas ondas separadas (completed) podem ser excluídas. Use cancelar para ondas pendentes." 
        });
      }

      // 2. Zerar quantidades separadas nos waveItems
      await db
        .update(pickingWaveItems)
        .set({ 
          pickedQuantity: 0,
          status: "pending"
        })
        .where(eq(pickingWaveItems.waveId, input.id));

      // 3. Cancelar onda
      await db
        .update(pickingWaves)
        .set({ status: "cancelled" })
        .where(eq(pickingWaves.id, input.id));

      // 4. Liberar pedidos (voltar para pending, mantendo reservas)
      await db
        .update(pickingOrders)
        .set({ 
          status: "pending",
          waveId: null
        })
        .where(eq(pickingOrders.waveId, input.id));

      return { 
        success: true, 
        message: `Onda ${wave.waveNumber} cancelada com sucesso. Pedidos voltaram para pending com reservas mantidas.`
      };
    }),

  /**
   * Editar quantidades separadas de uma onda completed
   * Permite ajustar quantidades para corrigir erros de separação
   */
  editCompleted: tenantProcedure
    .input(z.object({ 
      waveId: z.number(),
      items: z.array(z.object({
        waveItemId: z.number(),
        newPickedQuantity: z.number().min(0),
      }))
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar onda
      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.waveId))
        .limit(1);

      if (!wave) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      }

      if (wave.status !== "completed") {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Apenas ondas separadas (completed) podem ser editadas" 
        });
      }

      // 2. Atualizar quantidades dos itens
      for (const item of input.items) {
        // Buscar waveItem
        const [waveItem] = await db
          .select()
          .from(pickingWaveItems)
          .where(eq(pickingWaveItems.id, item.waveItemId))
          .limit(1);

        if (!waveItem) {
          throw new TRPCError({ 
            code: "NOT_FOUND", 
            message: `Item ${item.waveItemId} não encontrado` 
          });
        }

        // Validar que nova quantidade não excede o total solicitado
        if (item.newPickedQuantity > waveItem.totalQuantity) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `Quantidade separada (${item.newPickedQuantity}) não pode exceder quantidade solicitada (${waveItem.totalQuantity}) para o item ${waveItem.productSku}` 
          });
        }

        // Atualizar pickedQuantity
        const newStatus = item.newPickedQuantity === waveItem.totalQuantity ? "picked" : "picking";
        await db
          .update(pickingWaveItems)
          .set({ 
            pickedQuantity: item.newPickedQuantity,
            status: newStatus as "pending" | "picking" | "picked"
          })
          .where(eq(pickingWaveItems.id, item.waveItemId));
      }

      // 3. Recalcular status da onda
      const allWaveItems = await db
        .select()
        .from(pickingWaveItems)
        .where(eq(pickingWaveItems.waveId, input.waveId));

      const allCompleted = allWaveItems.every(
        item => item.pickedQuantity === item.totalQuantity
      );

      const newStatus = allCompleted ? "completed" : "picking";

      await db
        .update(pickingWaves)
        .set({ status: newStatus })
        .where(eq(pickingWaves.id, input.waveId));

      return { 
        success: true, 
        message: `Onda ${wave.waveNumber} atualizada com sucesso`,
        newStatus
      };
    }),

  /**
   * Excluir onda (apenas ondas pendentes ou canceladas)
   */
  delete: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verificar se a onda existe e seu status
      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.id))
        .limit(1);

      if (!wave) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      }

      // Apenas ondas pendentes ou canceladas podem ser excluídas
      if (wave.status !== "pending" && wave.status !== "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Apenas ondas pendentes ou canceladas podem ser excluídas"
        });
      }

      // Verificar permissão (apenas admin pode excluir)
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir ondas" });
      }

      // Nota: NÃO liberamos as reservas de estoque aqui porque:
      // - As reservas foram feitas na criação dos pedidos
      // - Os pedidos ainda existem (apenas voltam para "pending")
      // - As reservas só devem ser liberadas quando os pedidos forem excluídos/cancelados

      // Liberar pedidos associados (voltar para pending)
      await db
        .update(pickingOrders)
        .set({ status: "pending", waveId: null })
        .where(eq(pickingOrders.waveId, input.id));

      // Excluir itens da onda
      await db
        .delete(pickingWaveItems)
        .where(eq(pickingWaveItems.waveId, input.id));

      // Excluir onda
      await db
        .delete(pickingWaves)
        .where(eq(pickingWaves.id, input.id));

      return { success: true };
    }),

  /**
   * Gerar documento PDF da onda de separação
   */
  generateDocument: tenantProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      const pdfBuffer = await generateWaveDocument(input.id);
      
      // Retornar como base64 para o frontend
      return {
        pdf: pdfBuffer.toString('base64'),
        filename: `onda-${input.id}.pdf`,
      };
    }),

  /**
   * Finalizar onda de separação
   * Verifica se todos os itens foram separados e atualiza status da onda e pedidos
   */
  completeWave: tenantProcedure
    .input(z.object({
      waveId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar onda
      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.waveId))
        .limit(1);

      if (!wave) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      }

      // 2. Verificar se todos os itens foram separados
      const allItems = await db
        .select()
        .from(pickingWaveItems)
        .where(eq(pickingWaveItems.waveId, input.waveId));

      const allCompleted = allItems.every(item => item.status === "picked");

      if (!allCompleted) {
        const pendingCount = allItems.filter(item => item.status !== "picked").length;
        throw new TRPCError({ 
          code: "PRECONDITION_FAILED", 
          message: `Ainda há ${pendingCount} item(ns) pendente(s) de separação` 
        });
      }

      // 3. Atualizar status da onda para "completed"
      await db
        .update(pickingWaves)
        .set({ 
          status: "completed",
          pickedBy: ctx.user.id,
          pickedAt: new Date(),
        })
        .where(eq(pickingWaves.id, input.waveId));

      // 4. Atualizar status dos pedidos associados para "picked"
      await db
        .update(pickingOrders)
        .set({ 
          status: "picked",
          pickedBy: ctx.user.id,
          pickedAt: new Date(),
        })
        .where(eq(pickingOrders.waveId, input.waveId));

      return { 
        success: true, 
        message: `Onda ${wave.waveNumber} finalizada com sucesso`,
        waveNumber: wave.waveNumber,
      };
    }),

  /**
   * Validar endereço de separação (usado pelo coletor)
   */
  validateLocation: tenantProcedure
    .input(z.object({
      waveId: z.number(),
      locationCode: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar endereço
      const [location] = await db
        .select()
        .from(warehouseLocations)
        .where(eq(warehouseLocations.code, input.locationCode))
        .limit(1);

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Endereço não encontrado" });
      }

      // Buscar itens da onda nesse endereço
      const items = await db
        .select()
        .from(pickingWaveItems)
        .where(
          and(
            eq(pickingWaveItems.waveId, input.waveId),
            eq(pickingWaveItems.locationId, location.id)
          )
        );

      if (items.length === 0) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Nenhum item da onda neste endereço" 
        });
      }

      return {
        location,
        itemCount: items.length,
      };
    }),

  /**
   * Escanear produto (usado pelo coletor)
   * Verifica se etiqueta está associada ou se precisa associar
   */
  scanProduct: tenantProcedure
    .input(z.object({
      waveId: z.number(),
      locationId: z.number(),
      productCode: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar associação existente
      const [association] = await db
        .select({
          id: labelAssociations.id,
          productId: labelAssociations.productId,
          labelCode: labelAssociations.labelCode,
          batch: labelAssociations.batch,
          expiryDate: labelAssociations.expiryDate,
          unitsPerBox: labelAssociations.unitsPerBox,
        })
        .from(labelAssociations)
        .where(eq(labelAssociations.labelCode, input.productCode))
        .limit(1);

      if (!association) {
        // Etiqueta nova, precisa associar
        return {
          isNewLabel: true,
          productCode: input.productCode,
        };
      }

      // Buscar item da onda com esse produto e endereço
      const [waveItem] = await db
        .select()
        .from(pickingWaveItems)
        .where(
          and(
            eq(pickingWaveItems.waveId, input.waveId),
            eq(pickingWaveItems.locationId, input.locationId),
            eq(pickingWaveItems.productId, association.productId)
          )
        )
        .limit(1);

      if (!waveItem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Produto não pertence a esta onda/endereço",
        });
      }

      // Incrementar quantidade separada
      const unitsPerBox = association.unitsPerBox || 1;
      const newPickedQuantity = waveItem.pickedQuantity + unitsPerBox;

      // Determinar novo status
      const newStatus = newPickedQuantity >= waveItem.totalQuantity ? "picked" : "pending";

      // Atualizar pickingWaveItems
      await db
        .update(pickingWaveItems)
        .set({ 
          pickedQuantity: newPickedQuantity,
          status: newStatus
        })
        .where(eq(pickingWaveItems.id, waveItem.id));

      // Inserir leitura em labelReadings
      const sessionId = `P${input.waveId}`;
      await db.insert(labelReadings).values({
        sessionId,
        associationId: association.id,
        labelCode: input.productCode,
        readBy: ctx.user.id,
        unitsAdded: unitsPerBox,
      });

      return {
        isNewLabel: false,
        association,
        waveItem: {
          ...waveItem,
          pickedQuantity: newPickedQuantity,
        },
      };
    }),

  /**
   * Associar etiqueta com produto (usado pelo coletor)
   */
  associateLabel: tenantProcedure
    .input(z.object({
      waveId: z.number(),
      locationId: z.number(),
      labelCode: z.string(),
      productId: z.number(),
      batch: z.string().optional(),
      expiryDate: z.string().optional(),
      quantity: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verificar se etiqueta já está associada
      const [existing] = await db
        .select()
        .from(labelAssociations)
        .where(eq(labelAssociations.labelCode, input.labelCode))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Etiqueta já associada a outro produto",
        });
      }

      // Buscar produto
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
      }

      // Criar associação - usar effectiveTenantId do middleware de isolamento
      const tenantId = ctx.effectiveTenantId;
      await db.insert(labelAssociations).values({
        tenantId,
        labelCode: input.labelCode,
        productId: input.productId,
        batch: input.batch || null,
        expiryDate: toMySQLDate(input.expiryDate ? new Date(input.expiryDate) : null) as any,
        unitsPerBox: input.quantity,
        uniqueCode: getUniqueCode(product.sku, input.batch || ""),
        associatedBy: ctx.user.id,
        associatedAt: new Date(),
        status: 'AVAILABLE' as any,
      });

      // Buscar item da onda
      const [waveItem] = await db
        .select()
        .from(pickingWaveItems)
        .where(
          and(
            eq(pickingWaveItems.waveId, input.waveId),
            eq(pickingWaveItems.locationId, input.locationId),
            eq(pickingWaveItems.productId, input.productId)
          )
        )
        .limit(1);

      if (!waveItem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Produto não pertence a esta onda/endereço",
        });
      }

      // Atualizar quantidade separada
      const newPickedQuantity = waveItem.pickedQuantity + input.quantity;
      await db
        .update(pickingWaveItems)
        .set({ 
          pickedQuantity: newPickedQuantity,
          status: newPickedQuantity >= waveItem.totalQuantity ? "picked" : "picking",
        })
        .where(eq(pickingWaveItems.id, waveItem.id));

      return {
        success: true,
        product,
        waveItem: {
          ...waveItem,
          pickedQuantity: newPickedQuantity,
        },
      };
    }),

  /**
   * Cancelar onda de separação e reverter reservas atomicamente
   */
  cancelWithRevert: tenantProcedure
    .input(z.object({ waveId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.user?.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Tenant ID not found in session",
        });
      }

      return await db.transaction(async (tx) => {
        // 1. 🔒 Lock da Onda para evitar modificações simultâneas
        const [wave] = await tx
          .select()
          .from(pickingWaves)
          .where(
            and(
              eq(pickingWaves.id, input.waveId),
              eq(pickingWaves.tenantId, tenantId)
            )
          )
          .for('update');

        if (!wave) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Onda não encontrada ou sem permissão",
          });
        }

        // Validar se onda pode ser cancelada
        if (wave.status === "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Onda já foi concluída e não pode ser cancelada",
          });
        }

        if (wave.status === "cancelled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Onda já foi cancelada",
          });
        }

        // 2. Buscar todas as alocações de picking desta onda
        // 🔒 Ordenar por inventoryId para evitar Deadlock
        const allocations = await tx
          .select()
          .from(pickingAllocations)
          .where(eq(pickingAllocations.waveId, input.waveId))
          .orderBy(pickingAllocations.inventoryId); // 🔒 ORDEM CRÍTICA

        // 3. Reverter reservas no inventário atomicamente
        for (const allocation of allocations) {
          // Pular alocações sem inventoryId (não deveria acontecer, mas protege contra dados inconsistentes)
          if (!allocation.inventoryId) {
            console.warn(`[WAVE CANCEL] Alocação ${allocation.id} sem inventoryId - pulando`);
            continue;
          }
          // 🔒 SELECT FOR UPDATE no item de inventário específico
          const [invItem] = await tx
            .select()
            .from(inventory)
            .where(
              and(
                eq(inventory.id, allocation.inventoryId),
                eq(inventory.tenantId, tenantId)
              )
            )
            .for('update'); // 🔒 BLOQUEIO PESSIMISTA

          if (invItem) {
            // ✅ REVALIDAÇÃO PÓS-LOCK
            if (invItem.reservedQuantity < allocation.quantity) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Inconsistência detectada: reserva maior que saldo reservado (Produto ID: ${allocation.productId})`,
              });
            }

            // Reverter reserva
            await tx
              .update(inventory)
              .set({
                reservedQuantity: sql`${inventory.reservedQuantity} - ${allocation.quantity}`,
              })
              .where(eq(inventory.id, invItem.id));
          }
        }

        // 4. Limpeza Atômica
        // Remove as alocações para liberar o inventário para novas ondas
        await tx
          .delete(pickingAllocations)
          .where(eq(pickingAllocations.waveId, input.waveId));

        // Atualiza o status da onda
        await tx
          .update(pickingWaves)
          .set({ status: "cancelled" })
          .where(eq(pickingWaves.id, input.waveId));

        // Retorna pedidos vinculados para a fila (status pending)
        await tx
          .update(pickingOrders)
          .set({ status: "pending" })
          .where(
            inArray(
              pickingOrders.id,
              tx
                .select({ id: pickingWaveItems.pickingOrderId })
                .from(pickingWaveItems)
                .where(eq(pickingWaveItems.waveId, input.waveId))
            )
          );

        return {
          success: true,
          message: "Onda cancelada e reservas revertidas com sucesso",
          waveId: input.waveId,
        };
      });
    }),
});
