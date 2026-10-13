// Video ON6 sin UX. Solo tracking y config URL. Sin grabar ni hostear.
export function video_url(env: NodeJS.ProcessEnv = process.env): string {
  return env.ONBOARDING_VIDEO_URL ?? "";
}

export function registrar_progreso(
  estado: { videoProgreso: number; videoVisto: boolean },
  evento: { progreso: number; tipo: "inicio" | "mitad" | "fin" },
): { videoProgreso: number; videoVisto: boolean } {
  const progreso = Math.max(0, Math.min(100, evento.progreso));
  return { videoProgreso: progreso, videoVisto: evento.tipo === "fin" ? true : estado.videoVisto };
}
