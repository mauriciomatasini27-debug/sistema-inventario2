// Checklist ON8 sin UX. El avance se calcula con datos reales,
// no se tilda a mano. Puro sin IO.
export interface DatosChecklist {
  productos: number;
  productosConUmbral: number;
  proveedores: number;
  invitaciones: number;
  whatsappVerificado: boolean;
  esEjemplo?: boolean | undefined;
}

export const ID_CHECKLIST_EMPLEADO = "empleado" as const;

export interface PasoChecklist {
  id: "productos" | "umbrales" | "proveedor" | "whatsapp" | typeof ID_CHECKLIST_EMPLEADO;
  titulo: string;
  contador: string | null;
  listo: boolean;
  noAplica?: boolean | undefined;
}

export const META_PRODUCTOS = 10;
export const META_UMBRALES = 5;

// Por qué esEjemplo excluye: los datos de ejemplo no cuentan (ON8, ON10.5).
export function calcular_checklist(d: DatosChecklist): { pasos: PasoChecklist[]; listos: number; total: number } {
  if (d.esEjemplo) {
    return { pasos: [], listos: 0, total: 0 };
  }
  const productos = Math.max(0, d.productos);
  const conUmbral = Math.max(0, d.productosConUmbral);
  const umbralMeta = Math.min(META_UMBRALES, productos === 0 ? META_UMBRALES : productos);
  const pasos: PasoChecklist[] = [
    {
      id: "productos",
      titulo: "Cargá tus primeros 10 productos",
      contador: `${Math.min(productos, META_PRODUCTOS)} de ${META_PRODUCTOS}`,
      listo: productos >= META_PRODUCTOS,
    },
    {
      id: "umbrales",
      titulo: "Configurá los umbrales de stock bajo",
      contador: `${Math.min(conUmbral, umbralMeta)} de ${umbralMeta}`,
      listo: productos > 0 && conUmbral >= umbralMeta,
    },
    {
      id: "proveedor",
      titulo: "Agregá un proveedor",
      contador: null,
      listo: d.proveedores >= 1,
    },
    {
      id: ID_CHECKLIST_EMPLEADO,
      titulo: "Invitá a un empleado",
      contador: null,
      listo: d.invitaciones >= 1,
    },
  ];
  if (!d.whatsappVerificado) {
    pasos.unshift({
      id: "whatsapp",
      titulo: "Verificá tu WhatsApp",
      contador: null,
      listo: false,
    });
  }
  const listos = pasos.filter((p) => p.listo).length;
  return { pasos, listos, total: pasos.length };
}
