import { crearTablasVacias } from "./db.js";
import { hidratarOutbox, repararSeq, resetOutbox, pendientes } from "./outbox-store.js";
import { hidratarMappings, registrarProv, resolver as resolverMap } from "./id-mappings.js";
import { aplicarMovCaja, aplicarVenta } from "./local-repo.js";
import { puedeOperarOffline } from "./grants.js";
import { hidratarFotos, resetFotos } from "./fotos.js";
import { sincronizarAhora as flush, type PullPort, type PushPort } from "./sync-worker.js";
import type {
  MovimientoProv,
  OfflineGrant,
  RegistrarCajaInput,
  ResultadoSync,
  TicketProv,
  TicketVista,
  VenderInput,
  VistaOffline,
} from "./types.js";

// Fachada profunda: concentra política (grant, backoff, orden, mapeo) para
// que el caller complete cada operación con una sola llamada. Call chains
// de largo 1. Solo este archivo + types.ts son públicos; el resto interno.

export interface AbrirOpts {
  deviceCode: string;
  push?: PushPort | null;
  pull?: PullPort | null;
  grant?: OfflineGrant | null;
}

export interface Offline {
  vender(input: VenderInput): Promise<TicketProv>;
  caja: { registrar(input: RegistrarCajaInput): Promise<MovimientoProv> };
  tickets: { resolver(provisorio: string): Promise<TicketVista> };
  suscribir(cb: (s: VistaOffline) => void): () => void;
  sincronizarAhora(): Promise<ResultadoSync>;
  estado(): Promise<VistaOffline>;
}

/** Abre backend local, recupera crash (repararSeq) y reanuda worker. */
export async function abrir(opts: AbrirOpts): Promise<Offline> {
  const { deviceCode, push, pull, grant = null } = opts;
  await crearTablasVacias();
  // PWA-S3: el diario SQLite hidrata la memoria antes de reparar seq, así un
  // restart conserva ops, mapeos y continúa el seq sin reasignar pasado.
  await hidratarOutbox();
  await hidratarMappings();
  await hidratarFotos();
  await repararSeq();

  const subs = new Set<(s: VistaOffline) => void>();
  let enviando = false;
  let cursor: import("./types.js").Cursor | null = null;

  async function vista(): Promise<VistaOffline> {
    const cola = await pendientes(1_000_000);
    return {
      pendientes: cola.length,
      enviando,
      cursor,
      grantVigente: grant != null && puedeOperarOffline(grant, "venta"),
    };
  }

  function emitir(v: VistaOffline) {
    for (const cb of subs) cb(v);
  }

  return {
    async vender(input: VenderInput): Promise<TicketProv> {
      const { ticket, op } = await aplicarVenta(input, deviceCode);
      await registrarProv(op.opId, ticket.provisorio);
      void op;
      emitir(await vista());
      return ticket;
    },
    caja: {
      async registrar(input: RegistrarCajaInput): Promise<MovimientoProv> {
        const { prov, op } = await aplicarMovCaja(input, deviceCode);
        await registrarProv(op.opId, prov.idProvisorio as import("./types.js").IdProv);
        emitir(await vista());
        return prov;
      },
    },
    tickets: {
      async resolver(provisorio: string): Promise<TicketVista> {
        const r = await resolverMap(provisorio as import("./types.js").IdProv);
        const definitivo = r !== provisorio;
        return { codigo: String(r), definitivo, total: 0n };
      },
    },
    suscribir(cb: (s: VistaOffline) => void): () => void {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    async sincronizarAhora(): Promise<ResultadoSync> {
      enviando = true;
      try {
        const r = await flush({ deviceCode, push, pull });
        if (r.cursor != null) cursor = r.cursor;
        const v = await vista();
        emitir(v);
        return r;
      } finally {
        enviando = false;
      }
    },
    estado: vista,
  };
}

export const Offline = { abrir };

/** Solo tests: resetea backend local. */
export async function resetOffline(): Promise<void> {
  await resetOutbox();
  await resetFotos();
}
