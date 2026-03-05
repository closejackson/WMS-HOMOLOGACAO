# WMS Med@x - Todo de Migração

## Migração do Repositório wms-homologacao → wms-medax

- [x] Migrar package.json com dependências extras (bwip-js, exceljs, xlsx, pdfkit, multer, @zxing, html5-qrcode, idb, jsbarcode, qrcode, xml2js, etc.)
- [x] Migrar shared/ (const.ts, types.ts, utils.ts, _core/errors.ts)
- [x] Migrar drizzle/schema.ts com todas as 56 tabelas do WMS
- [x] Migrar drizzle.config.ts
- [x] Migrar server/_core/ (env.ts, context.ts, sdk.ts, oauth.ts, trpc.ts, cookies.ts, etc.)
- [x] Migrar server/db.ts com todos os helpers de banco
- [x] Migrar server/routers.ts e todos os routers tRPC
- [x] Migrar server/modules/ (addressing, conference, inventory, picking, receiving, etc.)
- [x] Migrar server/movements.ts, stage.ts, preallocation.ts, etc.
- [x] Migrar server/storage.ts
- [x] Migrar server/nfeParser.ts, locationCodeValidator.ts, locationValidation.ts
- [x] Migrar server/waveLogic.ts, waveDocument.ts, pickingLogic.ts, pickingAllocation.ts
- [x] Migrar server/syncReservations.ts, stockAlerts.ts, occupancy.ts, inventory.ts
- [x] Migrar todos os routers: blindConferenceRouter, clientPortalRouter, collectorPickingRouter, labelRouter, maintenanceRouter, pickingRouter, preallocationRouter, reportsRouter, roleRouter, shippingRouter, stageRouter, stockRouter, uploadRouter, userRouter, waveRouter
- [x] Migrar client/src/index.css (estilos globais)
- [x] Migrar client/src/App.tsx com todas as rotas
- [x] Migrar client/src/const.ts
- [x] Migrar client/src/main.tsx
- [x] Migrar client/src/lib/ (trpc.ts, utils.ts, dateUtils.ts, reportExport.ts, mobile-utils.ts, offlineQueue.ts)
- [x] Migrar client/src/hooks/ (useBackground, useBusinessError, useClientPortalAuth, useComposition, useMobile, useOfflineSync, usePersistFn)
- [x] Migrar client/src/contexts/ThemeContext.tsx
- [x] Migrar client/src/components/ (todos os componentes WMS)
- [x] Migrar client/src/pages/ (todas as páginas WMS)
- [x] Migrar vite.config.ts com aliases corretos
- [x] Migrar tsconfig.json
- [x] Instalar dependências extras com pnpm add
- [x] Aplicar migrations no TiDB Cloud (56 tabelas criadas)
- [x] Configurar variáveis de ambiente (injetadas automaticamente pelo Manus)
- [x] Corrigir erros de TypeScript (0 erros)
- [x] Validar build de produção (vite build + esbuild OK)
- [x] Testes vitest passando (1/1)
- [x] Criar checkpoint e publicar

## Bugs

- [x] CORRIGIDO: novo build com oauth.ts atualizado (campo detail no erro), env.ts simplificado sem Zod. Novo checkpoint criado para Publish.

- [x] Verificado: erro "OAuth callback failed" era esperado (código OAuth inválido no teste). Fluxo OAuth real funciona corretamente — página de login Manus exibida com sucesso
- [x] CORRIGIDO: env.ts com Zod estava no bundle de produção antigo (build de 07:10). Novo build gerado com env.ts simplificado (sem Zod). Checkpoint atualizado. (código OAuth inválido no teste). Fluxo OAuth real funciona corretamente — página de login Manus exibida com sucesso
- [x] CORRIGIDO: coluna tenantId ausente na tabela users do TiDB Cloud — adicionada via ALTER TABLE. Schema Drizzle e banco agora sincronizados. OAuth login deve funcionar.
- [x] Comparar schema Drizzle com todas as tabelas do TiDB Cloud e identificar colunas faltantes
- [x] Adicionada coluna status ao schema Drizzle de labelAssociations (estava no banco mas faltava no schema TypeScript)
- [x] CORRIGIDO: normalizar expiryDate para YYYY-MM-DD em todos os inserts de labelAssociations, productLabels, receivingOrderItems e blindConferenceItems (blindConferenceRouter, collectorPickingRouter, labelRouter, waveRouter, routers.ts)
- [x] CORRIGIDO: colunas associatedAt e status em labelAssociations agora passadas explicitamente (new Date() e 'RECEIVING'/'AVAILABLE') em todos os 5 inserts para evitar que Drizzle gere DEFAULT literal rejeitado pelo TiDB
- [x] CORRIGIDO: servidor reiniciado para carregar código novo com associatedAt/status explícitos. ENUM no banco aceita RECEIVING corretamente. Problema era cache do servidor de dev.
- [x] CORRIGIDO: status 'RECEIVING' trocado por 'AVAILABLE' em todos os inserts de labelAssociations (etiqueta não tem status de recebimento)
- [x] CORRIGIDO: dados de teste com tenantId=2 removidos da tabela labelAssociations (bloqueavam inserts por constraint UNIQUE global em labelCode)
- [x] CORRIGIDO: readLabel, associateLabel e registerNCG agora usam orderTenantId (tenant da ordem) em vez de activeTenantId (tenant do usuário) para buscar etiquetas em labelAssociations
- [x] CORRIGIDO: correção sistêmica — todas as procedures (undoLastReading, adjustQuantity, getSummary, prepareFinish, finish, closeReceivingOrder) agora usam orderTenantId (tenant da ordem) em vez de activeTenantId (tenant do usuário) para filtrar blindConferenceItems
- [x] BUG: finish falha com "Nenhum item encontrado para criar inventory" — receivingOrderItems filtrado por activeTenantId em vez de orderTenantId

## Manutenção

- [ ] Procedure tRPC cleanupOrphanInventory no backend com critérios de órfão
- [ ] UI de manutenção na tela de Inventário com botão de limpeza manual e relatório de resultado
- [x] Importação massiva de saldos via Excel (inventoryImportRouter): labelCode não-único, status por zona, uniqueCode=SKU-Lote, transação atômica, acesso restrito tenantId=1
- [x] CORRIGIDO: collectorPickingRouter.listOrders — Admin Global agora vê ondas de todos os tenants sem filtro de tenant; removido status inexistente 'in_progress' do filtro (apenas 'pending' e 'picking' são válidos)

## Reimpressão de Etiquetas

- [x] Backend: procedures tRPC para listar/reimprimir etiquetas de Recebimento
- [x] Backend: procedures tRPC para listar/reimprimir etiquetas de Pedidos de Separação
- [x] Backend: procedures tRPC para listar/reimprimir etiquetas de Volumes
- [x] Backend: procedures tRPC para listar/reimprimir etiquetas de Produtos
- [x] Backend: procedures tRPC para listar/reimprimir etiquetas de Endereços
- [x] Frontend: página /collector/label-reprint com menu de 5 tipos (design coletor)
- [x] Frontend: sub-páginas de cada tipo com busca e reimpressão
- [x] Frontend: card "Reimpressão de Etiquetas" na Home (/home)
- [x] Frontend: card "Reimpressão de Etiquetas" na tela /collector (coletor)
- [x] Registrar rotas no App.tsx

## Bugs

- [x] BUG CORRIGIDO: Global Admin não conseguia visualizar etiquetas — isGlobalAdmin no tenantGuard agora usa apenas role='admin' (sem restrição de tenantId)

## Reimpressão de Etiquetas de Endereços — Seleção em Lote

- [x] Backend: procedure reprintLocationsBatch (gera PDF com N etiquetas de uma vez)
- [x] Frontend: checkboxes individuais em cada linha de endereço
- [x] Frontend: botão "Selecionar Todas" (baseado no filtro atual)
- [x] Frontend: barra de ação flutuante com contador de selecionados e botão "Imprimir Selecionadas"
- [x] Frontend: preview modal antes da impressão em lote

## Etiquetas de Separação — Abas Pedidos e Ondas

- [x] Backend: procedure listPickingOrders para listar pedidos de picking com busca
- [x] Backend: procedure reprintPickingOrder para reimprimir etiqueta de pedido individual
- [x] Frontend: abas "Pedidos" e "Ondas" na WavesSubScreen
- [x] Frontend: aba Ondas lista pickingWaves (comportamento atual)
- [x] Frontend: aba Pedidos lista pickingOrders com busca por número/cliente

## Bugs

- [x] BUG CORRIGIDO: Cards de Pedidos de Separação agora exibem Nº do Pedido Cliente como título (cód. interno como subtexto)
- [x] BUG CORRIGIDO: Etiquetas de Separação (aba Pedidos) agora exibe Nº do Pedido Cliente como título

## Filtros em /products

- [x] Backend: atualizar procedure products.list para aceitar filtros tenantId, sku e category
- [x] Frontend: adicionar dropdowns/inputs de Cliente, SKU e Categoria na página Products
- [x] Frontend: aplicar filtros em tempo real (debounce) sem recarregar a página

## Importação de Produtos via Excel

- [x] Backend: instalar xlsx, criar procedure products.importFromExcel com validação e upsert
- [x] Backend: download de planilha modelo gerado no frontend (sem chamada ao servidor)
- [x] Frontend: componente ImportProductsDialog com upload drag-and-drop, preview de linhas e feedback de erros por linha
- [x] Frontend: botão "Importar Excel" na página /products
- [x] Frontend: exibir resumo pós-importação (X inseridos, Y atualizados, Z erros)
- [x] Adaptar template de importação de produtos para cabeçalhos em português

## Regras de Importação de Produtos

- [x] Backend: validar campos obrigatórios (SKU, Descrição, Unidades por Caixa, Controle Lote) e regra Controle Validade = Controle Lote
- [x] Backend: preencher automaticamente campos opcionais em branco com valores padrão
- [x] Frontend: preview destaca linhas com campos obrigatórios faltantes em vermelho
- [x] Frontend: template atualizado com cabeçalhos marcados com * para campos obrigatórios

## Design da Etiqueta de Pedido

- [x] Atualizar PDF da etiqueta de pedido: logo Med@x esquerda, Nº Pedido/Cliente/Destinatário direita, barcode Code-128 centralizado na parte inferior
- [x] Redesign etiqueta de pedido: fundo cinza claro, borda arredondada, marca d'água Med@x repetida, ícone caminhão/entrega antes do Destinatário, barcode grande centralizado

## Auditoria Global Admin - Filtros de Tenant

- [x] BUG CORRIGIDO: /collector/stage e /stage - stageRouter corrigido para passar null como tenantId para Global Admin
- [x] Auditoria completa: waveRouter, shippingRouter, reportsRouter, stockRouter, blindConferenceRouter, routers.ts (picking/waves) já tratavam Global Admin corretamente
- [x] stageRouter: getOrderForStage, startStageCheck, getActiveStageCheck, getStageCheckHistory, cancelStageCheck corrigidos

## Bugs

- [x] BUG CORRIGIDO: /collector/stage - erro "Já existe uma conferência em andamento para este pedido" — sistema de lock com timeout implementado

## Bugs

- [x] BUG CORRIGIDO: Stage — erro "Produto não pertence ao tenant atual" ao bipar etiqueta na conferência. recordStageItem agora usa o tenantId do stageCheck (pedido) em vez de ctx.effectiveTenantId (usuário logado)

## Bugs

- [x] BUG CORRIGIDO: /collector/label-reprint — Etiquetas de Volumes agora busca stageChecks por customerOrderNumber. Novas procedures: listStageVolumes e reprintStageVolume. Operador informa qtd de volumes ao reimprimir.

- [x] BUG CORRIGIDO: Importação de NF-e — xml2js retornava número 0 (int) para <serie>0</serie> e <nNF>66666</nNF>. Corrigido com String() no nfeParser.ts
- [x] BUG CORRIGIDO: Importação de NF-e — chave de acesso extraída com 45 chars em vez de 44 (varchar(44) no banco). Corrigido com replace(/^NFe/) + slice(-44) no nfeParser.ts

## Design Etiqueta de Volume (Stage)

- [x] Ajustar layout: linha divisória em y=70px, logo 2x maior, barcode 60% maior, tamanho 10x5cm

- [x] Redesenhar PDF de etiquetas de volume: logo Med@x esquerda, barcode direita, linha divisória, Destinatário/Pedido/Cliente/Volume bold (15cm x 7.5cm)

## Trava de Concorrência e Timeout — Stage

- [x] Schema: adicionados campos lockedByUserId, lockedByName, lastActivityAt em stageChecks
- [x] Backend: startStageCheck verifica lock ativo (< 10min) e bloqueia com nome do usuário
- [x] Backend: startStageCheck assume lock após timeout (>= 10min) para mesmo tenant
- [x] Backend: procedure stageHeartbeat atualiza lastActivityAt a cada 30s
- [x] Backend: procedure releaseStageLock libera o lock (saída voluntária)
- [x] Backend: procedure forceReleaseStageLock para Global Admin liberar qualquer lock
- [x] Frontend: alerta âmbar "Pedido sendo conferido por [Nome]" quando bloqueado
- [x] Frontend: modal de confirmação ao sair (botão Abandonar + beforeunload)
- [x] Frontend: heartbeat automático a cada 30s enquanto na tela de conferência
- [x] Frontend: botão "Abandonar" com modal de confirmação (libera lock voluntariamente)

## Bugs

- [x] BUG CORRIGIDO: Importação de saldos de estoque — múltiplas linhas com mesmo SKU+Lote+Endereço+Tenant no template faziam a segunda linha sobrescrever a quantidade da primeira (UPDATE quantity = row.quantity). Corrigido em inventoryImportRouter.ts: UPDATE agora acumula (existing.quantity + row.quantity). Afetava M03-03-09 (-24), M03-01-11 (-154), M03-02-37 (-250).

## Bugs

- [x] BUG CORRIGIDO: /products — INSERT/UPDATE de produto: booleanos requiresBatchControl/requiresExpiryControl agora convertidos para 0/1 explicitamente (MySQL/TiDB rejeita string "true"/"false" em tinyint(1))

## Importação de Saldos — Melhorias

- [x] Adicionar coluna "Descrição" ao template modelo de importação de saldos
- [x] Auto-cadastro de produto durante importação: se SKU não existir, criar produto com SKU + Descrição + tenantId automaticamente (retorna productsCreated no resultado)

## Bugs

- [x] BUG CORRIGIDO: Movimentação REC → STORAGE — Global Admin (effectiveTenantId=null) não resolvia tenantId do inventory corretamente. Corrigido em stockRouter.ts (usa input.tenantId como fallback) e movements.ts (não lança erro se tenantId ainda null após fallbacks)
- [x] BUG CORRIGIDO (definitivo): Movimentação de estoque — Global Admin (tenantId=1) filtrava inventory por tenantId=1, mas inventory pertencia a tenantId=30001. Corrigido em stockRouter.ts: Global Admin sem input.tenantId explícito passa null para registerMovement, que usa sql`1=1` no filtro de tenant (sem restrição de tenant)

## Bugs

- [x] BUG CORRIGIDO: /shipping — ao excluir romanéio, ondas (pickingWaves) agora revertem para 'staged' (em vez de permanecer 'picked'). NFs permanecem corretamente em 'linked' (vinculadas ao pedido, mas fora do romanéio). Adicionado import de pickingWaves no shippingRouter.ts

## Bugs

- [x] BUG CORRIGIDO: /shipping — ao excluir romanéio, pickingOrders agora ficam com status='invoiced' + shippingStatus='invoice_linked' (NF vinculada, fora do romanéio, pronto para re-expedição)

## Bugs

- [x] BUG CORRIGIDO: /shipping aba Pedidos — filtro agora inclui status 'staged' e 'invoiced' (inArray). Pedidos com NF vinculada fora de romanéio aparecem corretamente na listagem
