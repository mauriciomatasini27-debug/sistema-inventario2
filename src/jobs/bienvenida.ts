import { control } from "../lib/store.js";
import { claveBienvenida } from "../modules/onboarding/estado.js";
import { decidir_bienvenida, texto_bienvenida, BOTONES_BIENVENIDA } from "../modules/onboarding/bienvenida.js";

export interface ResultadoBienvenida {
  canal: "libre" | "plantilla" | "nada";
  enviada: boolean;
}

export function ejecutarBienvenida(input: {
  tenantId: string;
  numero: string;
  nombre: string;
  comercio: string;
  escribioPrimero: boolean;
  ventanaAbierta: boolean;
  optIn: boolean;
}): ResultadoBienvenida {
  const clave = claveBienvenida(input.tenantId, input.numero);
  const yaEnviada = control.bienvenidas.has(clave);
  const decision = decidir_bienvenida({
    escribioPrimero: input.escribioPrimero,
    ventanaAbierta: input.ventanaAbierta,
    optIn: input.optIn,
    yaEnviada,
  });
  if (decision.canal === "nada") return { canal: "nada", enviada: false };
  control.bienvenidas.add(clave);
  control.events.push({
    tenantId: input.tenantId,
    tipo: "bienvenida_enviada",
    detalle: { canal: decision.canal, onboarding: true },
  });
  control.opsOutbox.push({
    tipo: "bienvenida_enviada",
    payload: {
      tenant_id: input.tenantId,
      canal: decision.canal,
      texto: texto_bienvenida(input.nombre, input.comercio),
      botones: [...BOTONES_BIENVENIDA],
      onboarding: true,
      occurred_at: new Date().toISOString(),
    },
  });
  return { canal: decision.canal, enviada: true };
}
