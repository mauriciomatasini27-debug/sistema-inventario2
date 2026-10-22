import { describe, expect, it } from "vitest";
import {
  borrarColasLocales,
  CLAVE_LEGADA_OUTBOX,
  CLAVE_LEGADA_SEQ,
  claveOutboxCola,
  claveSeqCola,
  copiarSeqLegado,
} from "../src/offline/cola-venta.js";

interface FakeStorage {
  mapa: Map<string, string>;
  getItem(c: string): string | null;
  setItem(c: string, v: string): void;
  removeItem(c: string): void;
  keys(): string[];
}

function storageFake(datos: Record<string, string> = {}): FakeStorage {
  const mapa = new Map(Object.entries(datos));
  return {
    mapa,
    getItem: (c) => mapa.get(c) ?? null,
    setItem: (c, v) => { mapa.set(c, v); },
    removeItem: (c) => { mapa.delete(c); },
    keys: () => Array.from(mapa.keys()),
  };
}

describe("P10-14 cola offline por tenant", () => {
  it("claves del tenant con sufijo y legadas sin tenant", () => {
    expect(claveOutboxCola("tenant-a")).toBe("slice0-outbox:tenant-a");
    expect(claveSeqCola("tenant-a")).toBe("slice0-seq:tenant-a");
    expect(claveOutboxCola(null)).toBe("slice0-outbox");
    expect(claveSeqCola(null)).toBe("slice0-seq");
  });

  it("copiarSeqLegado hereda el contador legado sin rebajar el vigente", () => {
    const s = storageFake({ [CLAVE_LEGADA_SEQ]: "55" });
    copiarSeqLegado(s, "tenant-a");
    expect(s.getItem("slice0-seq:tenant-a")).toBe("55");
    s.setItem("slice0-seq:tenant-a", "60");
    copiarSeqLegado(s, "tenant-a");
    expect(s.getItem("slice0-seq:tenant-a")).toBe("60");
    s.setItem(CLAVE_LEGADA_SEQ, "999");
    copiarSeqLegado(s, "tenant-a");
    expect(s.getItem("slice0-seq:tenant-a")).toBe("999");
    s.setItem("slice0-seq:tenant-a", "2000");
    copiarSeqLegado(s, "tenant-a");
    expect(s.getItem("slice0-seq:tenant-a")).toBe("2000");
  });

  it("sin tenant no copia el contador", () => {
    const s = storageFake({ [CLAVE_LEGADA_SEQ]: "7" });
    copiarSeqLegado(s, null);
    expect(s.mapa.size).toBe(1);
  });

  it("borrarColasLocales limpia legadas y todas las de tenant", () => {
    const s = storageFake({
      [CLAVE_LEGADA_OUTBOX]: '[{"op_id":"x"}]',
      [CLAVE_LEGADA_SEQ]: "5",
      "slice0-outbox:tenant-a": '[{"op_id":"y"}]',
      "slice0-seq:tenant-a": "3",
      "slice0-outbox:tenant-b": "[]",
      "offline:catalogo:tenant-a": "{}",
      "otra-clave": "1",
    });
    borrarColasLocales(s);
    expect(s.mapa.has(CLAVE_LEGADA_OUTBOX)).toBe(false);
    expect(s.mapa.has(CLAVE_LEGADA_SEQ)).toBe(false);
    expect(s.mapa.has("slice0-outbox:tenant-a")).toBe(false);
    expect(s.mapa.has("slice0-seq:tenant-a")).toBe(false);
    expect(s.mapa.has("slice0-outbox:tenant-b")).toBe(false);
    expect(s.getItem("offline:catalogo:tenant-a")).toBe("{}");
    expect(s.getItem("otra-clave")).toBe("1");
  });

  it("borrarColasLocales sin storage ni keys no lanza", () => {
    expect(() => borrarColasLocales(null)).not.toThrow();
    const min = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(() => borrarColasLocales(min)).not.toThrow();
  });
});
