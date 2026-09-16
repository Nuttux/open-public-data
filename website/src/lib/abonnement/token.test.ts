import { describe, expect, it } from "vitest";
import { getAlertsConfig, makeToken, tokenToQuery, verifyToken, TOKEN_TTL_MS } from "./token";

const SECRET = "test-secret";

describe("data alert — confirmation link", () => {
  it("signs an address and reads it back", () => {
    const tok = makeToken(SECRET, "  Lectrice@Example.org ", "fr", 1_000_000);
    const back = verifyToken(SECRET, new URLSearchParams(tokenToQuery(tok)), 1_000_000 + 60_000);
    expect(back).toEqual({ ok: true, email: "lectrice@example.org", lang: "fr" });
  });

  it("refuses a link whose address was changed", () => {
    const tok = makeToken(SECRET, "a@example.org", "fr", 1_000_000);
    const q = new URLSearchParams(tokenToQuery({ ...tok, e: "b@example.org" }));
    expect(verifyToken(SECRET, q, 1_000_000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a link signed with another secret", () => {
    const tok = makeToken("other", "a@example.org", "en", 1_000_000);
    expect(verifyToken(SECRET, new URLSearchParams(tokenToQuery(tok)), 1_000_000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a link older than two days", () => {
    const tok = makeToken(SECRET, "a@example.org", "fr", 1_000_000);
    expect(verifyToken(SECRET, new URLSearchParams(tokenToQuery(tok)), 1_000_000 + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("keeps only fr and en", () => {
    const tok = makeToken(SECRET, "a@example.org", "pt", 1_000_000);
    const back = verifyToken(SECRET, new URLSearchParams(tokenToQuery(tok)), 1_000_000);
    expect(back.ok && back.lang).toBe("fr");
  });
});

describe("data alert — configuration", () => {
  it("needs the key, the audience and a sender", () => {
    expect(getAlertsConfig({}).ok).toBe(false);
    expect(getAlertsConfig({ RESEND_API_KEY: "k" })).toMatchObject({ ok: false, reason: "missing_audience" });
    expect(getAlertsConfig({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "a" })).toMatchObject({ ok: false, reason: "missing_sender" });
    expect(getAlertsConfig({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "a", SIGNALEMENT_EMAIL_FROM: "x@qipu.org" })).toMatchObject({ ok: true, from: "x@qipu.org", secret: "k" });
    expect(getAlertsConfig({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "a", ALERTS_EMAIL_FROM: "alertes@qipu.org", ALERTS_SECRET: "s" })).toMatchObject({ ok: true, from: "alertes@qipu.org", secret: "s" });
  });

  it("says whether the missing piece is a production error", () => {
    expect(getAlertsConfig({ VERCEL_ENV: "production" })).toMatchObject({ ok: false, isProd: true });
    expect(getAlertsConfig({ VERCEL_ENV: "preview" })).toMatchObject({ ok: false, isProd: false });
  });
});
