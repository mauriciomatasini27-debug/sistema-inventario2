// Fecha de comprobante para offline (FE-S22, ADR-0018 D6).
// Núcleo puro: vende igual sin conexión; factura al sync en orden cronológico
// con hora servidor. Fecha venta si válida (concepto 1: mismo mes, ≤5 días
// atrás, ≥ último comprobante); sino fecha hoy + leyenda `Venta del ...`.
export interface FechaResuelta {
  readonly fch: string;
  readonly usaHoy: boolean;
  readonly leyenda: string | null;
}

export function es_aaaammdd(s: string): boolean {
  return /^\d{8}$/.test(s);
}

export function aaaammdd_a_ddmmaaaa(fch: string): string {
  return `${fch.slice(6, 8)}/${fch.slice(4, 6)}/${fch.slice(0, 4)}`;
}

function aaaammdd_a_ms(fch: string): number | null {
  if (!es_aaaammdd(fch)) return null;
  const ms = Date.UTC(Number(fch.slice(0, 4)), Number(fch.slice(4, 6)) - 1, Number(fch.slice(6, 8)));
  if (!Number.isFinite(ms)) return null;
  return ms;
}

// hoy y venta en AAAAMMDD, ultimo o null si no hay comprobante previo.
export function resolver_fecha(ventaFch: string, ultimoFch: string | null, hoyFch: string): FechaResuelta {
  if (!es_aaaammdd(ventaFch) || !es_aaaammdd(hoyFch)) {
    return { fch: hoyFch, usaHoy: true, leyenda: es_aaaammdd(ventaFch) ? `Venta del ${aaaammdd_a_ddmmaaaa(ventaFch)}` : null };
  }
  if (ultimoFch !== null && !es_aaaammdd(ultimoFch)) {
    return { fch: hoyFch, usaHoy: true, leyenda: `Venta del ${aaaammdd_a_ddmmaaaa(ventaFch)}` };
  }
  const mismoMes = ventaFch.slice(0, 6) === hoyFch.slice(0, 6);
  const ventaMs = aaaammdd_a_ms(ventaFch);
  const hoyMs = aaaammdd_a_ms(hoyFch);
  const difDias = ventaMs !== null && hoyMs !== null ? Math.round((hoyMs - ventaMs) / 86_400_000) : null;
  const enVentana = difDias !== null && difDias >= 0 && difDias <= 5;
  const noAnteriorAlUltimo = ultimoFch === null || ventaFch >= ultimoFch;
  if (mismoMes && enVentana && noAnteriorAlUltimo && ventaFch <= hoyFch) {
    return { fch: ventaFch, usaHoy: false, leyenda: null };
  }
  return { fch: hoyFch, usaHoy: true, leyenda: `Venta del ${aaaammdd_a_ddmmaaaa(ventaFch)}` };
}

export interface PendienteSync {
  readonly id: string;
  readonly clientOcurredAt: string;
  readonly ventaFch: string;
}

// Ordena una cola pendiente_de_sync por ocurrencia cliente y resuelve la
// fecha de cada una en cadena: el `ultimo` avanza con cada comprobante para
// garantizar fch monótona (≥ último) sin huecos de decisión.
export function resolver_cola_sync(
  cola: ReadonlyArray<PendienteSync>,
  ultimoFch: string | null,
  hoyFch: string,
): Array<{ id: string; fch: string; usaHoy: boolean; leyenda: string | null }> {
  const ordenada = [...cola].sort((a, b) => (a.clientOcurredAt < b.clientOcurredAt ? -1 : a.clientOcurredAt > b.clientOcurredAt ? 1 : 0));
  let ultimo = ultimoFch;
  const out: Array<{ id: string; fch: string; usaHoy: boolean; leyenda: string | null }> = [];
  for (const p of ordenada) {
    const r = resolver_fecha(p.ventaFch, ultimo, hoyFch);
    out.push({ id: p.id, fch: r.fch, usaHoy: r.usaHoy, leyenda: r.leyenda });
    ultimo = r.fch > (ultimo ?? "") ? r.fch : (ultimo ?? r.fch);
    if (r.fch >= (ultimo ?? "")) ultimo = r.fch;
  }
  return out;
}
