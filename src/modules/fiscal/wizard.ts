// Wizard fiscal pasos 0-6 + delegación (FE-S4/S5/S6, ADR-0018 D2).
// Puro: pasos con pausa/resume; delegación Ya-lo-hice → pendiente_proveedor.
export const WIZARD_PASOS = [0, 1, 2, 3, 4, 5, 6] as const;

export type DelegacionEstado = "pendiente" | "pendiente_proveedor" | "activa" | "revocada" | "lista_espera";

export type ModoPrimeraFactura = "cae" | "prueba_nc";

export interface WizardEstado {
  readonly paso: number;
  readonly delegacion: DelegacionEstado;
  readonly pausaEn: number | null;
  readonly modoPrimeraFactura: ModoPrimeraFactura | null;
}

export interface ResultadoPruebaDelegacion {
  readonly ok: boolean;
  readonly motivo: string;
}

export interface VistaWizardDelegacion {
  readonly paso: number;
  readonly delegacion: DelegacionEstado;
  readonly pausaEn: number | null;
  readonly mensaje_dueno: string;
  readonly cola_pausada: boolean;
  readonly estado_enlace: string;
  readonly modo_primera_factura: ModoPrimeraFactura | null;
  readonly aviso_revocacion: string | null;
}

export const TEXTO_ESPERA_PROVEEDOR =
  "Estamos confirmando tu alta en ARCA con el proveedor. Suele tardar menos de un día hábil.";

const colaPausadaPorTenant = new Set<string>();
const modoPrimeraFacturaPorTenant = new Map<string, ModoPrimeraFactura>();
const avisoRevocacionPorTenant = new Map<string, string>();

export function wizard_inicial(): WizardEstado {
  return { paso: 0, delegacion: "pendiente", pausaEn: null, modoPrimeraFactura: null };
}

export function wizard_avanzar(w: WizardEstado, paso: number): WizardEstado {
  if (!Number.isInteger(paso) || paso < 0 || paso > 6) return w;
  return { ...w, paso, pausaEn: null };
}

export function wizard_pausar(w: WizardEstado): WizardEstado {
  return { ...w, pausaEn: w.paso };
}

export function wizard_resumir(w: WizardEstado): WizardEstado {
  return { ...w, paso: w.pausaEn ?? w.paso, pausaEn: null };
}

export function confirmar_delegacion(w: WizardEstado): WizardEstado {
  return { ...w, delegacion: "pendiente_proveedor" };
}

export function resolver_delegacion(w: WizardEstado, ok: boolean, esRIetapa1 = false): WizardEstado {
  if (esRIetapa1) return { ...w, delegacion: "lista_espera" };
  return { ...w, delegacion: ok ? "activa" : "pendiente_proveedor" };
}

export function revocar_delegacion(w: WizardEstado): WizardEstado {
  return { ...w, delegacion: "revocada" };
}

export function mensaje_delegacion_dueno(w: WizardEstado, ultimoMotivoPrueba?: string): string {
  switch (w.delegacion) {
    case "pendiente_proveedor":
      return ultimoMotivoPrueba === "Falta confirmar delegación"
        ? "Falta confirmar delegación en ARCA. El proveedor todavía no terminó el alta."
        : TEXTO_ESPERA_PROVEEDOR;
    case "activa":
      return "Tu delegación fiscal está activa. Ya podés emitir facturas.";
    case "revocada":
      return "Revocaste la delegación en ARCA. La cola de facturación está pausada hasta que vuelvas a activarla.";
    case "lista_espera":
      return "Estás en lista de espera para facturación (RI etapa 1).";
    default:
      return "Completá los pasos del asistente y confirmá la delegación en ARCA.";
  }
}

export function estado_enlace_fiscal(delegacion: DelegacionEstado): string {
  if (delegacion === "revocada") return "delegacion_revocada";
  if (delegacion === "pendiente_proveedor") return "delegacion_pendiente_proveedor";
  if (delegacion === "activa") return "activo";
  if (delegacion === "lista_espera") return "lista_espera";
  return "delegacion_pendiente_comercio";
}

export function aplicar_resultado_prueba_delegacion(
  w: WizardEstado,
  prueba: ResultadoPruebaDelegacion,
  esRIetapa1 = false,
): WizardEstado {
  return resolver_delegacion(w, prueba.ok, esRIetapa1);
}

export function pausar_cola_fiscal(tenantId: string): void {
  colaPausadaPorTenant.add(tenantId);
}

export function reanudar_cola_fiscal(tenantId: string): void {
  colaPausadaPorTenant.delete(tenantId);
}

export function cola_fiscal_pausada(tenantId: string): boolean {
  return colaPausadaPorTenant.has(tenantId);
}

export function registrar_aviso_revocacion(tenantId: string, texto: string): void {
  avisoRevocacionPorTenant.set(tenantId, texto);
}

export function leer_aviso_revocacion(tenantId: string): string | null {
  return avisoRevocacionPorTenant.get(tenantId) ?? null;
}

export function revocar_delegacion_en_comercio(
  w: WizardEstado,
  tenantId: string,
): { wizard: WizardEstado; aviso: string } {
  pausar_cola_fiscal(tenantId);
  const aviso =
    "Detectamos que revocaste la delegación fiscal en ARCA. Pausamos la cola de facturación. Contactá soporte para volver a activar.";
  registrar_aviso_revocacion(tenantId, aviso);
  return { wizard: revocar_delegacion(w), aviso };
}

export function elegir_modo_primera_factura(tenantId: string, modo: ModoPrimeraFactura): void {
  modoPrimeraFacturaPorTenant.set(tenantId, modo);
}

export function leer_modo_primera_factura(tenantId: string): ModoPrimeraFactura | null {
  return modoPrimeraFacturaPorTenant.get(tenantId) ?? null;
}

export function enriquecer_vista_wizard(
  tenantId: string,
  w: WizardEstado,
  ultimoMotivoPrueba?: string,
): VistaWizardDelegacion {
  return {
    ...w,
    mensaje_dueno: mensaje_delegacion_dueno(w, ultimoMotivoPrueba),
    cola_pausada: cola_fiscal_pausada(tenantId),
    estado_enlace: estado_enlace_fiscal(w.delegacion),
    modo_primera_factura: w.modoPrimeraFactura ?? leer_modo_primera_factura(tenantId),
    aviso_revocacion: leer_aviso_revocacion(tenantId),
  };
}

export function limpiar_estado_wizard_volatil(): void {
  colaPausadaPorTenant.clear();
  modoPrimeraFacturaPorTenant.clear();
  avisoRevocacionPorTenant.clear();
}

export type ProbarDelegacionFn = (
  ambiente: "homo" | "prod",
  auth: { token: string; sign: string; cuit: string },
  ptoVta: number,
  cbteTipo: number,
) => Promise<ResultadoPruebaDelegacion>;

export async function completar_tarea_proveedor_y_probar(
  w: WizardEstado,
  probar: ProbarDelegacionFn,
  input: {
    ambiente: "homo" | "prod";
    auth: { token: string; sign: string; cuit: string };
    ptoVta: number;
    cbteTipo: number;
    esRIetapa1?: boolean;
  },
): Promise<{ wizard: WizardEstado; prueba: ResultadoPruebaDelegacion }> {
  const prueba = await probar(input.ambiente, input.auth, input.ptoVta, input.cbteTipo);
  const wizard = aplicar_resultado_prueba_delegacion(w, prueba, input.esRIetapa1 ?? false);
  return { wizard, prueba };
}
