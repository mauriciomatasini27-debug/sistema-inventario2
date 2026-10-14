-- Fiscal prod slice homo: control D8/D3 + T3 (ADR-0018 D6-D8, FE-S17/S26/S20/S25).
-- Clave y TA solo *_ciphertext (KMS envelope); plano solo en memoria servicio.
CREATE TABLE IF NOT EXISTS fiscal_computers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambiente text NOT NULL CHECK (ambiente IN ('homo','prod')),
  alias text NOT NULL,
  cuit_proveedor text NOT NULL,
  cert_pem text NOT NULL,
  key_ciphertext text NOT NULL,
  kms_key_id text NOT NULL,
  not_after timestamptz,
  UNIQUE(ambiente, alias)
);
CREATE TABLE IF NOT EXISTS arca_tokens (
  fiscal_computer_id uuid NOT NULL REFERENCES fiscal_computers(id),
  servicio text NOT NULL DEFAULT 'wsfe',
  ambiente text NOT NULL,
  token_ciphertext text NOT NULL,
  sign_ciphertext text NOT NULL,
  expiration timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fiscal_computer_id, servicio, ambiente)
);
CREATE TABLE IF NOT EXISTS tenant_fiscal_links (
  tenant_id uuid NOT NULL,
  cuit text NOT NULL,
  ambiente text NOT NULL,
  fiscal_computer_id uuid NOT NULL REFERENCES fiscal_computers(id),
  estado text NOT NULL DEFAULT 'delegacion_pendiente_proveedor',
  PRIMARY KEY (tenant_id, ambiente)
);
CREATE TABLE IF NOT EXISTS fiscal_params (
  clave text PRIMARY KEY,
  valor text NOT NULL
);
INSERT INTO fiscal_params (clave, valor) VALUES
  ('umbral_dni_centavos','1000000000'),
  ('qr_base_url','https://www.arca.gob.ar/fe/qr/?p='),
  ('CAEA_ACTIVO','off')
ON CONFLICT (clave) DO NOTHING;
CREATE TABLE IF NOT EXISTS fiscal_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fiscal_document_id uuid NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
  intentos bigint NOT NULL DEFAULT 0,
  proximo_intento timestamptz
);
-- T3: reintentos + bandeja en fiscal_documents (tenant).
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS intentos bigint NOT NULL DEFAULT 0;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS proximo_intento timestamptz;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS ultimo_error_codigo text;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS motivo_castellano text;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS no_facturar jsonb;
