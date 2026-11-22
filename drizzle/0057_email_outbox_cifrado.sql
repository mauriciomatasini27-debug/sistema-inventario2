-- #295 / P10-33 / tag 0057: el html/texto del outbox se guardan cifrados.
-- Se renombran las columnas para que el espejo no exponga el claro. El valor
-- de las filas viejas sigue siendo plaintext: la lectura dual lo detecta
-- por el prefijo del ciphertext y lo envía sin descifrar. Sin clave de entorno
-- (EMAIL_OUTBOX_CIPHER_KEY_B64) el adaptador falla cerrado, no escribe claro.
--> statement-breakpoint
ALTER TABLE "email_outbox" RENAME COLUMN "html" TO "html_ciphertext";
--> statement-breakpoint
ALTER TABLE "email_outbox" RENAME COLUMN "texto" TO "texto_ciphertext";
