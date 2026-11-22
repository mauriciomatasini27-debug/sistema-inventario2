export interface ReclamadorEntrega {
  reclamar(clave: string, valor: string): Promise<boolean>;
  liberar(clave: string): Promise<void>;
}

export function reclamadorMemoria(mapa: Map<string, string>): ReclamadorEntrega {
  return {
    reclamar: async (clave, valor) => {
      if (mapa.has(clave)) return false;
      mapa.set(clave, valor);
      return true;
    },
    liberar: async (clave) => {
      mapa.delete(clave);
    },
  };
}
