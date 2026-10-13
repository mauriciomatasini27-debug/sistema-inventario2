import { beforeEach, describe, expect, it } from "vitest";
import { crearTablasVacias, resetDb } from "../src/offline/db.js";
import { encolar } from "../src/offline/outbox-store.js";
import { encolarFoto, pendientesFotos, resetFotos } from "../src/offline/fotos.js";
import {
  esCompartido,
  hidratarDispositivo,
  marcarCompartido,
  necesitaCifrado,
  pedirPersistencia,
  resetFlagCompartido,
  revocarDispositivo,
} from "../src/offline/dispositivo.js";
import { resetMappings } from "../src/offline/id-mappings.js";
import { resetOutbox } from "../src/offline/outbox-store.js";

beforeEach(async () => {
  await resetDb();
  await resetOutbox();
  await resetMappings();
  await resetFotos();
  resetFlagCompartido();
});

describe("PWA-S5 compartidos: cuota + borrado remoto + sin base legible", () => {
  it("cuota degradada sin plataforma, y real con port inyectado", async () => {
    const d = await pedirPersistencia({});
    expect(d.degradado).toBe(true);
    expect(d.persistido).toBe(false);
    const real = await pedirPersistencia({
      persist: async () => true,
      estimate: async () => ({ usage: 123, quota: 456 }),
    });
    expect(real).toEqual({ persistido: true, usoBytes: 123, cupoBytes: 456, degradado: false });
  });

  it("compartido exige cifrado (flag puro)", () => {
    expect(esCompartido()).toBe(false);
    expect(necesitaCifrado()).toBe(false);
    marcarCompartido(true);
    expect(esCompartido()).toBe(true);
    expect(necesitaCifrado()).toBe(true);
  });

  it("revocar borra outbox+fotos y deja la base ilegible", async () => {
    await crearTablasVacias();
    await encolar({ kind: "venta", resumen: "v1" });
    const f = await encolarFoto({ sku: "yerba-1", bytes: 5000, ancho: 800, alto: 600 });
    expect(f.ok).toBe(true);
    marcarCompartido(true);
    const r = await revocarDispositivo("dueño revoca mostrador");
    expect(r.borrado).toBe(true);
    expect(r.legible).toBe(false);
    expect(r.motivo).toBe("dueño revoca mostrador");
    expect(esCompartido()).toBe(false);
    // Memoria vacía y diario borrado: hidratar no recupera nada.
    await hidratarDispositivo();
    expect(await pendientesFotos()).toHaveLength(0);
  });

  it("revocar es idempotente y nunca lanza sin abrir", async () => {
    const r1 = await revocarDispositivo();
    const r2 = await revocarDispositivo("otra vez");
    expect(r1.borrado).toBe(true);
    expect(r2.legible).toBe(false);
  });
});
