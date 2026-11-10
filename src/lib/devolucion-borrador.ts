import { medioSchema, type Medio } from "./validation.js";

const EstadoMarca: unique symbol = Symbol("EstadoDevolucion");
const LineaIdMarca: unique symbol = Symbol("LineaId");

export type LineaId = string & { readonly [LineaIdMarca]: "LineaId" };
/** Opaco. La página no lee la venta, la clave ni los centavos. */
export type EstadoDevolucion = { readonly [EstadoMarca]: "EstadoDevolucion" };

export type FormatoPesos = (centavos: number) => string;

export const MOTIVOS_RAPIDOS: readonly string[] = ["Producto fallado", "Se arrepintió", "Equivocación"];

export const ACTOR_INICIAL = "panel-web";

const FRASE_FIADO = "Se acredita al fiado. La caja no se mueve.";
const FRASE_REINTENTO =
  "La base no respondió. Reintentá. Si cambiás la selección, puede generarse otra devolución.";
const FRASE_422 = "No se registró la devolución. Revisá los datos e intentá de nuevo.";

export type AccionDevolucion =
  | { readonly tipo: "buscar"; readonly numero: string }
  | { readonly tipo: "respuestaTicket"; readonly status: number; readonly json: unknown; readonly busqueda: number }
  | { readonly tipo: "cantidad"; readonly lineaId: LineaId; readonly qty: number }
  | { readonly tipo: "devolverTodo" }
  | { readonly tipo: "motivo"; readonly texto: string }
  | { readonly tipo: "medio"; readonly medio: Medio }
  | { readonly tipo: "actor"; readonly texto: string }
  | { readonly tipo: "cambiar" }
  | { readonly tipo: "enviar"; readonly ahoraIso: string; readonly claveNueva: string }
  | { readonly tipo: "respuestaDevolucion"; readonly status: number; readonly json: unknown }
  | { readonly tipo: "red"; readonly busqueda: number }
  | { readonly tipo: "redEnvio" }
  | { readonly tipo: "otra" };

export type PedidoPost = {
  readonly headers: {
    readonly "Content-Type": "application/json";
    readonly "Idempotency-Key": string;
  };
  readonly body: string;
};

export type EfectoDevolucion =
  | { readonly tipo: "nada" }
  | { readonly tipo: "buscar"; readonly busqueda: number; readonly numero: string }
  | { readonly tipo: "post"; readonly pedido: PedidoPost };

export type PasoDevolucion = {
  readonly estado: EstadoDevolucion;
  readonly efecto: EfectoDevolucion;
};

export type LineaVista = {
  readonly lineaId: LineaId;
  readonly titulo: string;
  readonly detalle: string;
  readonly qty: number;
  readonly max: number;
};

export type VistaDevolucion = {
  readonly status: string;
  readonly busqueda: number;
  readonly buscando: boolean;
  readonly lineas: readonly LineaVista[];
  readonly total: string;
  readonly motivo: string;
  readonly actor: string;
  readonly mostrarLineas: boolean;
  readonly mostrarMedio: boolean;
  readonly medio: Medio | null;
  readonly textoFiado: string | null;
  readonly mostrarTodo: boolean;
  readonly mostrarCambiar: boolean;
  readonly mostrarOtra: boolean;
  readonly bloquearEdicion: boolean;
  readonly boton: { readonly etiqueta: string; readonly disabled: boolean } | null;
  readonly confirmacion: { readonly titulo: string; readonly mensaje: string; readonly accion: string } | null;
};

type LineaTicket = {
  readonly lineaId: LineaId;
  readonly sku: string;
  readonly qtyVendida: number;
  readonly netoCentavos: number;
};

type TicketCargado = {
  readonly saleId: string;
  readonly numeroVisible: string;
  readonly totalCentavos: number;
  readonly lineas: readonly LineaTicket[];
} & (
  | { readonly reintegro: "caja"; readonly medioSugerido: Medio; readonly medioAjeno: boolean }
  | { readonly reintegro: "fiado" }
);

type Aviso =
  | { readonly tipo: "texto"; readonly texto: string }
  | { readonly tipo: "tope"; readonly acumulado: number; readonly total: number }
  | { readonly tipo: "facturado"; readonly facturado: number };

type BorradorBase = {
  readonly ticket: TicketCargado;
  readonly cantidades: ReadonlyMap<LineaId, number>;
  readonly motivo: string;
  readonly actor: string;
  readonly aviso: Aviso | null;
};

type BorradorEditable =
  | (BorradorBase & { readonly reintegro: "caja"; readonly medio: Medio })
  | (BorradorBase & { readonly reintegro: "fiado" });

type EnvioCongelado = {
  readonly clave: string;
  readonly ocurridoEn: string;
  readonly pedido: PedidoPost;
};

type BorradorCongelado = BorradorEditable & { readonly envio: EnvioCongelado };

type FaseDevolucion =
  | { readonly tipo: "vacio"; readonly aviso: Aviso | null }
  | { readonly tipo: "buscando"; readonly numero: string }
  | { readonly tipo: "editando"; readonly borrador: BorradorEditable }
  | { readonly tipo: "reintento"; readonly borrador: BorradorCongelado }
  | { readonly tipo: "enviando"; readonly borrador: BorradorCongelado }
  | { readonly tipo: "registrada"; readonly texto: string };

type EstadoInterno = {
  readonly busqueda: number;
  readonly fase: FaseDevolucion;
};

type EstadoReal = EstadoInterno & { readonly [EstadoMarca]: "EstadoDevolucion" };

const MEDIOS: ReadonlySet<string> = new Set(medioSchema.options);
const NADA: EfectoDevolucion = { tipo: "nada" };

function lineaIdDe(indice: number): LineaId {
  return `L${indice}` as LineaId;
}

function sellar(estado: EstadoInterno): EstadoDevolucion {
  const real: EstadoReal = {
    busqueda: estado.busqueda,
    fase: estado.fase,
    [EstadoMarca]: "EstadoDevolucion",
  };
  return Object.freeze(real);
}

function abrir(estado: EstadoDevolucion): EstadoInterno {
  const real = estado as EstadoReal;
  return { busqueda: real.busqueda, fase: real.fase };
}

function paso(estado: EstadoInterno, efecto: EfectoDevolucion): PasoDevolucion {
  return { estado: sellar(estado), efecto };
}

function quieto(estado: EstadoInterno): PasoDevolucion {
  return paso(estado, NADA);
}

function objeto(json: unknown): Record<string, unknown> | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  return json as Record<string, unknown>;
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto === "" ? null : texto;
}

function enteroSeguro(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isSafeInteger(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!/^\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) ? numero : null;
}

function enteroNoNegativo(valor: unknown): number | null {
  const numero = enteroSeguro(valor);
  if (numero === null || numero < 0) return null;
  return numero;
}

function esMedio(valor: string): valor is Medio {
  return MEDIOS.has(valor);
}

function montoDeLinea(netoCentavos: number, qtyVendida: number, qtyMarcada: number): number {
  if (qtyMarcada <= 0 || qtyVendida <= 0) return 0;
  if (qtyMarcada >= qtyVendida) return netoCentavos;
  return Math.floor((netoCentavos * qtyMarcada) / qtyVendida);
}

function seleccionCompleta(borrador: BorradorEditable): boolean {
  if (borrador.ticket.lineas.length === 0) return false;
  return borrador.ticket.lineas.every((linea) => (borrador.cantidades.get(linea.lineaId) ?? 0) === linea.qtyVendida);
}

function montoDelBorrador(borrador: BorradorEditable): number {
  let suma = 0;
  for (const linea of borrador.ticket.lineas) {
    suma += montoDeLinea(linea.netoCentavos, linea.qtyVendida, borrador.cantidades.get(linea.lineaId) ?? 0);
  }
  if (seleccionCompleta(borrador) && suma > borrador.ticket.totalCentavos) return borrador.ticket.totalCentavos;
  return suma;
}

function unidadesDe(borrador: BorradorEditable): number {
  let total = 0;
  for (const qty of borrador.cantidades.values()) total += qty;
  return total;
}

function listoParaEnviar(borrador: BorradorEditable): boolean {
  const motivo = borrador.motivo.trim();
  const actor = borrador.actor.trim();
  return montoDelBorrador(borrador) > 0 && motivo.length >= 1 && motivo.length <= 280 && actor.length >= 1 && actor.length <= 128;
}

function itemsDe(borrador: BorradorEditable): { product_id: string; qty: number }[] {
  const orden: string[] = [];
  const cantidades = new Map<string, number>();
  for (const linea of borrador.ticket.lineas) {
    const marcada = borrador.cantidades.get(linea.lineaId) ?? 0;
    if (marcada <= 0) continue;
    const previa = cantidades.get(linea.sku);
    if (previa === undefined) orden.push(linea.sku);
    cantidades.set(linea.sku, (previa ?? 0) + marcada);
  }
  return orden.map((sku) => ({ product_id: sku, qty: cantidades.get(sku) ?? 0 }));
}

function medioParaPost(borrador: BorradorEditable): Medio {
  if (borrador.reintegro === "fiado") return "Efectivo";
  return borrador.medio;
}

function congelar(borrador: BorradorEditable, clave: string, ocurridoEn: string): EnvioCongelado {
  const pedido: PedidoPost = {
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": clave,
    },
    body: JSON.stringify({
      sale_id: borrador.ticket.saleId,
      monto_centavos: montoDelBorrador(borrador),
      items: itemsDe(borrador),
      medio: medioParaPost(borrador),
      motivo: borrador.motivo.trim(),
      actor: borrador.actor.trim(),
      client_occurred_at: ocurridoEn,
    }),
  };
  return { clave, ocurridoEn, pedido };
}

function ticketDesdeJson(json: unknown): TicketCargado | null {
  const fila = objeto(json);
  if (!fila) return null;
  const saleId = textoDe(fila.sale_id);
  const totalCentavos = enteroNoNegativo(fila.total_centavos);
  const numeroVisible = textoDe(fila.ticket_definitivo) ?? textoDe(fila.ticket_provisorio);
  if (!saleId || totalCentavos === null || !numeroVisible || !Array.isArray(fila.lineas)) return null;

  const lineas: LineaTicket[] = [];
  for (const cruda of fila.lineas) {
    const linea = objeto(cruda);
    if (!linea) continue;
    const sku = textoDe(linea.sku);
    const qtyVendida = enteroSeguro(linea.qty);
    const netoCentavos = enteroNoNegativo(linea.neto_centavos);
    if (!sku || sku.length > 64 || qtyVendida === null || qtyVendida < 1 || netoCentavos === null) continue;
    lineas.push({ lineaId: lineaIdDe(lineas.length), sku, qtyVendida, netoCentavos });
  }
  if (lineas.length === 0) return null;

  const base = { saleId, numeroVisible, totalCentavos, lineas };
  const medio = typeof fila.medio === "string" ? fila.medio : "";
  if (medio === "A cuenta" || medio === "Pago: A cuenta") return { ...base, reintegro: "fiado" };
  if (esMedio(medio)) return { ...base, reintegro: "caja", medioSugerido: medio, medioAjeno: false };
  return { ...base, reintegro: "caja", medioSugerido: "Efectivo", medioAjeno: true };
}

function borradorInicial(ticket: TicketCargado): BorradorEditable {
  const base: BorradorBase = {
    ticket,
    cantidades: new Map(),
    motivo: "",
    actor: ACTOR_INICIAL,
    aviso: null,
  };
  if (ticket.reintegro === "fiado") return { ...base, reintegro: "fiado" };
  return { ...base, reintegro: "caja", medio: ticket.medioSugerido };
}

function conCampos(
  borrador: BorradorEditable,
  campos: { cantidades: ReadonlyMap<LineaId, number>; motivo: string; actor: string; aviso: Aviso | null },
): BorradorEditable {
  if (borrador.reintegro === "fiado") return { reintegro: "fiado", ticket: borrador.ticket, ...campos };
  return { reintegro: "caja", medio: borrador.medio, ticket: borrador.ticket, ...campos };
}

function sinEnvio(borrador: BorradorCongelado): BorradorEditable {
  return conCampos(borrador, {
    cantidades: borrador.cantidades,
    motivo: borrador.motivo,
    actor: borrador.actor,
    aviso: borrador.aviso,
  });
}

function conEnvio(borrador: BorradorEditable, envio: EnvioCongelado): BorradorCongelado {
  if (borrador.reintegro === "fiado") {
    return {
      reintegro: "fiado",
      ticket: borrador.ticket,
      cantidades: borrador.cantidades,
      motivo: borrador.motivo,
      actor: borrador.actor,
      aviso: borrador.aviso,
      envio,
    };
  }
  return {
    reintegro: "caja",
    medio: borrador.medio,
    ticket: borrador.ticket,
    cantidades: borrador.cantidades,
    motivo: borrador.motivo,
    actor: borrador.actor,
    aviso: borrador.aviso,
    envio,
  };
}

function aVacio(estado: EstadoInterno, texto: string | null): PasoDevolucion {
  const aviso = texto === null ? null : { tipo: "texto" as const, texto };
  return paso({ busqueda: estado.busqueda, fase: { tipo: "vacio", aviso } }, NADA);
}

function aEditando(estado: EstadoInterno, borrador: BorradorEditable): PasoDevolucion {
  return paso({ busqueda: estado.busqueda, fase: { tipo: "editando", borrador } }, NADA);
}

function fraseFiscal(estado: string | null): string {
  if (estado === "sin_factura") return "Sin nota de crédito.";
  if (estado === "espera_cae") return "Nota de crédito en espera de CAE.";
  if (estado === "pendiente") return "Nota de crédito pendiente.";
  if (!estado || /centavos/i.test(estado)) return "";
  return estado;
}

function textoRegistrada(numero: string, fiscal: string | null, repetida: boolean): string {
  const cabeza = repetida ? `Devolución ${numero} ya estaba registrada.` : `Devolución ${numero} registrada.`;
  const extra = fraseFiscal(fiscal);
  return extra === "" ? cabeza : `${cabeza} ${extra}`;
}

function aviso422(json: unknown, total: number): Aviso {
  const fila = objeto(json);
  const acumulado = fila ? enteroNoNegativo(fila.acumulado_centavos) : null;
  if (acumulado !== null) return { tipo: "tope", acumulado, total };
  const facturado = fila ? enteroNoNegativo(fila.facturado_centavos) : null;
  if (facturado !== null) return { tipo: "facturado", facturado };
  return { tipo: "texto", texto: FRASE_422 };
}

function alBuscar(estado: EstadoInterno, numeroCrudo: string): PasoDevolucion {
  const numero = numeroCrudo.trim();
  if (numero === "" || estado.fase.tipo === "enviando") return quieto(estado);
  const busqueda = estado.busqueda + 1;
  return paso(
    { busqueda, fase: { tipo: "buscando", numero } },
    { tipo: "buscar", busqueda, numero },
  );
}

function alResponderTicket(estado: EstadoInterno, accion: Extract<AccionDevolucion, { tipo: "respuestaTicket" }>): PasoDevolucion {
  if (estado.fase.tipo !== "buscando" || accion.busqueda !== estado.busqueda) return quieto(estado);
  if (accion.status === 200) {
    const ticket = ticketDesdeJson(accion.json);
    if (!ticket) return aVacio(estado, "No pude leer el ticket.");
    return aEditando(estado, borradorInicial(ticket));
  }
  if (accion.status === 404) return aVacio(estado, "No hay un ticket con ese número.");
  return aVacio(estado, "No pude leer el ticket.");
}

function alEditarCantidad(estado: EstadoInterno, lineaId: LineaId, qty: number): PasoDevolucion {
  if (estado.fase.tipo !== "editando") return quieto(estado);
  const linea = estado.fase.borrador.ticket.lineas.find((item) => item.lineaId === lineaId);
  if (!linea) return quieto(estado);
  let marcada = Number.isFinite(qty) ? Math.trunc(qty) : 0;
  if (marcada < 0) marcada = 0;
  if (marcada > linea.qtyVendida) marcada = linea.qtyVendida;
  const cantidades = new Map(estado.fase.borrador.cantidades);
  if (marcada === 0) cantidades.delete(lineaId);
  else cantidades.set(lineaId, marcada);
  return aEditando(
    estado,
    conCampos(estado.fase.borrador, {
      cantidades,
      motivo: estado.fase.borrador.motivo,
      actor: estado.fase.borrador.actor,
      aviso: estado.fase.borrador.aviso,
    }),
  );
}

function alDevolverTodo(estado: EstadoInterno): PasoDevolucion {
  if (estado.fase.tipo !== "editando") return quieto(estado);
  const cantidades = new Map<LineaId, number>();
  for (const linea of estado.fase.borrador.ticket.lineas) cantidades.set(linea.lineaId, linea.qtyVendida);
  return aEditando(
    estado,
    conCampos(estado.fase.borrador, {
      cantidades,
      motivo: estado.fase.borrador.motivo,
      actor: estado.fase.borrador.actor,
      aviso: estado.fase.borrador.aviso,
    }),
  );
}

function alEnviar(estado: EstadoInterno, ahoraIso: string, claveNueva: string): PasoDevolucion {
  if (estado.fase.tipo === "enviando") return quieto(estado);
  if (estado.fase.tipo === "reintento") {
    const borrador = estado.fase.borrador;
    return paso(
      { busqueda: estado.busqueda, fase: { tipo: "enviando", borrador } },
      { tipo: "post", pedido: borrador.envio.pedido },
    );
  }
  if (estado.fase.tipo !== "editando" || !listoParaEnviar(estado.fase.borrador)) return quieto(estado);
  const envio = congelar(estado.fase.borrador, claveNueva, ahoraIso);
  const borrador = conEnvio(estado.fase.borrador, envio);
  return paso(
    { busqueda: estado.busqueda, fase: { tipo: "enviando", borrador } },
    { tipo: "post", pedido: envio.pedido },
  );
}

function aReintento(estado: EstadoInterno, borrador: BorradorCongelado): PasoDevolucion {
  return paso({ busqueda: estado.busqueda, fase: { tipo: "reintento", borrador } }, NADA);
}

function alResponderDevolucion(estado: EstadoInterno, accion: Extract<AccionDevolucion, { tipo: "respuestaDevolucion" }>): PasoDevolucion {
  if (estado.fase.tipo !== "enviando") return quieto(estado);
  const borrador = estado.fase.borrador;
  if (accion.status === 201) {
    const fila = objeto(accion.json);
    const numero = fila ? textoDe(fila.numero_devolucion) : null;
    const fiscal = fila ? textoDe(fila.fiscal_estado) : null;
    const texto = numero ? textoRegistrada(numero, fiscal, false) : "Devolución registrada.";
    return paso({ busqueda: estado.busqueda, fase: { tipo: "registrada", texto } }, NADA);
  }
  if (accion.status === 409) {
    const original = objeto(objeto(accion.json)?.original);
    const numero = original ? textoDe(original.numero_devolucion) : null;
    if (!numero) return aVacio(estado, "Esa devolución ya estaba registrada, pero no pude leer el número.");
    return paso(
      { busqueda: estado.busqueda, fase: { tipo: "registrada", texto: textoRegistrada(numero, null, true) } },
      NADA,
    );
  }
  if (accion.status === 422) {
    const editable = conCampos(sinEnvio(borrador), {
      cantidades: borrador.cantidades,
      motivo: borrador.motivo,
      actor: borrador.actor,
      aviso: aviso422(accion.json, borrador.ticket.totalCentavos),
    });
    return aEditando(estado, editable);
  }
  if (accion.status === 404) return aVacio(estado, "No encontré esa venta.");
  return aReintento(estado, borrador);
}

export function estadoInicial(): EstadoDevolucion {
  return sellar({ busqueda: 0, fase: { tipo: "vacio", aviso: null } });
}

export function reducir(estado: EstadoDevolucion, accion: AccionDevolucion): PasoDevolucion {
  const actual = abrir(estado);
  switch (accion.tipo) {
    case "buscar":
      return alBuscar(actual, accion.numero);
    case "respuestaTicket":
      return alResponderTicket(actual, accion);
    case "red":
      if (actual.fase.tipo !== "buscando" || accion.busqueda !== actual.busqueda) return quieto(actual);
      return aVacio(actual, "Sin conexión. Probá la búsqueda de nuevo.");
    case "cantidad":
      return alEditarCantidad(actual, accion.lineaId, accion.qty);
    case "devolverTodo":
      return alDevolverTodo(actual);
    case "motivo":
      if (actual.fase.tipo !== "editando") return quieto(actual);
      return aEditando(
        actual,
        conCampos(actual.fase.borrador, {
          cantidades: actual.fase.borrador.cantidades,
          motivo: accion.texto,
          actor: actual.fase.borrador.actor,
          aviso: actual.fase.borrador.aviso,
        }),
      );
    case "actor":
      if (actual.fase.tipo !== "editando") return quieto(actual);
      return aEditando(
        actual,
        conCampos(actual.fase.borrador, {
          cantidades: actual.fase.borrador.cantidades,
          motivo: actual.fase.borrador.motivo,
          actor: accion.texto,
          aviso: actual.fase.borrador.aviso,
        }),
      );
    case "medio":
      if (actual.fase.tipo !== "editando" || actual.fase.borrador.reintegro !== "caja") return quieto(actual);
      return aEditando(actual, {
        reintegro: "caja",
        medio: accion.medio,
        ticket: actual.fase.borrador.ticket,
        cantidades: actual.fase.borrador.cantidades,
        motivo: actual.fase.borrador.motivo,
        actor: actual.fase.borrador.actor,
        aviso: actual.fase.borrador.aviso,
      });
    case "cambiar":
      if (actual.fase.tipo !== "reintento") return quieto(actual);
      return aEditando(actual, sinEnvio(actual.fase.borrador));
    case "enviar":
      return alEnviar(actual, accion.ahoraIso, accion.claveNueva);
    case "respuestaDevolucion":
      return alResponderDevolucion(actual, accion);
    case "redEnvio":
      if (actual.fase.tipo !== "enviando") return quieto(actual);
      return aReintento(actual, actual.fase.borrador);
    case "otra":
      if (actual.fase.tipo !== "registrada") return quieto(actual);
      return aVacio(actual, null);
  }
}

function textoAviso(aviso: Aviso | null, pesos: FormatoPesos): string | null {
  if (aviso === null) return null;
  if (aviso.tipo === "texto") return aviso.texto;
  if (aviso.tipo === "tope") {
    const queda = Math.max(0, aviso.total - aviso.acumulado);
    return `Ya se devolvieron ${pesos(aviso.acumulado)} de ${pesos(aviso.total)}. Quedan ${pesos(queda)}.`;
  }
  return `La nota de crédito no puede pasar lo facturado (${pesos(aviso.facturado)}). Esta devolución no se registró.`;
}

function borradorVisible(fase: FaseDevolucion): BorradorEditable | BorradorCongelado | null {
  if (fase.tipo === "editando" || fase.tipo === "reintento" || fase.tipo === "enviando") return fase.borrador;
  return null;
}

function confirmacionDe(borrador: BorradorEditable, pesos: FormatoPesos, reintento: boolean): VistaDevolucion["confirmacion"] {
  const unidades = unidadesDe(borrador);
  const palabra = unidades === 1 ? "unidad" : "unidades";
  const destino =
    borrador.reintegro === "fiado" ? FRASE_FIADO : `Sale de la caja en ${borrador.medio}.`;
  return {
    titulo: "Registrar devolución",
    mensaje: `Vas a devolver ${unidades} ${palabra} del ticket ${borrador.ticket.numeroVisible} por ${pesos(montoDelBorrador(borrador))}. ${destino}`,
    accion: reintento ? "Reintentar" : "Registrar",
  };
}

function statusDe(fase: FaseDevolucion, pesos: FormatoPesos): string {
  if (fase.tipo === "registrada") return fase.texto;
  if (fase.tipo === "buscando") return "Buscando el ticket…";
  if (fase.tipo === "enviando") return "Registrando la devolución…";
  if (fase.tipo === "reintento") return FRASE_REINTENTO;
  if (fase.tipo === "vacio") return textoAviso(fase.aviso, pesos) ?? "Escribí el número del ticket.";
  const aviso = textoAviso(fase.borrador.aviso, pesos);
  if (aviso) return aviso;
  const ticket = fase.borrador.ticket;
  if (ticket.reintegro === "caja" && ticket.medioAjeno) return "Elegí el medio del reintegro.";
  return "Marcá cuántas unidades vuelven.";
}

export function vistaDe(estado: EstadoDevolucion, pesos: FormatoPesos): VistaDevolucion {
  const actual = abrir(estado);
  const fase = actual.fase;
  const borrador = borradorVisible(fase);
  const editando = fase.tipo === "editando";
  const reintento = fase.tipo === "reintento";
  const enviando = fase.tipo === "enviando";
  const conLineas = editando || reintento || enviando;
  const monto = borrador ? montoDelBorrador(borrador) : 0;
  const puede = borrador ? listoParaEnviar(borrador) : false;
  const boton = editando
    ? { etiqueta: "Registrar devolución", disabled: !puede }
    : reintento
      ? { etiqueta: "Reintentar", disabled: false }
      : enviando
        ? { etiqueta: "Registrando…", disabled: true }
        : null;
  const lineas = borrador
    ? borrador.ticket.lineas.map((linea) => ({
        lineaId: linea.lineaId,
        titulo: linea.sku,
        detalle: linea.qtyVendida === 1 ? "Vendida 1" : `Vendidas ${linea.qtyVendida}`,
        qty: borrador.cantidades.get(linea.lineaId) ?? 0,
        max: linea.qtyVendida,
      }))
    : [];
  return {
    status: statusDe(fase, pesos),
    busqueda: actual.busqueda,
    buscando: fase.tipo === "buscando",
    lineas,
    total: borrador ? pesos(monto) : "",
    motivo: borrador?.motivo ?? "",
    actor: borrador?.actor ?? ACTOR_INICIAL,
    mostrarLineas: conLineas,
    mostrarMedio: Boolean(borrador && borrador.reintegro === "caja"),
    medio: borrador && borrador.reintegro === "caja" ? borrador.medio : null,
    textoFiado: borrador && borrador.reintegro === "fiado" ? FRASE_FIADO : null,
    mostrarTodo: editando && Boolean(borrador && !seleccionCompleta(borrador)),
    mostrarCambiar: reintento,
    mostrarOtra: fase.tipo === "registrada",
    bloquearEdicion: !editando,
    boton,
    confirmacion: borrador && boton && !boton.disabled ? confirmacionDe(borrador, pesos, reintento) : null,
  };
}
