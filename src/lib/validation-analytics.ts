import { z } from "zod";

// Borde RT7/RT8/RT9/RT11: listas cerradas, mismo estilo que validation.ts.
export const analyticsQuerySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  texto: z.string().max(64).optional(),
  categoria: z.string().max(64).optional(),
  ubicacion: z.string().max(64).optional(),
  orden: z.enum(["neto", "rotacion", "cobertura", "valorizado", "sinventa"]).default("neto"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().max(128).nullable().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(50),
  cobertura_ventana_dias: z.enum(["14", "28", "56"]).default("28"),
});

export const snapshotSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origen: z.enum(["manual", "viernes18h", "export", "offline"]).default("manual"),
});

export const exportSchema = z.object({
  formato: z.enum(["csv", "pdf"]),
  snapshot_id: z.string().min(1).max(128),
});

export const promoPreviewSchema = z.object({
  pct: z.union([z.literal(10), z.literal(15), z.literal(20)]),
  skus: z.array(z.string().min(1).max(64)).min(1).max(10),
});

export const promoConfirmSchema = promoPreviewSchema.extend({
  confirmado: z.literal(true),
  idempotency_key: z.string().min(1).max(128),
});

export const offlinePackSchema = z.object({
  alcance: z.enum(["7d", "30d", "mes"]),
});

export const reponerAddSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().min(1).max(64),
        qty: z.number().int().min(1).max(9999),
      }),
    )
    .min(1)
    .max(10),
  idempotency_key: z.string().min(1).max(128),
});
