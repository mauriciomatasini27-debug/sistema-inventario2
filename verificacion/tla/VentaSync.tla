------------------------------- MODULE VentaSync -------------------------------
EXTENDS Naturals, Sequences, FiniteSets

(***************************************************************************
Cola offline de /venta y su drenaje contra POST /api/sync/push.
Describe el codigo arreglado (VF-S2) de este repo:

  src/offline/cola-venta.ts, sincronizarColaVenta
    cola = deps.leer()
    for (const item of cola)
      await deps.enviar(item): fetch /api/sync/push                  -> Llegar..Responder
      si el fetch lanza -> cortado = true; break                     -> PerderPedido
      si status no es 2xx -> cortado = true; break                   -> Responder422
      si es 2xx -> confirmados.push(item)                            -> ResponderOk
    al final relee la cola y saca solo los op_id confirmados         -> Seguir
      (quitarConfirmados(deps.leer(), confirmados); deps.escribir)
    Llamada desde el onclick de #sync en src/pages/venta.astro, que
    adapta localStorage[outboxKey] a deps.leer/escribir y hace el POST.

  src/lib/repos/sync.ts, empujarOperacion (un paso por sentencia SQL)
    SELECT outbox WHERE op_id; si hay fila
      y el payload es igual -> 200 replay; distinto -> 409          -> Pre
    SELECT max(device_seq); si device_seq <= max -> 422             -> SeqChk
    INSERT outbox (op_id es PRIMARY KEY, src/db/schema.ts);
      23505 -> relectura -> replay (200 o 409)                      -> Ins

Cada handler de onclick es async: dos clics (o dos pestanas, que comparten
localStorage) corren dos drenajes intercalados. Flushes modela eso.
op_id = numero de op, y device_seq = el mismo numero (nextSeq es monotono).

Banderas (el codigo arreglado de este repo va en venta-sync.cfg):
  LIMPIA_TODO   TRUE = setItem("[]"); FALSE = saca solo los op_id con 2xx.
  CORTA_EN_FALLO TRUE = el for sale con break ante el primer fallo.
  UN_DRENAJE    TRUE = un solo drenaje a la vez (p. ej. navigator.locks).
  PK            TRUE = op_id es PRIMARY KEY. FALSE = quiebre deliberado.

El 409 por mismo op_id con payload distinto queda afuera del modelo: la caja
nunca reusa un op_id, y aca ese caso no cambia las tres leyes.
***************************************************************************)

CONSTANTS N, Flushes, LIMPIA_TODO, CORTA_EN_FALLO, UN_DRENAJE, PK

Ops == 1..N

VARIABLES
  prox,    \* proximo op que la caja puede cobrar offline
  q,       \* localStorage[outboxKey]: secuencia de op_id
  filas,   \* filas en la tabla outbox del servidor por op_id
  pc,      \* paso de cada drenaje
  snap,    \* copia de q que leyo cada drenaje al empezar
  idx,     \* item actual del for
  acked    \* ops con respuesta 2xx vista por ese drenaje

vars == <<prox, q, filas, pc, snap, idx, acked>>

Rango(s) == {s[k] : k \in DOMAIN s}
Guardadas == {o \in Ops : filas[o] > 0}
MaxSeq == IF Guardadas = {} THEN 0
          ELSE CHOOSE m \in Guardadas : \A o \in Guardadas : o <= m
Cur(f) == snap[f][idx[f]]

Init ==
  /\ prox = 1
  /\ q = <<>>
  /\ filas = [o \in Ops |-> 0]
  /\ pc = [f \in Flushes |-> "quieto"]
  /\ snap = [f \in Flushes |-> <<>>]
  /\ idx = [f \in Flushes |-> 1]
  /\ acked = [f \in Flushes |-> {}]

Vender ==
  /\ prox <= N
  /\ q' = Append(q, prox)
  /\ prox' = prox + 1
  /\ UNCHANGED <<filas, pc, snap, idx, acked>>

\* JS no cede el hilo entre que un await resuelve y el proximo await (o el
\* setItem final). Por eso "leer q y mandar el primero", "recibir respuesta y
\* mandar el siguiente" y "recibir la ultima y hacer el setItem" son un paso
\* cada uno: ninguna venta puede colarse en el medio.

Ir(f, paso) == pc' = [pc EXCEPT ![f] = paso]

\* Despues de procesar el item i (con acks a): manda el siguiente o termina.
Seguir(f, i, a) ==
  /\ idx' = [idx EXCEPT ![f] = i]
  /\ acked' = [acked EXCEPT ![f] = a]
  /\ IF i <= Len(snap[f])
       THEN Ir(f, "enviar") /\ UNCHANGED q
       ELSE /\ q' = IF LIMPIA_TODO THEN <<>>
                    ELSE SelectSeq(q, LAMBDA o : o \notin a)
            /\ Ir(f, "quieto")

\* sync.onclick: lee la cola y manda el primer item. Con cola vacia el
\* handler no hace nada observable, asi que el modelo no lo cuenta.
Empezar(f) ==
  /\ pc[f] = "quieto"
  /\ Len(q) > 0
  /\ UN_DRENAJE => \A g \in Flushes : pc[g] = "quieto"
  /\ pc' = [pc EXCEPT ![f] = "enviar"]
  /\ snap' = [snap EXCEPT ![f] = q]
  /\ idx' = [idx EXCEPT ![f] = 1]
  /\ acked' = [acked EXCEPT ![f] = {}]
  /\ UNCHANGED <<prox, q, filas>>

\* Fallo visto por la caja: el fetch lanza, o llega un 422/5xx (no lanza).
\* Con CORTA_EN_FALLO el for sale con break; si no, sigue con el proximo.
Fallo(f) ==
  IF CORTA_EN_FALLO
  THEN Seguir(f, Len(snap[f]) + 1, acked[f])
  ELSE Seguir(f, idx[f] + 1, acked[f])

\* El pedido se pierde antes de llegar al servidor.
PerderPedido(f) ==
  /\ pc[f] = "enviar"
  /\ Fallo(f)
  /\ UNCHANGED <<prox, filas, snap>>

Llegar(f) ==
  /\ pc[f] = "enviar"
  /\ Ir(f, "pre")
  /\ UNCHANGED <<prox, q, filas, snap, idx, acked>>

Pre(f) ==
  /\ pc[f] = "pre"
  /\ Ir(f, IF filas[Cur(f)] > 0 THEN "ok" ELSE "seqchk")
  /\ UNCHANGED <<prox, q, filas, snap, idx, acked>>

SeqChk(f) ==
  /\ pc[f] = "seqchk"
  /\ Ir(f, IF Cur(f) <= MaxSeq THEN "r422" ELSE "ins")
  /\ UNCHANGED <<prox, q, filas, snap, idx, acked>>

Ins(f) ==
  /\ pc[f] = "ins"
  /\ IF PK /\ filas[Cur(f)] > 0
       THEN UNCHANGED filas
       ELSE filas' = [filas EXCEPT ![Cur(f)] = @ + 1]
  /\ Ir(f, "ok")
  /\ UNCHANGED <<prox, q, snap, idx, acked>>

\* 200/201 llega a la caja.
ResponderOk(f) ==
  /\ pc[f] = "ok"
  /\ Seguir(f, idx[f] + 1, acked[f] \cup {Cur(f)})
  /\ UNCHANGED <<prox, filas, snap>>

\* El servidor ya respondio 2xx, pero la respuesta se corta en la red.
PerderRespuesta(f) ==
  /\ pc[f] = "ok"
  /\ Fallo(f)
  /\ UNCHANGED <<prox, filas, snap>>

Responder422(f) ==
  /\ pc[f] = "r422"
  /\ Fallo(f)
  /\ UNCHANGED <<prox, filas, snap>>

Next ==
  \/ Vender
  \/ \E f \in Flushes :
       \/ Empezar(f) \/ PerderPedido(f) \/ Llegar(f) \/ Pre(f)
       \/ SeqChk(f) \/ Ins(f) \/ ResponderOk(f) \/ PerderRespuesta(f)
       \/ Responder422(f)

Spec == Init /\ [][Next]_vars

(* Leyes *)
\* Una venta nunca queda dos veces en la outbox del servidor.
AlMasUnaFila == \A o \in Ops : filas[o] <= 1
\* Una venta cobrada offline esta en el servidor o todavia en la cola local.
NoVentaPerdida == \A o \in 1..(prox - 1) : filas[o] > 0 \/ o \in Rango(q)
\* Nada en la cola queda condenado a 422 para siempre.
NoAtascada == \A o \in Rango(q) : filas[o] = 0 => o > MaxSeq
================================================================================
