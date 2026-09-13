#!/usr/bin/env bash
# =============================================================================
# run_national.sh — les communes de France, hors du refresh de Paris.
#
# Le refresh de Paris (run_all.sh) exclut les modèles nationaux : ils lisent
# ~10 Go par passage, et un échec national ne doit jamais bloquer Paris.
#
# Cadence hebdomadaire (--cadence=weekly) : les marchés publics (DECP), la seule
# source nationale republiée chaque jour.
#   1. sync    — sync_decp_national.py : charge la nouvelle version si data.gouv
#                en a publié une ; sinon la chaîne s'arrête là (rien de neuf).
#   2. dbt     — staging → core → mart des marchés, puis leurs tests. Un test
#                qui échoue arrête tout avant l'export.
#   3. export  — export_marches_national.py --all : un dossier par commune et le
#                manifeste website/src/data/communes-marches-manifest.json.
#   4. check   — check_national_manifest.py : le manifeste neuf face à celui du
#                dépôt. Communes perdues ou montants effondrés → pas d'envoi.
#   5. upload  — gcloud storage rsync vers gs://qipu-communes-budget/communes-marches.
#                Jamais de suppression : une commune absente d'un export garde
#                ses fichiers.
#
# Les sources annuelles (DGFiP, OFGL, REI, RNE, Fonds vert, SIRENE, fonctions)
# ne sont PAS branchées ici : leurs chargeurs remplacent la table entière et
# figent leurs années. Les lancer tels quels effacerait l'historique.
#
# Usage :
#   ./run_national.sh --cadence=weekly                  # prod, chaîne complète
#   ./run_national.sh --cadence=weekly --target=dev     # datasets dbt_paris_dev_local_national_*
#   ./run_national.sh --cadence=weekly --no-upload      # tout sauf l'envoi au bucket
#   ./run_national.sh --cadence=weekly --force          # même si la DECP n'a pas changé
# =============================================================================
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$PIPELINE_DIR")"
PYTHON="${PYTHON:-python3}"
BUCKET="gs://qipu-communes-budget"

CADENCE=""
TARGET="prod"
UPLOAD=true
FORCE=false
for arg in "$@"; do
    case "$arg" in
        --cadence=*) CADENCE="${arg#*=}" ;;
        --target=*)  TARGET="${arg#*=}" ;;
        --no-upload) UPLOAD=false ;;
        --force)     FORCE=true ;;
        *) echo "argument inconnu : $arg" >&2; exit 2 ;;
    esac
done
[[ "$CADENCE" == "weekly" ]] || { echo "--cadence=weekly est la seule cadence branchée" >&2; exit 2; }

case "$TARGET" in
    prod) export NATIONAL_MARTS_DATASET="dbt_paris_national_marts" ;;
    dev)  export NATIONAL_MARTS_DATASET="dbt_paris_dev_local_national_marts" ;;
    *) echo "--target=prod|dev" >&2; exit 2 ;;
esac

step() { echo ""; echo "── $* ──────────────────────────────────────────"; }

# ── 1. sync ──────────────────────────────────────────────────────────────────
step "1/5 sync : DECP consolidée"
FORCE_FLAG=""; $FORCE && FORCE_FLAG="--force"
SYNC_OUT="$($PYTHON "$PIPELINE_DIR/scripts/sync/sync_decp_national.py" $FORCE_FLAG | tee /dev/stderr)"
if grep -q "rien à faire" <<<"$SYNC_OUT" && ! $FORCE; then
    echo "DECP inchangée depuis le dernier passage : rien à reconstruire."
    exit 0
fi

# ── 2. dbt ───────────────────────────────────────────────────────────────────
step "2/5 dbt : marchés des communes ($TARGET)"
MODELS="stg_ofgl_communes stg_sirene_unites_legales stg_decp_marches core_marches_national mart_marches_national"
(cd "$PIPELINE_DIR" && dbt run --target "$TARGET" --select $MODELS)
(cd "$PIPELINE_DIR" && dbt test --target "$TARGET" --select stg_decp_marches core_marches_national mart_marches_national)

# ── 3. export ────────────────────────────────────────────────────────────────
step "3/5 export : un dossier par commune ($NATIONAL_MARTS_DATASET)"
$PYTHON "$PIPELINE_DIR/scripts/export/export_marches_national.py" --all

# ── 4. check ─────────────────────────────────────────────────────────────────
step "4/5 contrôle du manifeste"
$PYTHON "$PIPELINE_DIR/scripts/audit/check_national_manifest.py" website/src/data/communes-marches-manifest.json

# ── 5. upload ────────────────────────────────────────────────────────────────
if $UPLOAD; then
    step "5/5 envoi : $BUCKET/communes-marches"
    gcloud storage rsync -r "$REPO_DIR/website/public/data/communes-marches" "$BUCKET/communes-marches"
else
    step "5/5 envoi ignoré (--no-upload)"
fi
echo ""
echo "✓ communes : marchés publics à jour"
