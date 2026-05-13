"use client";

import { fmtInt } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import { PARIS_POPULATION } from "@/lib/methodology";

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

export default function TaPartAToi({
  dette,
  fondsPropres,
  actif,
  horsBilan = 0,
  tauxMoyen,
}: Props) {
  const t = useT();

  // Tous les chiffres sont par habitant (abstraction comptable honnête, pas
  // une attribution fiscale fictive). On ne fait PAS de mapping « tes impôts
  // vont à X » : le budget de la Ville est fongible, les recettes (TF, TEOM,
  // DGF, DMTO…) alimentent le même pot et financent toutes les dépenses en
  // proportion. Attribuer un poste à une recette particulière est un récit
  // trompeur.
  const dettePerHab = dette / PARIS_POPULATION;
  const fpPerHab = fondsPropres / PARIS_POPULATION;
  const actifPerHab = actif / PARIS_POPULATION;
  const hbPerHab = horsBilan / PARIS_POPULATION;
  const interetsPerHabYear = (dettePerHab * tauxMoyen) / 100;

  return (
    <div className="fx-tapart">
      <div className="fx-tapart-block">
        <div className="fx-tapart-block-head">
          <div className="fx-tapart-block-kicker">{t("fx.tp.block1.kicker")}</div>
          <h3 className="fx-tapart-block-title">{t("fx.tp.block1.title")}</h3>
          <p className="fx-tapart-block-lead muted">
            {t("fx.tp.block1.lead")}
          </p>
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
              {t("fx.tp.card.fp_per_hab_hint").replace("{actif}", fmtInt(actifPerHab))}
            </div>
          </div>

          <div className="fx-tapart-card">
            <div className="fx-tapart-card-lbl">{t("fx.tp.card.interets")}</div>
            <div className="fx-tapart-card-val tnum">
              {fmtInt(interetsPerHabYear)}
              <span className="u">€/an</span>
            </div>
            <div className="fx-tapart-card-hint">
              {t("fx.tp.card.interets_hint").replace("{taux}", tauxMoyen.toFixed(1).replace(".", ","))}
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

        <p className="fx-tapart-note muted">{t("fx.tp.note")}</p>
      </div>
    </div>
  );
}
