import type { APIRoute } from "astro";
import { generarPlantillaCsv } from "../../../../modules/inventario/importacion.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  const csv = generarPlantillaCsv();
  return new Response(csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-stock.csv"',
    },
  });
};
