// LANE admin — Flags PA12 (overrides matan default del plan).
//
// Núcleo puro: sin IO, sin Drizzle. El default vive en control (plan);
// el override vive en admin con motivo obligatorio y vencimiento. Devuelve
// la fuente para que la UI muestre "override vs plan" sin doble fuente
// silenciosa. 403 si apagado, sin borrar datos (PA12).

export interface OverrideFlag {
  readonly valor: boolean;
  readonly motivo: string;
  readonly expiraEn: string | null;
}

export interface FlagResuelto {
  readonly valor: boolean;
  readonly fuente: "override" | "plan";
  readonly expirado: boolean;
}

// Por qué el expirado se reporta y no se borra: el job lo purga lógicamente;
// acá solo se ignora para que la decisión sea auditable.
export function resolver_flag(args: {
  readonly defaultPlan: boolean;
  readonly override: OverrideFlag | null;
  readonly ahora?: Date;
}): FlagResuelto {
  const { override } = args;
  if (!override) return { valor: args.defaultPlan, fuente: "plan", expirado: false };
  if (override.expiraEn && new Date(override.expiraEn) <= (args.ahora ?? new Date())) {
    return { valor: args.defaultPlan, fuente: "plan", expirado: true };
  }
  return { valor: override.valor, fuente: "override", expirado: false };
}
