import { describe, expect, it } from "vitest";
import {
  CLAVE_LEGADA_OUTBOX,
  CLAVE_LEGADA_SEQ,
  claveOutboxCola,
  type ItemCola,
  type RespuestaPush,
  type StorageCola,
} from "../src/offline/cola-venta.js";
import { drenadoUnico, textoDeDrenado, type ResultadoDrenado } from "../src/offline/drenado-unico.js";

function item(op_id: string, seq = 1): ItemCola {
  return { op_id, device_code: "caja-01", device_seq: seq, payload: { op_id } };
}

function memoria(seed: Record<string, unknown> = {}) {
  const datos = new Map<string, string>();
  for (const [clave, valor] of Object.entries(seed)) datos.set(clave, JSON.stringify(valor));
  let profundidad = 0;
  let anidada = false;
  const storage: StorageCola = {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave)! : null),
    setItem: (clave, valor) => {
      profundidad += 1;
      if (profundidad > 1) anidada = true;
      datos.set(clave, valor);
      profundidad -= 1;
    },
    removeItem: (clave) => {
      datos.delete(clave);
    },
  };
  return {
    storage,
    anidada: () => anidada,
    json: (clave: string) => (datos.has(clave) ? (JSON.parse(datos.get(clave)!) as unknown) : null),
    poner: (clave: string, valor: unknown) => {
      datos.set(clave, JSON.stringify(valor));
    },
  };
}

function ok(): RespuestaPush {
  return { status: 201, cuerpo: {} };
}

const ceros = { confirmados: 0, pendientes: 0, sensibles: 0, cortado: false };

describe("drenado único de la cola de venta", () => {
  it("un drenar vacía la cola del tenant sin el botón", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("op-1")] });
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem.storage,
      tenantId: "t-1",
      enviar: async (i) => {
        enviados.push(i.op_id);
        return ok();
      },
    });

    const resultado = await drenado.drenar();

    expect(enviados).toEqual(["op-1"]);
    expect(mem.json(clave)).toEqual([]);
    expect(resultado.tenant).toEqual({ confirmados: 1, pendientes: 0, sensibles: 0, cortado: false });
  });

  it("con el push caído la venta sigue en la cola y no hay otra pasada", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("op-1")] });
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem.storage,
      tenantId: "t-1",
      enviar: async (i) => {
        enviados.push(i.op_id);
        throw new Error("sin red");
      },
    });

    const resultado = await drenado.drenar();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(enviados).toEqual(["op-1"]);
    expect(mem.json(clave)).toEqual([item("op-1")]);
    expect(resultado.tenant.cortado).toBe(true);
  });

  it("dos drenar solapados no envían en paralelo y comparten el resultado", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("A", 1), item("B", 2)] });
    const vuelo = enviarConCompuerta();
    const drenado = drenadoUnico({ storage: mem.storage, tenantId: "t-1", enviar: vuelo.enviar });

    const primero = drenado.drenar();
    await vuelo.estaAdentro;
    const segundo = drenado.drenar();
    vuelo.soltar();
    const [a, b] = await Promise.all([primero, segundo]);

    expect(segundo).toBe(primero);
    expect(a).toBe(b);
    expect(vuelo.maximo()).toBe(1);
    expect(vuelo.enviados).toEqual(["A", "B"]);
    expect(mem.json(clave)).toEqual([]);
    expect(mem.anidada()).toBe(false);
    expect(a.tenant).toEqual({ confirmados: 2, pendientes: 0, sensibles: 0, cortado: false });
  });

  it("un alta durante el vuelo sale en la pasada extra", async () => {
    const corrida = await altaDuranteVuelo(true);
    expect(corrida.marcas).toEqual(["entra A", "sale A", "entra C", "sale C"]);
    expect(corrida.enviados).toEqual(["A", "C"]);
    expect(corrida.cola).toEqual([]);
    expect(corrida.anidada).toBe(false);
  });

  it("sin el segundo drenar el alta que entró durante el vuelo sigue en la cola", async () => {
    const corrida = await altaDuranteVuelo(false);
    expect(corrida.enviados).toEqual(["A"]);
    expect(corrida.cola).toEqual([item("C", 3)]);
    expect(corrida.anidada).toBe(false);
  });

  it("la pasada extra no reescribe la cola en paralelo", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("A", 1), item("B", 2)] });
    const vuelo = enviarConCompuerta();
    const drenado = drenadoUnico({ storage: mem.storage, tenantId: "t-1", enviar: vuelo.enviar });
    const primero = drenado.drenar();
    await vuelo.estaAdentro;
    const segundo = drenado.drenar();
    vuelo.soltar();
    await Promise.all([primero, segundo]);
    const alta = await altaDuranteVuelo(true);

    expect(mem.anidada()).toBe(false);
    expect(alta.anidada).toBe(false);
  });

  it("drena la legada antes que el tenant y borra la legada solo si quedó vacía", async () => {
    const mem = memoria({
      [CLAVE_LEGADA_OUTBOX]: [item("leg", 1)],
      [claveOutboxCola("t-1")]: [item("ten", 2)],
    });
    mem.storage.setItem(CLAVE_LEGADA_SEQ, "4");
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem.storage,
      tenantId: "t-1",
      enviar: async (i) => {
        enviados.push(i.op_id);
        return ok();
      },
    });

    const resultado = await drenado.drenar();

    expect(enviados).toEqual(["leg", "ten"]);
    expect(mem.storage.getItem(CLAVE_LEGADA_OUTBOX)).toBeNull();
    expect(mem.storage.getItem(CLAVE_LEGADA_SEQ)).toBeNull();
    expect(resultado.legado).toEqual({ confirmados: 1, pendientes: 0, sensibles: 0, cortado: false });
    expect(resultado.tenant.confirmados).toBe(1);
  });

  it("un 503 en la legada no borra esas claves y igual intenta el tenant", async () => {
    const mem = memoria({
      [CLAVE_LEGADA_OUTBOX]: [item("leg", 1)],
      [claveOutboxCola("t-1")]: [item("ten", 2)],
    });
    mem.storage.setItem(CLAVE_LEGADA_SEQ, "4");
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem.storage,
      tenantId: "t-1",
      enviar: async (i) => {
        enviados.push(i.op_id);
        return i.op_id === "leg" ? { status: 503, cuerpo: {} } : ok();
      },
    });

    const resultado = await drenado.drenar();

    expect(enviados).toEqual(["leg", "ten"]);
    expect(mem.json(CLAVE_LEGADA_OUTBOX)).toEqual([item("leg", 1)]);
    expect(mem.storage.getItem(CLAVE_LEGADA_SEQ)).toBe("4");
    expect(resultado.legado?.cortado).toBe(true);
    expect(resultado.tenant).toEqual({ confirmados: 1, pendientes: 0, sensibles: 0, cortado: false });
  });

  it("sin tenant hay una sola pasada de la clave legada", async () => {
    const lecturas = { n: 0 };
    const base = memoria({ [CLAVE_LEGADA_OUTBOX]: [item("op-1")] });
    const storage: StorageCola = {
      getItem: (clave) => {
        if (clave === CLAVE_LEGADA_OUTBOX) lecturas.n += 1;
        return base.storage.getItem(clave);
      },
      setItem: (clave, valor) => base.storage.setItem(clave, valor),
      removeItem: (clave) => base.storage.removeItem(clave),
    };
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage,
      tenantId: null,
      enviar: async (i) => {
        enviados.push(i.op_id);
        return ok();
      },
    });

    await drenado.drenar();

    expect(enviados).toEqual(["op-1"]);
    // Una pasada de sincronizarColaVenta lee al empezar y al confirmar. Cuatro sería legada y tenant.
    expect(lecturas.n).toBe(2);
    expect(base.storage.getItem(CLAVE_LEGADA_OUTBOX)).toBe("[]");
  });

  it("tenantId vacío también es una sola pasada de la clave legada", async () => {
    const lecturas = { n: 0 };
    const base = memoria({ [CLAVE_LEGADA_OUTBOX]: [item("op-1")] });
    const storage: StorageCola = {
      getItem: (clave) => {
        if (clave === CLAVE_LEGADA_OUTBOX) lecturas.n += 1;
        return base.storage.getItem(clave);
      },
      setItem: (clave, valor) => base.storage.setItem(clave, valor),
      removeItem: (clave) => base.storage.removeItem(clave),
    };
    const drenado = drenadoUnico({
      storage,
      tenantId: "",
      enviar: async () => ok(),
    });

    await drenado.drenar();

    expect(lecturas.n).toBe(2);
  });

  it("el botón a mitad de un éxito no anuncia cero", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("A")] });
    const vuelo = enviarConCompuerta();
    const drenado = drenadoUnico({ storage: mem.storage, tenantId: "t-1", enviar: vuelo.enviar });

    const primero = drenado.drenar();
    await vuelo.estaAdentro;
    const segundo = drenado.drenar();
    vuelo.soltar();
    const resultado = await primero;
    expect(await segundo).toBe(resultado);

    expect(resultado.tenant.pendientes).toBe(0);
    expect(resultado.tenant.confirmados).toBe(1);
    expect(textoDeDrenado("boton", resultado)).toBe("sync intentado (1)");
    expect(vuelo.enviados).toEqual(["A"]);
  });

  it("la línea calla si no se movió nada y el botón no", () => {
    const quieto: ResultadoDrenado = { tenant: ceros, legado: null };
    expect(textoDeDrenado("linea", quieto)).toBeNull();
    expect(textoDeDrenado("boton", quieto)).toBe("sync intentado (0)");

    const cortado: ResultadoDrenado = {
      tenant: { confirmados: 0, pendientes: 2, sensibles: 0, cortado: true },
      legado: null,
    };
    expect(textoDeDrenado("linea", cortado)).toBe("sync cortado: 2 pendiente(s)");
    expect(textoDeDrenado("boton", cortado)).toBe("sync cortado: 2 pendiente(s)");

    const sensibles: ResultadoDrenado = {
      tenant: { confirmados: 0, pendientes: 0, sensibles: 1, cortado: false },
      legado: null,
    };
    expect(textoDeDrenado("linea", sensibles)).toBe("Necesita conexión (1 sensible(s) solo online)");
    expect(textoDeDrenado("boton", sensibles)).toBe("Necesita conexión (1 sensible(s) solo online)");

    const soloLegada: ResultadoDrenado = {
      tenant: ceros,
      legado: { confirmados: 1, pendientes: 0, sensibles: 0, cortado: false },
    };
    expect(textoDeDrenado("linea", soloLegada)).toBe("sync intentado (0)");
  });

  it("un fallo solapado reintenta una vez porque el segundo caller lo pidió", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("op-1")] });
    const vuelo = enviarConCompuerta({ fallar: true });
    const drenado = drenadoUnico({ storage: mem.storage, tenantId: "t-1", enviar: vuelo.enviar });

    const primero = drenado.drenar();
    await vuelo.estaAdentro;
    const segundo = drenado.drenar();
    vuelo.soltar();
    await Promise.all([primero, segundo]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vuelo.enviados).toEqual(["op-1", "op-1"]);
    expect(mem.json(clave)).toEqual([item("op-1")]);
    expect(vuelo.maximo()).toBe(1);
  });

  it("dos instancias no comparten el vuelo", async () => {
    const bloqueado = enviarConCompuerta();
    const mem1 = memoria({ [claveOutboxCola("t-1")]: [item("A")] });
    const mem2 = memoria({ [claveOutboxCola("t-2")]: [item("B")] });
    const uno = drenadoUnico({ storage: mem1.storage, tenantId: "t-1", enviar: bloqueado.enviar });
    const enviados2: string[] = [];
    const dos = drenadoUnico({
      storage: mem2.storage,
      tenantId: "t-2",
      enviar: async (i) => {
        enviados2.push(i.op_id);
        return ok();
      },
    });

    const primero = uno.drenar();
    await bloqueado.estaAdentro;
    const resultado2 = await dos.drenar();
    bloqueado.soltar();
    await primero;

    expect(resultado2.tenant.confirmados).toBe(1);
    expect(enviados2).toEqual(["B"]);
    expect(mem2.json(claveOutboxCola("t-2"))).toEqual([]);
  });
});

function enviarConCompuerta(opts: { fallar?: boolean } = {}) {
  const enviados: string[] = [];
  const marcas: string[] = [];
  let enVuelo = 0;
  let maximo = 0;
  let soltar = () => {};
  let marcar = () => {};
  const esperar = new Promise<void>((resolve) => {
    soltar = resolve;
  });
  const estaAdentro = new Promise<void>((resolve) => {
    marcar = resolve;
  });
  let primero = true;
  const enviar = async (i: ItemCola): Promise<RespuestaPush> => {
    enVuelo += 1;
    maximo = Math.max(maximo, enVuelo);
    enviados.push(i.op_id);
    marcas.push(`entra ${i.op_id}`);
    const bloquear = primero;
    primero = false;
    if (bloquear) marcar();
    try {
      if (bloquear) await esperar;
      if (opts.fallar) throw new Error("sin red");
      return ok();
    } finally {
      marcas.push(`sale ${i.op_id}`);
      enVuelo -= 1;
    }
  };
  return { enviar, enviados, marcas, estaAdentro, soltar, maximo: () => maximo };
}

async function altaDuranteVuelo(pedirExtra: boolean) {
  const clave = claveOutboxCola("t-1");
  const mem = memoria({ [clave]: [item("A", 1)] });
  const vuelo = enviarConCompuerta();
  const drenado = drenadoUnico({ storage: mem.storage, tenantId: "t-1", enviar: vuelo.enviar });
  const primero = drenado.drenar();
  await vuelo.estaAdentro;
  const actual = mem.json(clave);
  mem.poner(clave, [...(Array.isArray(actual) ? actual : []), item("C", 3)]);
  if (pedirExtra) drenado.drenar();
  vuelo.soltar();
  await primero;
  return {
    marcas: vuelo.marcas,
    enviados: vuelo.enviados,
    cola: mem.json(clave),
    anidada: mem.anidada(),
  };
}
