// Dispositivos y cierre remoto P0 (AU9.1-AU9.4). Núcleo puro: sin IO.
// El adaptador (ruta) carga registros de `sessions` ya existentes y aplica el
// resultado. Cerrar sesiones no revoca la membership (AU9.2): el usuario
// puede volver a entrar con Google; revocar es AU7.

export interface SesionRegistro {
  idHash: string;
  googleSub: string;
  tenantId: string | null;
  expiraAt: string;
  expiraAbsoluta?: string | undefined;
  lastSeenAt?: string | undefined;
  revocadaAt?: string | undefined;
  agente?: string | undefined;
  dispositivoCodigo?: string | undefined;
}

export interface SesionVisible {
  idHash: string;
  esActual: boolean;
  ultimaActividad: string | null;
  dispositivo: string;
  tenantId: string | null;
}

// Por qué nombre legible con fallback: si el Dueño nombró el dispositivo
// (AU9.3, "PC del mostrador") se muestra ese; si no, el agente capturado en
// el login ("Chrome en Android"); si no hay nada, "Este dispositivo" o
// "Dispositivo" según sea la actual.
export function nombreDispositivoDe(opts: {
  agente?: string | undefined;
  nombreAsignado?: string | undefined;
  esActual: boolean;
}): string {
  if (opts.nombreAsignado?.trim()) return opts.nombreAsignado.trim().slice(0, 40);
  if (opts.agente?.trim()) return opts.agente.trim().slice(0, 80);
  return opts.esActual ? "Este dispositivo" : "Dispositivo";
}

export function esSesionActiva(s: SesionRegistro, ahora: Date): boolean {
  if (s.revocadaAt) return false;
  if (new Date(s.expiraAt).getTime() <= ahora.getTime()) return false;
  if (s.expiraAbsoluta && new Date(s.expiraAbsoluta).getTime() <= ahora.getTime()) return false;
  return true;
}

export function listarSesionesPropias(input: {
  sesiones: readonly SesionRegistro[];
  googleSub: string;
  idActualHash: string;
  nombres: ReadonlyMap<string, string>;
  ahora?: Date | undefined;
}): SesionVisible[] {
  const ahora = input.ahora ?? new Date();
  return input.sesiones
    .filter((s) => s.googleSub === input.googleSub && esSesionActiva(s, ahora))
    .map((s) => ({
      idHash: s.idHash,
      esActual: s.idHash === input.idActualHash,
      ultimaActividad: s.lastSeenAt ?? null,
      dispositivo: nombreDispositivoDe({
        agente: s.agente,
        nombreAsignado: s.dispositivoCodigo ? input.nombres.get(s.dispositivoCodigo) : undefined,
        esActual: s.idHash === input.idActualHash,
      }),
      tenantId: s.tenantId,
    }))
    .sort((a, b) => Number(b.esActual) - Number(a.esActual));
}

// Vista del Dueño sobre un miembro (AU9.2). No incluye la sesión actual del
// Dueño salvo que el objetivo sea él mismo.
export function listarSesionesDeMiembro(input: {
  sesiones: readonly SesionRegistro[];
  googleSubObjetivo: string;
  idActualHash: string;
  nombres: ReadonlyMap<string, string>;
  ahora?: Date | undefined;
}): SesionVisible[] {
  return listarSesionesPropias({
    sesiones: input.sesiones,
    googleSub: input.googleSubObjetivo,
    idActualHash: input.idActualHash,
    nombres: input.nombres,
    ahora: input.ahora,
  });
}

export type MotivoCierre =
  | "ok"
  | "no_permitido"
  | "no_encontrada"
  | "ya_cerrada";

export function decidirCierrePropio(input: {
  objetivoHash: string | "todas_menos_actual";
  idActualHash: string;
  sesiones: readonly SesionRegistro[];
  googleSub: string;
}): { permite: boolean; motivo: MotivoCierre } {
  if (input.objetivoHash === "todas_menos_actual") return { permite: true, motivo: "ok" };
  const s = input.sesiones.find((x) => x.idHash === input.objetivoHash);
  if (!s || s.googleSub !== input.googleSub) return { permite: false, motivo: "no_encontrada" };
  if (s.revocadaAt) return { permite: false, motivo: "ya_cerrada" };
  return { permite: true, motivo: "ok" };
}

// Cierre por el Dueño sobre otro usuario (AU9.2): requiere rol dueño y no
// toca la membership. El adaptador verifica el rol con `esDueno`.
export function decidirCierreDeDueno(input: {
  esDueno: boolean;
  objetivo: SesionRegistro | undefined;
}): { permite: boolean; motivo: MotivoCierre } {
  if (!input.esDueno) return { permite: false, motivo: "no_permitido" };
  if (!input.objetivo) return { permite: false, motivo: "no_encontrada" };
  if (input.objetivo.revocadaAt) return { permite: false, motivo: "ya_cerrada" };
  return { permite: true, motivo: "ok" };
}

export function aplicarCierre(input: {
  sesiones: SesionRegistro[];
  hashes: readonly string[];
  ahora?: Date | undefined;
  motivo?: string | undefined;
}): number {
  const ahoraIso = (input.ahora ?? new Date()).toISOString();
  let n = 0;
  for (const s of input.sesiones) {
    if (input.hashes.includes(s.idHash) && !s.revocadaAt) {
      s.revocadaAt = ahoraIso;
      n += 1;
    }
  }
  return n;
}

// Nombre de dispositivo del local (AU9.3): corto, sin control chars.
export function validarNombreDispositivo(nombre: string): { ok: boolean; valor?: string } {
  const v = nombre.trim().replace(/\s+/g, " ");
  if (v.length < 1 || v.length > 40) return { ok: false };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return { ok: false };
  return { ok: true, valor: v };
}
