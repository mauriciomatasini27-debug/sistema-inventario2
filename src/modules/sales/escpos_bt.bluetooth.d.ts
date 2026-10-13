// minimal.d.ts — Declaraciones Web Bluetooth mínimas para escpos_bt.ts.
// Por qué existe: el tsconfig del repo (DOM lib sin WebBluetooth) no trae
// los tipos `Bluetooth`, `BluetoothDevice`, `BluetoothRemoteGATT*` ni
// `navigator.bluetooth`. Para lograr `tsc --noEmit --strict` limpio SIN
// añadir dependencias (@types/web-bluetooth) se declara aquí lo justo que
// usa el conector (requestDevice + GATT connect/service/characteristic +
// write). El parent decide: (a) copiarlo junto a escpos_bt.ts, o (b) si el
// repo ya instala @types/web-bluetooth, descartarlo (borrar el archivo: los
// tipos oficiales ganan y no hay colisión si se borra; NO mantener ambos).
//
// Alcance: solo lo que toca escpos_bt.ts. Sin eventos, sin advertising,
// sin descriptors. Todo lo no usado se omite a propósito.

interface BluetoothLEScanFilter {
  services?: string[] | undefined;
  name?: string | undefined;
  namePrefix?: string | undefined;
}

interface RequestDeviceOptions {
  filters: BluetoothLEScanFilter[];
  optionalServices?: string[] | undefined;
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface BluetoothDevice {
  readonly name?: string | undefined;
  readonly gatt?: BluetoothRemoteGATTServer | undefined;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: ArrayBuffer): Promise<void>;
  writeValueWithResponse?(value: ArrayBuffer): Promise<void>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth | undefined;
}
