// Empleado ON11 sin UX. Vinculación opcional con el mismo mecanismo
// de ON2 y bienvenida corta libre. Puro sin IO.
export function bienvenida_empleado(nombre: string, comercio: string): string {
  const quien = nombre.trim() || "hola";
  return `¡Hola, ${quien}! Ya podés consultarme el stock de ${comercio}. Probá: ¿dónde está el Jorgito?`;
}

export function checklist_empleado(): Array<{ id: string; titulo: string }> {
  return [
    { id: "tour", titulo: "Mirá el tour de empleado" },
    { id: "buscar", titulo: "Buscá un producto y su ubicación" },
    { id: "venta-ejemplo", titulo: "Hacé una venta de prueba en modo ejemplo" },
  ];
}

// Por qué genérico: no revelar de qué comercio es el número (ON2.8).
export function mensaje_numero_en_uso(): string {
  return "Este número ya está vinculado a otro comercio. Usá otro número o pedí ayuda.";
}
