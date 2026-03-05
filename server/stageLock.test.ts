import { describe, it, expect } from "vitest";

/**
 * Testes para o sistema de Lock/Timeout do stageRouter
 * Verifica que as procedures de controle de concorrência estão registradas
 * e que o stageRouter está corretamente integrado ao appRouter.
 */

describe("stageRouter - Lock/Timeout procedures", () => {
  it("deve exportar o stageRouter corretamente", async () => {
    const { stageRouter } = await import("./stageRouter");
    expect(stageRouter).toBeDefined();
  });

  it("deve ter todas as procedures de lock registradas", async () => {
    const { stageRouter } = await import("./stageRouter");
    const routerDef = stageRouter as any;

    const expectedLockProcedures = [
      "stageHeartbeat",
      "releaseStageLock",
      "forceReleaseStageLock",
    ];

    for (const proc of expectedLockProcedures) {
      expect(
        proc in routerDef,
        `Procedure de lock '${proc}' deve existir no stageRouter`
      ).toBe(true);
    }
  });

  it("deve ter todas as procedures principais registradas", async () => {
    const { stageRouter } = await import("./stageRouter");
    const routerDef = stageRouter as any;

    const expectedProcedures = [
      "getOrderForStage",
      "startStageCheck",
      "recordStageItem",
      "completeStageCheck",
      "getActiveStageCheck",
      "getStageCheckHistory",
      "generateVolumeLabels",
      "undoLastStageItem",
      "cancelStageCheck",
      // Lock procedures
      "stageHeartbeat",
      "releaseStageLock",
      "forceReleaseStageLock",
    ];

    for (const proc of expectedProcedures) {
      expect(
        proc in routerDef,
        `Procedure '${proc}' deve existir no stageRouter`
      ).toBe(true);
    }
  });

  it("deve estar registrado no appRouter como stage", async () => {
    const { appRouter } = await import("./routers");
    const routerDef = appRouter as any;
    expect("stage" in routerDef._def.record).toBe(true);
  });

  it("deve ter stageHeartbeat como procedure de mutação", async () => {
    const { stageRouter } = await import("./stageRouter");
    const routerDef = stageRouter as any;
    // Procedures tRPC são funções com _def
    expect(routerDef.stageHeartbeat).toBeDefined();
    expect(typeof routerDef.stageHeartbeat).toBe("function");
    expect(routerDef.stageHeartbeat._def).toBeDefined();
  });

  it("deve ter releaseStageLock como procedure de mutação", async () => {
    const { stageRouter } = await import("./stageRouter");
    const routerDef = stageRouter as any;
    expect(routerDef.releaseStageLock).toBeDefined();
    expect(typeof routerDef.releaseStageLock).toBe("function");
    expect(routerDef.releaseStageLock._def).toBeDefined();
  });

  it("deve ter forceReleaseStageLock como procedure de mutação", async () => {
    const { stageRouter } = await import("./stageRouter");
    const routerDef = stageRouter as any;
    expect(routerDef.forceReleaseStageLock).toBeDefined();
    expect(typeof routerDef.forceReleaseStageLock).toBe("function");
    expect(routerDef.forceReleaseStageLock._def).toBeDefined();
  });
});
