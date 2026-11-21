// Por qué uuidv7 y no v4: ordenable por tiempo, el cursor de sync/pull avanza sin huecos lógicos.

function uuidv7(): string {
  const ms = Date.now();
  const rand = () => Math.floor(Math.random() * 0xffffffff);
  const a = rand();
  const b = rand();
  const c = rand();
  const timeHex = ms.toString(16).padStart(12, "0");
  const randAHex = a.toString(16).padStart(8, "0");
  const randBHex = (b & 0x3fffffff).toString(16).padStart(8, "0");
  const randCHex = c.toString(16).padStart(8, "0");
  const g3 = `7${randAHex.slice(1, 4)}`;
  const g4 = `${((parseInt(randBHex.slice(0, 2), 16) & 0x3f) | 0x80).toString(16)}${randBHex.slice(2, 4)}`;
  return (
    `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-${g3}-${g4}-${randBHex.slice(4, 8)}${randCHex}`
  );
}

export function newOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return uuidv7();
    } catch {
      return crypto.randomUUID();
    }
  }
  return uuidv7();
}

// dispositivo necesitan orden total para que device_seq + hlc resuelvan colisiones.
export class HlcClock {
  private lastMs = 0;
  private counter = 0;
  next(nowMs: number = Date.now()): string {
    if (nowMs > this.lastMs) {
      this.lastMs = nowMs;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return `${this.lastMs}:${this.counter}`;
  }
}

export interface OutboxOp {
  op_id: string;
  device_code: string;
  device_seq: number;
  hlc: string;
}

export function makeOutboxOp(
  device_code: string,
  lastSeq: number,
  clock: HlcClock,
): OutboxOp {
  return {
    op_id: newOpId(),
    device_code,
    device_seq: lastSeq + 1,
    hlc: clock.next(),
  };
}
