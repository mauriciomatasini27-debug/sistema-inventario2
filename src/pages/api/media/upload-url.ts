import type { APIRoute } from "astro";
import { z } from "zod";
import { createHmac } from "node:crypto";

export const prerender = false;

const bodySchema = z.object({
  content_type: z.enum(["image/jpeg", "image/webp"]),
  bytes: z.number().int().min(1).max(2 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  modulo_origen: z.enum(["inventory", "purchases", "tickets"]),
});

// POST /api/media/upload-url — CH-S2 / PWA-S4.
// Emite URL firmada para subir foto (800px/200KB, ≤2MB). Stub local HMAC 15min;
// R2 real va por env MEDIA_R2_* (documentado, no cableado aún).
// 409 mismo hash (dedupe journal photos_queue futuro).
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const secreto = process.env.MEDIA_UPLOAD_SECRET ?? process.env.JOBS_SECRET ?? "dev-media-secret-solo-tests";
  const expiraEn = Date.now() + 15 * 60_000;
  const objectKey = `fotos/${parsed.data.modulo_origen}/${parsed.data.sha256.slice(0, 2)}/${parsed.data.sha256}.jpg`;
  const firma = createHmac("sha256", secreto)
    .update(`${objectKey}:${parsed.data.sha256}:${expiraEn}`)
    .digest("hex");

  const base = process.env.MEDIA_UPLOAD_BASE ?? "/api/media/subir";
  const uploadUrl = `${base}?key=${encodeURIComponent(objectKey)}&exp=${expiraEn}&sig=${firma}`;
  return Response.json({ upload_url: uploadUrl, object_key: objectKey, expira_en: new Date(expiraEn).toISOString() }, { status: 201 });
};
