// Perfil demo fiscal SOLO-FAKE (ADR-0019 slice mínimo).
// No sirve para homo real: homo real requiere cert homo + PV WS (ver docs/adr/0018-fiscal-arca.md).
// Uso: desarrollo local + tests con crear_homo_fake() en src/modules/fiscal/homo-fake.ts.
// Sin secretos, sin red, sin validez fiscal.
export const FISCAL_DEMO_PERFIL = {
  cuit: "20933331726",
  cuitFormateado: "20-93333172-6",
  condicionIva: "monotributo",
  puntoVenta: "3",
  ptoVta: 3,
  cbteTipo: 11,
  modo: "automatico",
  ambiente: "homo-fake",
} as const;

export const FISCAL_DEMO_SECUENCIA_INICIAL = {
  puntoVenta: "3",
  cbteTipo: "11",
  lastNumber: 0,
} as const;

export const FISCAL_DEMO_VENTA = {
  saleId: "demo-s1",
  totalCentavos: 266000n,
  cbteFch: "20261010",
} as const;
