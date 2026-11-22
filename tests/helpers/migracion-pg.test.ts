import { beforeEach, describe, expect, it, vi } from "vitest";

const unsafe = vi.fn(async (_sql: string) => []);
const end = vi.fn(async () => {});

vi.mock("postgres", () => ({
  default: () => {
    const sql = (_strings: TemplateStringsArray, ..._valores: unknown[]) => Promise.resolve([]);
    return Object.assign(sql, { unsafe, end });
  },
}));

import { aplicarHasta } from "./migracion-pg.js";

describe("aplicarHasta bajo paralelo", () => {
  beforeEach(() => {
    unsafe.mockClear();
    end.mockClear();
  });

  it("aplica todas las migraciones en un solo viaje a Postgres", async () => {
    await aplicarHasta("0001_admin_panel", "postgres://postgres@127.0.0.1:54329/base_de_prueba");

    expect(end).toHaveBeenCalledTimes(1);
    // Con el código anterior había un unsafe() por statement (cientos) y el
    // beforeAll de las suites PG pasaba de 3-5s a >15s bajo contención (#448).
    expect(unsafe).toHaveBeenCalledTimes(1);
    const lote = String(unsafe.mock.calls[0]?.[0] ?? "");
    expect(lote).toContain('CREATE TABLE "cash_audit_log"');
    expect(lote.indexOf('CREATE TABLE "cash_audit_log"')).toBeLessThan(lote.indexOf('CREATE TABLE "admin_audit_log"'));
  });
});
