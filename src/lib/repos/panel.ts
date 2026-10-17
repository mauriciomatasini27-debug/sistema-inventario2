import { desc, eq, gte } from "drizzle-orm";
import { products, sales } from "../../db/schema.js";
import { shiftHandovers } from "../../db/schema-caja.js";
import { saleReturns, ticketPaymentCorrections } from "../../db/schema-tickets.js";
import { intentarLeer } from "../server-db.js";
import { fechaAR, parseFechaAR } from "../fecha-ar.js";
import type { DatosResumen, TurnoResumenRow } from "../panel-resumen.js";
import {
  crearAlmacenCorrecciones,
  crearAlmacenDevoluciones,
  crearAlmacenProductos,
  crearAlmacenStock,
  crearAlmacenTurnos,
  crearListaMovimientos,
} from "./_almacen.js";

// P3-7c (ADR-0020): lectura de las filas que alimentan el resumen del panel.
// DB primero vía intentarLeer (single sin base cae a memoria; multi sin base
// propaga BaseNoDisponible => 503 en la ruta). Ventana de 400 días: cubre los
// 12 meses del gráfico y los 28 días del heatmap sin traer todo el histórico.

const VENTANA_DIAS = 400;

export async function leerResumenPanel(
  ahora: Date = new Date(),
): Promise<{ datos: DatosResumen; fuente: "db" | "memoria" }> {
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000);
  const hoy = fechaAR(ahora);
  const enDb = await intentarLeer(async (db): Promise<DatosResumen> => {
    const ventasFilas = await db
      .select({ id: sales.id, medio: sales.medio, total: sales.totalCentavos, ocurrido: sales.clientOccurredAt })
      .from(sales)
      .where(gte(sales.createdAt, desde));
    const devolucionesFilas = await db
      .select({ monto: saleReturns.montoCentavos, medio: saleReturns.medio, ocurrido: saleReturns.createdAt })
      .from(saleReturns)
      .where(gte(saleReturns.createdAt, desde));
    const correccionesFilas = await db
      .select({
        saleId: ticketPaymentCorrections.saleId,
        medioNuevo: ticketPaymentCorrections.medioNuevo,
        ocurrido: ticketPaymentCorrections.createdAt,
      })
      .from(ticketPaymentCorrections)
      .innerJoin(sales, eq(ticketPaymentCorrections.saleId, sales.id))
      .where(gte(sales.createdAt, desde));
    const productosFilas = await db
      .select({ stockActual: products.stockActual, minStock: products.minStock })
      .from(products);
    const turnosFilas = await db
      .select({
        fechaJornada: shiftHandovers.fechaJornada,
        turno: shiftHandovers.turno,
        entregadoPor: shiftHandovers.entregadoPor,
        estado: shiftHandovers.estado,
        creadoEn: shiftHandovers.createdAt,
      })
      .from(shiftHandovers)
      .where(eq(shiftHandovers.fechaJornada, hoy))
      .orderBy(desc(shiftHandovers.createdAt));
    return {
      ventas: ventasFilas.map((f) => ({ saleId: f.id, medio: f.medio, totalCentavos: f.total, ocurridoEn: f.ocurrido })),
      devoluciones: devolucionesFilas.map((f) => ({ montoCentavos: f.monto, medio: f.medio, ocurridoEn: f.ocurrido })),
      correcciones: correccionesFilas.map((f) => ({ saleId: f.saleId, medioNuevo: f.medioNuevo, ocurridoEn: f.ocurrido })),
      productos: productosFilas,
      turnos: turnosFilas.flatMap((f) => filaATurno(f.fechaJornada, f.turno, f.entregadoPor, f.estado, f.creadoEn)),
    };
  });
  if (enDb === null) return { datos: resumenMemoria(ahora), fuente: "memoria" };
  return { datos: enDb, fuente: "db" };
}

function filaATurno(
  fechaJornada: string,
  turno: string,
  entregadoPor: string,
  estado: string,
  creadoEn: Date | null,
): TurnoResumenRow[] {
  const fecha = parseFechaAR(fechaJornada);
  if (fecha === null) return [];
  return [{ fecha, turno, entregadoPor, estado, creadoEn }];
}

// Sin DB (solo single) se arma con la memoria particionada del tenant, igual
// que el resto de los repos. Los turnos en memoria no guardan instante real.
function resumenMemoria(ahora: Date): DatosResumen {
  const ventas = crearListaMovimientos()
    .listar()
    .filter((m) => m.origen === "venta" && m.tipo === "egreso" && m.ocurrido_en !== undefined)
    .map((m) => ({
      saleId: m.sale_id ?? "",
      medio: m.metodo,
      totalCentavos: BigInt(m.monto_centavos),
      ocurridoEn: new Date(m.ocurrido_en as string),
    }));
  // Los almacenes en memoria no guardan created_at; las devoluciones y
  // correcciones se imputan al mes del request.
  const devoluciones = [...crearAlmacenDevoluciones().comoMapaSoloLectura().values()].map((r) => ({
    montoCentavos: BigInt(r.total_centavos),
    medio: r.medio,
    ocurridoEn: ahora,
  }));
  const correcciones = [...crearAlmacenCorrecciones().comoMapaSoloLectura().values()].map((c) => ({
    saleId: c.correccion.saleId,
    medioNuevo: c.correccion.medioNuevo,
    ocurridoEn: ahora,
  }));
  const stock = crearAlmacenStock().comoMapaSoloLectura();
  const productos = [...crearAlmacenProductos().comoMapaSoloLectura().values()].map((f) => ({
    stockActual: stock.get(f.sku) ?? 0,
    minStock: f.minStock,
  }));
  const turnos = [...crearAlmacenTurnos().comoMapaSoloLectura().values()].flatMap((t) =>
    filaATurno(t.fechaJornada, t.turno, t.entregadoPor, t.estado, null),
  );
  return { ventas, devoluciones, correcciones, productos, turnos };
}
