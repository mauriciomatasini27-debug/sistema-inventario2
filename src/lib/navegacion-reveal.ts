export interface ElementoRevelable {
  classList: { add: (...clases: string[]) => void };
}

export interface EntradaObservada {
  isIntersecting: boolean;
  target: ElementoRevelable;
}

export interface Observador {
  observe: (elemento: ElementoRevelable) => void;
  unobserve: (elemento: ElementoRevelable) => void;
  disconnect: () => void;
}

export interface OpcionesReveal {
  elementos: readonly ElementoRevelable[];
  reduce: boolean;
  crearObservador?: (alIntersectar: (entradas: EntradaObservada[]) => void) => Observador;
}

export interface ResultadoReveal {
  revelados: number;
  observador?: Observador;
}

export function iniciarReveal({ elementos, reduce, crearObservador }: OpcionesReveal): ResultadoReveal {
  if (reduce || !crearObservador || elementos.length === 0) return { revelados: 0 };

  for (const elemento of elementos) elemento.classList.add("reveal");

  const observador = crearObservador((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      entrada.target.classList.add("visible");
      observador.unobserve(entrada.target);
    }
  });

  for (const elemento of elementos) observador.observe(elemento);

  return { revelados: elementos.length, observador };
}
