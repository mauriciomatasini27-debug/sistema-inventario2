import type { APIRoute } from "astro";
import { manejarConfirmarConteo } from "../../../../lib/confirmar-conteo.js";

export const prerender = false;

// POST /api/counts/:id/confirmar — alias de PATCH /api/counts?id= (CAT-S6).
// Misma via que el PATCH; acá solo cambia de dónde sale el id.
export const POST: APIRoute = async ({ request, params }) => manejarConfirmarConteo(request, params.id ?? "");
