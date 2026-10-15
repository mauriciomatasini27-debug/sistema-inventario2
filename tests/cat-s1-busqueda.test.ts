import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { GET as GETProducts, POST as POSTProducts } from "../src/pages/api/products.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

interface ProductoListado {
  sku: string;
  iniciales: string;
  fotoUrl: string | null;
}

async function cuerpo(res: Response): Promise<{ productos: ProductoListado[] }> {
  return (await res.json()) as { productos: ProductoListado[] };
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

describe("P3-1 CAT-S1 busqueda difusa + iniciales/foto en GET /api/products", () => {
  it("q difusa, codigo, iniciales y fotoUrl; 422 foto y 409 codigo", async () => {
    const altaCafe = (await POSTProducts(
      ctx("http://x/api/products", {
        body: {
          sku: "CAFE-1",
          nombre: "Café Torrado",
          precio_centavos: 3000,
          codigo: "779001",
          foto: { url: "https://cdn.example/cafe.webp", ancho: 800, alto: 800, bytes: 150000 },
        },
      }),
    )) as Response;
    expect(altaCafe.status).toBe(201);
    const altaYerba = (await POSTProducts(
      ctx("http://x/api/products", { body: { sku: "YERBA-1", nombre: "Yerba Mate", precio_centavos: 5000 } }),
    )) as Response;
    expect(altaYerba.status).toBe(201);

    const porCafe = (await GETProducts(ctx("http://x/api/products?q=cafe"))) as Response;
    const jCafe = await cuerpo(porCafe);
    expect(jCafe.productos.length).toBe(1);
    expect(jCafe.productos[0]?.sku).toBe("CAFE-1");
    expect(jCafe.productos[0]?.iniciales).toBe("CT");
    expect(jCafe.productos[0]?.fotoUrl).toBe("https://cdn.example/cafe.webp");

    const porYerva = (await GETProducts(ctx("http://x/api/products?q=yerva"))) as Response;
    const jYerva = await cuerpo(porYerva);
    expect(jYerva.productos.length).toBe(1);
    expect(jYerva.productos[0]?.sku).toBe("YERBA-1");
    expect(jYerva.productos[0]?.iniciales).toBe("YM");
    expect(jYerva.productos[0]?.fotoUrl).toBe(null);

    const porCodigo = (await GETProducts(ctx("http://x/api/products?codigo=779001"))) as Response;
    const jCodigo = await cuerpo(porCodigo);
    expect(jCodigo.productos.length).toBe(1);
    expect(jCodigo.productos[0]?.sku).toBe("CAFE-1");
    expect(jCodigo.productos[0]?.iniciales).toBe("CT");

    const fotoAncha = (await POSTProducts(
      ctx("http://x/api/products", {
        body: {
          sku: "ANCHA-1",
          nombre: "Ancha",
          precio_centavos: 100,
          foto: { url: "https://cdn.example/ancha.webp", ancho: 801, alto: 800, bytes: 100 },
        },
      }),
    )) as Response;
    expect(fotoAncha.status).toBe(422);

    const fotoPesada = (await POSTProducts(
      ctx("http://x/api/products", {
        body: {
          sku: "PESADA-1",
          nombre: "Pesada",
          precio_centavos: 100,
          foto: { url: "https://cdn.example/pesada.webp", ancho: 800, alto: 800, bytes: 204801 },
        },
      }),
    )) as Response;
    expect(fotoPesada.status).toBe(422);

    const codigoRepetido = (await POSTProducts(
      ctx("http://x/api/products", { body: { sku: "OTRA-1", nombre: "Otra", precio_centavos: 100, codigo: "779001" } }),
    )) as Response;
    expect(codigoRepetido.status).toBe(409);
  });
});
