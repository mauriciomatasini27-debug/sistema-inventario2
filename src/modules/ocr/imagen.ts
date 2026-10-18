export interface ImagenOcr {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export const MAX_BYTES_IMAGEN = 16 * 1024 * 1024;
