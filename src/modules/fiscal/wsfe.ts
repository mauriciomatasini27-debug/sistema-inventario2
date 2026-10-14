// WSAA loginCms + WSFEv1 por fetch + XML manual (Fase 0: fetch+XML, timeout 30 s).
// Sin dependencia soap. Envelopes puros y testeables; el transporte es fino.
export const WSAA_URL: Record<"homo" | "prod", string> = {
  homo: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  prod: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

export const WSFE_URL: Record<"homo" | "prod", string> = {
  homo: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  prod: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

const TIMEOUT_MS = 30_000;

async function post_xml(url: string, body: string, soapAction: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.text();
}

export function login_cms_envelope(cmsBase64: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><loginCms><in0>${cmsBase64}</in0></loginCms></soapenv:Body></soapenv:Envelope>`
  );
}

export function parse_login_cms_response(xml: string): { token: string; sign: string } | null {
  const token = /<token>([^<]+)<\/token>/.exec(xml)?.[1];
  const sign = /<sign>([^<]+)<\/sign>/.exec(xml)?.[1];
  if (!token || !sign) return null;
  return { token, sign };
}

export async function login_cms(ambiente: "homo" | "prod", cmsBase64: string): Promise<{ token: string; sign: string }> {
  const xml = await post_xml(WSAA_URL[ambiente], login_cms_envelope(cmsBase64), "loginCms");
  const parsed = parse_login_cms_response(xml);
  if (!parsed) throw new Error("loginCms sin token/sign");
  return parsed;
}

export interface WsfeAuth {
  readonly token: string;
  readonly sign: string;
  readonly cuit: string;
}

function auth_xml(a: WsfeAuth): string {
  return `<Auth><Token>${a.token}</Token><Sign>${a.sign}</Sign><Cuit>${a.cuit}</Cuit></Auth>`;
}

export function dummy_envelope(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><FEDummy xmlns="http://ar.gov.afip.dif.FEV1/"/></soapenv:Body></soapenv:Envelope>`
  );
}

export interface DummyStatus {
  readonly appserver: string;
  readonly dbserver: string;
  readonly authserver: string;
}

export function parse_dummy_response(xml: string): DummyStatus | null {
  const app = /<appserver>([^<]+)<\/appserver>/.exec(xml)?.[1];
  const db = /<dbserver>([^<]+)<\/dbserver>/.exec(xml)?.[1];
  const auth = /<authserver>([^<]+)<\/authserver>/.exec(xml)?.[1];
  if (!app || !db || !auth) return null;
  return { appserver: app, dbserver: db, authserver: auth };
}

export function dummy_ok(s: DummyStatus): boolean {
  return s.appserver === "OK" && s.dbserver === "OK" && s.authserver === "OK";
}

export async function fe_dummy(ambiente: "homo" | "prod"): Promise<DummyStatus> {
  const xml = await post_xml(WSFE_URL[ambiente], dummy_envelope(), "FEDummy");
  const parsed = parse_dummy_response(xml);
  if (!parsed) throw new Error("FEDummy sin appserver/dbserver/authserver");
  return parsed;
}

export function ptos_venta_envelope(a: WsfeAuth): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><FEParamGetPtosVenta xmlns="http://ar.gov.afip.dif.FEV1/">` +
    `${auth_xml(a)}</FEParamGetPtosVenta></soapenv:Body></soapenv:Envelope>`
  );
}

export function parse_ptos_venta_response(xml: string): number[] | null {
  const ids = [...xml.matchAll(/<Nro>([^<]+)<\/Nro>/g)].map((m) => Number(m[1]));
  if (ids.length === 0) return null;
  return ids.filter((n) => Number.isInteger(n));
}

export async function fe_param_get_ptos_venta(ambiente: "homo" | "prod", a: WsfeAuth): Promise<number[]> {
  const xml = await post_xml(WSFE_URL[ambiente], ptos_venta_envelope(a), "FEParamGetPtosVenta");
  const parsed = parse_ptos_venta_response(xml);
  if (!parsed) throw new Error("FEParamGetPtosVenta sin Nro");
  return parsed;
}

// Prueba técnica delegación (FE-S5): FEDummy + PtosVenta + Ultimo con Auth.Cuit=comercio.
// 601 = falta delegación, nunca "Error 601".
export async function probar_delegacion(
  ambiente: "homo" | "prod",
  a: WsfeAuth,
  ptoVta: number,
  cbteTipo: number,
): Promise<{ ok: boolean; motivo: string }> {
  try {
    const d = await fe_dummy(ambiente);
    if (!dummy_ok(d)) return { ok: false, motivo: "FEDummy caído" };
    await fe_param_get_ptos_venta(ambiente, a);
    await fe_ultimo(ambiente, a, ptoVta, cbteTipo);
    return { ok: true, motivo: "delegación activa" };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("601")) return { ok: false, motivo: "Falta confirmar delegación" };
    return { ok: false, motivo: m };
  }
}

export function ultimo_envelope(a: WsfeAuth, ptoVta: number, cbteTipo: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">` +
    `${auth_xml(a)}<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>` +
    `</FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`
  );
}

export function parse_ultimo_response(xml: string): number | null {
  const m = /<CbteNro>(\d+)<\/CbteNro>/.exec(xml);
  return m ? Number(m[1]) : null;
}

export async function fe_ultimo(ambiente: "homo" | "prod", a: WsfeAuth, ptoVta: number, cbteTipo: number): Promise<number> {
  const xml = await post_xml(WSFE_URL[ambiente], ultimo_envelope(a, ptoVta, cbteTipo), "FECompUltimoAutorizado");
  const n = parse_ultimo_response(xml);
  if (n === null) throw new Error("FECompUltimoAutorizado sin CbteNro");
  return n;
}

export interface AlicIvaDet {
  readonly id: number;
  readonly baseImp: string;
  readonly importe: string;
}

export interface SolicitarDet {
  readonly concepto: number;
  readonly docTipo: number;
  readonly docNro: string;
  readonly cbteDesde: number;
  readonly cbteHasta: number;
  readonly cbteFch: string;
  readonly impTotal: string;
  readonly impNeto: string;
  readonly impIVA?: string | undefined;
  readonly impOpEx?: string | undefined;
  readonly impTrib?: string | undefined;
  readonly monId: string;
  readonly monCotiz: number;
  readonly condIvaReceptorId: number;
  readonly alicIva?: ReadonlyArray<AlicIvaDet> | undefined;
}

function alic_iva_xml(alic: ReadonlyArray<AlicIvaDet>): string {
  if (alic.length === 0) return "";
  const items = alic
    .map((a) => `<AlicIva><Id>${a.id}</Id><BaseImp>${a.baseImp}</BaseImp><Importe>${a.importe}</Importe></AlicIva>`)
    .join("");
  return `<Iva><AlicIva>${items}</AlicIva></Iva>`;
}

export function solicitar_envelope(a: WsfeAuth, cuit: string, ptoVta: number, cbteTipo: number, det: SolicitarDet): string {
  const ivaTag =
    det.alicIva !== undefined && det.alicIva.length > 0
      ? `<ImpIVA>${det.impIVA ?? "0.00"}</ImpIVA><ImpOpEx>${det.impOpEx ?? "0.00"}</ImpOpEx><ImpTrib>${det.impTrib ?? "0.00"}</ImpTrib>` +
        alic_iva_xml(det.alicIva)
      : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">` +
    `${auth_xml(a)}<FeCAEReq><FeCabReq>` +
    `<Cuit>${cuit}</Cuit><PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>` +
    `</FeCabReq><FeDetReq><FECAEDetRequest>` +
    `<Concepto>${det.concepto}</Concepto><DocTipo>${det.docTipo}</DocTipo><DocNro>${det.docNro}</DocNro>` +
    `<CbteDesde>${det.cbteDesde}</CbteDesde><CbteHasta>${det.cbteHasta}</CbteHasta><CbteFch>${det.cbteFch}</CbteFch>` +
    `<ImpTotal>${det.impTotal}</ImpTotal><ImpNeto>${det.impNeto}</ImpNeto>` +
    `${ivaTag}` +
    `<MonId>${det.monId}</MonId><MonCotiz>${det.monCotiz}</MonCotiz>` +
    `<CondicionIVAReceptorId>${det.condIvaReceptorId}</CondicionIVAReceptorId>` +
    `</FECAEDetRequest></FeDetReq></FeCAEReq>` +
    `</FECAESolicitar></soapenv:Body></soapenv:Envelope>`
  );
}

export function parse_solicitar_response(xml: string): { cae: string; caeVto: string; resultado: string } | null {
  const cae = /<CAE>([^<]+)<\/CAE>/.exec(xml)?.[1];
  const caeVto = /<CAEFchVto>([^<]+)<\/CAEFchVto>/.exec(xml)?.[1];
  const resultado = /<Resultado>([^<]+)<\/Resultado>/.exec(xml)?.[1];
  if (!cae || !caeVto || !resultado) return null;
  return { cae, caeVto, resultado };
}

export async function fe_solicitar(
  ambiente: "homo" | "prod",
  a: WsfeAuth,
  cuit: string,
  ptoVta: number,
  cbteTipo: number,
  det: SolicitarDet,
): Promise<{ cae: string; caeVto: string; resultado: string }> {
  const xml = await post_xml(WSFE_URL[ambiente], solicitar_envelope(a, cuit, ptoVta, cbteTipo, det), "FECAESolicitar");
  const parsed = parse_solicitar_response(xml);
  if (!parsed) throw new Error("FECAESolicitar sin CAE");
  return parsed;
}

export function consultar_envelope(a: WsfeAuth, cbteTipo: number, ptoVta: number, nro: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><FECompConsultar xmlns="http://ar.gov.afip.dif.FEV1/">` +
    `${auth_xml(a)}<FeCompConsReq>` +
    `<CbteTipo>${cbteTipo}</CbteTipo><PtoVta>${ptoVta}</PtoVta><CbteNro>${nro}</CbteNro>` +
    `</FeCompConsReq></FECompConsultar></soapenv:Body></soapenv:Envelope>`
  );
}

export interface ConsultaDoc {
  readonly cae: string;
  readonly docTipo: number;
  readonly docNro: string;
  readonly impTotal: string;
  readonly cbteFch: string;
}

export function parse_consultar_response(xml: string): ConsultaDoc | null {
  const cae = /<CodAutorizacion>([^<]+)<\/CodAutorizacion>/.exec(xml)?.[1];
  if (!cae) return null;
  const docTipo = Number(/<DocTipo>([^<]+)<\/DocTipo>/.exec(xml)?.[1] ?? "");
  const docNro = /<DocNro>([^<]+)<\/DocNro>/.exec(xml)?.[1] ?? "";
  const impTotal = /<ImpTotal>([^<]+)<\/ImpTotal>/.exec(xml)?.[1] ?? "";
  const cbteFch = /<CbteFch>([^<]+)<\/CbteFch>/.exec(xml)?.[1] ?? "";
  if (!Number.isInteger(docTipo) || !docNro || !impTotal || !cbteFch) return null;
  return { cae, docTipo, docNro, impTotal, cbteFch };
}

export async function fe_consultar(
  ambiente: "homo" | "prod",
  a: WsfeAuth,
  cbteTipo: number,
  ptoVta: number,
  nro: number,
): Promise<ConsultaDoc | null> {
  const xml = await post_xml(WSFE_URL[ambiente], consultar_envelope(a, cbteTipo, ptoVta, nro), "FECompConsultar");
  return parse_consultar_response(xml);
}
