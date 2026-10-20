import { afterEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST } from "../src/pages/api/gmail/webhook.js";

const VARS = ["GMAIL_PUBSUB_AUDIENCE", "GMAIL_PUBSUB_EMAIL", "GMAIL_PUBSUB_TOPIC"] as const;

function limpiar(): void {
  for (const v of VARS) delete process.env[v];
}

describe("webhook de Gmail", () => {
  afterEach(limpiar);

  it("sin configuración de Pub/Sub falla cerrado", async () => {
    limpiar();
    const r = await POST(ctx("http://x/api/gmail/webhook", { body: {} }));
    expect(r.status).toBe(503);
  });

  it("sin Authorization rechaza el push", async () => {
    process.env.GMAIL_PUBSUB_AUDIENCE = "https://mi-app/api/gmail/webhook";
    process.env.GMAIL_PUBSUB_EMAIL = "pubsub@ejemplo.iam.gserviceaccount.com";
    process.env.GMAIL_PUBSUB_TOPIC = "projects/p/topics/gmail";
    const r = await POST(
      ctx("http://x/api/gmail/webhook", {
        body: {
          message: { data: Buffer.from(JSON.stringify({ emailAddress: "a@b.com", historyId: "1" })).toString("base64") },
        },
      }),
    );
    expect(r.status).toBe(401);
  });
});
