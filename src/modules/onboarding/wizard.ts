// ONBOARDING-WIZARD (T1): estado puro del wizard conversacional del dueño.
// Sin IO. Inmutable: cada transición devuelve un estado nuevo.
import { ID_CHECKLIST_EMPLEADO } from "./checklist.js";

export type TipoPasoWizard = "text" | "choice";

export interface PasoWizard {
  key: string;
  titulo: string;
  tipo: TipoPasoWizard;
  opciones?: string[];
  subflujo?: "empleados";
  salidaSi?: string;
  noAplicaId?: string;
}

export const PASOS_WIZARD: readonly PasoWizard[] = [
  {
    key: "empleados",
    titulo: "¿Tenés empleados?",
    tipo: "choice",
    opciones: ["Sí, tengo empleados", "No, trabajo solo"],
    subflujo: "empleados",
    noAplicaId: ID_CHECKLIST_EMPLEADO,
  },
  {
    key: "productos",
    titulo: "¿Querés cargar tus productos ahora?",
    tipo: "choice",
    opciones: ["Sí, cargar productos", "Más tarde"],
    salidaSi: "/panel/stock/importar",
  },
  {
    key: "caja",
    titulo: "¿Tenés dinero en la caja para empezar a vender?",
    tipo: "choice",
    opciones: ["Sí, cargar monto", "Empezar en 0"],
    salidaSi: "/panel/caja",
  },
];

const PASOS_DATOS_FALTANTES: readonly PasoWizard[] = [
  { key: "rubro", titulo: "¿Cuál es tu rubro?", tipo: "text" },
  { key: "whatsapp", titulo: "¿Cuál es tu número de WhatsApp?", tipo: "text" },
];

export interface DatosConocidos {
  rubro?: string | null;
  whatsapp?: string | null;
}

export function pasosParaDatos(datos: DatosConocidos = {}): PasoWizard[] {
  const faltantes = PASOS_DATOS_FALTANTES.filter((paso) =>
    paso.key === "rubro" ? !datos.rubro : !datos.whatsapp,
  );
  return [...faltantes, ...PASOS_WIZARD];
}

export interface WizardState {
  paso: number;
  pasos: PasoWizard[];
  datosConocidos: DatosConocidos;
  respuestas: Record<string, string>;
  empleados: string[];
  empleadosDone: boolean;
  saltados: string[];
  completado: boolean;
}

export function estadoInicialWizard(datos: DatosConocidos = {}): WizardState {
  return {
    paso: 0,
    pasos: pasosParaDatos(datos),
    datosConocidos: { ...datos },
    respuestas: {},
    empleados: [],
    empleadosDone: false,
    saltados: [],
    completado: false,
  };
}

export function conDatosConocidos(state: WizardState, datos: DatosConocidos): WizardState {
  const pasos = pasosParaDatos(datos);
  const claveActual = state.pasos[state.paso]?.key;
  const paso = claveActual ? pasos.findIndex((p) => p.key === claveActual) : -1;
  return {
    ...state,
    datosConocidos: { ...datos },
    pasos,
    paso: paso >= 0 ? paso : Math.min(state.paso, pasos.length),
  };
}

export function pasoActual(state: WizardState): PasoWizard | null {
  if (state.completado) return null;
  if (state.paso >= state.pasos.length) return null;
  return state.pasos[state.paso] ?? null;
}

export function destinoSi(
  paso: PasoWizard | null | undefined,
  respuesta: string | undefined,
): string | null {
  if (!paso?.salidaSi) return null;
  return typeof respuesta === "string" && respuesta.startsWith("Sí") ? paso.salidaSi : null;
}

// TB-165 [plataforma]: el subflujo de empleados se decide por metadatos, no por el key.
export function subflujoEmpleadosActivo(state: WizardState): boolean {
  const paso = pasoActual(state);
  if (!paso || paso.subflujo !== "empleados" || state.empleadosDone) return false;
  return String(state.respuestas[paso.key] ?? "").startsWith("Sí");
}

export function transicionConSalida(
  state: WizardState,
  respuesta: string,
): { state: WizardState; salida: string | null } {
  return {
    state: avanzar(state, respuesta),
    salida: destinoSi(pasoActual(state), respuesta),
  };
}

export function indiceSubflujoEmpleados(pasos: readonly PasoWizard[]): number {
  return pasos.findIndex((p) => p.subflujo === "empleados");
}

function idNoAplica(paso: PasoWizard): string {
  return paso.noAplicaId ?? paso.key;
}

export function puedeAvanzar(state: WizardState, respuesta?: string): boolean {
  const paso = pasoActual(state);
  if (!paso) return false;
  if (paso.tipo === "text") {
    const valor = (respuesta ?? "").trim();
    return valor.length > 0;
  }
  return true;
}

export function avanzar(
  state: WizardState,
  respuesta?: string,
): WizardState {
  const paso = pasoActual(state);
  if (!paso) return state;
  if (paso.tipo === "text") {
    const valor = (respuesta ?? "").trim();
    if (valor.length === 0) return state;
    const respuestas = { ...state.respuestas, [paso.key]: valor };
    return { ...state, respuestas, paso: state.paso + 1 };
  }
  if (respuesta == null) return state;
  const respuestas = { ...state.respuestas, [paso.key]: respuesta };
  if (paso.subflujo === "empleados" && respuesta.startsWith("Sí")) {
    return { ...state, respuestas, empleadosDone: false };
  }
  return { ...state, respuestas, paso: state.paso + 1 };
}

export function saltar(state: WizardState): WizardState {
  const paso = pasoActual(state);
  if (!paso) return state;
  const noAplica = idNoAplica(paso);
  const saltados = state.saltados.includes(noAplica)
    ? state.saltados
    : [...state.saltados, noAplica];
  return { ...state, saltados, paso: state.paso + 1 };
}

export function agregarEmpleado(state: WizardState, nombre: string): WizardState {
  const n = nombre.trim();
  if (n.length === 0) return state;
  return { ...state, empleados: [...state.empleados, n] };
}

export function quitarEmpleado(state: WizardState, index: number): WizardState {
  if (index < 0 || index >= state.empleados.length) return state;
  const empleados = state.empleados.filter((_, i) => i !== index);
  return { ...state, empleados };
}

export function completarEmpleados(state: WizardState): WizardState {
  return { ...state, empleadosDone: true, paso: state.paso + 1 };
}

export function marcarCompletado(state: WizardState): WizardState {
  return { ...state, completado: true };
}

export function esCompleto(state: WizardState): boolean {
  return state.completado || state.paso >= state.pasos.length;
}

export function retomar(
  paso: number,
  respuestas: Record<string, string>,
  empleados: string[],
  saltados: string[],
  datos: DatosConocidos = {},
): WizardState {
  const pasos = pasosParaDatos(datos);
  const p = Math.max(0, Math.min(paso, pasos.length));
  const empleadosIndex = indiceSubflujoEmpleados(pasos);
  return {
    paso: p,
    pasos,
    datosConocidos: { ...datos },
    respuestas: { ...respuestas },
    empleados: [...empleados],
    empleadosDone: p > empleadosIndex,
    saltados: [...saltados],
    completado: false,
  };
}