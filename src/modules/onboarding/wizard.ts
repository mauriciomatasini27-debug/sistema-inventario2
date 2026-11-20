// ONBOARDING-WIZARD (T1): estado puro del wizard conversacional del dueño.
// Sin IO. Inmutable: cada transición devuelve un estado nuevo.

export type TipoPasoWizard = "text" | "choice";

export interface PasoWizard {
  key: string;
  titulo: string;
  tipo: TipoPasoWizard;
  opciones?: string[];
}

export const PASOS_WIZARD: readonly PasoWizard[] = [
  { key: "negocio", titulo: "¿Cómo se llama tu negocio?", tipo: "text" },
  { key: "dueno", titulo: "¿Cómo te llamás?", tipo: "text" },
  {
    key: "empleados",
    titulo: "¿Tenés empleados?",
    tipo: "choice",
    opciones: ["Sí, tengo empleados", "No, trabajo solo"],
  },
  {
    key: "productos",
    titulo: "¿Querés cargar tus productos ahora?",
    tipo: "choice",
    opciones: ["Sí, cargar productos", "Más tarde"],
  },
  {
    key: "caja",
    titulo: "¿Tenés dinero en la caja para empezar a vender?",
    tipo: "choice",
    opciones: ["Sí, cargar monto", "Empezar en 0"],
  },
];

export interface WizardState {
  paso: number;
  respuestas: Record<string, string>;
  empleados: string[];
  empleadosDone: boolean;
  saltados: string[];
  completado: boolean;
}

export function estadoInicialWizard(): WizardState {
  return {
    paso: 0,
    respuestas: {},
    empleados: [],
    empleadosDone: false,
    saltados: [],
    completado: false,
  };
}

export function pasoActual(state: WizardState): PasoWizard | null {
  if (state.completado) return null;
  if (state.paso >= PASOS_WIZARD.length) return null;
  return PASOS_WIZARD[state.paso] ?? null;
}

export function puedeAvanzar(state: WizardState, respuesta?: string): boolean {
  const paso = pasoActual(state);
  if (!paso) return false;
  if (paso.tipo === "text") {
    const valor = (respuesta ?? "").trim();
    return valor.length > 0;
  }
  // choice: siempre se puede elegir una opción
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
  // choice
  if (respuesta == null) return state;
  const respuestas = { ...state.respuestas, [paso.key]: respuesta };
  // sub-flujo empleados
  if (paso.key === "empleados" && respuesta.startsWith("Sí")) {
    return { ...state, respuestas, empleadosDone: false };
  }
  return { ...state, respuestas, paso: state.paso + 1 };
}

export function saltar(state: WizardState): WizardState {
  const paso = pasoActual(state);
  if (!paso) return state;
  const saltados = state.saltados.includes(paso.key)
    ? state.saltados
    : [...state.saltados, paso.key];
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
  return state.completado || state.paso >= PASOS_WIZARD.length;
}

export function retomar(paso: number, respuestas: Record<string, string>, empleados: string[], saltados: string[]): WizardState {
  const p = Math.max(0, Math.min(paso, PASOS_WIZARD.length));
  return {
    paso: p,
    respuestas: { ...respuestas },
    empleados: [...empleados],
    empleadosDone: p > 2,
    saltados: [...saltados],
    completado: false,
  };
}
