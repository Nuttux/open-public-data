"use client";

import { useState } from "react";
import { fmtInt } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

// Paris 2024 (approximations calibrées sur les comptes administratifs)
const PARIS_POPULATION = 2_133_111;

type Props = {
  /** Dette financière totale en €. */
  dette: number;
  /** Fonds propres (patrimoine net) en €. */
  fondsPropres: number;
  /** Actifs totaux en €. */
  actif: number;
  /** Hors-bilan (capital garanti) en €. */
  horsBilan?: number;
  /** Taux moyen pondéré de la dette (%). */
  tauxMoyen: number;
};

// Scénarios de foyer (chiffres moyens Paris 2024)
type Profile = {
  id: string;
  labelKey: string;
  descKey: string;
  // Impôts locaux annuels estimés (taxe foncière + TEOM, médiane approximative)
  impotsAnnuels: number;
};

const PROFILES: Profile[] = [
  {
    id: "locataire",
    labelKey: "fx.tp.profile.locataire.label",
    descKey: "fx.tp.profile.locataire.desc",
    impotsAnnuels: 0, // TEOM inclus dans loyer, pas de TF
  },
  {
    id: "studio",
    labelKey: "fx.tp.profile.studio.label",
    descKey: "fx.tp.profile.studio.desc",
    impotsAnnuels: 480, // TF ~ 380 + TEOM ~ 100
  },
  {
    id: "t3",
    labelKey: "fx.tp.profile.t3.label",
    descKey: "fx.tp.profile.t3.desc",
    impotsAnnuels: 1_200, // TF + TEOM sur 60-70 m²
  },
  {
    id: "grand",
    labelKey: "fx.tp.profile.grand.label",
    descKey: "fx.tp.profile.grand.desc",
    impotsAnnuels: 2_800, // TF + TEOM sur grand logement
  },
];

export default function TaPartAToi({
  dette,
  fondsPropres,
  actif,
  horsBilan = 0,
  tauxMoyen,
}: Props) {
  const t = useT();
  const [profileId, setProfileId] = useState<string>("t3");

  const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[2];

  // Calculs partagés (indépendants du profil)
  const dettePerHab = dette / PARIS_POPULATION;
  const fpPerHab = fondsPropres / PARIS_POPULATION;
  const actifPerHab = actif / PARIS_POPULATION;
  const hbPerHab = horsBilan / PARIS_POPULATION;

  // Part de l'impôt allant au service de la dette : estimation basée sur le
  // ratio annuité dette / recettes fiscales (~11 % à Paris 2024).
  const PART_IMPOT_DETTE = 0.11;
  const impotVersDette = profile.impotsAnnuels * PART_IMPOT_DETTE;

  // Intérêts annuels "virtuels" sur la part personnelle de dette
  const interetsPerHabYear = (dettePerHab * tauxMoyen) / 100;

  return (
    <div className="fx-tapart">
      <div className="fx-tapart-head">
        <div className="fx-tapart-kicker">{t("fx.tp.kicker")}</div>
        <h3 className="fx-tapart-title">{t("fx.tp.title")}</h3>
        <p className="fx-tapart-lead">{t("fx.tp.lead")}</p>
      </div>

      <div className="fx-tapart-profiles">
        <div className="fx-tapart-profiles-label">{t("fx.tp.profile_label")}</div>
        <div className="fx-tapart-profiles-grid">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`fx-tapart-profile ${profileId === p.id ? "active" : ""}`}
              onClick={() => setProfileId(p.id)}
            >
              <div className="l">{t(p.labelKey)}</div>
              <div className="d muted">{t(p.descKey)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="fx-tapart-grid">
        <div className="fx-tapart-card">
          <div className="fx-tapart-card-lbl">{t("fx.tp.card.dette_per_hab")}</div>
          <div className="fx-tapart-card-val tnum">
            {fmtInt(dettePerHab)}
            <span className="u">€</span>
          </div>
          <div className="fx-tapart-card-hint">
            {t("fx.tp.card.dette_per_hab_hint")}
          </div>
        </div>

        <div className="fx-tapart-card">
          <div className="fx-tapart-card-lbl">{t("fx.tp.card.fp_per_hab")}</div>
          <div className="fx-tapart-card-val tnum">
            {fmtInt(fpPerHab)}
            <span className="u">€</span>
          </div>
          <div className="fx-tapart-card-hint">
            {t("fx.tp.card.fp_per_hab_hint")
              .replace("{actif}", fmtInt(actifPerHab))}
          </div>
        </div>

        <div className="fx-tapart-card">
          <div className="fx-tapart-card-lbl">{t("fx.tp.card.interets")}</div>
          <div className="fx-tapart-card-val tnum">
            {fmtInt(interetsPerHabYear)}
            <span className="u">€/an</span>
          </div>
          <div className="fx-tapart-card-hint">
            {t("fx.tp.card.interets_hint")
              .replace("{taux}", tauxMoyen.toFixed(1).replace(".", ","))}
          </div>
        </div>

        {horsBilan > 0 && (
          <div className="fx-tapart-card">
            <div className="fx-tapart-card-lbl">{t("fx.tp.card.hb_per_hab")}</div>
            <div className="fx-tapart-card-val tnum">
              {fmtInt(hbPerHab)}
              <span className="u">€</span>
            </div>
            <div className="fx-tapart-card-hint">
              {t("fx.tp.card.hb_per_hab_hint")}
            </div>
          </div>
        )}
      </div>

      {profile.impotsAnnuels > 0 && (
        <div className="fx-tapart-impot">
          <div className="fx-tapart-impot-head">
            <span>
              {t("fx.tp.impot.lead_a")}{" "}
              <b>{fmtInt(profile.impotsAnnuels)} €/an</b>{" "}
              {t("fx.tp.impot.lead_b")}
            </span>
            <span className="fx-tapart-impot-val tnum">
              ≈ {fmtInt(impotVersDette)} <span className="u">€/an</span>
            </span>
          </div>
          <div className="fx-tapart-impot-bar" aria-hidden>
            <div
              className="fill"
              style={{ width: `${Math.min(100, PART_IMPOT_DETTE * 100)}%` }}
            />
          </div>
          <div className="fx-tapart-impot-caption muted">
            {t("fx.tp.impot.caption")
              .replace("{pct}", (PART_IMPOT_DETTE * 100).toFixed(0))}
          </div>
        </div>
      )}

      <p className="fx-tapart-note muted">
        {t("fx.tp.note")}
      </p>
    </div>
  );
}
