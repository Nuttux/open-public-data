#!/usr/bin/env bash
# ============================================================================
# Orchestrateur maître du pipeline Paris Budget Dashboard.
#
# Enchaîne les 4 phases dans l'ordre :
#   1. sync     — récupère les sources (OpenData API → BQ ou JSON direct)
#   2. dbt      — transforme les tables raw en marts (dbt run)
#   3. export   — exporte BQ → JSONs consommés par le front
#   4. enrich   — enrichit les JSONs (Sirene, LLM grounded, thématique, etc.)
#
# Chaque phase est idempotente : les scripts réutilisent leurs caches
# (sirene_companies.json, beneficiaire_grounded.json, …) donc un re-run
# sans nouvelle donnée = quasi no-op.
#
# Usage :
#   bash pipeline/run_all.sh                    # tout faire
#   bash pipeline/run_all.sh --skip=sync,dbt    # juste export + enrich
#   bash pipeline/run_all.sh --only=enrich      # juste l'enrichissement
#   bash pipeline/run_all.sh --tier1            # active enrich tier1 (LLM payant)
#   bash pipeline/run_all.sh --cron-safe        # skip enrich LLM, garde tier2 Sirene
#   bash pipeline/run_all.sh --dry-run          # imprime ce qui serait fait
#
# Variables d'env reconnues :
#   ANTHROPIC_API_KEY     (requis pour enrich tier1 / grounded LLM)
#   GOOGLE_API_KEY        (optionnel, Gemini au lieu de Claude)
#   GOOGLE_APPLICATION_CREDENTIALS   (pour dbt + BQ)
#   SKIP_DBT=1            (équivalent --skip=dbt)
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIPELINE_DIR="$REPO_ROOT/pipeline"
PYTHON="${PYTHON:-python3}"

# --- Flags -------------------------------------------------------------------
PHASES=("sync" "dbt" "export" "enrich")
SKIP=""
ONLY=""
TIER1=false
CRON_SAFE=false
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --skip=*)    SKIP="${arg#--skip=}" ;;
        --only=*)    ONLY="${arg#--only=}" ;;
        --tier1)     TIER1=true ;;
        --cron-safe) CRON_SAFE=true ;;
        --dry-run)   DRY_RUN=true ;;
        -h|--help)
            grep "^#" "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "⚠ arg inconnu : $arg"; exit 2 ;;
    esac
done

# SKIP_DBT=1 compat ancien usage
if [[ "${SKIP_DBT:-0}" == "1" && "$SKIP" != *"dbt"* ]]; then
    SKIP="${SKIP:+$SKIP,}dbt"
fi

should_run() {
    local phase="$1"
    if [[ -n "$ONLY" ]]; then
        [[ ",$ONLY," == *",$phase,"* ]] && return 0 || return 1
    fi
    [[ ",$SKIP," == *",$phase,"* ]] && return 1 || return 0
}

run_step() {
    local label="$1"; shift
    echo ""
    echo "────────────────────────────────────────────────────────"
    echo "▶ $label"
    echo "  $ $*"
    echo "────────────────────────────────────────────────────────"
    if $DRY_RUN; then
        echo "  (dry-run, skipping)"
        return 0
    fi
    "$@"
}

cd "$REPO_ROOT"

# --- 1. SYNC ----------------------------------------------------------------
if should_run sync; then
    echo "════════════════════════════════════════════════════════"
    echo "═  1/4  SYNC — récupération des sources"
    echo "════════════════════════════════════════════════════════"
    # Chemin direct OpenData → JSON (ne dépend pas de BQ). Rapide, gratuit.
    run_step "Subventions (OpenData Paris)" \
        $PYTHON "$PIPELINE_DIR/scripts/sync/fetch_subventions_opendata.py"
    # DECP marchés publics
    if [[ -f "$PIPELINE_DIR/scripts/sync/fetch_decp_paris.py" ]]; then
        run_step "Marchés publics DECP" \
            $PYTHON "$PIPELINE_DIR/scripts/sync/fetch_decp_paris.py" || \
            echo "  ⚠ fetch_decp_paris a échoué — on continue"
    fi
fi

# --- 2. DBT -----------------------------------------------------------------
if should_run dbt; then
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "═  2/4  DBT — transformations BigQuery"
    echo "════════════════════════════════════════════════════════"
    if command -v dbt >/dev/null 2>&1; then
        # En CI, on force le profil prod via DBT_PROFILES_DIR (sinon dbt
        # prend pipeline/profiles.yml et template DBT_USER → 'local').
        DBT_TARGET_FLAG=""
        if [[ -n "${DBT_PROFILES_DIR:-}" ]]; then
            DBT_TARGET_FLAG="--profiles-dir $DBT_PROFILES_DIR --target ${DBT_TARGET:-prod}"
        fi
        # dbt deps doit tourner avant run pour installer les packages (cf
        # pipeline/packages.yml). Idempotent.
        run_step "dbt deps" bash -c "cd '$PIPELINE_DIR' && dbt deps $DBT_TARGET_FLAG"
        # dbt seed : skip si DBT_SKIP_SEED=1 (en CI on évite les seeds
        # nationaux qui ont des schémas CSV cassés — bug préexistant à
        # fix séparément).
        if [[ "${DBT_SKIP_SEED:-0}" != "1" ]]; then
            run_step "dbt seed" bash -c "cd '$PIPELINE_DIR' && dbt seed $DBT_TARGET_FLAG"
        else
            echo "  ⊘ dbt seed skipped (DBT_SKIP_SEED=1)"
        fi
        run_step "dbt run" bash -c "cd '$PIPELINE_DIR' && dbt run $DBT_TARGET_FLAG"
    else
        echo "  ⚠ dbt non installé, phase skipped. Installer : pip install dbt-bigquery"
    fi
fi

# --- 3. EXPORT --------------------------------------------------------------
if should_run export; then
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "═  3/4  EXPORT — BQ → JSONs du front"
    echo "════════════════════════════════════════════════════════"
    # export_all.py orchestre déjà l'ensemble des exports domaine.
    run_step "Export complet" \
        $PYTHON "$PIPELINE_DIR/scripts/export/export_all.py" || \
        echo "  ⚠ export_all a échoué — souvent dû à creds BQ manquantes, on continue"
fi

# --- 4. ENRICH --------------------------------------------------------------
if should_run enrich; then
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "═  4/4  ENRICH — Sirene / LLM grounded / thématique"
    echo "════════════════════════════════════════════════════════"

    # 4a — tier2 bénéficiaires (gratuit, API Sirene, 20 workers)
    run_step "Bénéficiaires — tier2 Sirene ≥10k€" \
        $PYTHON "$PIPELINE_DIR/scripts/enrich/enrich_beneficiaire_grounded_llm.py" \
        --mode tier2

    # 4b — tier1 bénéficiaires (LLM payant, optionnel)
    if $TIER1; then
        if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
            echo "  ⚠ --tier1 demandé mais ANTHROPIC_API_KEY absente — phase skipped"
        else
            run_step "Bénéficiaires — tier1 LLM grounded ≥80k€" \
                $PYTHON "$PIPELINE_DIR/scripts/enrich/enrich_beneficiaire_grounded_llm.py" \
                --mode tier1
        fi
    else
        echo ""
        echo "  ℹ tier1 LLM non lancé (ajoute --tier1 pour l'activer, coût ~quelques €)"
    fi

    # 4c — autres enrichements (géo AP + thématique) via l'orchestrateur existant.
    # En mode --cron-safe, on skip : ces étapes sont 100% LLM (Gemini), donc
    # coûteuses et risquées en non-interactif. Les nouvelles lignes restent
    # sans thématique/géo jusqu'à la prochaine session manuelle.
    if $CRON_SAFE; then
        echo ""
        echo "  ℹ --cron-safe : run_enrichment.py (LLM Gemini) skipped."
        echo "    Les nouvelles lignes resteront non enrichies (thématique/géo)"
        echo "    jusqu'à la prochaine session manuelle."
    elif [[ -f "$PIPELINE_DIR/scripts/enrich/run_enrichment.py" ]]; then
        run_step "Autres enrichissements (géo + thématique)" \
            $PYTHON "$PIPELINE_DIR/scripts/enrich/run_enrichment.py" || \
            echo "  ⚠ run_enrichment.py a échoué — on continue"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "✓ Pipeline terminé"
echo "════════════════════════════════════════════════════════"
