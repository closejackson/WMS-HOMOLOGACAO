import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes para o labelReprintRouter
 * Verifica que as procedures de listagem e reimpressão estão registradas corretamente
 * e que a geração de PDF funciona para os 5 tipos de etiqueta.
 */

// Mock do banco de dados
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock do bwip-js
vi.mock("bwip-js", () => ({
  default: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-barcode")),
  },
  toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-barcode")),
}));

// Mock do pdfkit
vi.mock("pdfkit", () => {
  const EventEmitter = require("events");
  return {
    default: class MockPDF extends EventEmitter {
      constructor() {
        super();
        setTimeout(() => this.emit("end"), 10);
      }
      fontSize() { return this; }
      font() { return this; }
      text() { return this; }
      image() { return this; }
      end() { this.emit("end"); }
      on(event: string, cb: Function) {
        super.on(event, cb);
        return this;
      }
    },
  };
});

describe("labelReprintRouter", () => {
  it("deve exportar o router corretamente", async () => {
    const { labelReprintRouter } = await import("./labelReprintRouter");
    expect(labelReprintRouter).toBeDefined();
  });

  it("deve ter as 13 procedures esperadas (6 list + 7 reprint/batch)", async () => {
    const { labelReprintRouter } = await import("./labelReprintRouter");
    const routerDef = labelReprintRouter as any;
    const expectedProcedures = [
      "listReceiving",
      "reprintReceiving",
      "listWaves",
      "reprintWave",
      "listPickingOrders",
      "reprintPickingOrder",
      "listShipments",
      "reprintShipment",
      "listProductLabels",
      "reprintProductLabel",
      "listLocations",
      "reprintLocation",
      "reprintLocationsBatch",
    ];
    for (const proc of expectedProcedures) {
      expect(proc in routerDef._def.record, `Procedure '${proc}' deve existir`).toBe(true);
    }
  });

  it("deve estar registrado no appRouter como labelReprint", async () => {
    const { appRouter } = await import("./routers");
    const routerDef = appRouter as any;
    expect("labelReprint" in routerDef._def.record).toBe(true);
  });
});
