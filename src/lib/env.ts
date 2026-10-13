// Fuente única de variables de entorno del servidor.
// Por qué doble fuente: en `astro dev` Vite no copia el .env a
// process.env, solo inyecta import.meta.env. En producción las vars llegan
// por entorno real. Se prefiere process.env para poder rotar secretos sin
// rebuild, con fallback al .env vía import.meta.env.
export function leerVarEntorno(nombre: string, env: NodeJS.ProcessEnv = process.env): string {
  const deProceso = env[nombre];
  if (deProceso) return deProceso;
  const deMeta = (import.meta.env as unknown as Record<string, unknown>)[nombre];
  return typeof deMeta === "string" ? deMeta : "";
}
