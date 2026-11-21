// TB-165: dueño del flujo de onboarding. Todas las transiciones de OnboardingState
// (tour, checklist, video, wizard) pasan por acá; las rutas son shims HTTP
// que solo resuelven sesión/tenant y pasan un snapshot de conteos.
// TB-165: seam PersistenciaOnboarding (memoria en tests, control en producción).
import { type OnboardingState, type TourEstado } from "./estado.js";
import {
  crearPersistenciaOnboardingControl,
  type PersistenciaOnboarding,
} from "./persistencia.js";
import { calcular_checklist, type DatosChecklist } from "./checklist.js";
import { registrar_progreso } from "./video.js";
import {
  esCompleto,
  marcarCompletado,
  retomar,
  type WizardState,
} from "./wizard.js";

export type FotoComercio = DatosChecklist;
export type AccionChecklist = "saltar" | "retomar" | "ocultar" | "mostrar";
export type EventoVideo = "inicio" | "mitad" | "fin";

type PersistenciaOpcional = PersistenciaOnboarding | undefined;

// TB-165 [tenant]: quién, dónde y dónde se guarda viajan juntos en el contexto
// de cada transición, así las rutas no repiten el triple userId/tenantId.
export interface ContextoOnboarding {
  userId: string;
  tenantId: string;
  persistencia?: PersistenciaOpcional;
}

function persistenciaEfectiva(persistencia: PersistenciaOpcional): PersistenciaOnboarding {
  return persistencia ?? crearPersistenciaOnboardingControl();
}

// TB-165: guardar a partir de un estado ya leído evita el doble read en
// transiciones que necesitan el previo para calcular el patch.
function guardar(
  previo: OnboardingState,
  patch: Partial<OnboardingState>,
  persistencia: PersistenciaOnboarding,
): OnboardingState {
  const next: OnboardingState = {
    ...previo,
    ...patch,
    actualizadoAt: new Date().toISOString(),
  };
  persistencia.guardar(next);
  return next;
}

function actualizar(ctx: ContextoOnboarding, patch: Partial<OnboardingState>): OnboardingState {
  const p = persistenciaEfectiva(ctx.persistencia);
  return guardar(p.leer(ctx.userId, ctx.tenantId), patch, p);
}

// TB-165: lectura pura para que un GET no mute el estado del comercio.
export function leerOnboarding(ctx: ContextoOnboarding): OnboardingState {
  return persistenciaEfectiva(ctx.persistencia).leer(ctx.userId, ctx.tenantId);
}

export function marcarTourPaso(
  ctx: ContextoOnboarding,
  paso: number,
  estado: TourEstado,
): OnboardingState {
  return actualizar(ctx, { tourUltimoPaso: paso, tourEstado: estado });
}

export function accionChecklist(
  ctx: ContextoOnboarding,
  accion: AccionChecklist,
  paso: string | undefined,
): OnboardingState {
  const p = persistenciaEfectiva(ctx.persistencia);
  const previo = p.leer(ctx.userId, ctx.tenantId);
  let patch: Partial<OnboardingState> = {};
  if (accion === "saltar" && paso && !previo.pasosSaltados.includes(paso)) {
    patch = { pasosSaltados: [...previo.pasosSaltados, paso] };
  } else if (accion === "retomar" && paso) {
    patch = { pasosSaltados: previo.pasosSaltados.filter((p) => p !== paso) };
  } else if (accion === "ocultar") {
    patch = { checklistOculta: true };
  } else if (accion === "mostrar") {
    patch = { checklistOculta: false };
  }
  return guardar(previo, patch, p);
}

export function registrarVideo(
  ctx: ContextoOnboarding,
  progreso: number,
  evento: EventoVideo,
): OnboardingState {
  const p = persistenciaEfectiva(ctx.persistencia);
  const previo = p.leer(ctx.userId, ctx.tenantId);
  const avance = registrar_progreso(previo, { progreso, tipo: evento });
  return guardar(previo, avance, p);
}

// TB-165: el puente antes vivía a mano en la ruta completar; concentrarlo acá
// evita que dos callers armen distinto el mismo OnboardingState. El paso del
// wizard se respeta (no se hardcodea) y el estado completo se normaliza al largo.
function completarDesde(
  previo: OnboardingState,
  wizard: WizardState,
  persistencia: PersistenciaOnboarding,
): OnboardingState {
  return guardar(
    previo,
    {
      wizardCompletado: true,
      wizardPaso: esCompleto(wizard) ? wizard.pasos.length : wizard.paso,
      wizardEmpleados: [...wizard.empleados],
      wizardRespuestas: { ...wizard.respuestas },
    },
    persistencia,
  );
}

export function completarWizard(
  ctx: ContextoOnboarding,
  wizard: WizardState,
): OnboardingState {
  const p = persistenciaEfectiva(ctx.persistencia);
  return completarDesde(p.leer(ctx.userId, ctx.tenantId), wizard, p);
}

// TB-165 [tenant]: la ruta entrega todas las respuestas y el puente arma el
// WizardState con las transiciones del módulo, sin estados sintéticos en HTTP.
// Antes sólo pasaba empleados y el resto se descartaba; ahora se fusiona con
// lo ya persistido.
export function completarWizardConRespuestas(
  ctx: ContextoOnboarding,
  respuestas: Record<string, string> | undefined,
  empleados: readonly string[] | undefined,
): OnboardingState {
  const p = persistenciaEfectiva(ctx.persistencia);
  const previo = p.leer(ctx.userId, ctx.tenantId);
  const wizard = marcarCompletado(
    retomar(
      previo.wizardPaso,
      { ...previo.wizardRespuestas, ...(respuestas ?? {}) },
      [...(empleados ?? previo.wizardEmpleados)],
      [],
    ),
  );
  return completarDesde(previo, wizard, p);
}

export function calcularChecklist(
  estado: OnboardingState,
  foto: FotoComercio,
): {
  pasos: ReturnType<typeof calcular_checklist>["pasos"];
  listos: number;
  total: number;
  oculta: boolean;
} {
  const { pasos } = calcular_checklist(foto);
  // TB-165 [rol]: «no aplica» sale de la persistencia del Dueño, no del cálculo puro.
  const conNoAplica = pasos.map((paso) => ({
    ...paso,
    noAplica: estado.pasosSaltados.includes(paso.id),
  }));
  const aplicables = conNoAplica.filter((paso) => !paso.noAplica);
  return {
    pasos: conNoAplica,
    listos: aplicables.filter((paso) => paso.listo).length,
    total: aplicables.length,
    oculta: estado.checklistOculta,
  };
}
