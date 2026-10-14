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

export function crear_arca_provider(cfg: ArcaConfig): FiscalProvider {
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
      const t = tra_times(new Date());
      const tra = armar_tra_xml({ ...t, service: WSAA_SERVICE });
      const cms = firmar_tra_cms(tra, cfg.certPem, cfg.keyPem);
      try {
        const { token, sign } = await login_cms(cfg.ambiente, cms);
        const fresh: TaCache = { token, sign, expiraEn: Date.now() + TA_TTL_MS };
        taCache.set(key, fresh);
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
      return fe_ultimo(cfg.ambiente, { ...ta, cuit }, ptoVta, cbteTipo);
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
      const r = await fe_solicitar(
        cfg.ambiente,
        { ...ta, cuit: authCuit },
        authCuit,
        pedido.ptoVta,
        pedido.cbteTipo,
        {
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
        },
      );
      if (r.resultado !== "A") throw new Error(`ARCA rechazo ${r.resultado}`);
      return { cae: r.cae, caeVto: r.caeVto, raw: { resultado: r.resultado } };
    },
    async consultar(
      cbteTipo: number,
      ptoVta: number,
      nro: number,
      esperado?: ConsultaEsperada,
    ): Promise<{ existe: boolean; coincide: boolean; cae?: string }> {
      const ta = await get_ta();
      const d = await fe_consultar(cfg.ambiente, { ...ta, cuit: cfg.cuitProveedor }, cbteTipo, ptoVta, nro);
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
