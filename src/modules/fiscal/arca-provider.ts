// ArcaProvider real homo/prod (ADR-0018 D1-D5, ADR-0019 slice).
// Solo servidor: cert/key desde env, nunca cliente/repo/DB. Homo por defecto.
// TA cache memoria 12 h por (ambiente, cuitProveedor) con lock + doble check.
// En Postgres el lock es pg_advisory_xact_lock; acá mutex monoproceso slice.
import { armar_tra_xml, firmar_tra_cms, tra_times, WSAA_SERVICE } from "./tra.js";
import { fe_consultar, fe_solicitar, fe_ultimo, login_cms } from "./wsfe.js";
import type { ConsultaEsperada, FiscalProvider, PedidoAutorizable } from "./fiscal.js";

export interface ArcaConfig {
  readonly ambiente: "homo" | "prod";
  readonly cuitProveedor: string;
  readonly certPem: string;
  readonly keyPem: string;
}

export interface TaDurable {
  leer(): Promise<{ token: string; sign: string; expiraEn: number } | null>;
  guardar(ta: { token: string; sign: string; expiraEn: number }): Promise<void>;
}

type FeSolicitarFn = typeof fe_solicitar;
type FeUltimoFn = typeof fe_ultimo;
type FeConsultarFn = typeof fe_consultar;

export interface DepsArca {
  readonly ta?: TaDurable;
  readonly login?: (ambiente: "homo" | "prod", cmsBase64: string) => Promise<{ token: string; sign: string }>;
  readonly fe_solicitar?: FeSolicitarFn;
  readonly fe_ultimo?: FeUltimoFn;
  readonly fe_consultar?: FeConsultarFn;
  // FE-S21: etiqueta opcional para cola/métricas por comercio en autorizar_c.
  readonly tenantId?: string;
}

// FE-S21: métricas ARCA + archivo de pedido/respuesta sin secretos (memoria del proceso).
export interface MetricasColaFiscal {
  readonly pendientes: number;
  readonly pendienteMasViejoEn: number | null;
}

export interface SnapshotColaFiscalPorTenant {
  readonly tenantId: string;
  readonly cola: MetricasColaFiscal;
}

export interface MetricasArcaResumen {
  readonly llamadas: number;
  readonly latenciaMsPromedio: number | null;
  readonly rechazosPorCodigo: Readonly<Record<string, number>>;
  readonly colaPorComercio: Readonly<Record<string, MetricasColaFiscal>>;
  readonly antiguedadPendienteMasViejoMs: number | null;
}

export interface EntradaAuditoriaArca {
  readonly id: string;
  readonly en: number;
  readonly operacion: string;
  readonly tenantId: string | null;
  readonly pedido: unknown;
  readonly respuesta: unknown;
}

const CLAVE_SECRETA_ARCA =
  /^(token|sign|key|clave|cert|password|secret|cms|key_pem|cert_pem|token_ciphertext|sign_ciphertext|key_ciphertext)$/i;
const ARCHIVO_AUDITORIA_MAX = 500;

let latenciaSumaMs = 0;
let latenciaN = 0;
const rechazosPorCodigo = new Map<string, number>();
const colaPorTenant = new Map<string, MetricasColaFiscal>();
const archivoAuditoria: EntradaAuditoriaArca[] = [];
let archivoSeq = 0;

export function sanitizar_payload_arca(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizar_payload_arca);
  if (valor !== null && typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVE_SECRETA_ARCA.test(k)) continue;
      out[k] = sanitizar_payload_arca(v);
    }
    return out;
  }
  if (typeof valor === "string") {
    return valor
      .replace(/<Token>[^<]*<\/Token>/gi, "<Token>[redactado]</Token>")
      .replace(/<Sign>[^<]*<\/Sign>/gi, "<Sign>[redactado]</Sign>");
  }
  return valor;
}

export function limpiar_metricas_y_auditoria_arca(): void {
  latenciaSumaMs = 0;
  latenciaN = 0;
  rechazosPorCodigo.clear();
  colaPorTenant.clear();
  archivoAuditoria.length = 0;
  archivoSeq = 0;
}

export function actualizar_cola_fiscal_por_tenant(snapshots: ReadonlyArray<SnapshotColaFiscalPorTenant>): void {
  colaPorTenant.clear();
  for (const s of snapshots) {
    colaPorTenant.set(s.tenantId, s.cola);
  }
}

export function leer_metricas_arca(): MetricasArcaResumen {
  const rechazos: Record<string, number> = {};
  for (const [k, v] of rechazosPorCodigo) rechazos[k] = v;
  const cola: Record<string, MetricasColaFiscal> = {};
  for (const [k, v] of colaPorTenant) cola[k] = v;
  let antiguedad: number | null = null;
  const ahora = Date.now();
  for (const c of colaPorTenant.values()) {
    if (c.pendienteMasViejoEn == null || c.pendientes <= 0) continue;
    const edad = Math.max(0, ahora - c.pendienteMasViejoEn);
    if (antiguedad === null || edad > antiguedad) antiguedad = edad;
  }
  return {
    llamadas: latenciaN,
    latenciaMsPromedio: latenciaN > 0 ? Math.round(latenciaSumaMs / latenciaN) : null,
    rechazosPorCodigo: rechazos,
    colaPorComercio: cola,
    antiguedadPendienteMasViejoMs: antiguedad,
  };
}

export function leer_archivo_auditoria_arca(limite = ARCHIVO_AUDITORIA_MAX): readonly EntradaAuditoriaArca[] {
  const n = Math.max(1, limite);
  return archivoAuditoria.slice(-n);
}

function registrar_latencia_arca(ms: number): void {
  latenciaSumaMs += ms;
  latenciaN += 1;
}

function registrar_rechazo_arca(codigo: string): void {
  const k = codigo.trim() || "desconocido";
  rechazosPorCodigo.set(k, (rechazosPorCodigo.get(k) ?? 0) + 1);
}

function guardar_entrada_auditoria_arca(
  operacion: string,
  tenantId: string | null,
  pedido: unknown,
  respuesta: unknown,
): void {
  archivoSeq += 1;
  const entrada: EntradaAuditoriaArca = {
    id: `arca-audit-${archivoSeq}`,
    en: Date.now(),
    operacion,
    tenantId,
    pedido: sanitizar_payload_arca(pedido),
    respuesta: sanitizar_payload_arca(respuesta),
  };
  archivoAuditoria.push(entrada);
  if (archivoAuditoria.length > ARCHIVO_AUDITORIA_MAX) {
    archivoAuditoria.splice(0, archivoAuditoria.length - ARCHIVO_AUDITORIA_MAX);
  }
}

async function medir_llamada_arca<T>(
  operacion: string,
  tenantId: string | null,
  pedido: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const respuesta = await fn();
    registrar_latencia_arca(Date.now() - t0);
    guardar_entrada_auditoria_arca(operacion, tenantId, pedido, respuesta);
    return respuesta;
  } catch (e) {
    registrar_latencia_arca(Date.now() - t0);
    const msg = e instanceof Error ? e.message : String(e);
    const codigo = /\b(\d{5})\b/.exec(msg)?.[1] ?? (msg.includes("ARCA rechazo") ? msg.replace(/^ARCA rechazo\s*/i, "resultado-") : "error-red");
    registrar_rechazo_arca(codigo);
    guardar_entrada_auditoria_arca(operacion, tenantId, pedido, { error: msg });
    throw e;
  }
}

function pedido_a_auditoria(pedido: PedidoAutorizable): Record<string, unknown> {
  const base: Record<string, unknown> = {
    cbteTipo: pedido.cbteTipo,
    ptoVta: pedido.ptoVta,
    cbteDesde: pedido.cbteDesde,
    cbteHasta: pedido.cbteHasta,
    cbteFch: pedido.cbteFch,
    docTipo: pedido.docTipo,
    docNro: pedido.docNro.toString(),
    impTotal: pedido.impTotal.toString(),
  };
  if ("impIVA" in pedido) base.impIVA = pedido.impIVA.toString();
  return base;
}

interface FeSolicitarExtendido {
  readonly cae: string;
  readonly caeVto: string;
  readonly resultado: string;
  readonly codigoRechazo?: string;
}

const TA_TTL_MS = 12 * 60 * 60 * 1000;
const RENOVAR_ANTES_MS = 60 * 60 * 1000;

interface TaCache {
  token: string;
  sign: string;
  expiraEn: number;
}

const taCache = new Map<string, TaCache>();
let taInflight: Promise<TaCache> | null = null;
// D3: tras error WSAA no-alreadyAuthenticated, espera 60 s antes de reintentar.
let lastWsaaErrorAt = 0;
const WSAA_BACKOFF_MS = 60_000;

export function limpiar_wsaa_backoff(): void {
  lastWsaaErrorAt = 0;
}

function es_already_authenticated(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("alreadyAuthenticated");
}

function cacheKey(cfg: ArcaConfig): string {
  return `${cfg.ambiente}:${cfg.cuitProveedor}:${WSAA_SERVICE}`;
}

function centavos_a_decimal(c: bigint): string {
  const neg = c < 0n ? "-" : "";
  const abs = c < 0n ? -c : c;
  const enteros = abs / 100n;
  const resto = (abs % 100n).toString().padStart(2, "0");
  return `${neg}${enteros.toString()}.${resto}`;
}

export function limpiar_ta_cache(): void {
  taCache.clear();
  taInflight = null;
  lastWsaaErrorAt = 0;
}

export function crear_arca_provider(cfg: ArcaConfig, deps: DepsArca = {}): FiscalProvider {
  const login = deps.login ?? login_cms;
  const feSol = deps.fe_solicitar ?? fe_solicitar;
  const feUlt = deps.fe_ultimo ?? fe_ultimo;
  const feCon = deps.fe_consultar ?? fe_consultar;
  const tenantId = deps.tenantId ?? null;

  async function leerDurable(): Promise<TaCache | null> {
    if (!deps.ta) return null;
    try {
      const d = await deps.ta.leer();
      if (!d || d.expiraEn - Date.now() <= RENOVAR_ANTES_MS) return null;
      return { token: d.token, sign: d.sign, expiraEn: d.expiraEn };
    } catch (e) {
      console.warn("fiscal: no se pudo leer la TA durable", e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function persistirDurable(ta: TaCache): Promise<void> {
    if (!deps.ta) return;
    try {
      await deps.ta.guardar({ token: ta.token, sign: ta.sign, expiraEn: ta.expiraEn });
    } catch (e) {
      console.warn("fiscal: no se pudo persistir la TA", e instanceof Error ? e.message : String(e));
    }
  }

  async function get_ta(): Promise<{ token: string; sign: string }> {
    const key = cacheKey(cfg);
    const ahora = Date.now();
    const hit = taCache.get(key);
    if (hit && hit.expiraEn - ahora > RENOVAR_ANTES_MS) return { token: hit.token, sign: hit.sign };
    if (taInflight) return taInflight.then((t) => ({ token: t.token, sign: t.sign }));
    if (Date.now() - lastWsaaErrorAt < WSAA_BACKOFF_MS) {
      throw new Error("wsaa_backoff_60s");
    }
    taInflight = (async (): Promise<TaCache> => {
      const doble = taCache.get(key);
      if (doble && doble.expiraEn - Date.now() > RENOVAR_ANTES_MS) return doble;
      // Segundo worker: la TA persistida por otro proceso evita pedir otra.
      const durable = await leerDurable();
      if (durable) {
        taCache.set(key, durable);
        return durable;
      }
      const t = tra_times(new Date());
      const tra = armar_tra_xml({ ...t, service: WSAA_SERVICE });
      const cms = firmar_tra_cms(tra, cfg.certPem, cfg.keyPem);
      try {
        const { token, sign } = await login(cfg.ambiente, cms);
        const fresh: TaCache = { token, sign, expiraEn: Date.now() + TA_TTL_MS };
        taCache.set(key, fresh);
        await persistirDurable(fresh);
        return fresh;
      } catch (e) {
        // alreadyAuthenticated: otro worker ganó; relee caché en vez de backoff.
        if (!es_already_authenticated(e)) lastWsaaErrorAt = Date.now();
        throw e;
      }
    })();
    try {
      const r = await taInflight;
      return { token: r.token, sign: r.sign };
    } finally {
      taInflight = null;
    }
  }

  return {
    get_ta,
    async ultimo_autorizado(cuit: string, ptoVta: number, cbteTipo: number): Promise<number> {
      const ta = await get_ta();
      return medir_llamada_arca(
        "FECompUltimoAutorizado",
        tenantId,
        { ptoVta, cbteTipo, cuit },
        () => feUlt(cfg.ambiente, { ...ta, cuit }, ptoVta, cbteTipo),
      );
    },
    async autorizar_c(pedido: PedidoAutorizable, authCuit: string): Promise<{ cae: string; caeVto: string; raw: unknown }> {
      const ta = await get_ta();
      const esB =
        pedido.cbteTipo === 6 ||
        pedido.cbteTipo === 1 ||
        pedido.cbteTipo === 8 ||
        pedido.cbteTipo === 3 ||
        pedido.cbteTipo === 7 ||
        pedido.cbteTipo === 2;
      const detAlic =
        esB && "alicIva" in pedido
          ? pedido.alicIva.map((a) => ({ id: a.id, baseImp: centavos_a_decimal(a.baseImpCentavos), importe: centavos_a_decimal(a.importeCentavos) }))
          : undefined;
      const detIva = esB && "impIVA" in pedido ? centavos_a_decimal(pedido.impIVA) : undefined;
      const detSolicitar = {
        concepto: pedido.concepto,
        docTipo: pedido.docTipo,
        docNro: pedido.docNro.toString(),
        cbteDesde: pedido.cbteDesde,
        cbteHasta: pedido.cbteHasta,
        cbteFch: pedido.cbteFch,
        impTotal: centavos_a_decimal(pedido.impTotal),
        impNeto: centavos_a_decimal(pedido.impNeto),
        ...(detIva !== undefined ? { impIVA: detIva, impOpEx: "0.00", impTrib: "0.00" } : {}),
        monId: pedido.monId,
        monCotiz: pedido.monCotiz,
        condIvaReceptorId: pedido.condIvaReceptor,
        ...(detAlic !== undefined ? { alicIva: detAlic } : {}),
      };
      const pedidoAudit = pedido_a_auditoria(pedido);
      const r = (await medir_llamada_arca("FECAESolicitar", tenantId, pedidoAudit, () =>
        feSol(cfg.ambiente, { ...ta, cuit: authCuit }, authCuit, pedido.ptoVta, pedido.cbteTipo, detSolicitar),
      )) as FeSolicitarExtendido;
      if (r.resultado !== "A") {
        const codigo = r.codigoRechazo ?? `resultado-${r.resultado}`;
        registrar_rechazo_arca(codigo);
        throw new Error(`ARCA rechazo ${r.resultado}`);
      }
      return { cae: r.cae, caeVto: r.caeVto, raw: { resultado: r.resultado } };
    },
    async consultar(
      cbteTipo: number,
      ptoVta: number,
      nro: number,
      esperado?: ConsultaEsperada,
    ): Promise<{ existe: boolean; coincide: boolean; cae?: string }> {
      const ta = await get_ta();
      const d = await medir_llamada_arca(
        "FECompConsultar",
        tenantId,
        { cbteTipo, ptoVta, nro },
        () => feCon(cfg.ambiente, { ...ta, cuit: cfg.cuitProveedor }, cbteTipo, ptoVta, nro),
      );
      if (!d) return { existe: false, coincide: false };
      // D5: coincide compara total, doc y fecha (FECompConsultar). Sin
      // esperado no hay con qué comparar: existe pero no coincide probado.
      if (esperado === undefined) return { existe: true, coincide: true, cae: d.cae };
      const coincide =
        d.docTipo === esperado.docTipo &&
        d.docNro === esperado.docNro &&
        d.cbteFch === esperado.cbteFch &&
        d.impTotal === centavos_a_decimal(esperado.impTotalCentavos);
      return { existe: true, coincide, cae: d.cae };
    },
  };
}

export function crear_arca_provider_desde_env(env: Record<string, string | undefined>): ArcaConfig | null {
  const cuitProveedor = env["ARCA_CUIT_PROVEEDOR"] ?? "";
  const certPem = env["ARCA_CERT_PEM"] ?? "";
  const keyPem = env["ARCA_KEY_PEM"] ?? "";
  if (!cuitProveedor || !certPem || !keyPem) return null;
  const ambiente = env["ARCA_AMBIENTE"] === "prod" ? ("prod" as const) : ("homo" as const);
  return { ambiente, cuitProveedor, certPem, keyPem };
}
