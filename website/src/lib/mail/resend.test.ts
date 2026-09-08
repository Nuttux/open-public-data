import { describe, expect, it } from "vitest";
import { getMailConfig, isProductionRuntime, isValidEmail } from "./resend";

// Le contrat qui compte : en prod, une config absente doit être détectable
// comme une erreur — jamais avalée. Ces tests figent ce contrat.

describe("isProductionRuntime", () => {
  it("n'est vrai que sur VERCEL_ENV=production", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});

describe("getMailConfig", () => {
  it("signale une clé absente, et dit si on est en prod", () => {
    const cfg = getMailConfig("signalement", {
      VERCEL_ENV: "production",
      SIGNALEMENT_EMAIL_TO: "x@y.z",
    });
    expect(cfg).toEqual({ ok: false, reason: "missing_api_key", isProd: true });
  });

  it("signale un destinataire absent", () => {
    const cfg = getMailConfig("signalement", {
      VERCEL_ENV: "preview",
      RESEND_API_KEY: "re_test",
    });
    expect(cfg).toEqual({ ok: false, reason: "missing_recipient", isProd: false });
  });

  it("le contact tombe sur SIGNALEMENT_EMAIL_TO si CONTACT_EMAIL_TO manque", () => {
    const cfg = getMailConfig("contact", {
      RESEND_API_KEY: "re_test",
      SIGNALEMENT_EMAIL_TO: "x@y.z",
    });
    expect(cfg.ok && cfg.to).toBe("x@y.z");
  });

  it("CONTACT_EMAIL_TO prime pour le contact, et l'expéditeur a un défaut", () => {
    const cfg = getMailConfig("contact", {
      RESEND_API_KEY: "re_test",
      SIGNALEMENT_EMAIL_TO: "x@y.z",
      CONTACT_EMAIL_TO: "hello@qipu.org",
    });
    expect(cfg.ok && cfg.to).toBe("hello@qipu.org");
    expect(cfg.ok && cfg.from).toBe("onboarding@resend.dev");
  });
});

describe("isValidEmail", () => {
  it("accepte une adresse simple et refuse le reste", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("pas une adresse")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
