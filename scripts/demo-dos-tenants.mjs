// Demo PRD-E2E-01: crea los dos tenants de ejemplo y verifica el flujo.
// Uso: DEMO_SESSION=<valor de __Host-sesion> node scripts/demo-dos-tenants.mjs
// Idempotente: reuso por request_key (409 con tenant_id cuenta como OK).
// Nunca imprime la cookie.
const base = process.env.DEMO_BASE_URL ?? "http://localhost:4321";
const session = process.env.DEMO_SESSION ?? "";
if (!session) {
  console.error("FAIL falta DEMO_SESSION con el valor de la cookie __Host-sesion");
  process.exit(1);
}
const cookie = `__Host-sesion=${session}`;
let fallos = 0;
function check(nombre, cond, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${nombre}${detalle ? ` ${detalle}` : ""}`);
  if (!cond) fallos += 1;
}
async function post(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function get(path) {
  const r = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto };
}
const ses0 = await get("/api/auth/sesion-actual");
check("sesion valida", ses0.status === 200 && ses0.json?.logueado === true);
const alta1 = await post("/api/onboarding/alta", {
  nombre_comercio: "Kiosco Lo de Mauri",
  rubro: "kiosco",
  request_key: "demo-e2e-t1",
});
const t1 = alta1.json?.tenant_id;
check("alta kiosco dueno", (alta1.status === 201 || alta1.status === 409) && typeof t1 === "string", `status=${alta1.status}`);
const alta2 = await post("/api/tenants", {
  nombre_comercio: "Almacén Don Pepe",
  plan: "demo",
  moneda: "ARS",
  owner_google_sub: "demo-almacen-01",
  request_key: "demo-e2e-t2",
});
const t2 = alta2.json?.tenant_id;
check(
  "alta almacen demo",
  (alta2.status === 201 || alta2.status === 409) && typeof t2 === "string",
  `status=${alta2.status}`,
);
if (alta2.status === 403) console.error("HINT falta SUPERADMIN_SUBS con tu googleSub en .env + reiniciar dev");
if (t1) {
  const est = await get(`/api/onboarding/estado?tenant_id=${t1}`);
  check("estado tenant kiosco", est.status === 200, `status=${est.status}`);
}
for (const [nombre, path, esperado] of [
  ["landing", "/", 200],
  ["panel", "/panel", 200],
  ["venta", "/venta", 200],
]) {
  const r = await get(path);
  check(`pagina ${nombre}`, r.status === esperado, `status=${r.status}`);
}
const ses = await get("/api/auth/sesion-actual");
check("sesion-actual logueado", ses.status === 200 && ses.json?.logueado === true);
console.log(`TENANTS t1=${t1 ?? "?"} t2=${t2 ?? "?"}`);
process.exit(fallos > 0 ? 1 : 0);
