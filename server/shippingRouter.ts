/**
 * Router para Módulo de Expedição
 * Gerencia Notas Fiscais, Romaneios e Expedição
 */

import { router, protectedProcedure } from "./_core/trpc.js";
import { tenantProcedure, assertSameTenant } from "./_core/tenantGuard";
import { getDb } from "./db.js";
import { 
  invoices, 
  shipmentManifests, 
  shipmentManifestItems,
  pickingOrders,
  pickingOrderItems,
  pickingWaves,
  products,
  tenants,
  inventory,
  inventoryMovements,
  
  warehouseLocations,
  warehouseZones,
  stageCheckItems,
  stageChecks
} from "../drizzle/schema.js";
import { parseNFE } from "./nfeParser.js";
import { TRPCError } from "@trpc/server";
import { getUniqueCode } from "./utils/uniqueCode.js";
import { z } from "zod";
import { eq, and, or, sql, desc, inArray, isNull } from "drizzle-orm";

export const shippingRouter = router({
  // ============================================================================
  // PEDIDOS - Fila de Expedição
  // ============================================================================
  
  /**
   * Listar pedidos prontos para expedição (status: staged)
   */
  listOrders: tenantProcedure
    .input(
      z.object({
        status: z.enum(["awaiting_invoice", "invoice_linked", "in_manifest", "shipped"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? null : effectiveTenantId;

      const conditions: any[] = [
        // Pedidos prontos para expedição: 'staged' (aguardando NF) ou 'invoiced' (NF vinculada, fora de romanéio)
        inArray(pickingOrders.status, ["staged", "invoiced"]),
      ];

      if (tenantId !== null) {
        conditions.push(eq(pickingOrders.tenantId, tenantId));
      }

      if (input?.status) {
        conditions.push(eq(pickingOrders.shippingStatus, input.status));
      }

      const orders = await db
        .select({
          id: pickingOrders.id,
          orderNumber: pickingOrders.orderNumber,
          customerOrderNumber: pickingOrders.customerOrderNumber,
          customerName: pickingOrders.customerName,
          deliveryAddress: pickingOrders.deliveryAddress,
          shippingStatus: pickingOrders.shippingStatus,
          createdAt: pickingOrders.createdAt,
        })
        .from(pickingOrders)
        .where(and(...conditions))
        .orderBy(desc(pickingOrders.createdAt));

      return orders;
    }),

  // ============================================================================
  // NOTAS FISCAIS
  // ============================================================================

  /**
   * Importar XML de Nota Fiscal
   */
  importInvoice: tenantProcedure
    .input(
      z.object({
        xmlContent: z.string(), // Conteúdo do XML
        invoiceNumber: z.string(),
        series: z.string(),
        invoiceKey: z.string(),
        customerId: z.number(),
        customerName: z.string(),
        volumes: z.number(),
        totalValue: z.string(),
        issueDate: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? input.customerId : effectiveTenantId;

      // Verificar se NF já foi importada
      const existing = await db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceKey, input.invoiceKey))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Nota Fiscal já foi importada anteriormente" 
        });
      }

      // Inserir NF
      const [result] = await db.insert(invoices).values({
        tenantId,
        invoiceNumber: input.invoiceNumber,
        series: input.series,
        invoiceKey: input.invoiceKey,
        customerId: input.customerId,
        customerName: input.customerName,
        xmlData: { raw: input.xmlContent }, // Armazenar XML completo
        volumes: input.volumes,
        totalValue: input.totalValue,
        issueDate: new Date(input.issueDate),
        status: "imported",
        importedBy: ctx.user.id,
      });

      return { 
        success: true, 
        invoiceId: Number(result.insertId),
        message: `Nota Fiscal ${input.invoiceNumber} importada com sucesso` 
      };
    }),

  /**
   * Listar Notas Fiscais
   */
  listInvoices: tenantProcedure
    .input(
      z.object({
        status: z.enum(["imported", "linked", "in_manifest", "shipped"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? null : effectiveTenantId;

      const conditions: any[] = [];

      if (tenantId !== null) {
        conditions.push(eq(invoices.tenantId, tenantId));
      }

      if (input?.status) {
        conditions.push(eq(invoices.status, input.status));
      }

      const result = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          series: invoices.series,
          invoiceKey: invoices.invoiceKey,
          customerName: invoices.customerName,
          pickingOrderId: invoices.pickingOrderId,
          volumes: invoices.volumes,
          totalValue: invoices.totalValue,
          issueDate: invoices.issueDate,
          status: invoices.status,
          importedAt: invoices.importedAt,
          linkedAt: invoices.linkedAt,
          orderNumber: pickingOrders.customerOrderNumber,
        })
        .from(invoices)
        .leftJoin(pickingOrders, eq(invoices.pickingOrderId, pickingOrders.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(invoices.importedAt));

      return result;
    }),

  /**
   * Vincular NF a Pedido
   */
  linkInvoiceToOrder: tenantProcedure
    .input(
      z.object({
        invoiceNumber: z.string(),
        orderNumber: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar NF pelo número
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceNumber, input.invoiceNumber))
        .limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `NF ${input.invoiceNumber} não encontrada`,
        });
      }

      // Buscar pedido pelo número do cliente
      const [order] = await db
        .select()
        .from(pickingOrders)
        .where(eq(pickingOrders.customerOrderNumber, input.orderNumber))
        .limit(1);

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Pedido ${input.orderNumber} não encontrado`,
        });
      }

      // Verificar se NF já está vinculada
      if (invoice.pickingOrderId) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Nota Fiscal já está vinculada a outro pedido" 
        });
      }

      if (order.status !== "staged") {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Pedido deve estar com status 'staged' para receber NF" 
        });
      }

      // Buscar itens do pedido com dados do produto
      const orderItems = await db
        .select({
          productId: pickingOrderItems.productId,
          sku: products.sku,
          supplierCode: products.supplierCode,
          requestedQuantity: pickingOrderItems.requestedQuantity,
          requestedUM: pickingOrderItems.requestedUM,
          unitsPerBox: products.unitsPerBox,
          batch: pickingOrderItems.batch,
          uniqueCode: (pickingOrderItems as any).uniqueCode, // ✅ Incluir uniqueCode
        })
        .from(pickingOrderItems)
        .leftJoin(products, eq(pickingOrderItems.productId, products.id))
        .where(eq(pickingOrderItems.pickingOrderId, order.id));

      // Parse XML da NF para validar
      const nfeData = await parseNFE((invoice.xmlData as any).raw);

      // Validar SKUs
      const orderSkus = new Set(orderItems.map(item => item.sku || item.supplierCode));
      const nfeSkus = new Set(nfeData.produtos.map(p => p.codigo));
      
      const missingSkus = Array.from(nfeSkus).filter(sku => !orderSkus.has(sku));
      if (missingSkus.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `SKUs da NF não encontrados no pedido: ${missingSkus.join(", ")}`,
        });
      }

      // Validar quantidades e lotes (LOTE POR LOTE)
      for (const nfeProd of nfeData.produtos) {
        // ✅ BUSCAR POR UNIQUECODE (chave única SKU+Lote)
        const nfeUniqueCode = getUniqueCode(nfeProd.codigo, nfeProd.lote);
        const orderItem = orderItems.find(item => {
          // Tentar match por uniqueCode primeiro (mais eficiente)
          if (item.uniqueCode) {
            return item.uniqueCode === nfeUniqueCode;
          }
          // Fallback para match manual (dados antigos sem uniqueCode)
          const skuMatch = item.sku === nfeProd.codigo || item.supplierCode === nfeProd.codigo;
          const batchMatch = !nfeProd.lote || item.batch === nfeProd.lote;
          return skuMatch && batchMatch;
        });

        if (!orderItem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Produto ${nfeProd.codigo} (Lote: ${nfeProd.lote || 'N/A'}) da NF não encontrado no pedido`,
          });
        }

        // Normalizar quantidade do pedido para unidades
        let expectedQuantity = orderItem.requestedQuantity;
        if (orderItem.requestedUM === 'box' && orderItem.unitsPerBox) {
          expectedQuantity = orderItem.requestedQuantity * orderItem.unitsPerBox;
        }

        // Validar quantidade (NF sempre vem em unidades) - LOTE POR LOTE
        if (expectedQuantity !== nfeProd.quantidade) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Quantidade divergente para SKU ${nfeProd.codigo} Lote ${nfeProd.lote || 'N/A'}: Pedido=${expectedQuantity} unidades, NF=${nfeProd.quantidade} unidades`,
          });
        }

        // Validar lote (já validado no find acima, mas mantido para clareza)
        if (orderItem.batch && nfeProd.lote && orderItem.batch !== nfeProd.lote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Lote divergente para SKU ${nfeProd.codigo}: Pedido=${orderItem.batch}, NF=${nfeProd.lote}`,
          });
        }
      }

      // Validar volumes (comparar com total esperado do pedido)
      // Por enquanto apenas log, pode adicionar validação se necessário
      console.log(`[Shipping] Volumes da NF: ${nfeData.volumes}`);

      // Vincular NF ao pedido
      await db
        .update(invoices)
        .set({
          pickingOrderId: order.id,
          status: "linked",
          linkedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      // Atualizar status de expedição do pedido
      await db
        .update(pickingOrders)
        .set({
          shippingStatus: "invoice_linked",
        })
        .where(eq(pickingOrders.id, order.id));

      return { 
        success: true, 
        message: "Nota Fiscal vinculada ao pedido com sucesso" 
      };
    }),

  /**
   * Desvincular NF de Pedido
   */
  unlinkInvoice: tenantProcedure
    .input(
      z.object({
        invoiceNumber: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar NF pelo número
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceNumber, input.invoiceNumber))
        .limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `NF ${input.invoiceNumber} não encontrada`,
        });
      }

      if (!invoice.pickingOrderId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nota Fiscal não está vinculada a nenhum pedido",
        });
      }

      const orderId = invoice.pickingOrderId;

      // Desvincular NF do pedido
      await db
        .update(invoices)
        .set({
          pickingOrderId: null,
          status: "imported",
          linkedAt: null,
        })
        .where(eq(invoices.id, invoice.id));

      // Atualizar status de expedição do pedido para awaiting_invoice
      await db
        .update(pickingOrders)
        .set({
          shippingStatus: "awaiting_invoice",
        })
        .where(eq(pickingOrders.id, orderId));

      return {
        success: true,
        message: "Nota Fiscal desvinculada do pedido com sucesso",
      };
    }),

  /**
   * Excluir NF Importada
   */
  deleteInvoice: tenantProcedure
    .input(
      z.object({
        invoiceNumber: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar NF pelo número
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceNumber, input.invoiceNumber))
        .limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `NF ${input.invoiceNumber} não encontrada`,
        });
      }

      if (invoice.pickingOrderId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível excluir NF vinculada a um pedido. Desvincule primeiro.",
        });
      }

      if (invoice.status !== "imported") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Não é possível excluir NF com status '${invoice.status}'`,
        });
      }

      // Excluir NF
      await db
        .delete(invoices)
        .where(eq(invoices.id, invoice.id));

      return {
        success: true,
        message: "Nota Fiscal excluída com sucesso",
      };
    }),

  // ============================================================================
  // ROMANEIOS
  // ============================================================================

  /**
   * Criar Romaneio
   */
  createManifest: tenantProcedure
    .input(
      z.object({
        carrierName: z.string(),
        orderIds: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Validar pedidos
      const orders = await db
        .select({
          id: pickingOrders.id,
          customerOrderNumber: pickingOrders.customerOrderNumber,
          shippingStatus: pickingOrders.shippingStatus,
          tenantId: pickingOrders.tenantId,
        })
        .from(pickingOrders)
        .where(
          sql`${pickingOrders.id} IN (${sql.join(input.orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      if (orders.length !== input.orderIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Alguns pedidos não foram encontrados" });
      }

      // Verificar se todos os pedidos têm NF vinculada
      const ordersWithoutInvoice = orders.filter(o => o.shippingStatus !== "invoice_linked");
      if (ordersWithoutInvoice.length > 0) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: `Pedidos sem NF vinculada: ${ordersWithoutInvoice.map(o => o.customerOrderNumber).join(", ")}` 
        });
      }

      // Buscar NFs dos pedidos
      const invoicesList = await db
        .select()
        .from(invoices)
        .where(
          sql`${invoices.pickingOrderId} IN (${sql.join(input.orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      const totalVolumes = invoicesList.reduce((sum, inv) => sum + (inv.volumes || 0), 0);

      // Usar tenantId do primeiro pedido (todos devem ser do mesmo cliente)
      const manifestTenantId = orders[0].tenantId;

      // Gerar número do romaneio
      const manifestNumber = `ROM-${Date.now()}`;

      // Criar romaneio
      const [manifest] = await db.insert(shipmentManifests).values({
        tenantId: manifestTenantId,
        manifestNumber,
        carrierName: input.carrierName,
        totalOrders: input.orderIds.length,
        totalInvoices: invoicesList.length,
        totalVolumes,
        status: "draft",
        createdBy: ctx.user.id,
      });

      const manifestId = Number(manifest.insertId);

      // Adicionar itens ao romaneio
      for (const orderId of input.orderIds) {
        const invoice = invoicesList.find(inv => inv.pickingOrderId === orderId);
        if (invoice) {
          await db.insert(shipmentManifestItems).values({
            manifestId,
            pickingOrderId: orderId,
            invoiceId: invoice.id,
            volumes: invoice.volumes,
          });
        }
      }

      // Atualizar status dos pedidos e NFs
      await db
        .update(pickingOrders)
        .set({ shippingStatus: "in_manifest" })
        .where(
          sql`${pickingOrders.id} IN (${sql.join(input.orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      await db
        .update(invoices)
        .set({ status: "in_manifest" })
        .where(
          sql`${invoices.pickingOrderId} IN (${sql.join(input.orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      // ========================================================================
      // RESERVA AUTOMÁTICA DE ESTOQUE NO ENDEREÇO EXP
      // ========================================================================
      
      // 1. Buscar todos os itens dos pedidos vinculados ao romaneio (com uniqueCode)
      const orderItems = await db
        .select({
          productId: pickingOrderItems.productId,
          uniqueCode: pickingOrderItems.uniqueCode,
          batch: pickingOrderItems.batch,
          requestedQuantity: pickingOrderItems.requestedQuantity,
          unitsPerBox: products.unitsPerBox,
          totalUnits: sql<number>`${pickingOrderItems.requestedQuantity} * COALESCE(${products.unitsPerBox}, 1)`,
        })
        .from(pickingOrderItems)
        .innerJoin(products, eq(pickingOrderItems.productId, products.id))
        .where(inArray(pickingOrderItems.pickingOrderId, input.orderIds));

      // 2. Para cada item, localizar estoque na zona EXP por uniqueCode e reservar
      for (const item of orderItems) {
        // 🎯 Buscar estoque disponível na zona EXP usando uniqueCode + locationZone
        const expStock = await db
          .select({
            inventoryId: inventory.id,
            locationId: inventory.locationId,
            quantity: inventory.quantity,
            reservedQuantity: inventory.reservedQuantity,
            availableQuantity: sql<number>`${inventory.quantity} - COALESCE(${inventory.reservedQuantity}, 0)`,
          })
          .from(inventory)
          .where(
            and(
              ...(item.uniqueCode ? [eq(inventory.uniqueCode, item.uniqueCode)] : [sql`1=0`]), // 🎯 Busca por uniqueCode (SKU-LOTE)
              eq(inventory.locationZone, "EXP"), // 🎯 Busca direta por locationZone (sem JOIN)
              eq(inventory.status, "available"),
              sql`${inventory.quantity} - COALESCE(${inventory.reservedQuantity}, 0) > 0` // Saldo disponível
            )
          )
          .limit(1); // Pegar primeiro endereço disponível

        if (expStock.length > 0) {
          const stock = expStock[0];
          const quantityToReserve = Math.min(item.totalUnits, stock.availableQuantity);
          
          // VALIDAÇÃO PREVENTIVA: Garantir que reserva não exceda estoque disponível
          if (quantityToReserve <= 0) {
            console.warn(`[RESERVA] Estoque insuficiente na zona EXP para uniqueCode ${item.uniqueCode}. Necessário: ${item.totalUnits}, Disponível: ${stock.availableQuantity}`);
            continue; // Pular este item
          }
          
          // Validar que a nova reserva total não excederá a quantidade física
          const newReservedQuantity = (stock.reservedQuantity || 0) + quantityToReserve;
          if (newReservedQuantity > stock.quantity) {
            console.error(`[RESERVA] ERRO CRÍTICO: Tentativa de reservar mais do que existe fisicamente!`);
            console.error(`  UniqueCode: ${item.uniqueCode}, Estoque ID: ${stock.inventoryId}`);
            console.error(`  Quantidade física: ${stock.quantity}, Já reservado: ${stock.reservedQuantity || 0}, Tentando reservar: ${quantityToReserve}`);
            console.error(`  Nova reserva total seria: ${newReservedQuantity} (EXCEDE O ESTOQUE!)`);
            throw new Error(`Erro de integridade: reserva excederia estoque físico. UniqueCode ${item.uniqueCode}, Endereço ${stock.locationId}`);
          }
          
          // Atualizar reservedQuantity e status
          await db
            .update(inventory)
            .set({ 
              reservedQuantity: sql`COALESCE(${inventory.reservedQuantity}, 0) + ${quantityToReserve}`
            })
            .where(eq(inventory.id, stock.inventoryId));
          
          // NOTA: pickingAllocations serão criadas automaticamente por pickingAllocation.ts ao gerar onda
          console.log(`[RESERVA] Reservado ${quantityToReserve} unidades do uniqueCode ${item.uniqueCode} (lote ${item.batch}) no estoque ${stock.inventoryId} para romaneio ${manifestId}`);
        } else {
          // ⚠️ Estoque insuficiente na zona EXP para este lote
          console.error(`[RESERVA] Estoque insuficiente no Stage para o lote ${item.batch} (uniqueCode: ${item.uniqueCode}). Necessário: ${item.totalUnits} unidades.`);
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `Estoque insuficiente no Stage para o lote ${item.batch}. Verifique se a conferência foi finalizada.` 
          });
        }
      }

      console.log(`[ROMANEIO] Romaneio ${manifestId} criado com ${input.orderIds.length} pedido(s). Reservas criadas em EXP.`);
      
      return { 
        success: true, 
        manifestId,
        manifestNumber,
        message: `Romaneio ${manifestNumber} criado com ${input.orderIds.length} pedido(s). Estoque reservado automaticamente na zona EXP.` 
      };
    }),

  /**
   * Listar Romaneios
   */
  listManifests: tenantProcedure
    .input(
      z.object({
        status: z.enum(["draft", "ready", "collected", "shipped"]).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? null : effectiveTenantId;

      const conditions: any[] = [];

      if (tenantId !== null) {
        conditions.push(eq(shipmentManifests.tenantId, tenantId));
      }

      if (input?.status) {
        conditions.push(eq(shipmentManifests.status, input.status));
      }

      const manifests = await db
        .select()
        .from(shipmentManifests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(shipmentManifests.createdAt));

      return manifests;
    }),

  /**
   * Finalizar Expedição (Romaneio)
   */
  finalizeManifest: tenantProcedure
    .input(z.object({ manifestId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar romaneio
      const [manifest] = await db
        .select()
        .from(shipmentManifests)
        .where(eq(shipmentManifests.id, input.manifestId))
        .limit(1);

      if (!manifest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Romaneio não encontrado" });
      }

      // Buscar itens do romaneio
      const items = await db
        .select()
        .from(shipmentManifestItems)
        .where(eq(shipmentManifestItems.manifestId, input.manifestId));

      const orderIds = items.map(item => item.pickingOrderId);

      // ===== BAIXA DE ESTOQUE =====
      // Para cada pedido do romaneio, executar baixa de estoque
      for (const orderItem of items) {
        const orderId = orderItem.pickingOrderId;

        // Buscar pedido para obter tenantId
        const [pickingOrder] = await db
          .select()
          .from(pickingOrders)
          .where(eq(pickingOrders.id, orderId))
          .limit(1);

        if (!pickingOrder) continue;

        // Buscar endereço de expedição do cliente
        const [tenant] = await db
          .select({ shippingAddress: tenants.shippingAddress })
          .from(tenants)
          .where(eq(tenants.id, pickingOrder.tenantId))
          .limit(1);

        let shippingLocation;

        // Se cliente não tem shippingAddress configurado, buscar automaticamente endereço EXP disponível
        if (!tenant || !tenant.shippingAddress) {
          const [autoShippingLocation] = await db
            .select()
            .from(warehouseLocations)
            .where(
              and(
                sql`${warehouseLocations.code} LIKE 'EXP%'`,
                eq(warehouseLocations.tenantId, pickingOrder.tenantId),
                or(
                  eq(warehouseLocations.status, 'available'),
                  eq(warehouseLocations.status, 'available')
                )
              )
            )
            .limit(1);

          if (!autoShippingLocation) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Nenhum endereço de expedição disponível encontrado para o pedido ${pickingOrder.customerOrderNumber}`,
            });
          }

          shippingLocation = autoShippingLocation;
        } else {
          // Buscar endereço de expedição configurado no sistema
          const [configuredLocation] = await db
            .select()
            .from(warehouseLocations)
            .where(
              and(
                eq(warehouseLocations.code, tenant.shippingAddress),
                eq(warehouseLocations.tenantId, pickingOrder.tenantId)
              )
            )
            .limit(1);

          if (!configuredLocation) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Endereço de expedição ${tenant.shippingAddress} não encontrado no sistema`,
            });
          }

          shippingLocation = configuredLocation;
        }

        // Buscar itens conferidos no Stage para este pedido
        const [stageCheck] = await db
          .select()
          .from(stageChecks)
          .where(
            and(
              eq(stageChecks.pickingOrderId, orderId),
              eq(stageChecks.status, 'completed')
            )
          )
          .orderBy(desc(stageChecks.completedAt))
          .limit(1);

        if (!stageCheck) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Pedido ${pickingOrder.customerOrderNumber} não possui conferência Stage concluída`,
          });
        }

        // Buscar itens conferidos
        const checkedItems = await db
          .select()
          .from(stageCheckItems)
          .where(eq(stageCheckItems.stageCheckId, stageCheck.id));

        // Para cada item conferido, executar baixa de estoque do endereço EXP
        for (const item of checkedItems) {
          // Buscar estoque no endereço de expedição para este produto
          const expInventory = await db
            .select()
            .from(inventory)
            .where(
              and(
                eq(inventory.locationId, shippingLocation.id),
                eq(inventory.productId, item.productId),
                eq(inventory.tenantId, pickingOrder.tenantId)
              )
            );

          let remainingToShip = item.checkedQuantity;

          for (const inv of expInventory) {
            if (remainingToShip <= 0) break;

            const quantityToShip = Math.min(remainingToShip, inv.quantity);

            // Subtrair do estoque de expedição (baixa)
            const newQuantity = inv.quantity - quantityToShip;
            const newReservedQuantity = Math.max(0, inv.reservedQuantity - quantityToShip);
            
            if (newQuantity > 0) {
              // Atualizar quantidade E reservedQuantity (modelo bancário: saque do cofre)
              await db
                .update(inventory)
                .set({ 
                  quantity: newQuantity,
                  reservedQuantity: newReservedQuantity 
                })
                .where(eq(inventory.id, inv.id));
            } else {
              // Remover registro se quantidade zerou
              await db
                .delete(inventory)
                .where(eq(inventory.id, inv.id));
            }

            // Registrar movimentação de baixa (saída)
            await db.insert(inventoryMovements).values({
              productId: inv.productId,
              batch: inv.batch,
              fromLocationId: shippingLocation.id,
              toLocationId: null, // Baixa de estoque (saída)
              quantity: quantityToShip,
              movementType: "picking",
              referenceType: "shipment_manifest",
              referenceId: input.manifestId,
              performedBy: ctx.user.id,
              notes: `Baixa de estoque ao finalizar romaneio ${manifest.manifestNumber} - Pedido ${pickingOrder.customerOrderNumber}`,
              tenantId: pickingOrder.tenantId,
            });

            remainingToShip -= quantityToShip;
          }

          // Verificar se conseguiu baixar toda a quantidade
          if (remainingToShip > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente no endereço de expedição para o produto ${item.productSku}. Faltam ${remainingToShip} unidades.`,
            });
          }
        }
      }
      // ===== FIM DA BAIXA DE ESTOQUE =====

      // ===== LIBERAÇÃO DE RESERVAS NA ZONA EXP =====
      // Após expedir, liberar reservas dos pedidos na zona EXP
      console.log(`[EXPEDIÇÃO] Liberando reservas de ${orderIds.length} pedido(s)...`);
      
      for (const orderId of orderIds) {
        // Buscar itens do pedido
        const orderItems = await db
          .select({
            productId: pickingOrderItems.productId,
            quantity: pickingOrderItems.requestedQuantity,
            unit: pickingOrderItems.unit,
          })
          .from(pickingOrderItems)
          .where(eq(pickingOrderItems.pickingOrderId, orderId));

        // Para cada item, liberar reserva na zona EXP
        for (const item of orderItems) {
          // Buscar produto para obter unitsPerBox
          const [product] = await db
            .select({ unitsPerBox: products.unitsPerBox })
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);

          // Calcular quantidade em unidades
          const quantityInUnits = item.unit === 'box' 
            ? item.quantity * (product?.unitsPerBox || 1)
            : item.quantity;

          // Buscar estoque reservado na zona EXP para este produto
          const expStock = await db
            .select({
              inventoryId: inventory.id,
              reservedQuantity: inventory.reservedQuantity,
            })
            .from(inventory)
            .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
            .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
            .where(
              and(
                eq(inventory.productId, item.productId),
                eq(warehouseZones.code, "EXP"),
                sql`${inventory.reservedQuantity} > 0` // Tem reserva
              )
            )
            .limit(1);

          if (expStock.length > 0) {
            const stock = expStock[0];
            const quantityToRelease = Math.min(quantityInUnits, stock.reservedQuantity);
            
            // VALIDAÇÃO PREVENTIVA: Garantir que liberação não resulte em reserva negativa
            if (quantityToRelease <= 0) {
              console.warn(`[EXPEDIÇÃO] Nenhuma reserva para liberar. Produto ${item.productId}, Reservado: ${stock.reservedQuantity}`);
              continue; // Pular este item
            }
            
            const newReservedQuantity = stock.reservedQuantity - quantityToRelease;
            if (newReservedQuantity < 0) {
              console.error(`[EXPEDIÇÃO] ERRO CRÍTICO: Tentativa de liberar mais do que está reservado!`);
              console.error(`  Produto: ${item.productId}, Estoque ID: ${stock.inventoryId}`);
              console.error(`  Reservado atualmente: ${stock.reservedQuantity}, Tentando liberar: ${quantityToRelease}`);
              console.error(`  Nova reserva seria: ${newReservedQuantity} (NEGATIVO!)`);
              throw new Error(`Erro de integridade: liberação resultaria em reserva negativa. Produto ${item.productId}`);
            }
            
            // Decrementar reservedQuantity
            await db
              .update(inventory)
              .set({ 
                reservedQuantity: sql`${inventory.reservedQuantity} - ${quantityToRelease}` 
              })
              .where(eq(inventory.id, stock.inventoryId));
            
            console.log(`[EXPEDIÇÃO] Liberado ${quantityToRelease} unidades do produto ${item.productId} no estoque ${stock.inventoryId}`);
          }
        }
      }
      console.log(`[EXPEDIÇÃO] Reservas liberadas com sucesso!`);
      // ===== FIM DA LIBERAÇÃO DE RESERVAS =====

      // Atualizar status do romaneio
      await db
        .update(shipmentManifests)
        .set({
          status: "shipped",
          shippedAt: new Date(),
        })
        .where(eq(shipmentManifests.id, input.manifestId));

      // Atualizar status dos pedidos
      await db
        .update(pickingOrders)
        .set({
          status: "shipped",
          shippingStatus: "shipped",
          shippedAt: new Date(),
        })
        .where(
          sql`${pickingOrders.id} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      // Atualizar status das NFs
      await db
        .update(invoices)
        .set({ status: "shipped" })
        .where(
          sql`${invoices.pickingOrderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`
        );

      return { 
        success: true, 
        message: `Romaneio ${manifest.manifestNumber} expedido com sucesso` 
      };
    }),

  // Gerar PDF do romaneio
  generateManifestPDF: tenantProcedure
    .input(z.object({ manifestId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar romaneio
      const [manifest] = await db
        .select()
        .from(shipmentManifests)
        .where(eq(shipmentManifests.id, input.manifestId))
        .limit(1);

      if (!manifest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Romaneio não encontrado",
        });
      }

      // Buscar tenant (remetente)
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, manifest.tenantId))
        .limit(1);

      // Buscar itens do romaneio com pedidos e NFs
      const items = await db
        .select({
          orderId: shipmentManifestItems.pickingOrderId,
          orderNumber: pickingOrders.customerOrderNumber,
          invoiceId: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          customerName: invoices.customerName,
          customerCity: invoices.customerCity,
          customerState: invoices.customerState,
          volumes: invoices.volumes,
          pesoB: invoices.pesoB,
          totalValue: invoices.totalValue,
        })
        .from(shipmentManifestItems)
        .innerJoin(pickingOrders, eq(shipmentManifestItems.pickingOrderId, pickingOrders.id))
        .leftJoin(invoices, eq(invoices.pickingOrderId, pickingOrders.id))
        .where(eq(shipmentManifestItems.manifestId, input.manifestId));

      // Retornar dados para geração de PDF
      return {
        manifest: {
          number: manifest.manifestNumber,
          createdAt: manifest.createdAt,
          carrierName: manifest.carrierName,
          totalOrders: manifest.totalOrders,
          totalInvoices: manifest.totalInvoices,
          totalVolumes: manifest.totalVolumes,
        },
        tenant: {
          name: tenant?.name || "N/A",
          cnpj: tenant?.cnpj || "N/A",
        },
        items: items.map(item => ({
          orderNumber: item.orderNumber,
          invoiceNumber: item.invoiceNumber || "N/A",
          customerName: item.customerName || "N/A",
          customerCity: item.customerCity || "",
          customerState: item.customerState || "",
          volumes: item.volumes || 0,
          weight: parseFloat(item.pesoB || "0")
        })),
      };
    }),

  /**
   * Excluir múltiplos romaneios
   */
  deleteMany: tenantProcedure
    .input(
      z.object({
        ids: z.array(z.number()).min(1, "Selecione pelo menos um romaneio"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se algum romaneio está finalizado
      const manifests = await db
        .select({ id: shipmentManifests.id, status: shipmentManifests.status })
        .from(shipmentManifests)
        .where(inArray(shipmentManifests.id, input.ids));

      const shippedManifests = manifests.filter(m => m.status === "shipped");
      if (shippedManifests.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Não é possível excluir romaneios já expedidos. ${shippedManifests.length} romaneio(s) já foram expedidos.`,
        });
      }

      // Buscar itens dos romaneios para liberar pedidos
      const manifestItems = await db
        .select({ pickingOrderId: shipmentManifestItems.pickingOrderId })
        .from(shipmentManifestItems)
        .where(inArray(shipmentManifestItems.manifestId, input.ids));

      const orderIds = Array.from(new Set(manifestItems.map(item => item.pickingOrderId)));

      // Excluir itens dos romaneios
      await db
        .delete(shipmentManifestItems)
        .where(inArray(shipmentManifestItems.manifestId, input.ids));

      // Excluir romaneios
      await db
        .delete(shipmentManifests)
        .where(inArray(shipmentManifests.id, input.ids));

      // Atualizar status dos pedidos: status='invoiced' + shippingStatus='invoice_linked'
      // (NF vinculada, fora de romaneio — volta para fila de expedição)
      if (orderIds.length > 0) {
        await db
          .update(pickingOrders)
          .set({ status: "invoiced", shippingStatus: "invoice_linked" })
          .where(inArray(pickingOrders.id, orderIds));
      }

      // ========================================================================
      // CORREÇÃO: RESTAURAR STATUS DAS NFs E LIBERAR RESERVAS
      // ========================================================================

      // 1. Restaurar status das NFs vinculadas aos pedidos
      // 'linked' = NF vinculada ao pedido, mas fora de romaneio (comportamento correto após exclusão do romaneio)
      if (orderIds.length > 0) {
        await db
          .update(invoices)
          .set({ status: "linked" })
          .where(inArray(invoices.pickingOrderId, orderIds));
      }

      // 2. Reverter ondas (pickingWaves) vinculadas aos pedidos para 'staged'
      if (orderIds.length > 0) {
        // Buscar waveIds dos pedidos afetados
        const waveLinks = await db
          .select({ waveId: pickingOrders.waveId })
          .from(pickingOrders)
          .where(inArray(pickingOrders.id, orderIds));

        const waveIds = Array.from(new Set(
          waveLinks.map(w => w.waveId).filter((id): id is number => id !== null && id !== undefined)
        ));

        if (waveIds.length > 0) {
          await db
            .update(pickingWaves)
            .set({ status: "staged" })
            .where(inArray(pickingWaves.id, waveIds));
        }
      }

      // 2. Liberar reservas de estoque em EXP
      // Buscar itens dos pedidos para liberar reservas
      if (orderIds.length > 0) {
        const orderItems = await db
          .select({
            productId: pickingOrderItems.productId,
            quantity: pickingOrderItems.requestedQuantity,
          })
          .from(pickingOrderItems)
          .where(inArray(pickingOrderItems.pickingOrderId, orderIds));

        // Para cada item, liberar reserva na zona EXP
        for (const item of orderItems) {
          // Buscar estoque reservado na zona EXP para este produto
          const expStock = await db
            .select({
              inventoryId: inventory.id,
              reservedQuantity: inventory.reservedQuantity,
            })
            .from(inventory)
            .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
            .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
            .where(
              and(
                eq(inventory.productId, item.productId),
                eq(warehouseZones.code, "EXP"),
                sql`${inventory.reservedQuantity} > 0` // Tem reserva
              )
            )
            .limit(1);

          if (expStock.length > 0) {
            const stock = expStock[0];
            const quantityToRelease = Math.min(item.quantity, stock.reservedQuantity);
            
            // VALIDAÇÃO PREVENTIVA: Garantir que liberação não resulte em reserva negativa
            if (quantityToRelease <= 0) {
              console.warn(`[LIBERAÇÃO] Nenhuma reserva para liberar. Produto ${item.productId}, Reservado: ${stock.reservedQuantity}`);
              continue; // Pular este item
            }
            
            const newReservedQuantity = stock.reservedQuantity - quantityToRelease;
            if (newReservedQuantity < 0) {
              console.error(`[LIBERAÇÃO] ERRO CRÍTICO: Tentativa de liberar mais do que está reservado!`);
              console.error(`  Produto: ${item.productId}, Estoque ID: ${stock.inventoryId}`);
              console.error(`  Reservado atualmente: ${stock.reservedQuantity}, Tentando liberar: ${quantityToRelease}`);
              console.error(`  Nova reserva seria: ${newReservedQuantity} (NEGATIVO!)`);
              throw new Error(`Erro de integridade: liberação resultaria em reserva negativa. Produto ${item.productId}`);
            }
            
            // Decrementar reservedQuantity
            await db
              .update(inventory)
              .set({ 
                reservedQuantity: sql`${inventory.reservedQuantity} - ${quantityToRelease}` 
              })
              .where(eq(inventory.id, stock.inventoryId));
            
            console.log(`[LIBERAÇÃO] Liberado ${quantityToRelease} unidades do produto ${item.productId} no estoque ${stock.inventoryId}`);
          }
        }
      }

      return {
        success: true,
        deletedCount: input.ids.length,
        releasedOrders: orderIds.length,
        message: `${input.ids.length} romaneio(s) cancelado(s). ${orderIds.length} pedido(s) liberado(s). NFs e reservas restauradas.`,
      };
    }),

  /**
   * Cancelar expedição de pedido
   * Retorna pedido para status "picked" para nova conferência no Stage
   */
  cancelShipping: tenantProcedure
    .input(
      z.object({
        orderId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar pedido
      const [order] = await db
        .select()
        .from(pickingOrders)
        .where(eq(pickingOrders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pedido não encontrado",
        });
      }

      // Validar tenant
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? null : effectiveTenantId;
      if (tenantId !== null && order.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Pedido não pertence ao tenant atual",
        });
      }

      // Validar status (só pode cancelar se estiver em "staged")
      if (order.status !== "staged") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pedido deve estar com status "staged" para ser cancelado. Status atual: ${order.status}`,
        });
      }

      // Verificar se pedido está em romaneio
      const manifestItems = await db
        .select()
        .from(shipmentManifestItems)
        .where(eq(shipmentManifestItems.pickingOrderId, input.orderId))
        .limit(1);

      if (manifestItems.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pedido está em romaneio. Cancele o romaneio primeiro.",
        });
      }

      // Desvincular NF (se houver)
      const linkedInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.pickingOrderId, input.orderId));

      if (linkedInvoices.length > 0) {
        await db
          .update(invoices)
          .set({
            pickingOrderId: null,
            status: "imported",
            linkedAt: null,
          })
          .where(eq(invoices.pickingOrderId, input.orderId));

        console.log(`[CancelShipping] Desvinculado ${linkedInvoices.length} NF(s) do pedido ${order.orderNumber}`);
      }

      // ========== ESTORNO DE ESTOQUE ==========
      // Buscar movimentações do pedido (EXP → Armazenagem)
      const movements = await db
        .select({
          id: inventoryMovements.id,
          productId: inventoryMovements.productId,
          batch: inventoryMovements.batch,
          fromLocationId: inventoryMovements.fromLocationId,
          toLocationId: inventoryMovements.toLocationId,
          quantity: inventoryMovements.quantity,
        })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.referenceType, "picking_order"),
            eq(inventoryMovements.referenceId, input.orderId),
            eq(inventoryMovements.movementType, "picking")
          )
        );

      console.log(`[CancelShipping] Encontradas ${movements.length} movimentação(ões) para estornar do pedido ${order.orderNumber}`);

      // Reverter cada movimentação: EXP → Endereço de armazenagem
      for (const movement of movements) {
        // Validar IDs de localização
        if (!movement.fromLocationId || !movement.toLocationId) {
          console.warn(`[CancelShipping] Movimentação ${movement.id} sem localizações válidas, pulando...`);
          continue;
        }

        // 1. Subtrair do endereço EXP (destino original)
        const expConditions = [
          eq(inventory.locationId, movement.toLocationId as number),
          eq(inventory.productId, movement.productId),
          eq(inventory.tenantId, order.tenantId),
        ];
        
        if (movement.batch) {
          expConditions.push(eq(inventory.batch, movement.batch));
        } else {
          expConditions.push(isNull(inventory.batch));
        }

        const [expInventory] = await db
          .select()
          .from(inventory)
          .where(and(...expConditions))
          .limit(1);

        if (!expInventory) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Estoque não encontrado no endereço de expedição para produto ${movement.productId}`,
          });
        }

        if (expInventory.quantity < movement.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Estoque insuficiente no endereço de expedição. Disponível: ${expInventory.quantity}, Necessário: ${movement.quantity}`,
          });
        }

        const newExpQuantity = expInventory.quantity - movement.quantity;
        if (newExpQuantity <= 0) {
          // Remover registro se quantidade zerou (inventory deve conter apenas registros com saldo)
          await db.delete(inventory).where(eq(inventory.id, expInventory.id));
        } else {
          await db
            .update(inventory)
            .set({ quantity: newExpQuantity })
            .where(eq(inventory.id, expInventory.id));
        }

        // 2. Devolver para endereço de armazenagem (origem original)
        const storageConditions = [
          eq(inventory.locationId, movement.fromLocationId as number),
          eq(inventory.productId, movement.productId),
          eq(inventory.tenantId, order.tenantId),
        ];
        
        if (movement.batch) {
          storageConditions.push(eq(inventory.batch, movement.batch));
        } else {
          storageConditions.push(isNull(inventory.batch));
        }

        const [storageInventory] = await db
          .select()
          .from(inventory)
          .where(and(...storageConditions))
          .limit(1);

        if (storageInventory) {
          // Adicionar ao estoque existente
          await db
            .update(inventory)
            .set({
              quantity: storageInventory.quantity + movement.quantity,
            })
            .where(eq(inventory.id, storageInventory.id));
        } else {
          // Buscar SKU do produto para gerar uniqueCode
          const product = await db.select({ sku: products.sku })
            .from(products)
            .where(eq(products.id, movement.productId))
            .limit(1);

          // Buscar zona do endereço de armazenagem (origem da movimentação)
          const storageLocation = await db.select({ zoneCode: warehouseZones.code })
            .from(warehouseLocations)
            .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
            .where(eq(warehouseLocations.id, movement.fromLocationId))
            .limit(1);

          const { getUniqueCode } = await import("./utils/uniqueCode");

          // Recriar registro de estoque no endereço de armazenagem
          await db.insert(inventory).values({
            locationId: movement.fromLocationId,
            productId: movement.productId,
            batch: movement.batch || null,
            expiryDate: expInventory.expiryDate || null,
            quantity: movement.quantity,
            tenantId: order.tenantId,
            status: "available",
            uniqueCode: getUniqueCode(product[0]?.sku || "", movement.batch || null), // ✅ Adicionar uniqueCode
            locationZone: storageLocation[0]?.zoneCode || null, // ✅ Adicionar locationZone
          });
        }

        // 3. Recriar reserva
        // Buscar ID do inventário após inserção/atualização
        let inventoryIdForReservation = storageInventory?.id;
        
        if (!inventoryIdForReservation) {
          const newInventoryConditions = [
            eq(inventory.locationId, movement.fromLocationId as number),
            eq(inventory.productId, movement.productId),
            eq(inventory.tenantId, order.tenantId),
          ];
          
          if (movement.batch) {
            newInventoryConditions.push(eq(inventory.batch, movement.batch));
          } else {
            newInventoryConditions.push(isNull(inventory.batch));
          }

          const [newInventory] = await db
            .select({ id: inventory.id })
            .from(inventory)
            .where(and(...newInventoryConditions))
            .limit(1);
          
          inventoryIdForReservation = newInventory?.id;
        }
        
        if (!inventoryIdForReservation) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Não foi possível encontrar inventário para recriar reserva do produto ${movement.productId}`,
          });
        }
        
        // NOTA: pickingAllocations serão recriadas automaticamente ao gerar nova onda

        // 4. Registrar movimentação reversa no histórico
        await db.insert(inventoryMovements).values({
          productId: movement.productId,
          batch: movement.batch,
          fromLocationId: movement.toLocationId, // EXP
          toLocationId: movement.fromLocationId, // Armazenagem
          quantity: movement.quantity,
          movementType: "adjustment",
          referenceType: "picking_order",
          referenceId: input.orderId,
          performedBy: ctx.user.id,
          notes: `Estorno automático - Expedição cancelada do pedido ${order.customerOrderNumber || order.orderNumber}`,
          tenantId: order.tenantId,
        });
      }

      console.log(`[CancelShipping] Estorno de estoque concluído: ${movements.length} movimentação(ões) revertidas`);

      // Cancelar conferência de stage
      const stageCheckList = await db
        .select()
        .from(stageChecks)
        .where(
          and(
            eq(stageChecks.pickingOrderId, input.orderId),
            eq(stageChecks.status, "completed")
          )
        );

      if (stageCheckList.length > 0) {
        // Marcar conferência como divergente (não há status "cancelled" no schema)
        await db
          .update(stageChecks)
          .set({ 
            status: "divergent",
            notes: sql`CONCAT(COALESCE(${stageChecks.notes}, ''), '\n[CANCELADO] Expedição cancelada. Pedido retornado para nova conferência.')`
          })
          .where(
            and(
              eq(stageChecks.pickingOrderId, input.orderId),
              eq(stageChecks.status, "completed")
            )
          );

        console.log(`[CancelShipping] Marcado ${stageCheckList.length} conferência(s) de stage como divergente do pedido ${order.orderNumber}`);
      }

      // Alterar status do pedido para "picked"
      await db
        .update(pickingOrders)
        .set({
          status: "picked",
          shippingStatus: null,
        })
        .where(eq(pickingOrders.id, input.orderId));

      return {
        success: true,
        message: `Pedido ${order.customerOrderNumber || order.orderNumber} retornado para nova conferência no Stage`,
      };
    }),
});
