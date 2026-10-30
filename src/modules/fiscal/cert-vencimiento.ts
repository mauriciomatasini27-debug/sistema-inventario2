// FE-S26 / #106: alertas de vencimiento del certificado del computador fiscal (FE16.3).
// Núcleo puro: días restantes, umbrales 60/30/7 y severidad para el Control Plane.

export const UMBRALES_CERT_DIAS = [60, 30, 7] as const;
export type UmbralCertDias = (typeof UMBRALES_CERT_DIAS)[number];

export type SeveridadAlertaCert = "ok" | "aviso" | "critico";

export interface AlertaCertificadoFiscal {
  readonly fiscalComputerId: string;
  readonly ambiente: string;
  readonly alias: string;
  readonly cuitProveedor: string;
  readonly notAfter: string;
  readonly diasRestantes: number;
  readonly severidad: SeveridadAlertaCert;
  readonly umbralActivo: UmbralCertDias | null;
}

const MS_DIA = 86_400_000;

export function diasRestantesCertificado(notAfter: Date, hoy: Date): number {
  const fin = Date.UTC(notAfter.getUTCFullYear(), notAfter.getUTCMonth(), notAfter.getUTCDate());
  const inicio = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.floor((fin - inicio) / MS_DIA);
}

export function umbralActivo(diasRestantes: number): UmbralCertDias | null {
  if (diasRestantes < 0) return null;
  if (diasRestantes <= 7) return 7;
  if (diasRestantes <= 30) return 30;
  if (diasRestantes <= 60) return 60;
  return null;
}

export function severidadCertificado(diasRestantes: number): SeveridadAlertaCert {
  if (diasRestantes < 0) return "critico";
  if (diasRestantes <= 30) return "critico";
  if (diasRestantes <= 60) return "aviso";
  return "ok";
}

export function alertaDesdeComputador(
  fila: {
    readonly id: string;
    readonly ambiente: string;
    readonly alias: string;
    readonly cuitProveedor: string;
    readonly notAfter: Date | null;
  },
  hoy: Date,
): AlertaCertificadoFiscal | null {
  if (!fila.notAfter) return null;
  const dias = diasRestantesCertificado(fila.notAfter, hoy);
  const severidad = severidadCertificado(dias);
  if (severidad === "ok") return null;
  return {
    fiscalComputerId: fila.id,
    ambiente: fila.ambiente,
    alias: fila.alias,
    cuitProveedor: fila.cuitProveedor,
    notAfter: fila.notAfter.toISOString(),
    diasRestantes: dias,
    severidad,
    umbralActivo: umbralActivo(dias),
  };
}

export function claveRegistroAlertaCert(fiscalComputerId: string, umbral: UmbralCertDias): string {
  return `cert_venc_alerta:${fiscalComputerId}:${umbral}`;
}

// Umbrales que hay que registrar hoy (una sola vez por umbral y computador).
export function umbralesPorEmitir(
  diasRestantes: number,
  yaEmitidos: ReadonlySet<UmbralCertDias>,
): readonly UmbralCertDias[] {
  const out: UmbralCertDias[] = [];
  if (diasRestantes <= 60 && diasRestantes > 30 && !yaEmitidos.has(60)) out.push(60);
  if (diasRestantes <= 30 && diasRestantes > 7 && !yaEmitidos.has(30)) out.push(30);
  if (diasRestantes <= 7 && diasRestantes >= 0 && !yaEmitidos.has(7)) out.push(7);
  return out;
}
