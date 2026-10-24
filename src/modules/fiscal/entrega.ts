// FE-S28: la letra R exige CAI (RG 5678) y WSFEv1 no autoriza ese papel.
// Por encima de 4.500 kg o de $9.529.691 (punto de miles), COT ARBA, PRD-FE-01 FE15.2.

type SinPalabraRemito<S extends string> = Lowercase<S> extends `${string}remito${string}` ? never : S;

function afirmarTitulo<S extends string>(titulo: SinPalabraRemito<S>): SinPalabraRemito<S> {
  return titulo;
}

export const TITULO_CONSTANCIA = afirmarTitulo("Constancia de entrega interna");
export const LEYENDA_CONSTANCIA = "DOCUMENTO NO VÁLIDO COMO REMITO" as const;

export interface ConstanciaEntrega {
  readonly titulo: typeof TITULO_CONSTANCIA;
  readonly leyenda: typeof LEYENDA_CONSTANCIA;
  readonly letra: null;
}

export function emitir_constancia(): ConstanciaEntrega {
  return {
    titulo: TITULO_CONSTANCIA,
    leyenda: LEYENDA_CONSTANCIA,
    letra: null,
  };
}

export const UMBRAL_COT_KG = 4_500;
export const UMBRAL_COT_CENTAVOS = 9_529_691n * 100n;

export interface CuestionarioEntrega {
  readonly carne: boolean;
  readonly harina: boolean;
  readonly trasladoBuenosAires: boolean;
  readonly kilos: number;
  readonly importeCentavos: bigint;
}

export type RegimenAviso = "wsremcarne" | "wsremharina" | "cot-arba";

export interface AvisoRegimen {
  readonly regimen: RegimenAviso;
  readonly texto: string;
  readonly link: string;
}

export interface ResultadoCuestionario {
  readonly avisos: readonly AvisoRegimen[];
  readonly emite: false;
}

const LINK_WSREMCARNE = "https://www.arca.gob.ar/ws/remitoElecCarnico/Manual_Desarrollador_WSREMCARNE_v3_5.pdf";
const LINK_WSREMHARINA = "https://arca.gob.ar/ws/remitoHTSDMT/Manual_Desarrollador_WSREMHARINA_v2.9.pdf";
const LINK_COT_ARBA =
  "https://web.arba.gov.ar/preguntas-frecuentes/que-es-el-cot-quienes-y-bajo-que-condiciones-estan-obligados-generarlo-en-que";

interface FilaRegimen {
  readonly regimen: RegimenAviso;
  readonly texto: string;
  readonly link: string;
  readonly aplica: (q: CuestionarioEntrega) => boolean;
}

function traslado_supera_cot(q: CuestionarioEntrega): boolean {
  if (!q.trasladoBuenosAires) return false;
  return q.kilos > UMBRAL_COT_KG || q.importeCentavos > UMBRAL_COT_CENTAVOS;
}

const REGIMENES: readonly FilaRegimen[] = [
  {
    regimen: "wsremcarne",
    texto: "wsremcarne RG 5259",
    link: LINK_WSREMCARNE,
    aplica: (q) => q.carne,
  },
  {
    regimen: "wsremharina",
    texto: "wsremharina RG 5264",
    link: LINK_WSREMHARINA,
    aplica: (q) => q.harina,
  },
  {
    regimen: "cot-arba",
    texto: "COT ARBA",
    link: LINK_COT_ARBA,
    aplica: traslado_supera_cot,
  },
];

export function evaluar_cuestionario(q: CuestionarioEntrega): ResultadoCuestionario {
  const avisos = REGIMENES.filter((fila) => fila.aplica(q)).map((fila) => ({
    regimen: fila.regimen,
    texto: fila.texto,
    link: fila.link,
  }));
  return { avisos, emite: false };
}
