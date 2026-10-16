import { describe, expect, it, beforeEach } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { decidir_bienvenida, texto_bienvenida } from "../src/modules/onboarding/bienvenida.js";
import { ejecutarBienvenida } from "../src/jobs/bienvenida.js";

beforeEach(() => {
  resetStore();
});

describe("bienvenida ON5", () => {
  it("sale libre cuando el usuario escribió primero", () => {
    expect(
      decidir_bienvenida({ escribioPrimero: true, ventanaAbierta: false, optIn: false, yaEnviada: false }),
    ).toEqual({ canal: "libre" });
  });

  it("sale plantilla con opt-in cuando no escribió", () => {
    expect(
      decidir_bienvenida({ escribioPrimero: false, ventanaAbierta: false, optIn: true, yaEnviada: false }),
    ).toEqual({ canal: "plantilla" });
  });

  it("no sale nada sin opt-in ni ventana", () => {
    expect(
      decidir_bienvenida({ escribioPrimero: false, ventanaAbierta: false, optIn: false, yaEnviada: false }),
    ).toEqual({ canal: "nada", motivo: "sin_optin" });
  });

  it("no repite aunque la ventana siga abierta", () => {
    expect(
      decidir_bienvenida({ escribioPrimero: true, ventanaAbierta: true, optIn: true, yaEnviada: true }),
    ).toEqual({ canal: "nada", motivo: "ya_enviada" });
  });

  it("el job es idempotente por tenant y número", () => {
    const base = {
      tenantId: "t-1",
      numero: "+5491155551234",
      nombre: "Mauricio",
      comercio: "Kiosco La Esquina",
      escribioPrimero: true,
      ventanaAbierta: true,
      optIn: false,
    };
    const r1 = ejecutarBienvenida(base);
    const r2 = ejecutarBienvenida(base);
    expect(r1).toEqual({ canal: "libre", enviada: true });
    expect(r2).toEqual({ canal: "nada", enviada: false });
    expect(texto_bienvenida("Mauricio", "Kiosco La Esquina")).toContain("¿qué ubicaciones tengo?");
  });

  it("marca onboarding en el outbox y en el evento sin descontar del cupo (ON5.8)", () => {
    const r = ejecutarBienvenida({
      tenantId: "t-cupo",
      numero: "+5491155551234",
      nombre: "Mauricio",
      comercio: "Kiosco La Esquina",
      escribioPrimero: true,
      ventanaAbierta: true,
      optIn: false,
    });
    expect(r).toEqual({ canal: "libre", enviada: true });
    const salida = control.opsOutbox[control.opsOutbox.length - 1];
    expect(salida?.tipo).toBe("bienvenida_enviada");
    expect((salida?.payload as { onboarding: boolean }).onboarding).toBe(true);
    const evento = control.events.filter((e) => e.tenantId === "t-cupo").at(-1);
    expect(evento?.tipo).toBe("bienvenida_enviada");
    expect((evento?.detalle as { onboarding: boolean }).onboarding).toBe(true);
  });
});
