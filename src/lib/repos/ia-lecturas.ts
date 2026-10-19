import { conTenant } from "../tenant-mode.js";
import { construirResumen } from "../panel-resumen.js";
import type { LecturasIA } from "../../modules/ia/asistente.js";
import { obtenerBalance } from "./caja.js";
import { listarClientesConSaldo } from "./fiado.js";
import { clasificarLotes, listarLotes } from "./lotes.js";
import { leerResumenPanel } from "./panel.js";
import { listarCatalogoVivo } from "./whatsapp.js";

// IA-S4 (PRD-IA-01, ADR-0044): lecturas reales del asistente. Cada herramienta
// conectada lee datos del tenant del comercio, nunca números inventados. Las
// herramientas sin lectura quedan fuera del mapa y el núcleo responde que
// todavía no puede leer ese dato.

function limiteDe(params: unknown, porDefecto: number, max: number): number {
  if (typeof params !== "object" || params === null) return porDefecto;
  const valor = (params as { limite?: unknown }).limite;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 ? Math.min(valor, max) : porDefecto;
}

function diasDe(params: unknown, porDefecto: number, max: number): number {
  if (typeof params !== "object" || params === null) return porDefecto;
  const valor = (params as { dias?: unknown }).dias;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 ? Math.min(valor, max) : porDefecto;
}

export function crearLecturasIA(opts: { ahora?: () => Date } = {}): LecturasIA {
  const ahora = opts.ahora ?? (() => new Date());
  return {
    stock_bajo: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const limite = limiteDe(params, 10, 50);
        const catalogo = await listarCatalogoVivo(ctx.tenantId);
        return catalogo
          .filter((p) => p.umbral > 0 && p.stock <= p.umbral)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, limite)
          .map((p) => ({ sku: p.sku, nombre: p.nombre, stock: p.stock, minimo: p.umbral }));
      }),
    deudores: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const limite = limiteDe(params, 10, 20);
        const { clientes } = await listarClientesConSaldo(ahora().getTime());
        return clientes
          .filter((c) => c.saldoCentavos > 0n)
          .sort((a, b) => (a.saldoCentavos === b.saldoCentavos ? 0 : a.saldoCentavos > b.saldoCentavos ? -1 : 1))
          .slice(0, limite)
          .map((c) => ({ nombre: c.nombre, saldoCentavos: c.saldoCentavos.toString(), diasAtraso: c.diasMax }));
      }),
    por_vencer: (ctx, params) =>
      conTenant(ctx.tenantId, async () => {
        const dias = diasDe(params, 15, 90);
        const clasificacion = clasificarLotes(await listarLotes(), ahora().getTime());
        return [
          ...clasificacion.vencidos,
          ...clasificacion.alertas_3d,
          ...clasificacion.alertas_7d,
          ...clasificacion.alertas_15d,
        ]
          .filter((a) => a.dias <= dias)
          .sort((a, b) => a.dias - b.dias)
          .map((a) => ({ sku: a.sku, dias: a.dias, cantidadRestante: a.cantidad_restante, venceEl: a.vence_el }));
      }),
    caja_dia: (ctx) =>
      conTenant(ctx.tenantId, async () => {
        const balance = await obtenerBalance();
        return { totalCentavos: balance.total, porMedio: balance.porMedio, fuente: balance.fuente };
      }),
    ventas_periodo: (ctx) =>
      conTenant(ctx.tenantId, async () => {
        const { datos, fuente } = await leerResumenPanel(ahora());
        const resumen = construirResumen(ahora(), datos);
        return {
          ventasMesCentavos: resumen.ventas_mes_centavos,
          ticketsHoy: resumen.tickets_hoy,
          fuente,
        };
      }),
  };
}
