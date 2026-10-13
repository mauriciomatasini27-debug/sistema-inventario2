import type { APIRoute } from "astro";
import { z } from "zod";

export const prerender = false;

// POST /api/lots/ocr-fecha — F12.3/F12.11 OCR fecha impresa envase.
// Acepta texto crudo tipo "VTO 03/2027", "Vence 12/25", propone fecha para confirmar.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ texto: z.string().min(1).max(500) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const t = parsed.data.texto.toUpperCase();
  // Patrones: MM/YYYY, MM/YY, DD/MM/YYYY.
  const m1 = t.match(/(0[1-9]|1[0-2])\s*\/\s*(20\d{2})/);
  const m2 = t.match(/(0[1-9]|1[0-2])\s*\/\s*(\d{2})(?!\d)/);
  const m3 = t.match(/(\d{1,2})\s*\/\s*(0[1-9]|1[0-2])\s*\/\s*(20\d{2})/);
  let propuesta: string | null = null;
  if (m3) {
    const dd = m3[1]!.padStart(2, "0");
    propuesta = `${m3[3]}-${m3[2]}-${dd}`;
  } else if (m1) {
    propuesta = `${m1[2]}-${m1[1]}-01`;
  } else if (m2) {
    const yy = Number(m2[2]);
    const full = yy >= 70 ? 1900 + yy : 2000 + yy;
    propuesta = `${full}-${m2[1]}-01`;
  }
  if (!propuesta) return Response.json({ error: "sin_fecha", texto: parsed.data.texto }, { status: 422 });
  return Response.json({ propuesta_fecha: propuesta, origen: "ocr_vencimiento", confirma_operador: true });
};
