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
# Cadence annuelle (--cadence=annual, branchée le 2026-09-14) : les sources que
# leurs producteurs publient une fois l'an ou au fil de l'eau.
#   1. sync    — chaque chargeur compare la source à sa table et ne charge que ce
#                qui manque ou a changé, par _national_raw (une année à la fois,
#                ou un instantané versionné, toujours derrière une garde de
#                volume) : DGFiP balances, balance croisée nature-fonction, OFGL
#                consolidée, REI, Fonds vert, RNE (état courant et versions
#                archivées), SIRENE. Chaque table écrite est notée ; rien de
#                noté → arrêt.
#   2. dbt     — les modèles en aval des seules tables écrites
#                (source:national_raw.<table>+), puis leurs tests.
#   3. export  — les exports qui lisent ces modèles, pour toutes les communes.
#   4. check   — chaque manifeste neuf face à celui du dépôt.
#   5. upload  — les dossiers de communes exportés, vers le bucket.
#
# Usage :
#   ./run_national.sh --cadence=weekly                  # prod, chaîne complète
#   ./run_national.sh --cadence=weekly --target=dev     # datasets dbt_paris_dev_${DBT_USER:-local}_national_*
#   ./run_national.sh --cadence=weekly --no-upload      # tout sauf l'envoi au bucket
#   ./run_national.sh --cadence=weekly --force          # même si la DECP n'a pas changé
#   ./run_national.sh --cadence=annual                  # sources annuelles, seulement ce qui a bougé
#   ./run_national.sh --cadence=annual --force          # reconstruit et exporte tout, même sans nouveauté
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
[[ "$CADENCE" == "weekly" || "$CADENCE" == "annual" ]] || { echo "--cadence=weekly|annual" >&2; exit 2; }

case "$TARGET" in
    prod) export NATIONAL_MARTS_DATASET="dbt_paris_national_marts" ;;
    dev)  export NATIONAL_MARTS_DATASET="dbt_paris_dev_${DBT_USER:-local}_national_marts" ;;
    *) echo "--target=prod|dev" >&2; exit 2 ;;
esac

step() { echo ""; echo "── $* ──────────────────────────────────────────"; }

# =============================================================================
# Cadence annuelle
# =============================================================================
if [[ "$CADENCE" == "annual" ]]; then
    ALL_TABLES="dgfip_balances dgfip_balances_nature_fonction ofgl_communes rei_taux fonds_vert rne_conseillers_municipaux rne_maires_historique sirene_unites_legales"

    step "1/5 sync : sources annuelles"
    export NATIONAL_CHANGES_FILE="$(mktemp)"
    # sync_rne_maires_historique : la liste des captures archivées est fixe dans
    # le script ; tant qu'elle ne change pas, il ne télécharge ni n'écrit rien.
    for loader in sync_dgfip_balances_national sync_dgfip_nature_fonction sync_ofgl_national sync_rei_taux sync_fonds_vert sync_rne_maires sync_rne_maires_historique sync_sirene_unites_legales; do
        echo "· $loader"
        $PYTHON "$PIPELINE_DIR/scripts/sync/$loader.py"
    done
    CHANGED="$(sort -u "$NATIONAL_CHANGES_FILE" | tr '\n' ' ')"
    if [[ -z "${CHANGED// /}" ]]; then
        if $FORCE; then
            CHANGED="$ALL_TABLES"
            echo "Aucune source n'a bougé ; --force : on reconstruit tout."
        else
            echo "Aucune source annuelle n'a bougé : rien à reconstruire."
            exit 0
        fi
    fi
    echo "Tables écrites : $CHANGED"

    step "2/5 dbt : en aval de $CHANGED ($TARGET)"
    SELECT=""
    for t in $CHANGED; do SELECT="$SELECT source:national_raw.$t+"; done
    (cd "$PIPELINE_DIR" && dbt seed --target "$TARGET" --select seed_comptes_libelles_simples seed_nomenclature_comptes)
    (cd "$PIPELINE_DIR" && dbt run --target "$TARGET" --select $SELECT)
    (cd "$PIPELINE_DIR" && dbt test --target "$TARGET" --select $SELECT)

    step "3/5 export ($NATIONAL_MARTS_DATASET)"
    EXPORTS=""
    add() { [[ " $EXPORTS " == *" $1 "* ]] || EXPORTS="$EXPORTS $1"; }
    for t in $CHANGED; do
        case "$t" in
            dgfip_balances)             add budget; add investissements ;;
            dgfip_balances_nature_fonction) add fonctions ;;
            ofgl_communes)              add budget; add investissements; add evolution; add chantiers; add taux ;;
            rei_taux)                   add taux ;;
            fonds_vert)                 add chantiers ;;
            rne_conseillers_municipaux) add maires ;;
            rne_maires_historique)      add maires ;;
            sirene_unites_legales)      add marches ;;
        esac
    done
    MANIFESTS=""
    DIRS=""
    for e in $EXPORTS; do
        case "$e" in
            budget)          $PYTHON "$PIPELINE_DIR/scripts/export/export_budget_national.py" --all
                             MANIFESTS="$MANIFESTS communes-budget-manifest.json"; DIRS="$DIRS communes-budget" ;;
            investissements) $PYTHON "$PIPELINE_DIR/scripts/export/export_investissements_national.py" --all
                             MANIFESTS="$MANIFESTS communes-investissements-manifest.json"; DIRS="$DIRS communes-investissements" ;;
            evolution)       $PYTHON "$PIPELINE_DIR/scripts/export/export_evolution_national.py" --all
                             MANIFESTS="$MANIFESTS communes-evolution-manifest.json"; DIRS="$DIRS communes-evolution" ;;
            chantiers)       $PYTHON "$PIPELINE_DIR/scripts/export/export_chantiers_national.py" --all
                             MANIFESTS="$MANIFESTS communes-chantiers-manifest.json"; DIRS="$DIRS communes-chantiers" ;;
            taux)            $PYTHON "$PIPELINE_DIR/scripts/export/export_taux_national.py"
                             MANIFESTS="$MANIFESTS communes-taux.json" ;;
            maires)          $PYTHON "$PIPELINE_DIR/scripts/export/export_maires_national.py"
                             MANIFESTS="$MANIFESTS communes-maires.json" ;;
            marches)         $PYTHON "$PIPELINE_DIR/scripts/export/export_marches_national.py" --all
                             MANIFESTS="$MANIFESTS communes-marches-manifest.json"; DIRS="$DIRS communes-marches" ;;
            fonctions)       $PYTHON "$PIPELINE_DIR/scripts/export/export_communes_fonctions.py"
                             MANIFESTS="$MANIFESTS communes-fonctions-manifest.json"; DIRS="$DIRS communes-fonctions" ;;
        esac
    done

    step "4/5 contrôle des manifestes"
    for m in $MANIFESTS; do
        $PYTHON "$PIPELINE_DIR/scripts/audit/check_national_manifest.py" "website/src/data/$m"
    done

    if $UPLOAD; then
        for d in $DIRS; do
            step "5/5 envoi : $BUCKET/$d"
            gcloud storage rsync -r "$REPO_DIR/website/public/data/$d" "$BUCKET/$d"
        done
    else
        step "5/5 envoi ignoré (--no-upload)"
    fi
    echo ""
    echo "✓ communes : sources annuelles à jour ($CHANGED)"
    exit 0
fi

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
