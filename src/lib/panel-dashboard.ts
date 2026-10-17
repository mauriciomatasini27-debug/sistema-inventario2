import { formatearCentavos, setTexto } from "./panel-modulos.js";

export interface MesVenta {
  mes: string;
  efectivo_centavos: string | number;
  digital_centavos: string | number;
}

export interface MedioVenta {
  medio: string;
  centavos: string | number;
}

export interface SegmentoMedio {
  medio: string;
  pct: number;
}

const MAX_SEGMENTOS = 3;

export function segmentosPorMedio(porMedio: MedioVenta[]): SegmentoMedio[] {
  const positivos = porMedio
    .map((m) => ({ medio: m.medio, valor: Number(m.centavos) }))
    .filter((m) => Number.isFinite(m.valor) && m.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = positivos.reduce((a, m) => a + m.valor, 0);
  if (total <= 0) return [];
  const base =
    positivos.length > MAX_SEGMENTOS
      ? [...positivos.slice(0, MAX_SEGMENTOS), { medio: "Otros", valor: positivos.slice(MAX_SEGMENTOS).reduce((a, m) => a + m.valor, 0) }]
      : positivos;
  const exactos = base.map((m) => (m.valor / total) * 100);
  const pisos = exactos.map((e) => Math.floor(e));
  const resto = 100 - pisos.reduce((a, p) => a + p, 0);
  const orden = exactos
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; k < resto; k++) {
    const o = orden[k];
    if (o) pisos[o.i] = (pisos[o.i] ?? 0) + 1;
  }
  return base.map((m, i) => ({ medio: m.medio, pct: pisos[i] ?? 0 }));
}

export interface BucketHeat {
  dia_semana: number;
  hora: number;
  tickets: number;
}

export interface TurnoResumen {
  hora: string;
  turno: string;
  entregado_por?: string | null;
  estado: string;
}

export interface ResumenPanel {
  tickets_hoy?: number;
  devoluciones_hoy?: number;
  stock_bajo?: number;
  ventas_por_mes?: MesVenta[];
  por_medio?: MedioVenta[];
  heatmap?: BucketHeat[];
  turnos?: TurnoResumen[];
}

const MESES_AR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function nombreMes(mes: string): string {
  return MESES_AR[Number(mes.slice(5, 7)) - 1] || mes;
}

export function pintarTurnos(turnos: TurnoResumen[]): void {
  const ul = document.getElementById("turnos-lista");
  if (!ul) return;
  ul.innerHTML = "";
  if (!turnos.length) {
    ul.innerHTML = "<li>Sin turnos hoy.</li>";
    setTexto("turnos-estado", "Sin turnos registrados hoy.");
    return;
  }
  turnos.forEach((t) => {
    const li = document.createElement("li");
    const hora = document.createElement("span");
    hora.className = "hora";
    hora.textContent = t.hora;
    const b = document.createElement("b");
    b.textContent = t.turno;
    const mini = document.createElement("span");
    mini.className = "mini";
    mini.textContent = (t.entregado_por || "—") + " · " + t.estado;
    li.append(hora, b, document.createElement("br"), mini);
    ul.appendChild(li);
  });
  setTexto("turnos-estado", turnos.length + " turno(s) hoy.");
}

export function pintarHeat(buckets: BucketHeat[]): void {
  const cont = document.getElementById("heat");
  if (!cont) return;
  cont.innerHTML = "";
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const mapa = new Map(buckets.map((b) => [b.dia_semana + ":" + b.hora, b.tickets]));
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const i = document.createElement("i");
      const t = mapa.get(d + ":" + h) || 0;
      total += t;
      if (t > 0) {
        i.className = "on";
        i.title = (dias[d] ?? "") + " " + h + ":00 · " + t + " ticket(s)";
      }
      cont.appendChild(i);
    }
  }
  const resumen = total ? total + " tickets en los últimos 28 días." : "Sin ventas en los últimos 28 días.";
  cont.setAttribute("aria-label", "Heatmap de tickets por día y hora: " + resumen);
  setTexto("heatmap-estado", resumen);
}

export function pintarVentas(meses: MesVenta[]): void {
  const primero = meses[0];
  const ultimo = meses[meses.length - 1];
  if (!primero || !ultimo) {
    setTexto("ventas-estado", "Sin ventas registradas.");
    return;
  }
  const X0 = 30;
  const X1 = 590;
  const Y0 = 150;
  const Y1 = 10;
  const max = Math.max(1, ...meses.map((m) => Math.max(Number(m.efectivo_centavos), Number(m.digital_centavos))));
  const paso = meses.length > 1 ? (X1 - X0) / (meses.length - 1) : 0;
  const puntos = (clave: "efectivo_centavos" | "digital_centavos") =>
    meses
      .map((m, i) => {
        const x = X0 + i * paso;
        const y = Y0 - (Number(m[clave]) / max) * (Y0 - Y1);
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .join(" ");
  document.getElementById("serie-efectivo")?.setAttribute("points", puntos("efectivo_centavos"));
  document.getElementById("serie-digital")?.setAttribute("points", puntos("digital_centavos"));
  const g = document.getElementById("ventas-meses");
  if (g) {
    g.innerHTML = "";
    meses.forEach((m, i) => {
      if (i % 2 !== 0 && i !== meses.length - 1) return;
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", String(X0 + i * paso));
      t.setAttribute("y", "165");
      t.setAttribute("text-anchor", "middle");
      t.textContent = nombreMes(m.mes);
      g.appendChild(t);
    });
  }
  setTexto("ventas-periodo", primero.mes + " a " + ultimo.mes);
  setTexto(
    "ventas-estado",
    "En vivo: " + ultimo.mes + " " + formatearCentavos(ultimo.efectivo_centavos) + " efectivo · " + formatearCentavos(ultimo.digital_centavos) + " digital.",
  );
}

export function pintarDona(porMedio: MedioVenta[]): void {
  const arco = document.getElementById("dona-arco");
  const legend = document.getElementById("medios-legend");
  if (!arco || !legend) return;
  const total = porMedio.reduce((a, m) => a + Number(m.centavos), 0);
  if (!total) {
    arco.setAttribute("stroke-dasharray", "0 377");
    setTexto("dona-pct", "—");
    legend.innerHTML = "<span>Sin ventas este mes.</span>";
    setTexto("medios-estado", "Sin movimientos este mes.");
    return;
  }
  const efectivo = porMedio.filter((m) => m.medio === "Efectivo").reduce((a, m) => a + Number(m.centavos), 0);
  const pct = Math.round((efectivo / total) * 100);
  const C = 2 * Math.PI * 60;
  arco.setAttribute("stroke-dasharray", ((C * pct) / 100).toFixed(1) + " " + C.toFixed(1));
  setTexto("dona-pct", pct + "%");
  legend.innerHTML = "";
  porMedio.slice(0, 4).forEach((m) => {
    const s = document.createElement("span");
    s.textContent = Math.round((Number(m.centavos) / total) * 100) + "% " + m.medio;
    legend.appendChild(s);
  });
  setTexto("medios-estado", "En vivo: este mes " + formatearCentavos(total) + " en " + porMedio.length + " medio(s).");
}

export type FuenteKpi = "resumen" | "caja";

/** Pinta un KPI (reemplaza su skeleton) y marca su `.bignum` para la entrada escalonada. */
export function pintarKpi(id: string, texto: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.closest(".bignum")?.classList.add("listo");
}

/** Marca una fuente de la franja KPI como resuelta (éxito o error); con todas resueltas, `aria-busy="false"`. */
export function kpiListo(fuente: FuenteKpi): void {
  const strip = document.getElementById("kpi-strip");
  if (!strip) return;
  const pendientes = (strip.getAttribute("data-pendientes") ?? "").split(" ").filter((f) => f && f !== fuente);
  strip.setAttribute("data-pendientes", pendientes.join(" "));
  if (!pendientes.length) strip.setAttribute("aria-busy", "false");
}

export function pintarSegbar(porMedio: MedioVenta[]): void {
  const bar = document.getElementById("segbar");
  if (!bar) return;
  bar.textContent = "";
  const segs = segmentosPorMedio(porMedio);
  if (!segs.length) {
    const vacio = document.createElement("span");
    vacio.className = "vacio";
    vacio.textContent = "Sin ventas este mes";
    bar.appendChild(vacio);
    return;
  }
  segs.forEach((seg) => {
    const span = document.createElement("span");
    span.style.width = seg.pct + "%";
    span.textContent = seg.pct + "% " + seg.medio;
    bar.appendChild(span);
  });
}

export function renderResumen(j: ResumenPanel): void {
  pintarKpi("n-tickets", String(j.tickets_hoy ?? 0));
  pintarKpi("n-stock", String(j.stock_bajo ?? 0));
  setTexto("heat-ventas", String(j.tickets_hoy ?? 0));
  setTexto("heat-dev", String(j.devoluciones_hoy ?? 0));
  pintarSegbar(j.por_medio ?? []);
  setTexto("kpi-estado", "En vivo: " + (j.tickets_hoy ?? 0) + " tickets hoy · " + (j.stock_bajo ?? 0) + " con stock bajo.");
  pintarVentas(j.ventas_por_mes ?? []);
  pintarDona(j.por_medio ?? []);
  pintarHeat(j.heatmap ?? []);
  pintarTurnos(j.turnos ?? []);
  kpiListo("resumen");
}

export function renderResumenError(): void {
  const bar = document.getElementById("segbar");
  if (bar) {
    // Sin esto la barra quedaría en skeleton para siempre.
    const vacio = document.createElement("span");
    vacio.className = "vacio";
    vacio.textContent = "Sin datos";
    bar.replaceChildren(vacio);
  }
  pintarKpi("n-tickets", "—");
  pintarKpi("n-stock", "—");
  setTexto("heat-ventas", "—");
  setTexto("heat-dev", "—");
  setTexto("kpi-estado", "Sin conexión con el servidor: resumen no disponible.");
  setTexto("ventas-estado", "Sin conexión: ventas por mes no disponibles.");
  setTexto("medios-estado", "Sin conexión: composición por medio no disponible.");
  setTexto("heatmap-estado", "Sin conexión: heatmap no disponible.");
  setTexto("turnos-estado", "Sin conexión: turnos no disponibles.");
  kpiListo("resumen");
}
