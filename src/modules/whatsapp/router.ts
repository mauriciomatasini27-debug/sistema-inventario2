// Router conversacional B4/B6/B10 (P0) del Bot WA. Núcleo puro: sin IO,
// sin Drizzle, sin reloj propio (ahoraMs entra por parámetro).
// El adaptador (webhook.ts) arma los snapshots vivos y persiste sesión +
// lista del viernes; acá solo se decide qué responder.
// Orden: día a día (B10) → viernes (B6) → alertas (B4/B5) → nada (sigue
// la consulta en vivo de servicio.ts).

import { responder_que_falta, type ItemAlertaEntrada } from "./alertas.js";
import {
  agregar_al_viernes,
  armar_texto_viernes,
  crear_item_viernes,
  parsear_comando_viernes,
  type ListaViernes,
} from "./lista-viernes.js";
import {
  listar_pedidos_14d,
  parsear_dia_a_dia,
  ultimos_movimientos,
  type MovimientoVista,
  type PedidoDia,
} from "./dia-a-dia.js";

export interface SesionRouter {
  readonly paso: string;
  readonly contexto: Record<string, unknown>;
}

export interface EntradaRouter {
  readonly texto: string;
  readonly catalogo: ReadonlyArray<ItemAlertaEntrada>;
  readonly comercio: string;
  readonly pedidos: ReadonlyArray<PedidoDia>;
  readonly movs: ReadonlyArray<MovimientoVista>;
  readonly friday: ListaViernes;
  readonly sesion: SesionRouter | null;
  readonly ahoraMs: number;
}

export type SalidaRouter =
  | { readonly accion: "dia_pedidos"; readonly texto: string }
  | { readonly accion: "dia_movimientos"; readonly texto: string }
  | { readonly accion: "viernes_ver"; readonly texto: string }
  | { readonly accion: "viernes_guardado"; readonly texto: string; readonly friday: ListaViernes }
  | { readonly accion: "alertas"; readonly texto: string; readonly pagina: number }
  | { readonly accion: "nada" };

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function es_ver_mas(texto: string): boolean {
  return /\bver mas\b/.test(` ${SIN_TILDES(texto)} `);
}

function buscar_en_catalogo(catalogo: ReadonlyArray<ItemAlertaEntrada>, resto: string): ItemAlertaEntrada | null {
  const t = SIN_TILDES(resto).trim();
  if (!t) return null;
  const exacto = catalogo.find((c) => SIN_TILDES(c.nombre) === t);
  if (exacto) return exacto;
  const empieza = catalogo.find((c) => SIN_TILDES(c.nombre).startsWith(t));
  if (empieza) return empieza;
  const incluye = catalogo.find((c) => SIN_TILDES(c.nombre).includes(t));
  return incluye ?? null;
}

export function enrutar(e: EntradaRouter): SalidaRouter {
  // B10: "qué pedí" / "últimos movimientos de X" (solo lectura).
  const dia = parsear_dia_a_dia(e.texto);
  if (dia.kind === "que_pedi") {
    const r = listar_pedidos_14d(e.pedidos, e.ahoraMs, dia.proveedor ?? undefined);
    return { accion: "dia_pedidos", texto: r.texto };
  }
  if (dia.kind === "movimientos") {
    const r = ultimos_movimientos(e.movs, dia.termino);
    return { accion: "dia_movimientos", texto: r.texto };
  }

  // B6: lista del viernes.
  const cmd = parsear_comando_viernes(e.texto);
  if (cmd.kind === "ver_lista" || cmd.kind === "que_guarde") {
    return { accion: "viernes_ver", texto: armar_texto_viernes(e.friday, e.comercio) };
  }
  if (cmd.kind === "guardar_viernes" || cmd.kind === "pedir_ahora") {
    const resto = cmd.resto.trim();
    // Sin resto: se guardan todas las alertas vigentes (del aviso matutino).
    if (!resto) {
      let next = e.friday;
      let n = 0;
      for (const c of e.catalogo) {
        if (c.umbral <= 0 || c.stock > c.umbral) continue;
        const antes = next;
        next = agregar_al_viernes(next, crear_item_viernes({ ...c }));
        if (next !== antes) n++;
      }
      if (n === 0) return { accion: "viernes_ver", texto: armar_texto_viernes(e.friday, e.comercio) };
      return {
        accion: "viernes_guardado",
        texto: `Listo, guardé ${n} para el viernes en ${e.comercio}. Escribí "lista del viernes" para verlos.`,
        friday: next,
      };
    }
    const hit = buscar_en_catalogo(e.catalogo, resto);
    if (!hit) {
      return { accion: "viernes_ver", texto: `No encontré "${resto}" en ${e.comercio}. Probá con "qué me falta" para ver las alertas.` };
    }
    if (cmd.kind === "pedir_ahora") {
      // El armado del borrador vive en la sesión del pedido (B7); acá se
      // deja constancia y se sigue por ese flujo.
      return { accion: "viernes_ver", texto: `${hit.nombre} — ${hit.stock} u. Te armo el pedido en el siguiente mensaje.` };
    }
    const next = agregar_al_viernes(e.friday, crear_item_viernes({ ...hit }));
    if (next === e.friday) {
      return { accion: "viernes_ver", texto: `${hit.nombre} ya estaba en la lista del viernes de ${e.comercio}.` };
    }
    return {
      accion: "viernes_guardado",
      texto: `Listo, ${hit.nombre} quedó en la lista del viernes de ${e.comercio}.`,
      friday: next,
    };
  }

  // B4: paginado "ver más" sobre la última lista de alertas.
  if (es_ver_mas(e.texto) && e.sesion?.paso === "alertas") {
    const pagina = Number(e.sesion.contexto["pagina"] ?? 1) + 1;
    const r = responder_que_falta(e.catalogo, e.comercio, pagina);
    return { accion: "alertas", texto: r.texto, pagina };
  }

  return { accion: "nada" };
}
