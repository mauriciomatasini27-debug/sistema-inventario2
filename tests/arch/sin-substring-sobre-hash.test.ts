import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// E11: nunca substring de un PIN/secreto corto sobre datos aleatorios.
// La sal/hex de scrypt (o un uuid) contiene cualquier ventana de 4 hex por
// azar (~1/1000 por corrida) y el test flakea en CI (P9-7: PR #66 y #76).
// Comparar campos exactos en su lugar; ver tests/auth-pin.test.ts.
const RX_PIN_CORTO = /not\.toContain\(\s*["']\d{4,6}["']\s*\)/;
const RX_ALEATORIO = /[Hh]ash|[Ss]alt|[Uu]uid|randomUUID|JSON\.stringify/;

const MENSAJE =
  "substring de PIN/secreto sobre datos aleatorios: comparar campos exactos, no substring sobre datos aleatorios; ver tests/auth-pin.test.ts";

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "arch") continue;
      out.push(...archivos(p));
    } else if (p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

export function esSubstringSobreAleatorio(linea: string): boolean {
  const codigo = (linea.split("//")[0] ?? "") as string;
  return RX_PIN_CORTO.test(codigo) && RX_ALEATORIO.test(codigo);
}

describe("E11 sin substring de secreto sobre hash/aleatorio", () => {
  it("ningún test aplica not.toContain(<PIN>) sobre hash, sal, uuid o JSON", () => {
    const mal: string[] = [];
    for (const f of archivos(join("tests"))) {
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (esSubstringSobreAleatorio(linea)) mal.push(`${f.replace(/\\/g, "/")}:${i + 1}: ${linea.trim()}`);
      });
    }
    expect(mal, mal.length > 0 ? `${MENSAJE}:\n${mal.join("\n")}` : "").toEqual([]);
  });

  it("habría fallado en la línea vieja 104 de auth-pin (red)", () => {
    const vieja104 = 'expect(control.devicePins.get("PC1")?.pinHash).not.toContain("1234");';
    const vieja107 = 'expect(JSON.stringify(ev)).not.toContain("1234");';
    expect(esSubstringSobreAleatorio(vieja104)).toBe(true);
    expect(esSubstringSobreAleatorio(vieja107)).toBe(true);
  });

  it("no marca comparaciones exactas ni máscaras deterministas", () => {
    expect(esSubstringSobreAleatorio('expect(h.split("$")).not.toContain("1234");')).toBe(false);
    expect(esSubstringSobreAleatorio('expect(partes).not.toContain(plano);')).toBe(false);
    expect(esSubstringSobreAleatorio('expect(enmascararNumero("+5491155551234")).not.toContain("55551234");')).toBe(false);
    expect(esSubstringSobreAleatorio('expect(secreta.error).not.toContain("1234");')).toBe(false);
  });
});
