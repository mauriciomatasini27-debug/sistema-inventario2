export interface QrReciboAsociar {
  monto_centavos: number | string | bigint;
  fecha_operacion: string | Date;
}

export interface QrCandidato {
  id: string;
  monto_centavos: number | string | bigint;
  ocurrido_en: string | Date;
}

export type AsociacionQr =
  | { tipo: "auto"; movimiento_id: string }
  | { tipo: "toque"; candidatos: string[] }
  | { tipo: "sin_candidato" };

const VENTANA_MS = 15 * 60 * 1000;

function aCentavos(v: number | string | bigint): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(v);
}

export function asociarQr(recibo: QrReciboAsociar, candidatos: QrCandidato[]): AsociacionQr {
  let monto: bigint;
  try {
    monto = aCentavos(recibo.monto_centavos);
  } catch {
    return { tipo: "sin_candidato" };
  }
  const t = new Date(recibo.fecha_operacion).getTime();
  if (!Number.isFinite(t)) return { tipo: "sin_candidato" };
  const dentro: string[] = [];
  for (const c of candidatos) {
    let m: bigint;
    try {
      m = aCentavos(c.monto_centavos);
    } catch {
      continue;
    }
    if (m !== monto) continue;
    const o = new Date(c.ocurrido_en).getTime();
    if (!Number.isFinite(o)) continue;
    if (Math.abs(o - t) <= VENTANA_MS) dentro.push(c.id);
  }
  const primero = dentro[0];
  if (dentro.length === 1 && primero !== undefined) return { tipo: "auto", movimiento_id: primero };
  if (dentro.length > 1) return { tipo: "toque", candidatos: dentro };
  return { tipo: "sin_candidato" };
}
