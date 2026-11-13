// TB-164 #164: espejo en memoria de reportes de problema/sugerencia (plano control).
// La verdad en monoproceso; reportes-comercio-db copia durable si la tabla existe.

export type TipoReporteComercio = "problema" | "sugerencia";
export type EstadoReporteComercio = "recibido" | "en_revision" | "resuelto";

export interface ContextoReporteSeguro {
  pantalla: string;
  ruta: string;
  version: string;
}

export interface ReporteComercioMem {
  id: string;
  tenantId: string;
  nombreComercio: string;
  autorGoogleSub: string;
  idempotencyKey: string;
  tipo: TipoReporteComercio;
  texto: string;
  estado: EstadoReporteComercio;
  contexto: ContextoReporteSeguro;
  creadoEn: string;
  actualizadoEn: string;
}

export const reportesComercioStore = {
  reportes: new Map<string, ReporteComercioMem>(),
  porClave: new Map<string, string>(),
};

export function resetReportesComercio(): void {
  reportesComercioStore.reportes.clear();
  reportesComercioStore.porClave.clear();
}
