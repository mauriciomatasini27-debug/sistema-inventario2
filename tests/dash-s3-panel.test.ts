import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moduloIndice } from "../src/lib/panel-modulos.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("DASH-S3 tarjeta Bot en el índice de /panel", () => {
  it("panel.astro compone BotCard junto a los módulos del bot", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain("BotCard");
    expect(panel).toContain("<BotCard />");
    expect(panel).toContain("<BotModulosCard />");
  });

  it("la tarjeta enlaza a la config del bot y trae los tres datos", () => {
    const card = leer("src/components/panel/BotCard.astro");
    expect(moduloIndice("bot").href).toBe("/panel/bot/config");
    expect(card).toContain("href={bot.href}");
    expect(card).toContain("Consultas de hoy");
    expect(card).toContain("Última consulta");
    expect(card).toContain("tabular-nums");
  });

  it("el estado se anuncia y se explica en texto, nunca solo color", () => {
    const card = leer("src/components/panel/BotCard.astro");
    expect(card).toContain('aria-live="polite"');
    expect(card).toContain("formatearUltimaConsulta");
    expect(leer("src/lib/bot-card-panel.ts")).toContain("Todavía no hubo consultas");
  });

  it("tiene estados de carga y de error en texto", () => {
    const card = leer("src/components/panel/BotCard.astro");
    expect(card).toContain("Cargando…");
    expect(card).toContain("No pudimos leer el estado del bot. Reintentá en un rato.");
  });

  it("la tarjeta vive en el endpoint read-only del resumen", () => {
    const card = leer("src/components/panel/BotCard.astro");
    expect(card).toContain('fetch("/api/whatsapp/resumen")');
  });
});
