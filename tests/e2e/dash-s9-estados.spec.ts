import { expect, test, type Page, type Route } from "@playwright/test";

const preguntas = [
  { texto: "¿Cuánto vendí este mes?", herramienta: "ventas_periodo" },
  { texto: "¿Cuánto hay en caja?", herramienta: "caja_dia" },
];

const cifras = [{ etiqueta: "Total en caja", valor: "$ 2.500,00" }];

function cupo(usado: number) {
  return {
    usado,
    cupo: 100,
    restante: 100 - usado,
    agotado: false,
    reinicia_el: "2026-11-01",
    explicacion: "",
  };
}

function respuestaOk(route: Route) {
  return route.fulfill({
    json: {
      texto: "Hay $ 2.500,00 en caja.",
      rechazada: false,
      herramienta: "caja_dia",
      cifras,
      reporte: { href: "/panel/caja", etiqueta: "caja" },
    },
  });
}

async function abrirDrawer(page: Page) {
  await page.goto("/panel");
  await page.locator("#asistente-abrir").click();
  await expect(page.locator("#asistente-drawer")).toBeVisible();
}

test("error de red muestra el mensaje y Reintentar reenvía la misma pregunta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let post = 0;
  await page.route("**/api/asistente", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { incluido: true, explicacion: "", preguntas, cupo: cupo(3) } });
    }
    post += 1;
    if (post === 1) return route.abort("failed");
    return respuestaOk(route);
  });

  await abrirDrawer(page);
  await page.locator("#asistente-pregunta").fill("¿Cuánto hay en caja?");
  await page.locator("#asistente-enviar").click();

  await expect(page.locator("#asistente-estado")).toHaveText("Sin conexión. Revisá internet y reintentá.");
  const reintentar = page.getByRole("button", { name: "Reintentar" });
  await expect(reintentar).toBeVisible();
  await reintentar.click();

  await expect(page.locator("#asistente-respuesta")).toHaveText("Hay $ 2.500,00 en caja.");
  await expect(page.locator("#asistente-estado")).toHaveText("");
  await expect(reintentar).toBeHidden();
  expect(post).toBe(2);
});

test("cupo agotado deshabilita input y chips y muestra la fecha de reinicio", async ({ page }) => {
  await page.route("**/api/asistente", (route) =>
    route.fulfill({
      json: {
        incluido: true,
        explicacion: "",
        preguntas,
        cupo: {
          usado: 100,
          cupo: 100,
          restante: 0,
          agotado: true,
          reinicia_el: "2026-11-01",
          explicacion: "Llegaste al cupo del mes. Se reinicia el 1/11.",
        },
      },
    }),
  );

  await abrirDrawer(page);
  await expect(page.locator("#asistente-pregunta")).toBeDisabled();
  await expect(page.locator("#asistente-enviar")).toBeDisabled();
  for (const chip of await page.locator("[data-asistente-chip]").all()) {
    await expect(chip).toBeDisabled();
  }
  await expect(page.locator("#asistente-estado")).toContainText("1/11");
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeHidden();
  await expect(page.locator("#asistente-medidor-texto")).toHaveText("Te quedan 0 de 100 consultas este mes");
});

test("el medidor muestra las consultas restantes y baja tras una respuesta que gastó cupo", async ({ page }) => {
  await page.route("**/api/asistente", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { incluido: true, explicacion: "", preguntas, cupo: cupo(3) } })
      : respuestaOk(route),
  );

  await abrirDrawer(page);
  await expect(page.locator("#asistente-medidor-texto")).toHaveText("Te quedan 97 de 100 consultas este mes");
  await expect(page.locator("#asistente-medidor-barra")).toHaveAttribute("aria-valuenow", "3");
  await expect(page.locator("#asistente-medidor-barra")).toHaveAttribute("aria-valuemax", "100");

  await page.getByRole("button", { name: "¿Cuánto hay en caja?" }).click();
  await expect(page.locator("#asistente-respuesta")).toHaveText("Hay $ 2.500,00 en caja.");
  await expect(page.locator("#asistente-medidor-texto")).toHaveText("Te quedan 96 de 100 consultas este mes");
});

test("la consulta que gasta la última del mes deja la respuesta y deshabilita el input", async ({ page }) => {
  await page.route("**/api/asistente", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { incluido: true, explicacion: "", preguntas, cupo: cupo(99) } })
      : respuestaOk(route),
  );

  await abrirDrawer(page);
  await expect(page.locator("#asistente-medidor-texto")).toHaveText("Te quedan 1 de 100 consultas este mes");
  await page.getByRole("button", { name: "¿Cuánto hay en caja?" }).click();
  await expect(page.locator("#asistente-respuesta")).toHaveText("Hay $ 2.500,00 en caja.");
  await expect(page.locator("#asistente-medidor-texto")).toHaveText("Te quedan 0 de 100 consultas este mes");
  await expect(page.locator("#asistente-pregunta")).toBeDisabled();
  await expect(page.locator("#asistente-estado")).toContainText("1/11");
});

for (const tema of ["light", "dark"] as const) {
  test(`estados a 360 px sin desborde horizontal (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.route("**/api/asistente", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { incluido: true, explicacion: "", preguntas, cupo: cupo(3) } })
        : route.abort("failed"),
    );

    await abrirDrawer(page);
    await page.getByRole("button", { name: "¿Cuánto hay en caja?" }).click();
    await expect(page.locator("#asistente-estado")).toHaveText("Sin conexión. Revisá internet y reintentá.");
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

    const caja = await page.locator("#asistente-drawer").boundingBox();
    expect(caja).not.toBeNull();
    expect(Math.round(caja!.width)).toBe(360);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
    await page.locator("#asistente-drawer").screenshot({ path: `test-results/dash-s9-360-${tema}.png` });
  });
}
