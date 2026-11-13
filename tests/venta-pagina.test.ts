import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("venta.astro: el script principal se empaqueta", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("ningún <script> usa define:vars ni is:inline (rompen los imports)", () => {
    const tags = [...src().matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).not.toContain("define:vars");
      expect(tag).not.toContain("is:inline");
    }
  });

  it("el tenant va en un data-tenant que el script lee con dataset", () => {
    const s = src();
    expect(s).toMatch(/data-tenant=\{tenantId/);
    expect(s).toContain(".dataset.tenant");
  });
});

// P1-56: si Cobrar vuelve a armar lineas: [linea] desde el formulario, este test falla.
describe("venta.astro: carrito multiproducto y ticket local", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("Cobrar arma el POST desde el carrito, no desde una sola línea del formulario", () => {
    const s = src();
    expect(s).toContain('import { fusionarLinea, armarCobroDesdeCarrito }');
    expect(s).toContain("armarCobroDesdeCarrito({");
    expect(s).toMatch(/body:\s*JSON\.stringify\(vuelo\.payload\)/);
    expect(s).not.toMatch(/lineas:\s*\[\s*linea\s*\]/);
    expect(s).toContain('id="lista-carrito"');
    expect(s).toContain('id="tarjeta-ticket"');
    expect(s).toContain("DOCUMENTO NO VÁLIDO COMO FACTURA");
    expect(s).toMatch(/@media print[\s\S]*#tarjeta-ticket/);
    expect(s).toContain("aplicarTicketDefinitivoSiVisible");
    expect(s).toContain("construir_resumen_ticket");
    expect(s).toContain("construir_wa_me_url");
  });
});

// P1-59: si el cobro offline deja de avisar con el stock proyectado, este test falla.
describe("venta.astro: aviso de stock local en cero", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("después de encolar avisa si el proyectado queda en 0 y el cobro sigue", () => {
    const s = src();
    expect(s).toContain('import { avisoStockLocalAgotado, stockLocal } from "../offline/stock-local.js"');
    expect(s).toContain("El stock registrado de este producto ya estaba en 0");
    expect(s).toMatch(/storage\.setItem\(outboxKey[\s\S]*avisoStockLocalAgotado\(stockLocal\(/);
    expect(s).toMatch(/estado\("offline provisorio " \+ vuelo\.ticketBase\.provisorio \+ " encolado " \+ vuelo\.op_id \+ avisoAgotado\)/);
  });
});

describe("TB-161: escáner real en Vender", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("usa el visor modal, mensajes del módulo y devuelve el foco al buscador", () => {
    const s = src();
    expect(s).toContain('id="visor-camara"');
    expect(s).toContain("Escanear etiqueta");
    expect(s).toContain("mensajeErrorCamara");
    expect(s).toContain("motivoCamaraNoDisponible");
    expect(s).toContain("cerrarVisorCamara");
    expect(s).toMatch(/\$\("sku"\)\.focus\(\)/);
    expect(s).not.toContain("Simular lectura");
  });
});

describe("TB-162: cobro real y vuelto en efectivo", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("reusa el POST, marca Modo al cobrar y valida el monto recibido", () => {
    const s = src();
    expect(s).toContain('import { evaluarVueltoEfectivo, totalCentavosCarrito }');
    expect(s).toContain('id="efectivo-recibido"');
    expect(s).toContain('id="efectivo-vuelto"');
    expect(s).toContain('modoRaiz.dataset.modoCobrando');
    expect(s).toContain("recibido_insuficiente");
    expect(s).toContain('confirmarCobro.disabled = vacio || cobrando');
    expect(s).toContain('if (cobrando) return');
    expect(s).not.toMatch(/simulaci[oó]n/i);
    for (const medio of ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia", "A cuenta"]) {
      expect(s).toContain(`"${medio}"`);
    }
  });
});

describe("TB-160: buscador, ticket y paso de cobro", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("nace sin catálogo a la vista y con Cobrar apagado, distinto del flame", () => {
    const s = src();
    expect(s).toContain('id="resultados" hidden');
    expect(s).toContain('class="cobrar-apagado" disabled');
    expect(s).toContain("#cobrar.cobrar-apagado");
    expect(s).toContain("#cobrar.sg-flame-cta");
    expect(s).not.toContain("demo-sku-1");
    expect(s).toContain('id="paso-cobro"');
    expect(s).toContain('id="volver-ticket"');
    expect(s).toContain('id="confirmar-cobro"');
    expect(s).toContain('id="leer-camara"');
    expect(s).toContain("Escanear");
    expect(s).toContain("hitsCatalogoLocal");
    expect(s).toContain("efectoCodigoDesconocido().mensaje");
    expect(s).toContain("min-width: 44px; min-height: 44px");
  });

  it("un código desconocido con el nombre vacío no arma la línea", () => {
    const cuerpo = bloqueLectura(src());
    const vacio = cuerpo.indexOf('$("alta-nombre").value.trim() === ""');
    const aviso = cuerpo.indexOf("efectoCodigoDesconocido().mensaje", vacio);
    const retorno = cuerpo.indexOf("return;", aviso);
    const suma = cuerpo.lastIndexOf("agregarLineaDesdeFormulario()");
    expect(vacio).toBeGreaterThan(0);
    expect(aviso).toBeGreaterThan(vacio);
    expect(retorno).toBeGreaterThan(aviso);
    expect(suma).toBeGreaterThan(retorno);
  });

  it("Enter en el nombre vacío tampoco arma la línea", () => {
    const s = src();
    const i = s.indexOf('$("alta-nombre").addEventListener("keydown"');
    expect(i).toBeGreaterThan(0);
    const tecla = s.slice(i, i + 500);
    expect(tecla).toContain('ev.key !== "Enter"');
    const vacio = tecla.indexOf('$("alta-nombre").value.trim() === ""');
    const retorno = tecla.indexOf("return;", vacio);
    const suma = tecla.indexOf("agregarLineaDesdeFormulario()");
    expect(vacio).toBeGreaterThan(-1);
    expect(retorno).toBeGreaterThan(vacio);
    expect(suma).toBeGreaterThan(retorno);
  });
});

function bloqueLectura(s: string): string {
  const inicio = s.indexOf("const incorporarLectura");
  const fin = s.indexOf("const pintarResultados", inicio);
  return s.slice(inicio, fin);
}

describe("venta.astro: aviso de mora sin frenar Cobrar", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("suma los días al saldo y suelta el cobro si el servidor responde MORA", () => {
    const s = src();
    expect(s).toContain("Este cliente no está en la ficha.");
    expect(s).toContain('Saldo " + saldo + ". Sin tope.');
    expect(s).toContain('Saldo " + saldo + ". Disponible "');
    expect(s).toContain('" En mora: " + dias + " días con saldo."');
    expect(s).toMatch(/j\.codigo === "MORA"[\s\S]{0,180}cobroEnVuelo = null/);
    expect(s).toMatch(/j\.codigo === "MORA"[\s\S]{0,220}estado\(j\.error/);
  });

  it("CONFIRMACION_EXCESO pregunta antes de soltar el vuelo y reintenta la misma clave", () => {
    const s = src();
    const marca = s.indexOf('j.codigo === "CONFIRMACION_EXCESO"');
    const tope = s.indexOf('j.codigo === "TOPE_SUPERADO"');
    expect(marca).toBeGreaterThan(0);
    expect(tope).toBeGreaterThan(marca);
    const bloque = s.slice(marca, tope);
    const pregunta = bloque.indexOf("confirmar(");
    const suelta = bloque.indexOf("cobroEnVuelo = null");
    expect(pregunta).toBeGreaterThan(-1);
    expect(suelta).toBeGreaterThan(pregunta);
    expect(bloque).toContain("confirmado_exceso: true");
    expect(s).toContain('import { confirmar } from "../lib/confirmar-dom.js"');
    expect(s).toContain("<ConfirmDialog");
  });
});
