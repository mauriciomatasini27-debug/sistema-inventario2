export interface UsoIA {
  readonly tenantId: string;
  readonly mes: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly costoCentavos: number;
}

export interface ResumenUsoIA {
  readonly consultas: number;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly costoCentavos: number;
}

export interface RegistroUsoIA {
  registrar(uso: UsoIA): void;
  usoDelMes(tenantId: string, mes: string): ResumenUsoIA;
}

export class RegistroUsoIAMemoria implements RegistroUsoIA {
  private readonly filas: UsoIA[] = [];

  registrar(uso: UsoIA): void {
    this.filas.push(uso);
  }

  usoDelMes(tenantId: string, mes: string): ResumenUsoIA {
    let consultas = 0;
    let tokensEntrada = 0;
    let tokensSalida = 0;
    let costoCentavos = 0;
    for (const f of this.filas) {
      if (f.tenantId !== tenantId || f.mes !== mes) continue;
      consultas += 1;
      tokensEntrada += f.tokensEntrada;
      tokensSalida += f.tokensSalida;
      costoCentavos += f.costoCentavos;
    }
    return { consultas, tokensEntrada, tokensSalida, costoCentavos };
  }
}
