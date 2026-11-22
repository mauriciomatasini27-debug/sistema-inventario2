------------------------------- MODULE StockLotes -------------------------------
EXTENDS Naturals, Sequences, FiniteSets

(***************************************************************************
Lotes y stock: el Historial de stock es la unica fuente de verdad (ADR-0123).
Describe el seam de src/lib/repos/stock.ts y sus caller de T01..T05:

  aplicarMovimiento(m)   -> Alta, Venta, BajaVencido, Devolucion
    con base: INSERT stock_movements + UPDATE products.stock_actual
              + UPDATE stock_lots.cantidad_restante en una transaccion;
              el espejo en memoria se escribe despues del commit.
    sin base: la memoria es el modo legítimo y la escritura es atomica.
    si la base falla: se propaga el error; NO se espeja en memoria.
  aplicarVentaLotes      -> decide FEFO y delega las escrituras al seam.
  sobreventa             -> movimiento VENTA con motivo "sobreventa"; se
                            registra pero no baja stock ni lote ( exclusion
                            de la proyeccion de Stock disponible ).
  devolucion             -> lee del Historial por idemKey de la venta los
                            Lotes consumidos, reparte proporcionalmente y
                            da el sobrante por redondeo al Lote que vence
                            antes, todo en la misma transaccion.

Banderas (el codigo arreglado va en stock-lotes.cfg):
  ESPEJO_TRAS_FALLO TRUE = ante un fallo de base se escribe igual el espejo
                           en memoria (el bug que corrige T04). FALSE = se
                           propaga y no queda rastro.

Se modelan dos escritores concurrentes (Ops) y claves de idempotencia acotadas
(Idem): reintentar una clave ya aplicada no produce movimientos nuevos.
***************************************************************************)

CONSTANTS L1, L2, GEN, NA, Idem, Ops, MAXCANT, MAXSTOCK, MAXMOV, MAXOPS,
          SOBREVENTA, ESPEJO_TRAS_FALLO

Lotes == {L1, L2, GEN}
Item == [lote: Lotes, cantidad: 1..MAXCANT]
Mov == [idem: Idem, lote: Lotes \cup {NA}, delta: (0 - MAXCANT)..MAXCANT,
        tipo: {"ALTA", "VENTA", "COMPENSATORIO", "MERMA"},
        motivo: {"", SOBREVENTA}]
Consumo1 == {<<i>> : i \in Item}
Consumo2 == {<<i, j>> : i \in Item, j \in Item}
ConsumoPosible == Consumo1 \cup Consumo2
LotesDistintos(s) == \A a, b \in DOMAIN s : a /= b => s[a].lote /= s[b].lote
Snapshot == [stock: 0..MAXSTOCK, lotes: [Lotes -> 0..MAXCANT], hist: Seq(Mov)]
Fallo == [idem: Idem, antes: Snapshot, despues: Snapshot]

Expira(l) == CASE l = L1 -> 1
                [] l = L2 -> 2
                [] OTHER  -> 3  \* Lote generico: sin vencimiento, va al final

VARIABLES
  bdStock,    \* products.stock_actual en la base (proyeccion)
  bdLotes,    \* stock_lots.cantidad_restante en la base (proyeccion)
  bdHist,     \* stock_movements: unica fuente de verdad
  memStock,   \* espejo de stock_actual en memoria
  memLotes,   \* espejo de cantidad_restante en memoria
  memHist,    \* espejo del Historial en memoria
  idemp,      \* idemKey ya aplicadas con exito
  consumos,   \* por idemKey de venta, Lotes consumidos (del Historial)
  devoluciones, \* [idem, sale, cantidad] registradas
  reingresos, \* por idemKey de devolucion, la secuencia del reparto
  bajas,      \* todo evento que bajo cantidad_restante
  fallos,     \* intentos de escritura con la base caida
  hechos      \* operaciones iniciadas por escritor

vars == <<bdStock, bdLotes, bdHist, memStock, memLotes, memHist, idemp,
          consumos, devoluciones, reingresos, bajas, fallos, hechos>>

RECURSIVE SumSeqR(_)
SumSeqR(s) == IF Len(s) = 0 THEN 0 ELSE Head(s) + SumSeqR(Tail(s))
SumSeq(s) == SumSeqR(s)

RECURSIVE SumaCantR(_)
SumaCantR(S) == IF S = {} THEN 0
                ELSE LET x == CHOOSE e \in S : TRUE IN x.cantidad + SumaCantR(S \ {x})
SumaCant(S) == SumaCantR(S)
SeqToSet(s) == {s[i] : i \in DOMAIN s}

SumaItems(s) == SumSeq([i \in DOMAIN s |-> s[i].cantidad])
SumaDeltas(h) ==
  LET sel == SelectSeq(h, LAMBDA m : m.motivo /= SOBREVENTA)
  IN SumSeq([i \in DOMAIN sel |-> sel[i].delta])
SumaLotes(L) == L[L1] + L[L2] + L[GEN]

\* Una entrada/salida escribe movimiento y proyecciones juntos. La sobreventa
\* se registra en el Historial pero no toca stock ni Lote.
AplicarMov(m, S, L, H) ==
  [stock |-> IF m.motivo = SOBREVENTA THEN S ELSE S + m.delta,
   lotes |-> IF /\ m.motivo /= SOBREVENTA
               /\ m.lote \in Lotes
              THEN [L EXCEPT ![m.lote] = @ + m.delta]
              ELSE L,
   hist |-> Append(H, m)]

RECURSIVE AplicarMsR(_, _, _, _)
AplicarMsR(ms, S, L, H) ==
  IF Len(ms) = 0 THEN [stock |-> S, lotes |-> L, hist |-> H]
  ELSE LET r == AplicarMov(ms[1], S, L, H)
       IN AplicarMsR([i \in 1..(Len(ms) - 1) |-> ms[i + 1]], r.stock, r.lotes, r.hist)
AplicarMs(ms, S, L, H) == AplicarMsR(ms, S, L, H)

\* FEFO: si queda un Lote que vence antes, la venta tiene que consumirlo.
FefoOk(s, L) ==
  \A i \in DOMAIN s :
    \A l \in Lotes :
      (Expira(l) < Expira(s[i].lote) /\ L[l] > 0) =>
        \E j \in DOMAIN s : s[j].lote = l

\* Reparto proporcional por SKU; el sobrante por redondeo va al Lote que
\* vence antes. Devuelve una secuencia ordenada por vencimiento (a lo sumo 2).
Reparto(consum, c) ==
  LET total == SumaCant(consum)
      crudas == {[lote |-> x.lote, cantidad |-> (c * x.cantidad) \div total] : x \in consum}
      sobr == c - SumaCant(crudas)
      cerc == (CHOOSE x \in consum : \A y \in consum : Expira(x.lote) <= Expira(y.lote)).lote
      pCerc == CHOOSE p \in crudas : p.lote = cerc
      ajustadas == IF sobr = 0 THEN crudas
                   ELSE (crudas \ {pCerc}) \cup {[pCerc EXCEPT !.cantidad = @ + sobr]}
      positivas == {p \in ajustadas : p.cantidad > 0}
      primero == CHOOSE p \in positivas : \A q \in positivas : Expira(p.lote) <= Expira(q.lote)
      resto == positivas \ {primero}
      segundo == IF resto = {} THEN <<>> ELSE <<CHOOSE q \in resto : TRUE>>
  IN <<primero>> \o segundo

\* Confirmacion con base: commit y espejo se modelan en un solo paso; el
\* Historial de la base y el de la memoria quedan iguales.
Confirmar(k, nuevo) ==
  /\ bdStock' = nuevo.stock
  /\ bdLotes' = nuevo.lotes
  /\ bdHist' = nuevo.hist
  /\ memStock' = nuevo.stock
  /\ memLotes' = nuevo.lotes
  /\ memHist' = nuevo.hist
  /\ idemp' = idemp \cup {k}

Init ==
  /\ bdStock = 0 /\ memStock = 0
  /\ bdLotes = [l \in Lotes |-> 0] /\ memLotes = [l \in Lotes |-> 0]
  /\ bdHist = <<>> /\ memHist = <<>>
  /\ idemp = {}
  /\ consumos = [k \in Idem |-> {}]
  /\ devoluciones = {}
  /\ reingresos = [k \in Idem |-> <<>>]
  /\ bajas = {}
  /\ fallos = {}
  /\ hechos = [o \in Ops |-> 0]

Alta(o, k, l, c) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ l \in Lotes
  /\ c \in 1..MAXCANT
  /\ bdStock + c <= MAXSTOCK
  /\ bdLotes[l] + c <= MAXCANT
  /\ Len(bdHist) < MAXMOV
  /\ LET m == [idem |-> k, lote |-> l, delta |-> c, tipo |-> "ALTA", motivo |-> ""]
         nuevo == AplicarMov(m, bdStock, bdLotes, bdHist)
     IN /\ Confirmar(k, nuevo)
        /\ UNCHANGED <<consumos, devoluciones, reingresos, bajas, fallos>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

Venta(o, k, s) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ s \in ConsumoPosible
  /\ LotesDistintos(s)
  /\ FefoOk(s, bdLotes)
  /\ \A i \in DOMAIN s : bdLotes[s[i].lote] >= s[i].cantidad
  /\ SumaItems(s) <= bdStock
  /\ Len(bdHist) + Len(s) <= MAXMOV
  /\ LET ms == [i \in DOMAIN s |-> [idem |-> k, lote |-> s[i].lote,
                                    delta |-> (0 - s[i].cantidad),
                                    tipo |-> "VENTA", motivo |-> ""]]
         nuevo == AplicarMs(ms, bdStock, bdLotes, bdHist)
     IN /\ Confirmar(k, nuevo)
        /\ consumos' = [consumos EXCEPT ![k] =
             {[lote |-> s[i].lote, cantidad |-> s[i].cantidad] : i \in DOMAIN s}]
        /\ bajas' = bajas \cup
             {[lote |-> s[i].lote, delta |-> (0 - s[i].cantidad)] : i \in DOMAIN s}
        /\ UNCHANGED <<devoluciones, reingresos, fallos>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

Sobreventa(o, k, c) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ c \in 1..MAXCANT
  /\ bdStock < c
  /\ Len(bdHist) < MAXMOV
  /\ LET m == [idem |-> k, lote |-> NA, delta |-> (0 - c),
               tipo |-> "VENTA", motivo |-> SOBREVENTA]
         nuevo == AplicarMov(m, bdStock, bdLotes, bdHist)
     IN /\ Confirmar(k, nuevo)
        /\ UNCHANGED <<consumos, devoluciones, reingresos, bajas, fallos>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

BajaVencido(o, k, l) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ l \in {L1, L2}
  /\ bdLotes[l] > 0
  /\ Len(bdHist) < MAXMOV
  /\ LET c == bdLotes[l]
         m == [idem |-> k, lote |-> l, delta |-> (0 - c), tipo |-> "MERMA", motivo |-> ""]
         nuevo == AplicarMov(m, bdStock, bdLotes, bdHist)
     IN /\ Confirmar(k, nuevo)
        /\ bajas' = bajas \cup {[lote |-> l, delta |-> (0 - c)]}
        /\ UNCHANGED <<consumos, devoluciones, reingresos, fallos>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

Devolucion(o, k, ks, c) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ ks \in idemp
  /\ ks /= k
  /\ consumos[ks] /= {}
  /\ c \in 1..SumaCant(consumos[ks])
  /\ LET rep == Reparto(consumos[ks], c)
         ms == [i \in DOMAIN rep |-> [idem |-> k, lote |-> rep[i].lote,
                                      delta |-> rep[i].cantidad,
                                      tipo |-> "COMPENSATORIO", motivo |-> ""]]
         nuevo == AplicarMs(ms, bdStock, bdLotes, bdHist)
     IN /\ Len(bdHist) + Len(rep) <= MAXMOV
        /\ bdStock + c <= MAXSTOCK
        /\ \A i \in DOMAIN rep : bdLotes[rep[i].lote] + rep[i].cantidad <= MAXCANT
        /\ Confirmar(k, nuevo)
        /\ reingresos' = [reingresos EXCEPT ![k] = rep]
        /\ devoluciones' = devoluciones \cup {[idem |-> k, sale |-> ks, cantidad |-> c]}
        /\ UNCHANGED <<consumos, bajas, fallos>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

\* La base configurada falla: se propaga y no se toca la memoria. Con
\* ESPEJO_TRAS_FALLO el codigo viejo espeja igual (bug de T04).
Falla(o, k, l, c) ==
  /\ hechos[o] < MAXOPS
  /\ k \notin idemp
  /\ l \in Lotes
  /\ c \in 1..MAXCANT
  /\ bdLotes[l] >= c
  /\ bdStock >= c
  /\ Len(bdHist) < MAXMOV
  /\ LET m == [idem |-> k, lote |-> l, delta |-> (0 - c), tipo |-> "VENTA", motivo |-> ""]
         antes == [stock |-> memStock, lotes |-> memLotes, hist |-> memHist]
         nuevo == AplicarMov(m, memStock, memLotes, memHist)
         despues == IF ESPEJO_TRAS_FALLO
                    THEN [stock |-> nuevo.stock, lotes |-> nuevo.lotes, hist |-> nuevo.hist]
                    ELSE antes
     IN /\ fallos' = fallos \cup {[idem |-> k, antes |-> antes, despues |-> despues]}
        /\ IF ESPEJO_TRAS_FALLO
           THEN /\ memStock' = nuevo.stock
                /\ memLotes' = nuevo.lotes
                /\ memHist' = nuevo.hist
           ELSE UNCHANGED <<memStock, memLotes, memHist>>
        /\ UNCHANGED <<bdStock, bdLotes, bdHist, idemp, consumos,
                       devoluciones, reingresos, bajas>>
  /\ hechos' = [hechos EXCEPT ![o] = @ + 1]

Next ==
  \E o \in Ops, k \in Idem :
    \/ \E l \in Lotes, c \in 1..MAXCANT : \/ Alta(o, k, l, c) \/ Falla(o, k, l, c)
    \/ \E s \in ConsumoPosible : Venta(o, k, s)
    \/ \E c \in 1..MAXCANT : Sobreventa(o, k, c)
    \/ \E l \in {L1, L2} : BajaVencido(o, k, l)
    \/ \E ks \in Idem, c \in 1..MAXCANT : Devolucion(o, k, ks, c)

Spec == Init /\ [][Next]_vars

(* Leyes *)

\* 1. Los tres numeros coinciden en cada store: Historial (sin sobreventa),
\*    Stock disponible y suma de lotes.
TresNumeros ==
  /\ bdStock = SumaDeltas(bdHist) /\ bdStock = SumaLotes(bdLotes)
  /\ memStock = SumaDeltas(memHist) /\ memStock = SumaLotes(memLotes)

\* 2. Si la base falla, no se espeja: ningun movimiento vive solo en memoria
\*    y el intento fallido no deja rastro en las proyecciones.
SinEspejoTrasFallo ==
  /\ SeqToSet(memHist) \subseteq SeqToSet(bdHist)
  /\ \A f \in fallos : f.antes = f.despues

\* 3. Toda devolucion reingresa a los Lotes consumidos por la venta (clave de
\*    idempotencia), con el reparto proporcional y el sobrante al que vence
\*    antes, escrito en la misma transaccion que la devolucion.
DevolucionAlLoteOriginal ==
  \A d \in devoluciones :
    /\ reingresos[d.idem] = Reparto(consumos[d.sale], d.cantidad)
    /\ \A p \in {reingresos[d.idem][i] : i \in DOMAIN reingresos[d.idem]} :
         \E m \in SeqToSet(bdHist) :
           /\ m.tipo = "COMPENSATORIO" /\ m.idem = d.idem
           /\ m.lote = p.lote /\ m.delta = p.cantidad

\* 4. Toda baja de Lote tiene su movimiento en el Historial, y todo
\*    movimiento de salida (salvo la sobreventa) tiene su baja.
BajaConMovimiento ==
  /\ \A b \in bajas : \E m \in SeqToSet(bdHist) : m.lote = b.lote /\ m.delta = b.delta
  /\ \A m \in SeqToSet(bdHist) :
       (m.delta < 0 /\ m.motivo /= SOBREVENTA) =>
         \E b \in bajas : b.lote = m.lote /\ b.delta = m.delta
===============================================================================
