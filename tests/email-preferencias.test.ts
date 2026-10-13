import { describe, expect, it } from "vitest";
import { CATALOGO, canal_texto, es_desactivable } from "../src/modules/email/catalogo.js";
import {
  actualizar_tipo,
  en_silencio,
  pausar,
  prefs_por_defecto,
  puede_enviar,
} from "../src/modules/email/preferencias.js";
import { aplicar_baja, cabeceras_baja, firmar_baja, verificar_baja } from "../src/modules/email/baja.js";

const SECRET = "test-secret";

describe("email A NE1 catalogo fijo", () => {
  it("tres clave por wa+email, resto email, sin selector", () => {
    expect(CATALOGO.stock_bajo.canal).toBe("wa+email");
    expect(CATALOGO.resumen_viernes.canal).toBe("wa+email");
    expect(CATALOGO.resumen_cierre.canal).toBe("wa+email");
    expect(CATALOGO.vencimientos.canal).toBe("email");
    expect(CATALOGO.sistema_operacion.canal).toBe("email");
    expect(canal_texto("stock_bajo")).toBe("Por WhatsApp y email");
    expect(canal_texto("vencimientos")).toBe("Por email");
  });

  it("seguridad y cuenta no desactivables", () => {
    expect(es_desactivable("seguridad")).toBe(false);
    expect(es_desactivable("cuenta")).toBe(false);
    expect(es_desactivable("resumen_cierre")).toBe(true);
  });
});

describe("email A NE9 silencio y pausa", () => {
  it("silencio 23:00-07:30 difiere vencimiento", () => {
    const prefs = prefs_por_defecto();
    // 23:30 en silencio
    expect(puede_enviar("vencimientos", prefs, { ahoraMs: 0, ahoraMin: 23 * 60 + 30 })).toBe(false);
    // 07:30 fin del silencio
    expect(puede_enviar("vencimientos", prefs, { ahoraMs: 0, ahoraMin: 7 * 60 + 30 })).toBe(true);
    expect(en_silencio(23 * 60 + 30, prefs.silencio)).toBe(true);
  });

  it("seguridad ignora silencio y pausa", () => {
    const pausadas = pausar(prefs_por_defecto(), 9999, "dueno");
    expect(pausadas.ok).toBe(true);
    if (!pausadas.ok) return;
    expect(puede_enviar("seguridad", pausadas.prefs, { ahoraMs: 10, ahoraMin: 23 * 60 + 30 })).toBe(true);
    expect(puede_enviar("vencimientos", pausadas.prefs, { ahoraMs: 10, ahoraMin: 600 })).toBe(false);
    // Al terminar la pausa se retoma sin acumulado: el gate vuelve a true
    expect(puede_enviar("vencimientos", pausadas.prefs, { ahoraMs: 10000, ahoraMin: 600 })).toBe(true);
  });

  it("solo dueno edita; empleado 403", () => {
    const r = actualizar_tipo(prefs_por_defecto(), "vencimientos", { activo: false }, "empleado");
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    const r2 = actualizar_tipo(prefs_por_defecto(), "seguridad", { activo: false }, "dueno");
    expect(r2).toMatchObject({ ok: false, error: "no_desactivable" });
  });
});

describe("email A NE10 baja un clic", () => {
  it("baja corta solo email de la categoria", () => {
    const prefs = prefs_por_defecto();
    const token = firmar_baja(SECRET, { tenantId: "t1", sub: "u1", categoria: "resumen_cierre" });
    const v = verificar_baja(SECRET, token);
    expect(v.ok).toBe(true);
    const r = aplicar_baja(prefs, "resumen_cierre");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prefs.porTipo.resumen_cierre.activo).toBe(false);
    // WA sigue: el canal fijo no cambia
    expect(CATALOGO.resumen_cierre.canal).toBe("wa+email");
  });

  it("token alterado no cambia nada", () => {
    const token = firmar_baja(SECRET, { tenantId: "t1", sub: "u1", categoria: "vencimientos" });
    const v = verificar_baja(SECRET, token + "x");
    expect(v.ok).toBe(false);
  });

  it("seguridad sin List-Unsubscribe", () => {
    const token = firmar_baja(SECRET, { tenantId: "t1", sub: "u1", categoria: "vencimientos" });
    expect(cabeceras_baja("https://avisos.test", token, "vencimientos")).toMatchObject({
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(cabeceras_baja("https://avisos.test", "t", "seguridad")).toBeNull();
    expect(cabeceras_baja("https://avisos.test", "t", "cuenta")).toBeNull();
  });
});
