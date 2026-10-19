----------------------------- MODULE PlanCambio -----------------------------
EXTENDS Naturals, Sequences, FiniteSets

(***************************************************************************
Baja programada de plan (PLAN-S4) y su rodado perezoso al leer la suscripcion.
Describe el codigo de este repo:

  src/pages/api/plan/cambiar.ts, POST
    leerCatalogo(); activa = leerSuscripcionActiva(tenantId)     -> Leer
    si destino = activa.planId (ya rodada):
      si activa.planProgramado != null -> programarCambioPlan(null, null)
                                                                 -> MismoPlan
    si destino es mas caro -> 409 requiere_cobro, sin escribir   -> Subida
    si destino es mas barato:
      fecha = fechaCambioDePlan(activa.desde, activa.hasta, ahora)
      programarCambioPlan(destino, inicioDiaAR(fecha))           -> Baja

  src/modules/planes/ciclo.ts
    fechaCambioDePlan: usa `hasta` si sigue vigente; si no, el proximo
      aniversario mensual de `desde` (aca, el dia siguiente del reloj acotado).
    planVigenteDe: si `ahora` >= `hasta`, el vigente es `planProgramado`.
    inicioDiaAR: guarda `hasta` como el dia civil en que rige.

  src/lib/repos/planes.ts
    leerSuscripcionActiva: aplica planVigenteDe y persiste el rodado
      (plan = programado, planProgramado = null, hasta = null, desde = hasta).
      Es perezoso: si nadie lee despues de `hasta`, la fila sigue igual.
    programarCambioPlan: escribe planProgramado y hasta; no toca el plan
      vigente. Con null, null cancela.

Dos pedidos del Dueno (Pedidos = 1..N_PEDIDOS) corren intercalados. Cada uno
lee (y roda si toca), decide y escribe. La ventana de carrera es entre esa
lectura y esa escritura: el pedido B puede programar/cancelar despues de la
lectura de A. Un pedido se puede reiniciar hasta MAX_PEDIDOS veces para
recorrer dos ciclos con el reloj de dias acotado.

Banderas (el codigo actual va en plan-cambio.cfg):
  BAJA_ANTES         TRUE = el rodado aplica el programado aunque `dia` < `hasta`.
  DOS_CAMBIOS        TRUE = el rodado no limpia planProgramado/hasta; el mismo
                            programado se vuelve a aplicar en la lectura siguiente.
  SUBIDA_ALTERA      TRUE = el 409 de subida igual toca la suscripcion.
  PROGRAMA_SIN_HASTA TRUE = la baja guarda planProgramado con hasta = 0 (null).
  NO_CANCELA         TRUE = pedir el mismo plan no cancela el programado.

El precio solo decide subida o baja (Nivel); el prorrateo de PLAN-S3 y el
calendario mensual real quedan afuera.
***************************************************************************)

CONSTANTS DIA_MAX, N_PEDIDOS, MAX_PEDIDOS,
          BAJA_ANTES, DOS_CAMBIOS, SUBIDA_ALTERA, PROGRAMA_SIN_HASTA, NO_CANCELA

Planes == {"basico", "plus", "pro"}
Dias == 1..DIA_MAX
Pedidos == 1..N_PEDIDOS

Nivel(p) == CASE p = "basico" -> 1
                [] p = "plus"  -> 2
                [] OTHER       -> 3

VARIABLES
  dia,          \* reloj de dias acotado; 1..DIA_MAX cubre dos ciclos
  plan,         \* subscriptions.plan_id persistido
  prog,         \* subscriptions.plan_programado ("ninguno" = null)
  hasta,        \* subscriptions.hasta como dia civil (0 = null)
  progId,       \* id del programado pendiente (0 = ninguno)
  nprog,        \* ultimo id de programado usado
  programas,    \* set de [id, destino, hasta] aceptados por Baja
  cambios,      \* secuencia de [id, dia, destino] aplicados por el rodado
  pedidosHechos,\* pedidos iniciados (cota MAX_PEDIDOS)
  pc,           \* paso de cada pedido
  destino,      \* plan pedido por cada pedido
  snap,         \* vista (ya rodada) que devuelve leerSuscripcionActiva
  respuestas,   \* set de [pedido, tipo, codigo, antes, despues]
  cancelaciones \* set de [pedido, antes, despues]

vars == <<dia, plan, prog, hasta, progId, nprog, programas, cambios,
          pedidosHechos, pc, destino, snap, respuestas, cancelaciones>>

Init ==
  /\ dia = 1
  /\ plan = "plus"
  /\ prog = "ninguno"
  /\ hasta = 0
  /\ progId = 0
  /\ nprog = 0
  /\ programas = {}
  /\ cambios = <<>>
  /\ pedidosHechos = 0
  /\ pc = [r \in Pedidos |-> "inicio"]
  /\ destino = [r \in Pedidos |-> "plus"]
  /\ snap = [r \in Pedidos |-> [plan |-> "plus", prog |-> "ninguno", hasta |-> 0]]
  /\ respuestas = {}
  /\ cancelaciones = {}

Iniciar(r) ==
  /\ pc[r] \in {"inicio", "fin"}
  /\ pedidosHechos < MAX_PEDIDOS
  /\ \E d \in Planes :
       /\ destino' = [destino EXCEPT ![r] = d]
       /\ pc' = [pc EXCEPT ![r] = "leyendo"]
       /\ pedidosHechos' = pedidosHechos + 1
       /\ UNCHANGED <<dia, plan, prog, hasta, progId, nprog, programas,
                      cambios, snap, respuestas, cancelaciones>>

\* planVigenteDe: el programado rige desde `hasta` (o antes, con BAJA_ANTES).
AplicaRollover ==
  IF BAJA_ANTES
  THEN prog /= "ninguno"
  ELSE prog /= "ninguno" /\ hasta /= 0 /\ dia >= hasta

\* leerSuscripcionActiva: roda si toca, persiste y devuelve la vista.
Leer(r) ==
  /\ pc[r] = "leyendo"
  /\ IF AplicaRollover
     THEN /\ plan' = prog
          /\ cambios' = Append(cambios, [id |-> progId, dia |-> dia, destino |-> prog])
          /\ IF DOS_CAMBIOS
             THEN UNCHANGED <<prog, hasta, progId>>
             ELSE /\ prog' = "ninguno" /\ hasta' = 0 /\ progId' = 0
     ELSE /\ UNCHANGED <<plan, prog, hasta, progId, cambios>>
  /\ snap' = [snap EXCEPT ![r] =
                [plan |-> plan', prog |-> prog', hasta |-> hasta']]
  /\ pc' = [pc EXCEPT ![r] = "decidir"]
  /\ UNCHANGED <<dia, nprog, programas, pedidosHechos, destino,
                 respuestas, cancelaciones>>

\* destino = plan vigente: con un programado pendiente, lo cancela.
MismoPlan(r) ==
  /\ pc[r] = "decidir"
  /\ destino[r] = snap[r].plan
  /\ IF snap[r].prog /= "ninguno"
     THEN /\ cancelaciones' = cancelaciones \cup
              {[pedido |-> r,
                antes |-> [plan |-> plan, prog |-> prog, hasta |-> hasta],
                despues |-> [plan |-> plan,
                             prog |-> IF NO_CANCELA THEN prog ELSE "ninguno",
                             hasta |-> IF NO_CANCELA THEN hasta ELSE 0]]}
          /\ IF NO_CANCELA
             THEN UNCHANGED <<prog, hasta, progId>>
             ELSE /\ prog' = "ninguno" /\ hasta' = 0 /\ progId' = 0
     ELSE /\ UNCHANGED <<prog, hasta, progId, cancelaciones>>
  /\ pc' = [pc EXCEPT ![r] = "fin"]
  /\ UNCHANGED <<dia, plan, nprog, programas, cambios, pedidosHechos,
                 destino, snap, respuestas>>

\* Subir: 409 requiere_cobro. El codigo actual no escribe nada.
Subida(r) ==
  /\ pc[r] = "decidir"
  /\ Nivel(destino[r]) > Nivel(snap[r].plan)
  /\ \/ /\ SUBIDA_ALTERA
        /\ plan' = destino[r]
        /\ UNCHANGED <<prog, hasta, progId, programas, cambios, cancelaciones>>
        /\ respuestas' = respuestas \cup
             {[pedido |-> r, tipo |-> "subida", codigo |-> 409,
               antes |-> [plan |-> plan, prog |-> prog, hasta |-> hasta],
               despues |-> [plan |-> destino[r], prog |-> prog, hasta |-> hasta]]}
     \/ /\ ~SUBIDA_ALTERA
        /\ UNCHANGED <<plan, prog, hasta, progId, programas, cambios, cancelaciones>>
        /\ respuestas' = respuestas \cup
             {[pedido |-> r, tipo |-> "subida", codigo |-> 409,
               antes |-> [plan |-> plan, prog |-> prog, hasta |-> hasta],
               despues |-> [plan |-> plan, prog |-> prog, hasta |-> hasta]]}
  /\ pc' = [pc EXCEPT ![r] = "fin"]
  /\ UNCHANGED <<dia, nprog, pedidosHechos, destino, snap>>

\* Bajar: programa a fin de ciclo. Reusa el `hasta` vigente de la vista; si
\* no hay, el dia siguiente (el proximo aniversario en el modelo real).
Baja(r) ==
  /\ pc[r] = "decidir"
  /\ Nivel(destino[r]) < Nivel(snap[r].plan)
  /\ dia < DIA_MAX
  /\ LET fecha == IF snap[r].hasta /= 0 /\ snap[r].hasta >= dia
                  THEN snap[r].hasta
                  ELSE dia + 1
         nuevoId == nprog + 1
         guardada == IF PROGRAMA_SIN_HASTA THEN 0 ELSE fecha
     IN /\ prog' = destino[r]
        /\ hasta' = guardada
        /\ progId' = nuevoId
        /\ nprog' = nuevoId
        /\ programas' = programas \cup
             {[id |-> nuevoId, destino |-> destino[r], hasta |-> fecha]}
        /\ UNCHANGED <<plan, cambios, respuestas, cancelaciones>>
  /\ pc' = [pc EXCEPT ![r] = "fin"]
  /\ UNCHANGED <<dia, pedidosHechos, destino, snap>>

AvanzarDia ==
  /\ dia < DIA_MAX
  /\ dia' = dia + 1
  /\ UNCHANGED <<plan, prog, hasta, progId, nprog, programas, cambios,
                 pedidosHechos, pc, destino, snap, respuestas, cancelaciones>>

Next ==
  \/ AvanzarDia
  \/ \E r \in Pedidos :
       \/ Iniciar(r) \/ Leer(r) \/ MismoPlan(r) \/ Subida(r) \/ Baja(r)

Spec == Init /\ [][Next]_vars

(* Leyes *)
CambiosDe(id) == SelectSeq(cambios, LAMBDA c : c.id = id)

\* Una baja programada se aplica a lo sumo una vez y nunca antes de su `hasta`.
UnSoloCambio ==
  /\ \A id \in {p.id : p \in programas} : Len(CambiosDe(id)) <= 1
  /\ \A i \in 1..Len(cambios) :
       \E p \in programas :
         /\ p.id = cambios[i].id
         /\ cambios[i].dia >= p.hasta
         /\ cambios[i].destino = p.destino

\* Un pedido de subida responde 409 y deja intacta la suscripcion.
SinUpgradeSinCobro ==
  \A e \in respuestas :
    (e.tipo = "subida") =>
      (e.codigo = 409 /\ e.antes = e.despues)

\* Nunca queda plan_programado sin `hasta`, ni en la fila ni en la historia.
ProgramadoCompleto ==
  /\ (prog = "ninguno") \/ (hasta /= 0)
  /\ \A p \in programas : p.hasta /= 0

\* Pedir el plan vigente cancela el programado: plan_programado y hasta en null.
CancelaMismoPlan ==
  \A e \in cancelaciones :
    /\ e.despues.plan = e.antes.plan
    /\ e.despues.prog = "ninguno"
    /\ e.despues.hasta = 0
================================================================================
