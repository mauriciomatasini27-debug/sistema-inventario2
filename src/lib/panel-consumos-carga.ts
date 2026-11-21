export type CargadorCuentasConsumos<T> = {
  cargar: () => Promise<T>;
  invalidar: () => void;
};

// P1-48 / P1-90: cada visita a /panel/consumos debe disparar un fetch nuevo.
// No reutilizar la promesa en curso (if (cuentasPromesa) return …) deja "Cargando…" al volver a la ruta.
export function crearCargadorCuentasConsumos<T>(pedir: () => Promise<T>): CargadorCuentasConsumos<T> {
  let cuentasPromesa: Promise<T> | null = null;

  const invalidar = () => {
    cuentasPromesa = null;
  };

  const cargar = () => {
    const promesa = pedir();
    cuentasPromesa = promesa;
    return promesa;
  };

  return { cargar, invalidar };
}