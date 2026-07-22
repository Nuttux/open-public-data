"use client";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import { useT, useLocale } from "@/lib/localeContext";
import { numLocale } from "@/lib/fmt";
import { useCountUp } from "@/lib/use-count-up";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";
import type { DailyBreadConstants } from "@/lib/national-data";
import {
  computeBreakdown,
  computeBreakdownRetraite,
  computeBreakdownCapital,
  computeBreakdownIndependant,
  computeInstitutionShares,
  computeInstitutionSharesCausal,
  computeAssoBreakdown,
  computeStateBuckets,
  computeLocalLevels,
  isCollectiviteUnique,
  type IndepActivityType,
} from "@/lib/daily-bread";
import {
  EditableNumber,
  EditableSelect,
  EditableCommune,
} from "@/components/fusion/EditableInlineSpan";
// DailyBreadEquivalentCard + getPictoForKey — supprimés avec §06 synthèse
// (mai 2026). Conservés dans /components/fusion/ pour usage futur éventuel.

// ─── Sources de revenus (cumulatif) ──────────────────────────────────────
// L'utilisateur peut cumuler plusieurs sources simultanément (cas réel :
// cadre + dividendes, retraité + revenus fonciers, indépendant + salaire
// complémentaire, etc.). Chaque source a son propre montant ; 0 = pas
// concerné. Le total est la somme des 4 breakdowns.
//
// Caveat : l'IR du foyer est en réalité agrégé sur le RFR consolidé (somme
// de tous les revenus). Ici chaque source est calculée séparément, ce qui
// est une approximation acceptable pour un MVP éducatif. Phase 5 OpenFisca
// intégrera le calcul consolidé exact (RFR → IR par foyer).
const INDEP_TYPES: IndepActivityType[] = [
  "vente",
  "services_bic",
  "services_bnc",
];

// ─── Types ───────────────────────────────────────────────────────────────

type CommuneHit = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  pop: number;
};

type SelectedCommune = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  reg_name: string;
  pop: number;
  eur_hab: number; // dépenses totales €/hab (OFGL)
  impots_locaux_eur_hab: number; // recettes fiscales totales €/hab — sert à estimer la TF du ménage
};

/**
 * TF estimée pour 1 ménage propriétaire moyen.
 *
 * Hypothèse : OFGL "impôts locaux" = TF + TH (résidences secondaires) + CFE + CVAE + autres.
 * Part TF + TH ménages dans ce total ≈ 40 % (40 % du reste = entreprises et autres taxes).
 * Taille moyenne d'un ménage France ≈ 2,2 hab (INSEE 2022).
 *
 * → TF estimée par ménage = impots_locaux × 0,4 × 2,2
 */
const estimateTaxeFonciereFromCommune = (impots_locaux_eur_hab: number) =>
  Math.round(impots_locaux_eur_hab * 0.4 * 2.2);

// ─── Helpers ─────────────────────────────────────────────────────────────

const PRESETS = [
  { key: "smic", net: 1426 },
  { key: "median", net: 2100 },
  { key: "cadre", net: 3750 },
  { key: "cadre_sup", net: 6000 },
] as const;

const PARTS_OPTIONS = [
  { value: 1, key: "single" as const },
  { value: 1.5, key: "single_1kid" as const },
  { value: 2, key: "couple" as const },
  { value: 2.5, key: "couple_1kid" as const },
  { value: 3, key: "couple_2kids" as const },
  { value: 4, key: "couple_3kids" as const },
];

const fmtEur = (n: number, locale: string, decimals = 0) =>
  n.toLocaleString(numLocale(locale), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

/** Format €/an au format compact "X Md€" / "€X bn" — pour la note méthodo
 *  §04 État (mention 447 / 676 / 229 Md€). */
const fmtBnEur = (amountEur: number, locale: string): string => {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const md = amountEur / 1e9;
  const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
  return locale === "fr"
    ? `${rounded.replace(".", ",")} Md€`
    : `€${rounded} bn`;
};

/**
 * Inline-render a tagged string like "le {b1}truc{/b1} et {b2}machin{/b2}"
 * by mapping each tag to a span with custom styling. Lightweight to avoid
 * pulling in a markdown lib for a couple of bold spans.
 */
function renderTagged(
  tpl: string,
  styles: Record<string, React.CSSProperties> = {},
): React.ReactNode {
  const re = /\{(b\d?|em)\}([^{]*?)\{\/\1\}/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(tpl))) {
    if (m.index > last) parts.push(tpl.slice(last, m.index));
    const tag = m[1];
    const inner = m[2];
    const style = styles[tag] ?? { color: "var(--p-ink)", fontWeight: 600 };
    parts.push(
      <b key={i++} style={style}>
        {inner}
      </b>,
    );
    last = m.index + m[0].length;
  }
  if (last < tpl.length) parts.push(tpl.slice(last));
  return parts;
}

// ─── RevealCountNum ──────────────────────────────────────────────────────
//
// Petit wrapper réutilisable pour les chiffres dont l'animation count-up
// doit être déclenchée au moment où la zone parente entre dans le viewport
// (et pas avant). Utilisé par le tri-stack §02 dont les 3 % et 3 montants
// doivent compter en synchro avec l'animation `scaleX` des segments.
//
// Régression zéro côté SSR :
// - Tant que `revealed === false` ET qu'aucune animation n'a démarré, on
//   rend `format(value)` directement → SSR et premier render client
//   affichent la valeur finale (pas de "0" visible si JS désactivé).
// - Quand `revealed` bascule à `true`, on arme `started`, on pousse
//   `target = value` à `useCountUp` qui était initialisé à 0 → animation
//   `0 → value`. Pas de saut "value → 0 → value" : on bascule directement
//   du rendu statique au rendu animé.
// - Updates ultérieurs de `value` (changement de profil après le reveal)
//   sont propagés au target → useCountUp gère l'interpolation.
//
// Limite connue : 1 frame possible à 0 lors du switch (le hook useCountUp
// retourne son state interne courant — 0 — pour le render qui suit le
// setTarget, avant que le rAF ne produise la première valeur > 0). Sur
// 600ms d'animation, c'est ~16ms invisibles à l'œil.
function RevealCountNum({
  value,
  revealed,
  duration = 600,
  format,
}: {
  value: number;
  revealed: boolean;
  duration?: number;
  format: (v: number) => string;
}) {
  const [started, setStarted] = useState(false);
  const [target, setTarget] = useState(0);
  const animated = useCountUp(target, duration);

  useEffect(() => {
    if (revealed && !started) {
      setTarget(value);
      setStarted(true);
    } else if (started) {
      setTarget(value);
    }
  }, [revealed, value, started]);

  if (!started) return <>{format(value)}</>;
  return <>{format(animated)}</>;
}

// ─── Component ───────────────────────────────────────────────────────────

/**
 * Index compact des keys publiées par Agent P. Sert à filtrer les alias
 * en ne rendant cliquable QUE ce qui existe vraiment côté drilldown.json
 * (zéro lien mort par construction).
 *
 * - level2/level3 : nomenclature officielle PLFSS/PLF/OFGL
 * - aggregations (État seulement) : 10 buckets éditoriaux du pipeline
 * - departement/region (Local seulement) : niveaux administratifs distincts
 */
type DrilldownIndex = Record<
  "secu" | "etat" | "local",
  { level2: string[]; level3: Record<string, string[]> }
> & {
  etat_aggregations?: string[];
  local_dept?: { level2: string[]; level3: Record<string, string[]> };
  local_region?: { level2: string[]; level3: Record<string, string[]> };
};

// ─── Alias rules (in-page row.key → drilldown.key) ────────────────────────
//
// Pourquoi : les rows DeepDive en page sont calculées à partir de
// `daily_bread.json` (seeds éditoriales : ONDAM/DREES/DEPP/AFT…) tandis que
// le drilldown.json (Agent P) suit la nomenclature officielle PLF/PLFSS/OFGL.
// Les `key` ne matchent pas naturellement → alias explicite par bucket.
//
// Toute clé NON listée ici sera juste non-cliquable (graceful) — ne pas
// inventer d'alias spéculatifs : mieux vaut une row passive qu'un lien mort.

const SECU_TOP_ALIAS: Record<string, string> = {
  part_cnam_maladie: "cnam_maladie",
  part_cnav_retraites: "cnav_retraites",
  part_caf_famille: "cnaf_famille",
  part_unedic_chomage: "unedic_chomage",
  part_at_mp_autonomie: "atmp_autonomie",
};

// État stateBuckets agrège missions PLF en 10 buckets éditoriaux. Le pipeline
// publie ces mêmes 10 buckets sous `drilldown.etat.aggregations` — donc on
// route directement vers `/bucket/etat/agg/<bucketKey>` (la route drawer
// `etat/agg/[agg]` liste les missions PLF composantes et chaque mission
// pointe vers son `level2/level3/level4`).
// Les keys ici sont identiques à celles de `STATE_BUCKET_DEFS` (lib/daily-bread.ts).
const ETAT_TOP_ALIAS_AGG: Record<string, string> = {
  education_recherche: "education_recherche",
  defense: "defense",
  securite: "securite",
  justice: "justice",
  solidarite_insertion: "solidarite_insertion",
  travail_emploi: "travail_emploi",
  ecologie_logement_transports: "ecologie_logement_transports",
  culture_medias_sport: "culture_medias_sport",
  dette: "dette",
  autres_ministeres: "autres",
  // contribution_ue + autres_etat_hors_plf : pas de drawer (overlay-only).
};

// (Alias LOCAL_* — supprimés en mai 2026 : ils alimentaient les rows
//  cliquables des DeepDive, désormais migrés dans le drawer.)

export default function DailyBreadClient({
  db,
  drilldownIndex,
}: {
  db: DailyBreadConstants | null;
  /** Index compact des keys de drilldown.json (level2 + level3 par parent).
   *  Construit côté server (page.tsx) ; sert ici à filtrer les alias en ne
   *  rendant cliquable QUE ce que l'Agent P a effectivement publié. */
  drilldownIndex?: DrilldownIndex;
}) {
  // Helper : construit une Map<inPageKey, fullUrl> en intersectant un alias
  // statique avec les keys publiées par Agent P. Les keys absentes du drilldown
  // restent non-cliquables — pas de lien mort possible.
  // Le query string profil (`?net=...`) est injecté plus bas via
  // `appendProfileQuery` — sans lui, les drawers L2/L3/agg perdent le
  // contexte profil et n'affichent plus les €/mois (lead + sub-rows).
  const makeTopUrlMap = useCallback(
    (bucket: "secu" | "etat" | "local", alias: Record<string, string>) => {
      const m = new Map<string, string>();
      const available = new Set(drilldownIndex?.[bucket]?.level2 ?? []);
      for (const [inPage, drillKey] of Object.entries(alias)) {
        if (available.has(drillKey)) {
          m.set(inPage, `/fr/national/daily-bread/bucket/${bucket}/${drillKey}`);
        }
      }
      return m;
    },
    [drilldownIndex],
  );
  // (Helper makeLevel3UrlMap — supprimé en mai 2026 avec les DeepDive Sécu
  //  qui en étaient le seul caller. Les drills niveau 3 restent accessibles
  //  via le drawer ouvert depuis BarList.)


  const secuTopUrls = useMemo(
    () => makeTopUrlMap("secu", SECU_TOP_ALIAS),
    [makeTopUrlMap],
  );
  // État buckets éditoriaux → routes drawer `/bucket/etat/agg/<aggKey>`
  // (la route agg liste les missions PLF puis chaque mission ouvre son level2).
  // On intersecte avec les aggregations effectivement publiées par Agent P.
  const etatTopUrls = useMemo(() => {
    const m = new Map<string, string>();
    const available = new Set(drilldownIndex?.etat_aggregations ?? []);
    for (const [inPage, aggKey] of Object.entries(ETAT_TOP_ALIAS_AGG)) {
      if (available.has(aggKey)) {
        m.set(inPage, `/fr/national/daily-bread/bucket/etat/agg/${aggKey}`);
      }
    }
    // La ligne "Contribution UE" ouvre la fiche recette détaillée (PSR-UE
    // décomposé en RNB/TVA/plastique/NGEU + bilan brut/reçu/net) — partage
    // la même fiche que /fr/national/budget/recettes/psr_ue.
    m.set("contribution_ue", "/fr/national/budget/recettes/psr_ue");
    return m;
  }, [drilldownIndex]);
  // (URLs alias bloc-communal-seed / fonctionnelle / dept / region —
  //  servaient à rendre les rows DeepDive cliquables. Supprimées avec la
  //  migration des asides dans le drawer en mai 2026.)

  // BarList §05 — 3 niveaux administratifs cliquables.
  // Chaque ligne ouvre la vue scope-overview (drawer) listant TOUTES les
  // fonctions du bloc — pas auto-jump vers la 1re fonction (qui masquait
  // le reste du scope, ex : "Dept → Santé" cachait lycées, routes…).
  const localLevelsUrls = useMemo(() => {
    const m = new Map<string, string>();
    const blocKeys = drilldownIndex?.local?.level2 ?? [];
    const deptKeys = drilldownIndex?.local_dept?.level2 ?? [];
    const regKeys = drilldownIndex?.local_region?.level2 ?? [];
    if (blocKeys.length > 0) {
      m.set("bloc_communal", `/fr/national/daily-bread/bucket/local`);
    }
    if (deptKeys.length > 0) {
      m.set("departement", `/fr/national/daily-bread/bucket/local/dept`);
    }
    if (regKeys.length > 0) {
      m.set("region", `/fr/national/daily-bread/bucket/local/region`);
    }
    return m;
  }, [drilldownIndex]);
  // (Helper buildSecuL3 — supprimé avec les DeepDive Sécu ; les drilldowns
  //  niveau 3 restent accessibles via le drawer level2 ouvert depuis BarList.)
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Form state (URL-driven, cumulatif) ────────────────────────────
  // Defaults : profil médian français INSEE (~2 100 €/mois net) · célibataire · Paris
  // Toutes les sources non-salaire défaut à 0 (= "pas concerné").
  // Clamps de sécurité : valeurs ≥ 0, parts dans [1; 10] — protège des URLs mal formées.
  const clampNonNeg = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);
  // Param "net" : present → cast (incl. 0 explicite), absent → défaut 2100.
  // Important : pour ?net=0&capital=120000, salaire DOIT être 0 (pas le défaut).
  const rawNetParam = searchParams?.get("net");
  const initialSalaire = rawNetParam !== null && rawNetParam !== undefined
    ? clampNonNeg(Number(rawNetParam))
    : 2100;
  const initialPension = clampNonNeg(Number(searchParams?.get("pension") ?? 0));
  const initialCapital = clampNonNeg(Number(searchParams?.get("capital") ?? 0));
  const initialIndepCa = clampNonNeg(Number(searchParams?.get("indep_ca") ?? 0));
  const rawParts = Number(searchParams?.get("parts") || 1);
  const initialParts = Number.isFinite(rawParts)
    ? Math.min(10, Math.max(1, rawParts))
    : 1;
  const initialCommuneSlug = searchParams?.get("c") || "paris";
  const initialOwner = searchParams?.get("owner") === "1";
  const initialTf = clampNonNeg(Number(searchParams?.get("tf") || 0)); // 0 = auto-estimation
  const rawIndepType = (searchParams?.get("indep_type") || "services_bic") as IndepActivityType;
  const initialIndepType: IndepActivityType = INDEP_TYPES.includes(rawIndepType)
    ? rawIndepType
    : "services_bic";

  // Renommé `netMonthly` → `salaireMonthly` pour refléter le modèle cumulatif.
  const [salaireMonthly, setSalaireMonthly] = useState<number>(initialSalaire);
  const [pensionMonthly, setPensionMonthly] = useState<number>(initialPension);
  const [capitalAnnuel, setCapitalAnnuel] = useState<number>(initialCapital);
  const [indepCaAnnuel, setIndepCaAnnuel] = useState<number>(initialIndepCa);
  const [parts, setParts] = useState<number>(initialParts);
  const [commune, setCommune] = useState<SelectedCommune | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(initialOwner);
  // tfCustom = 0 → auto-estimation depuis la commune ; sinon valeur saisie par user
  const [tfCustom, setTfCustom] = useState<number>(initialTf);
  const [indepType, setIndepType] = useState<IndepActivityType>(initialIndepType);

  // ─── OpenFisca (Phase 5 MVP, opt-in) ───────────────────────────────
  // Calcul exact via l'API publique Etalab pour le profil **salarié**.
  // - Activé sur clic du bouton "Affiner avec calcul officiel"
  // - Si l'API timeout / erreur : fallback silencieux sur le calcul JS local
  // - Reset automatique dès que les inputs salaire/parts/commune changent
  //   (pour éviter d'afficher un breakdown OF stale).
  type OpenFiscaBreakdownLite = {
    cotisations_sal: number;
    csg: number;
    ir: number;
    tva_estimee: number;
    total: number;
  };
  const [openFiscaResult, setOpenFiscaResult] =
    useState<OpenFiscaBreakdownLite | null>(null);
  const [isLoadingOpenFisca, setIsLoadingOpenFisca] = useState(false);
  const [openFiscaError, setOpenFiscaError] = useState<string | null>(null);

  // Auto-reset OpenFisca result si inputs salaire-pertinents changent.
  useEffect(() => {
    setOpenFiscaResult(null);
    setOpenFiscaError(null);
  }, [salaireMonthly, parts, commune?.insee]);

  // "Autres revenus" : auparavant déplié seulement si une source non-salaire
  // était dans l'URL. Depuis post user-testing (mai 2026), on déplie TOUJOURS
  // par défaut pour discoverability — les utilisateurs ne réalisaient pas
  // qu'on accepte pension/capital/indép. Variable conservée pour signature
  // mais non utilisée — voir <details open> plus bas.
  const initialOtherIncomesOpen =
    initialPension > 0 || initialCapital > 0 || initialIndepCa > 0;
  void initialOtherIncomesOpen;

  // Sync URL when inputs change. Cas par défaut salarié = URL minimale
  // (?net=2100&parts=1&c=paris) ; on omet les zéros pour rester propre.
  //
  // ⚠ Skip si on a navigué vers une sous-route (drawer drill-down) — sinon le
  // replace écrase l'URL `/fr/national/daily-bread/bucket/<bucket>/...` et tue l'intercept
  // parallel-route. Le client reste monté pendant l'intercept (layout persiste)
  // donc l'effect tourne encore.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && pathname !== "/fr/national/daily-bread") return;
    const params = new URLSearchParams();
    params.set("net", String(salaireMonthly));
    params.set("parts", String(parts));
    if (commune) params.set("c", commune.slug);
    if (isOwner) params.set("owner", "1");
    if (tfCustom > 0) params.set("tf", String(tfCustom));
    if (pensionMonthly > 0) params.set("pension", String(pensionMonthly));
    if (capitalAnnuel > 0) params.set("capital", String(capitalAnnuel));
    if (indepCaAnnuel > 0) {
      params.set("indep_ca", String(indepCaAnnuel));
      if (indepType !== "services_bic") params.set("indep_type", indepType);
    }
    router.replace(`/fr/national/daily-bread?${params.toString()}`, { scroll: false });
  }, [
    salaireMonthly,
    pensionMonthly,
    capitalAnnuel,
    indepCaAnnuel,
    parts,
    commune,
    isOwner,
    tfCustom,
    indepType,
    pathname,
    router,
  ]);

  // Query string profil — propagé aux liens drill (drawer) pour que les
  // pages `@drawer/(.)bucket/...` reçoivent ?net=...&parts=...&c=... et
  // affichent les €/mois sur le profil. Sans ce param, le drawer perd le
  // contexte profil (lead "SUR TON PROFIL · X €/MOIS" + sub-rows €/mois).
  // Doit rester aligné avec la logique du `useEffect` URL sync ci-dessus.
  const profileQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("net", String(salaireMonthly));
    params.set("parts", String(parts));
    if (commune) params.set("c", commune.slug);
    if (isOwner) params.set("owner", "1");
    if (tfCustom > 0) params.set("tf", String(tfCustom));
    if (pensionMonthly > 0) params.set("pension", String(pensionMonthly));
    if (capitalAnnuel > 0) params.set("capital", String(capitalAnnuel));
    if (indepCaAnnuel > 0) {
      params.set("indep_ca", String(indepCaAnnuel));
      if (indepType !== "services_bic") params.set("indep_type", indepType);
    }
    return params.toString();
  }, [
    salaireMonthly,
    pensionMonthly,
    capitalAnnuel,
    indepCaAnnuel,
    parts,
    commune,
    isOwner,
    tfCustom,
    indepType,
  ]);

  // ─── Initial commune fetch ─────────────────────────────────────────
  useEffect(() => {
    if (commune) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/commune/${encodeURIComponent(initialCommuneSlug)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const e = data.entry;
        if (!e) return;
        const eur_hab = e.kpis?.depenses_totales?.eur_hab ?? 1500;
        const impots_locaux_eur_hab = e.kpis?.impots_locaux?.eur_hab ?? 1100;
        setCommune({
          insee: e.insee,
          slug: e.slug,
          nom: e.nom,
          dep_name: e.dep_name,
          reg_name: e.reg_name ?? "",
          pop: e.pop,
          eur_hab,
          impots_locaux_eur_hab,
        });
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Warm up search API in background ─────────────────────────────
  // Next.js dev compile-on-demand peut prendre ~10s la première fois ;
  // on lance un fetch idle au mount pour que la compile arrive avant
  // que l'utilisateur tape. En prod c'est gratuit (déjà compilé).
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/search-communes?q=__warm").catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // ─── Commune pick handler ──────────────────────────────────────────
  // L'autocomplete de search est géré par <EditableCommune> dans le hero ;
  // ici on garde uniquement le callback qui refetch les KPIs (eur_hab,
  // impots_locaux) après un pick. L'état est mis à jour de façon optimiste
  // (depuis la donnée de la hit), puis enrichi quand l'API répond.
  const pickCommune = useCallback(async (hit: CommuneHit) => {
    setCommune({
      insee: hit.insee,
      slug: hit.slug,
      nom: hit.nom,
      dep_name: hit.dep_name,
      reg_name: "",
      pop: hit.pop,
      eur_hab: 0,
      impots_locaux_eur_hab: 0,
    });
    try {
      const res = await fetch(`/api/commune/${encodeURIComponent(hit.slug)}`);
      const data = await res.json();
      const e = data.entry;
      const eur_hab = e?.kpis?.depenses_totales?.eur_hab ?? 1500;
      const impots_locaux_eur_hab = e?.kpis?.impots_locaux?.eur_hab ?? 1100;
      setCommune({
        insee: hit.insee,
        slug: hit.slug,
        nom: hit.nom,
        dep_name: hit.dep_name,
        reg_name: e?.reg_name ?? "",
        pop: hit.pop,
        eur_hab,
        impots_locaux_eur_hab,
      });
    } catch {
      // ignore — the optimistic update remains
    }
  }, []);

  // ─── OpenFisca request handler ─────────────────────────────────────
  // POST /api/openfisca-calc avec le profil salaire courant.
  // Sur succès : setOpenFiscaResult → tout le hero/composition/dispatch
  // utilise désormais le breakdown OpenFisca pour le salaire.
  // Sur fail : setOpenFiscaError + fallback silencieux (le JS local reste actif).
  const requestOpenFiscaCalc = useCallback(async () => {
    if (salaireMonthly <= 0) return;
    setIsLoadingOpenFisca(true);
    setOpenFiscaError(null);
    try {
      const res = await fetch("/api/openfisca-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaireMonthly,
          parts,
          departementInsee: commune?.insee,
        }),
      });
      const data = await res.json();
      if (!data?.ok || !data.breakdown) {
        setOpenFiscaError(data?.error || "openfisca_unavailable");
        return;
      }
      const b = data.breakdown;
      setOpenFiscaResult({
        cotisations_sal: b.cotisations_sal ?? 0,
        csg: b.csg ?? 0,
        ir: b.ir ?? 0,
        tva_estimee: b.tva_estimee ?? 0,
        total: b.total ?? 0,
      });
    } catch {
      setOpenFiscaError("network_error");
    } finally {
      setIsLoadingOpenFisca(false);
    }
  }, [salaireMonthly, parts, commune?.insee]);

  // ─── Compute breakdowns (cumulatif) ────────────────────────────────
  // Chaque source = 1 breakdown indépendant. Si montant = 0 → breakdown 0
  // (skip silencieux). Le total final = somme des 4 + TF.
  //
  // CAVEAT MVP : l'IR du foyer est calculé séparément par source (salaire,
  // pension, indépendant) — en réalité l'IR est calculé sur le RFR consolidé
  // (somme des revenus). Approximation acceptable pour un calculateur
  // pédagogique — Phase 5 OpenFisca pour le calcul exact.
  const breakdownSalaireJsLocal = useMemo(() => {
    if (!db || salaireMonthly <= 0) {
      return { cotisations_sal: 0, csg: 0, ir: 0, tva_estimee: 0, total: 0 };
    }
    return computeBreakdown({ net_annuel: salaireMonthly * 12, parts }, db);
  }, [salaireMonthly, parts, db]);

  // breakdownSalaire = OpenFisca si actif, sinon JS local. Le reste de l'UI
  // (composition, dispatch institutionnel, deep-dives) lit `breakdownSalaire`
  // — donc activer OpenFisca propage automatiquement le calcul exact partout
  // où le salaire compte. Les autres sources (pension/capital/indep) restent
  // toujours en calcul JS local pour la Phase 5 MVP.
  const breakdownSalaire = openFiscaResult ?? breakdownSalaireJsLocal;

  const breakdownRetraite = useMemo(() => {
    if (!db || pensionMonthly <= 0) {
      return { csg_crds_casa: 0, ir: 0, tva_estimee: 0, total: 0, taux_csg_applied: 0 };
    }
    return computeBreakdownRetraite(pensionMonthly * 12, parts, db);
  }, [pensionMonthly, parts, db]);

  const breakdownCapital = useMemo(() => {
    if (!db || capitalAnnuel <= 0) {
      return { ir: 0, prelevements_sociaux: 0, tva_estimee: 0, total: 0 };
    }
    return computeBreakdownCapital(capitalAnnuel, db);
  }, [capitalAnnuel, db]);

  const breakdownIndep = useMemo(() => {
    if (!db || indepCaAnnuel <= 0) {
      return { cotisations_urssaf: 0, ir: 0, tva_estimee: 0, total: 0, benefice_imposable: 0 };
    }
    return computeBreakdownIndependant(indepCaAnnuel, indepType, parts, db);
  }, [indepCaAnnuel, indepType, parts, db]);

  // Sources actives = montant > 0 (pour adapter UI eyebrow / composition)
  const activeSources = useMemo(() => {
    const s: Array<"salaire" | "pension" | "capital" | "indep"> = [];
    if (salaireMonthly > 0) s.push("salaire");
    if (pensionMonthly > 0) s.push("pension");
    if (capitalAnnuel > 0) s.push("capital");
    if (indepCaAnnuel > 0) s.push("indep");
    return s;
  }, [salaireMonthly, pensionMonthly, capitalAnnuel, indepCaAnnuel]);

  // Total cumulé (annuel) — somme des 4 breakdowns
  const breakdownTotalCumule =
    breakdownSalaire.total +
    breakdownRetraite.total +
    breakdownCapital.total +
    breakdownIndep.total;

  // ─── Taxe foncière estimée (varie selon commune si propriétaire) ──
  const tfEstimated = useMemo(() => {
    if (!isOwner) return 0;
    if (tfCustom > 0) return tfCustom;
    if (commune && commune.impots_locaux_eur_hab > 0) {
      return estimateTaxeFonciereFromCommune(commune.impots_locaux_eur_hab);
    }
    return 0;
  }, [isOwner, tfCustom, commune]);

  const totalAnnuel = breakdownTotalCumule + tfEstimated;
  const totalMonthly = totalAnnuel / 12;

  // Count-up animations — easing material standard, 600ms.
  // Le rendu utilise la valeur animée pour les chiffres "vedettes" (preview
  // en haut + grand chiffre du panneau profil). Voir `useCountUp` pour la
  // gestion mount/SSR/reduced-motion.
  const totalMonthlyAnim = useCountUp(totalMonthly, 600);
  const totalAnnuelAnim = useCountUp(totalAnnuel, 600);

  // Reveal-on-scroll pour le tri-stack du panneau Dispatch (02). Les 3
  // segments grandissent depuis la gauche en stagger (0/150/300ms) la
  // première fois que le panneau entre dans le viewport. One-shot.
  const triStackRef = useRef<HTMLDivElement | null>(null);
  const triStackRevealed = useRevealOnScroll(triStackRef, { threshold: 0.3 });

  // ─── Count-up §01 — composition adaptative du hero ───────────────────
  //
  // Les 4 (ou 3) montants de la ligne "Composition" sautent sec lors d'un
  // changement de profil (SMIC → Cadre, etc.). On les anime en cascade
  // légère via des durations échelonnées (600/650/700/750 ms) — toutes
  // démarrent ensemble mais finissent à 50 ms d'écart, ce qui donne
  // l'impression visuelle d'une cascade sans nécessiter un délai de
  // démarrage (que `useCountUp` ne supporte pas). Tous les hooks sont
  // appelés au top-level (Rules of Hooks) ; seule la branche affichée
  // utilise réellement les valeurs animées.
  const compoSalCotis = useCountUp(breakdownSalaire.cotisations_sal / 12, 600);
  const compoSalCsg = useCountUp(breakdownSalaire.csg / 12, 650);
  const compoSalIr = useCountUp(breakdownSalaire.ir / 12, 700);
  const compoSalTva = useCountUp(breakdownSalaire.tva_estimee / 12, 750);

  const compoRetCsg = useCountUp(breakdownRetraite.csg_crds_casa / 12, 600);
  const compoRetIr = useCountUp(breakdownRetraite.ir / 12, 650);
  const compoRetTva = useCountUp(breakdownRetraite.tva_estimee / 12, 700);

  const compoCapIr = useCountUp(breakdownCapital.ir / 12, 600);
  const compoCapPs = useCountUp(breakdownCapital.prelevements_sociaux / 12, 650);
  const compoCapTva = useCountUp(breakdownCapital.tva_estimee / 12, 700);

  const compoIndCotis = useCountUp(breakdownIndep.cotisations_urssaf / 12, 600);
  const compoIndIr = useCountUp(breakdownIndep.ir / 12, 650);
  const compoIndTva = useCountUp(breakdownIndep.tva_estimee / 12, 700);

  // ─── Reveal-on-scroll §03–§07 — fade-in + slide-up des panels ────────
  //
  // Chaque panel (Sécu, État, Local, Synthèse, Méthode) entre
  // depuis 30px en bas avec opacité 0, transition 500ms cubic-bezier
  // standard. Threshold 0.15 (panel apparaît dès qu'on en voit ~15%, soit
  // après quelques pixels de scroll), one-shot.
  //
  // Régression zéro : si IntersectionObserver indispo OU JS désactivé,
  // `useRevealOnScroll` renvoie `true` immédiatement → `.is-revealed`
  // posée → état final affiché. Avec JS dispo mais avant scroll, le panel
  // est temporairement opacity 0 jusqu'au reveal — c'est l'effet voulu.
  //
  // §00 (Calc) et §01 (Hero) restent toujours visibles d'emblée pour ne
  // pas masquer le hero au mount. §02 (Disp) garde son reveal limité au
  // tri-stack interne (déjà fait) — pas de panel-level fade pour éviter
  // d'enchaîner deux animations sur le même panel.
  //
  // Renumérotage 2026-05 : ancien §06 (COFOG) retiré → §07 Synthèse devient
  // §06, §08 Caveats refondu en "Méthode" et devient §07.
  const panel3Ref = useRef<HTMLElement | null>(null);
  const panel3Revealed = useRevealOnScroll(panel3Ref, { threshold: 0.15 });
  const panel4Ref = useRef<HTMLElement | null>(null);
  const panel4Revealed = useRevealOnScroll(panel4Ref, { threshold: 0.15 });
  const panel5Ref = useRef<HTMLElement | null>(null);
  const panel5Revealed = useRevealOnScroll(panel5Ref, { threshold: 0.15 });
  const panel6Ref = useRef<HTMLElement | null>(null);
  const _panel6Revealed = useRevealOnScroll(panel6Ref, { threshold: 0.15 });
  const panel7Ref = useRef<HTMLElement | null>(null);
  const panel7Revealed = useRevealOnScroll(panel7Ref, { threshold: 0.15 });

  // Client-armed flag pour la couche cinétique des panels.
  // Tant que `clientArmed === false` (SSR + premier paint client), les
  // panels n'ont pas la classe modifier `is-armed` → ils sont rendus
  // dans leur état final (opacity 1, pas de translation) → JS désactivé
  // = panels visibles, valeurs lisibles. Promesse "régression zéro" :
  // l'animation est strictement progressive enhancement.
  // Après mount, on bascule à `true` → la classe `is-armed` active la
  // règle CSS qui pose opacity 0 + translateY(30px) jusqu'à ce que
  // `is-revealed` soit posé par `useRevealOnScroll`. Comme les panels
  // §03-§08 sont tous sous la ligne de flottaison initiale, le passage
  // visible→invisible→reveal ne produit aucun flash perceptible.
  const [clientArmed, setClientArmed] = useState(false);
  useEffect(() => {
    setClientArmed(true);
  }, []);

  // Écart pédagogique OpenFisca vs JS local sur la part salaire (en %).
  // Affiché seulement si > 1 % et résultat OpenFisca présent.
  const openFiscaEcartPct = useMemo(() => {
    if (!openFiscaResult || breakdownSalaireJsLocal.total <= 0) return null;
    const diff =
      ((openFiscaResult.total - breakdownSalaireJsLocal.total) /
        breakdownSalaireJsLocal.total) *
      100;
    return Math.abs(diff) > 1 ? diff : null;
  }, [openFiscaResult, breakdownSalaireJsLocal.total]);

  // ─── Pivot Approche A (mai 2026) ────────────────────────────────────
  // Daily Bread n'utilise PLUS de dispatch perso (ni causal ni proportionnel).
  // À la place, les panneaux §02-05 affichent la dépense publique nationale
  // PER-CAPITA — ce que la France dépense par habitant en moyenne sur chaque
  // sous-secteur. La §06 synthèse compare la contribution perso (856 €/mois)
  // à la moyenne per-capita (~2 200 €/mois/hab) et explique le gap (cotisations
  // employeurs invisibles, IS, déficit, etc.). Promesse honnête : pas de claim
  // que "TES euros vont précisément à X" (ce qui est conceptuellement faux).
  //
  // institutionShares + secuShare/etatShare/localShare gardés pour compat
  // (notamment pour le total perso utilisé dans §06).
  const institutionShares = useMemo(
    () =>
      db
        ? computeInstitutionSharesCausal(
            {
              breakdownSalaire,
              breakdownRetraite,
              breakdownCapital,
              breakdownIndep,
              tfAnnual: tfEstimated,
            },
            db,
          )
        : [],
    [db, breakdownSalaire, breakdownRetraite, breakdownCapital, breakdownIndep, tfEstimated],
  );
  void computeInstitutionShares;

  // secuShare/etatShare/localShare — gardés pour les conditionals des panels
  // (étant donné que assoBranches/stateBuckets/localLevels sont per-capita,
  // ces "shares" ne projettent plus le perso de l'utilisateur). secuShare
  // n'est plus utilisé en post-§06-drop ; etat/local servent au conditional
  // de rendu des panels §04/§05 (présent uniquement quand drilldown OK).
  const etatShare = institutionShares.find((i) => i.code === "S1311");
  const localShare = institutionShares.find((i) => i.code === "S1313");

  // PER-CAPITA national constants (Approche A) — ce que la France dépense
  // par habitant chaque mois en moyenne, par sous-secteur. Population INSEE
  // 1er janvier 2024 (~68 M) depuis db.apu_subsectors.totals.population_france.
  const populationFr =
    db?.apu_subsectors?.totals?.population_france ?? 68042591;
  const s1311Total = db?.apu_subsectors?.institutions?.S1311?.annual_eur ?? 0;
  const s1313Total = db?.apu_subsectors?.institutions?.S1313?.annual_eur ?? 0;
  const s1314Total = db?.apu_subsectors?.institutions?.S1314?.annual_eur ?? 0;
  const secuMonthly = populationFr > 0 ? s1314Total / populationFr / 12 : 0;
  const etatMonthly = populationFr > 0 ? s1311Total / populationFr / 12 : 0;
  const localMonthly = populationFr > 0 ? s1313Total / populationFr / 12 : 0;
  const totalPerCapitaMonthly = secuMonthly + etatMonthly + localMonthly;

  // Pour les sub-rows : on utilise les TOTAUX nationaux (pas la share perso)
  // et on divise par population × 12 pour obtenir le per-capita par branche.
  const assoBranches = useMemo(
    () => (db ? computeAssoBreakdown(s1314Total, db) : []),
    [db, s1314Total],
  );

  const stateBuckets = useMemo(
    () => (db ? computeStateBuckets(s1311Total, db) : []),
    [db, s1311Total],
  );

  const localLevels = useMemo(() => {
    if (!db) return [];
    // Pour le local, on garde les shares OFGL nationales (55/30/15) sans
    // pondération commune — c'est de la moyenne nationale par habitant.
    return computeLocalLevels(
      s1313Total,
      db,
      1, // ratio = 1 → pas de pondération Paris pour le national per-capita
      false, // pas de collectivité-unique merge ; vue nationale
    );
  }, [db, s1313Total]);

  // ─── Deep-dives — supprimés (2026-05) ──────────────────────────────
  //   La section "À l'intérieur de…" sur la page principale était
  //   redondante avec le drawer ouvert depuis BarList. Les chiffres clés
  //   éditoriaux (asides) sont maintenant rendus DANS le drawer via
  //   `getEditorialAsidesForLevel2()` (lib/editorial-asides.ts), passés à
  //   `BudgetDrilldownFiche` par les pages drawer/standalone.
  //
  //   Les `xxxMonthly` et `deepdiveXxx` correspondants ont donc été
  //   retirés ici — ils ne servaient qu'à alimenter `<DailyBreadDeepDive>`.
  //   Le sub-component `DailyBreadDeepDive` plus bas est conservé en cas
  //   de réintroduction ponctuelle, mais n'est plus rendu.

  // ─── Equivalents (concrete units for synthèse panel) ───────────────
  const _equivalents = useMemo(() => {
    if (!db) return [];
    const items = db.equivalents.items;
    const consult = items.consultation_medecin_generaliste?.value ?? 30;
    const pension = items.pension_retraite_mensuelle_moyenne?.value ?? 1626;
    const eleveJour = items.cout_eleve_jour_scolaire_public?.value ?? 52;
    const ticket = items.trajet_metro_paris?.value ?? 2.5;

    // Approche A : monthly_eur dans assoBranches/stateBuckets/localLevels est
    // désormais le NATIONAL monthly total (798 Md€ × share / 12). Pour
    // les équivalents, on convertit en per-capita en divisant par la
    // population française. Le label "Ta cotisation X €/mois" devient
    // "X €/mois/habitant" pour cohérence avec le reste de Daily Bread.
    const toPerCapita = (n: number) =>
      populationFr > 0 ? n / populationFr : 0;

    // CNAM = "part_cnam_maladie"
    const cnam = assoBranches.find((b) => b.key === "part_cnam_maladie");
    const cnav = assoBranches.find((b) => b.key === "part_cnav_retraites");
    // key alignée sur STATE_BUCKET_DEFS (`education_recherche`).
    const educ = stateBuckets.find((b) => b.key === "education_recherche");
    const dette = stateBuckets.find((b) => b.key === "dette");
    const blocCommunal = localLevels.find((l) => l.key === "bloc_communal");
    // Per-capita monthly pour chaque équivalent
    const cnamPC = cnam ? toPerCapita(cnam.monthly_eur) : 0;
    const cnavPC = cnav ? toPerCapita(cnav.monthly_eur) : 0;
    const educPC = educ ? toPerCapita(educ.monthly_eur) : 0;
    const dettePC = dette ? toPerCapita(dette.monthly_eur) : 0;
    const blocPC = blocCommunal ? toPerCapita(blocCommunal.monthly_eur) : 0;

    return [
      cnam && cnamPC > 0 && {
        key: "sante" as const,
        institution: "secu" as const,
        tagFr: "SANTÉ · SÉCURITÉ SOCIALE",
        tagEn: "HEALTH · SOCIAL SECURITY",
        number: (cnamPC / consult).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 1 },
        ),
        claimAFr: "consultations généralistes",
        claimAEn: "GP visits",
        claimBFr: "(valeur équivalente / habitant / mois).",
        claimBEn: "(equivalent value / inhabitant / month).",
        editorialFr: "Si tout l'argent de la branche maladie allait à des consultations chez le GP, ça en paierait 15 par habitant et par mois. En réalité, la branche maladie finance aussi hôpital, médicaments, médico-social — c'est un ordre de grandeur.",
        editorialEn: "If all health-branch spending went to GP visits, it would pay for 15 per inhabitant per month. In reality, the health branch also funds hospitals, medication, long-term care — this is an order of magnitude.",
        sourceDetailFr: "Convention médicale 2024 · 30 € la consultation.",
        sourceDetailEn: "Medical agreement 2024 · €30 per visit.",
        viaDetailFr: `Branche maladie : ${fmtEur(cnamPC, locale, 0)} €/mois/habitant.`,
        viaDetailEn: `Health branch: €${fmtEur(cnamPC, locale, 0)}/month/inhabitant.`,
        headline: `≈ ${(cnamPC / consult).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 1 },
        )}`,
        unitFr: "consultations / mois / hab",
        unitEn: "GP visits / month / inhab",
        amount: cnamPC,
        sub: "CNAM",
        viaFr: "via CNAM",
        viaEn: "via CNAM",
      },
      cnav && cnavPC > 0 && {
        key: "retraite" as const,
        institution: "secu" as const,
        tagFr: "RETRAITES · CNAV",
        tagEn: "PENSIONS · CNAV",
        number: `${((cnavPC / pension) * 100).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 0 },
        )} %`,
        claimAFr: "d'une pension moyenne",
        claimAEn: "of an average pension",
        claimBFr: "(valeur équivalente / habitant / mois).",
        claimBEn: "(equivalent value / inhabitant / month).",
        editorialFr: "La dépense retraite par habitant équivaut à 23 % d'une pension moyenne (1 626 €/mois, DREES). En réalité chaque pensionné reçoit sa pension complète — l'équivalent ramène la dépense totale à un objet du quotidien.",
        editorialEn: "Pension spending per inhabitant equals 23 % of an average pension (€1,626/month, DREES). In reality each pensioner receives their full pension — the equivalent scales total spending to an everyday item.",
        sourceDetailFr: "DREES 2024 · pension moyenne 1 626 €/mois.",
        sourceDetailEn: "DREES 2024 · average pension €1,626/month.",
        viaDetailFr: `Branche retraite : ${fmtEur(cnavPC, locale, 0)} €/mois/habitant.`,
        viaDetailEn: `Pension branch: €${fmtEur(cnavPC, locale, 0)}/month/inhabitant.`,
        headline: `≈ ${((cnavPC / pension) * 100).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 0 },
        )} %`,
        unitFr: "d'une pension moyenne / hab",
        unitEn: "of an average pension / inhab",
        amount: cnavPC,
        sub: "CNAV",
        viaFr: "via CNAV",
        viaEn: "via CNAV",
      },
      educ && educPC > 0 && {
        key: "ecole" as const,
        institution: "etat" as const,
        tagFr: "ÉCOLE · ÉTAT",
        tagEn: "SCHOOL · STATE",
        number: (educPC / eleveJour).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 2 },
        ),
        claimAFr: "jours d'école",
        claimAEn: "school-days",
        claimBFr: "(valeur équivalente / habitant / mois).",
        claimBEn: "(equivalent value / inhabitant / month).",
        editorialFr: "La dépense Éducation par habitant équivaut à 3,6 jours de scolarité (52 €/jour/élève, DEPP). En réalité ~17 % des Français sont élèves — l'équivalent ramène la dépense totale à un objet du quotidien.",
        editorialEn: "Education spending per inhabitant equals 3.6 school-days (€52/day/student, DEPP). In reality ~17 % of French residents are students — the equivalent scales total spending to an everyday item.",
        sourceDetailFr: "DEPP RERS 2023 · ~9 350 €/an par élève.",
        sourceDetailEn: "DEPP RERS 2023 · ~€9,350/year per student.",
        viaDetailFr: `Éducation État : ${fmtEur(educPC, locale, 0)} €/mois/habitant.`,
        viaDetailEn: `State education: €${fmtEur(educPC, locale, 0)}/month/inhab.`,
        headline: `≈ ${(educPC / eleveJour).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 2 },
        )}`,
        unitFr: "jours d'école / mois / hab",
        unitEn: "school-days / month / inhab",
        amount: educPC,
        sub: locale === "en" ? "State" : "État",
        viaFr: "via État",
        viaEn: "via State",
      },
      blocCommunal && blocPC > 0 && {
        key: "transport" as const,
        institution: "local" as const,
        tagFr: "TRANSPORT · COLLECTIVITÉS",
        tagEn: "TRANSPORT · LOCAL",
        number: (blocPC / ticket).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 0 },
        ),
        claimAFr: "trajets urbains",
        claimAEn: "urban transit trips",
        claimBFr: "(valeur équivalente / habitant / mois).",
        claimBEn: "(equivalent value / inhabitant / month).",
        editorialFr: "La dépense bloc communal par habitant équivaut à 90 trajets bus/métro/tram (2,50 €/trajet, UTP). En réalité elle finance aussi voirie, écoles, propreté, culture — c'est un ordre de grandeur.",
        editorialEn: "Municipal-block spending per inhabitant equals 90 transit trips (€2.50/trip, UTP). In reality it also funds roads, schools, waste, culture — this is an order of magnitude.",
        sourceDetailFr: "UTP 2024 · 2,50 € le trajet urbain.",
        sourceDetailEn: "UTP 2024 · €2.50 per urban trip.",
        viaDetailFr: `Bloc communal : ${fmtEur(blocPC, locale, 0)} €/mois/habitant.`,
        viaDetailEn: `Municipal block: €${fmtEur(blocPC, locale, 0)}/month/inhab.`,
        headline: `≈ ${(blocPC / ticket).toLocaleString(
          numLocale(locale),
          { maximumFractionDigits: 0 },
        )}`,
        unitFr: "tickets transport / mois / hab",
        unitEn: "transit tickets / month / inhab",
        amount: blocPC,
        sub: locale === "en" ? "Municipal" : "Bloc communal",
        viaFr: "via collectivités",
        viaEn: "via local authorities",
      },
      dette && dettePC > 0 && {
        key: "dette" as const,
        institution: "etat" as const,
        tagFr: "DETTE · ÉTAT",
        tagEn: "DEBT · STATE",
        number: `${fmtEur(dettePC, locale, 0)} €`,
        claimAFr: "d'intérêts par habitant",
        claimAEn: "of interest per inhabitant",
        claimBFr: "par mois sur la dette publique.",
        claimBEn: "per month on public debt.",
        editorialFr: "Charge réelle d'intérêts payés sur la dette publique, ramenée par habitant. En hausse depuis 2022 avec la remontée des taux.",
        editorialEn: "Real interest paid on public debt, per inhabitant. Rising since 2022 with higher interest rates.",
        sourceDetailFr: "AFT 2025 · charge de la dette votée au PLF.",
        sourceDetailEn: "AFT 2025 · debt service voted in PLF.",
        viaDetailFr: `Service de la dette : ${fmtEur(dettePC, locale, 0)} €/mois/habitant.`,
        viaDetailEn: `Debt service: €${fmtEur(dettePC, locale, 0)}/month/inhab.`,
        headline: `≈ ${fmtEur(dettePC, locale, 0)} €`,
        unitFr: "d'intérêts dette / mois / hab",
        unitEn: "debt interest / month / inhab",
        amount: dettePC,
        sub: locale === "en" ? "Interest" : "Intérêts",
        viaFr: "via service de la dette",
        viaEn: "via debt service",
      },
    ].filter(Boolean) as Array<{
      key: "sante" | "retraite" | "ecole" | "transport" | "dette";
      institution: "secu" | "etat" | "local";
      tagFr: string;
      tagEn: string;
      number: string;
      claimAFr: string;
      claimAEn: string;
      claimBFr?: string;
      claimBEn?: string;
      editorialFr: string;
      editorialEn: string;
      sourceDetailFr: string;
      sourceDetailEn: string;
      viaDetailFr?: string;
      viaDetailEn?: string;
      headline: string;
      unitFr: string;
      unitEn: string;
      amount: number;
      sub: string;
      viaFr: string;
      viaEn: string;
    }>;
  }, [db, assoBranches, stateBuckets, localLevels, locale, populationFr]);

  // Note : l'ancien `eyebrow` (Médian · Célibataire (1 part) · Paris) a été
  // retiré du hero — redondant avec la phrase éditable principale qui contient
  // déjà ces 3 paramètres. Le bandeau "01 · PROFIL" (db-panel-num) suffit pour
  // le numérotage de section.

  const presetActiveKey = useMemo(() => {
    // Le preset n'est "actif" que si l'utilisateur est uniquement en mode salaire.
    if (activeSources.length !== 1 || activeSources[0] !== "salaire") return undefined;
    const found = PRESETS.find((p) => p.net === salaireMonthly);
    return found?.key;
  }, [salaireMonthly, activeSources]);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className={`theme-db-scrolly${clientArmed ? " is-armed" : ""}`}>
      <div className="theme-fusion">
        <Navbar />
      </div>
      <main id="main-content" tabIndex={-1}>
        {/* ── PANNEAU 0 — ONBOARDING (post user-testing fix) ── */}
        {/* Bloc d'intro pédagogique pour clarifier ce qu'on propose dès
            l'arrivée sur la page : profil personnalisable → contribution
            mensuelle → drilldown des dépenses. Sans ça, l'utilisateur
            arrivait sur §01 sans comprendre que les valeurs étaient
            éditables ni la promesse de la page. */}
        <section className="db-panel db-p-onboarding">
          <div className="db-panel-wrap db-p-onboarding-wrap">
            <p className="db-p-onboarding-kicker">
              {t("db.hero.onboarding.kicker")}
            </p>
            <h1 className="db-p-onboarding-title">
              {t("db.hero.onboarding.title")}
            </h1>
            <p className="db-p-onboarding-hint">
              {renderTagged(t("db.hero.onboarding.hint"))}
            </p>
          </div>
        </section>

        {/* ── PANNEAU 1 — HERO ÉDITABLE (fusion §00 + §01) ── */}
        {/* Le hero fusionné NYT-style : les paramètres du calcul (salaire,
            parts, commune) sont des spans cliquables intégrés DANS la phrase
            narrative. Plus de formulaire séparé §00. Big number + composition
            en aside-droite (desktop) ou stacked-below (mobile). Réglages
            avancés (autres revenus + propriétaire/TF) cachés dans un
            <details> discret. Bouton OpenFisca top-right, plus un bloc. */}
        <section
          id="db-hero-fold"
          className="db-panel db-p-hero db-p-hero-edit"
        >
          <div className="db-panel-wrap db-p-hero-wrap">
            {/* numéro de section */}
            <p className="db-panel-num db-p-hero-num-top">
              {t("db.hero.num")}
            </p>

            {/* CTA OpenFisca (top-right desktop, sous le num en mobile) */}
            <div className="db-p-hero-cta-area">
              {salaireMonthly > 0 && (
                <button
                  type="button"
                  className="db-p-hero-cta-affine"
                  data-state={
                    isLoadingOpenFisca
                      ? "loading"
                      : openFiscaResult
                        ? "active"
                        : openFiscaError
                          ? "error"
                          : "idle"
                  }
                  onClick={requestOpenFiscaCalc}
                  disabled={isLoadingOpenFisca || !!openFiscaResult}
                  title={t("db.openfisca.note")}
                >
                  {isLoadingOpenFisca
                    ? t("db.openfisca.button.loading")
                    : openFiscaResult
                      ? t("db.openfisca.button.active")
                      : t("db.openfisca.button.idle")}{" "}
                  →
                </button>
              )}
            </div>

            {/* Phrase éditable principale — les inputs sont DANS le texte */}
            <h1 className="db-p-hero-text">
              {activeSources.length === 1 && activeSources[0] === "salaire" ? (
                <>
                  {t("db.hero.editable.prefix_salaire")}{" "}
                  <EditableNumber
                    value={salaireMonthly}
                    onChange={setSalaireMonthly}
                    display={`${fmtEur(salaireMonthly, locale, 0)} ${
                      locale === "en" ? "€/month" : "€/mois"
                    }`}
                    suffix={locale === "en" ? "€/month" : "€/mois"}
                    min={0}
                    max={50_000}
                    step={50}
                    presets={PRESETS.map((p) => ({
                      label: t(`db.calc.preset.${p.key}`),
                      value: p.net,
                    }))}
                    ariaLabel={t("db.hero.editable.aria.salaire")}
                    pickerLabel={t("db.form.salaire_label")}
                    locale={numLocale(locale)}
                  />
                  ,{" "}
                  <EditableSelect<number>
                    value={parts}
                    onChange={setParts}
                    options={PARTS_OPTIONS.map((p) => ({
                      value: p.value,
                      label: t(`db.form.parts.${p.key}`),
                    }))}
                    display={
                      PARTS_OPTIONS.find((p) => p.value === parts)
                        ? t(
                            `db.form.parts.${
                              PARTS_OPTIONS.find((p) => p.value === parts)!.key
                            }`,
                          )
                        : `${parts} ${locale === "en" ? "parts" : "parts"}`
                    }
                    ariaLabel={t("db.hero.editable.aria.parts")}
                    pickerLabel={t("db.form.parts_label")}
                  />{" "}
                  {locale === "en" ? "in" : "à"}{" "}
                  <EditableCommune
                    display={commune ? commune.nom : "Paris"}
                    onPick={(h) => pickCommune(h as CommuneHit)}
                    ariaLabel={t("db.hero.editable.aria.commune")}
                    pickerLabel={t("db.form.commune_label")}
                    placeholder={t("db.form.commune_placeholder")}
                    helpText={t("db.form.commune_help")}
                  />
                  ,
                </>
              ) : activeSources.length === 0 ? (
                <>
                  {t("db.hero.q_a.zero")}{" "}
                  <EditableNumber
                    value={salaireMonthly}
                    onChange={setSalaireMonthly}
                    display={t("db.hero.editable.set_salaire")}
                    suffix={locale === "en" ? "€/month" : "€/mois"}
                    presets={PRESETS.map((p) => ({
                      label: t(`db.calc.preset.${p.key}`),
                      value: p.net,
                    }))}
                    ariaLabel={t("db.hero.editable.aria.salaire")}
                    pickerLabel={t("db.form.salaire_label")}
                    locale={numLocale(locale)}
                  />
                </>
              ) : (
                <>
                  {/* multi-sources OU source non-salaire : fallback narratif
                      ancien (q_a / q_b) — l'édition se fait dans le drawer
                      "ajustements avancés" plus bas, pour rester lisible. */}
                  {(() => {
                    if (activeSources.length > 1) {
                      const cumuleMonthly =
                        salaireMonthly +
                        pensionMonthly +
                        capitalAnnuel / 12 +
                        indepCaAnnuel / 12;
                      return t("db.hero.q_a.multi").replace(
                        "{amount}",
                        fmtEur(cumuleMonthly, locale, 0),
                      );
                    }
                    const only = activeSources[0];
                    if (only === "pension") {
                      return t("db.hero.q_a.retraite").replace(
                        "{amount}",
                        fmtEur(pensionMonthly, locale, 0),
                      );
                    }
                    if (only === "capital") {
                      return t("db.hero.q_a.capital").replace(
                        "{amount}",
                        fmtEur(capitalAnnuel, locale, 0),
                      );
                    }
                    return t("db.hero.q_a.independant").replace(
                      "{amount}",
                      fmtEur(indepCaAnnuel, locale, 0),
                    );
                  })()}
                </>
              )}
              {/* Phrase éditable s'arrête sur les inputs — le climax (chiffre
                  + tagline "financent chaque mois...") vit en aside-droite
                  pour éviter la duplication avec le big number. */}
            </h1>

            {/* Aside : big number + composition compacte */}
            <div className="db-p-hero-aside">
              <p className="db-p-hero-bignum tnum">
                {fmtEur(totalMonthlyAnim, locale, 0)}
                <span className="db-p-hero-bignum-eur">€</span>
                {openFiscaResult && (
                  <span
                    className="db-openfisca-badge"
                    title={t("db.openfisca.badge.tooltip")}
                  >
                    {t("db.openfisca.badge")}
                  </span>
                )}
              </p>
              {/* Tagline italic ocre comme caption du big number — déplacée
                  ici depuis la phrase <h1> pour éviter la duplication. */}
              {(() => {
                const tpl = t("db.hero.q_b");
                const parts = tpl.split("{result}");
                const after = (parts.length > 1 ? parts[1] : tpl).trim();
                return (
                  <em className="db-p-hero-result-caption">{after}</em>
                );
              })()}
              {/* Meta inline — juste l'annuel ("13 453 €/an"). Le "/mois" a
                  été retiré car redondant avec la tagline italic au-dessus
                  ("financent chaque mois..."). */}
              <p className="db-p-hero-meta-inline tnum">
                <span className="db-p-hero-meta-inline-year">
                  {t("db.hero.meta_inline.year").replace(
                    "{annual}",
                    fmtEur(totalAnnuelAnim, locale, 0),
                  )}
                </span>
              </p>

              {/* Fix 5 : mini stack bar 4-segments — visualise la décomposition
                  des prélèvements en proportions visuelles plutôt qu'en liste
                  plate. Couleurs alignées sur la palette dispatch §02 (bleu sécu,
                  bleu-gris CSG, ink état, charcoal-tobacco TVA — ocre désaturé
                  pour rester distinct sans casser la hiérarchie DA). Multi-sources
                  reste en liste plate (5 catégories trop hétérogènes pour une stack
                  bar lisible). */}
              {(() => {
                const segments: Array<{
                  key: string;
                  label: string;
                  value: number;
                  cssVar: string;
                }> =
                  activeSources.length === 1 && activeSources[0] === "salaire"
                    ? [
                        { key: "cotis", label: t("db.hero.compo.cotisations"), value: compoSalCotis, cssVar: "var(--p-secu)" },
                        { key: "csg",   label: t("db.hero.compo.csg"),         value: compoSalCsg,   cssVar: "#5b6aa8" },
                        { key: "ir",    label: t("db.hero.compo.ir"),          value: compoSalIr,    cssVar: "var(--p-etat)" },
                        { key: "tva",   label: t("db.hero.compo.tva"),         value: compoSalTva,   cssVar: "#7a6a4f" },
                      ]
                    : activeSources.length === 1 && activeSources[0] === "pension"
                      ? [
                          { key: "csg", label: t("db.hero.compo.csg_casa"), value: compoRetCsg, cssVar: "var(--p-secu)" },
                          { key: "ir",  label: t("db.hero.compo.ir"),       value: compoRetIr,  cssVar: "var(--p-etat)" },
                          { key: "tva", label: t("db.hero.compo.tva"),      value: compoRetTva, cssVar: "#7a6a4f" },
                        ]
                      : activeSources.length === 1 && activeSources[0] === "capital"
                        ? [
                            { key: "pfu_ir", label: t("db.hero.compo.pfu_ir"), value: compoCapIr, cssVar: "var(--p-etat)" },
                            { key: "pfu_ps", label: t("db.hero.compo.pfu_ps"), value: compoCapPs, cssVar: "var(--p-secu)" },
                            { key: "tva",    label: t("db.hero.compo.tva"),    value: compoCapTva, cssVar: "#7a6a4f" },
                          ]
                        : activeSources.length === 1 && activeSources[0] === "indep"
                          ? [
                              { key: "cotis", label: t("db.hero.compo.cotis_urssaf"), value: compoIndCotis, cssVar: "var(--p-secu)" },
                              { key: "ir",    label: t("db.hero.compo.ir"),           value: compoIndIr,    cssVar: "var(--p-etat)" },
                              { key: "tva",   label: t("db.hero.compo.tva"),          value: compoIndTva,   cssVar: "#7a6a4f" },
                            ]
                          : [];
                const total = segments.reduce((s, x) => s + x.value, 0);
                if (segments.length > 0 && total > 0) {
                  return (
                    <div className="db-p-hero-compo">
                      <p className="db-p-hero-compo-label">
                        {t("db.hero.meta_label_compo")}
                      </p>
                      <div
                        className="db-p-hero-compo-bar"
                        role="img"
                        aria-label={segments
                          .map((s) => `${s.label} ${fmtEur(s.value, locale, 0)} €`)
                          .join(", ")}
                      >
                        {segments.map((s) => (
                          <span
                            key={s.key}
                            className="db-p-hero-compo-seg"
                            style={{
                              flexGrow: s.value,
                              background: s.cssVar,
                            }}
                          />
                        ))}
                      </div>
                      <ul className="db-p-hero-compo-legend">
                        {segments.map((s) => (
                          <li key={s.key}>
                            <span
                              aria-hidden
                              className="db-p-hero-compo-dot"
                              style={{ background: s.cssVar }}
                            />
                            <span className="db-p-hero-compo-legend-lbl">
                              {s.label}
                            </span>{" "}
                            <span className="db-p-hero-compo-legend-val tnum">
                              {fmtEur(s.value, locale, 0)} €
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                if (activeSources.length > 1) {
                  return (
                    <div className="db-p-hero-compo">
                      <p className="db-p-hero-compo-label">
                        {t("db.hero.meta_label_compo")}
                      </p>
                      <p className="db-p-hero-compo-multi tnum">
                        {breakdownSalaire.total > 0 && (
                          <>
                            {t("db.hero.compo.src.salaire")}{" "}
                            <span className="lite">
                              {fmtEur(breakdownSalaire.total / 12, locale, 0)} €
                            </span>
                          </>
                        )}
                        {breakdownRetraite.total > 0 && (
                          <>
                            {breakdownSalaire.total > 0 && " · "}
                            {t("db.hero.compo.src.pension")}{" "}
                            <span className="lite">
                              {fmtEur(breakdownRetraite.total / 12, locale, 0)} €
                            </span>
                          </>
                        )}
                        {breakdownCapital.total > 0 && (
                          <>
                            {(breakdownSalaire.total > 0 ||
                              breakdownRetraite.total > 0) &&
                              " · "}
                            {t("db.hero.compo.src.capital")}{" "}
                            <span className="lite">
                              {fmtEur(breakdownCapital.total / 12, locale, 0)} €
                            </span>
                          </>
                        )}
                        {breakdownIndep.total > 0 && (
                          <>
                            {(breakdownSalaire.total > 0 ||
                              breakdownRetraite.total > 0 ||
                              breakdownCapital.total > 0) &&
                              " · "}
                            {t("db.hero.compo.src.indep")}{" "}
                            <span className="lite">
                              {fmtEur(breakdownIndep.total / 12, locale, 0)} €
                            </span>
                          </>
                        )}
                        {tfEstimated > 0 && (
                          <>
                            {" · "}
                            {t("db.hero.compo.src.tf")}{" "}
                            <span className="lite">
                              {fmtEur(tfEstimated / 12, locale, 0)} €
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Presets rapides salaire — chips inline juste sous l'aside.
                  Visibles uniquement quand le mode est "salaire pur" pour ne
                  pas créer d'ambiguïté ("appliquer SMIC" remplace les autres
                  sources actives). */}
              {(activeSources.length === 0 ||
                (activeSources.length === 1 &&
                  activeSources[0] === "salaire")) && (
                <div className="db-p-hero-presets">
                  <span className="db-p-hero-presets-label">
                    {t("db.calc.presets_label")}
                  </span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`db-p-hero-preset${
                        presetActiveKey === p.key ? " is-active" : ""
                      }`}
                      onClick={() => setSalaireMonthly(p.net)}
                      title={t(`db.calc.preset.${p.key}`)}
                    >
                      {/* Fix 6 : label court pour tenir sur une ligne en desktop ;
                          la version longue (avec le montant) reste dans le picker
                          EditableNumber et dans l'attr title pour le hover. */}
                      {t(`db.calc.preset_short.${p.key}`)}
                    </button>
                  ))}
                </div>
              )}

              {/* CTA discret sous les presets (côté droit) qui équilibre
                  visuellement la colonne et pousse le lecteur vers §02 sans
                  être lourd. Smooth-scroll JS pour éviter le saut brutal. */}
              <a
                className="db-p-hero-cta-jump"
                href="#db-disp"
                onClick={(e) => {
                  if (typeof document === "undefined") return;
                  const target = document.getElementById("db-disp");
                  if (!target) return;
                  e.preventDefault();
                  target.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                {t("db.hero.aside_cta")}{" "}
                <span aria-hidden>↓</span>
              </a>
            </div>

            {/* Drawer "ajustements avancés" — pension, capital, indépendant,
                propriétaire/TF. Discret par défaut. Ouvert si une source non-
                salaire est non nulle (URL deep-link), ou si l'utilisateur a
                coché propriétaire. */}
            <details
              className="db-p-hero-advanced"
              open
            >
              <summary className="db-p-hero-advanced-summary">
                <span>{t("db.hero.advanced.summary")}</span>
                <span aria-hidden className="db-p-hero-advanced-chevron">
                  ↓
                </span>
              </summary>
              <div className="db-p-hero-advanced-body">
                <p className="db-p-hero-advanced-help">
                  {t("db.form.other_incomes_help")}
                </p>

                <div className="db-p-hero-advanced-grid">
                  {/* Pension */}
                  <div className="db-p-calc-field">
                    <label htmlFor="db-pension">
                      {t("db.form.retraite_label")}
                      <span className="db-p-calc-field-unit">
                        {" "}
                        {t("db.form.unit.per_month")}
                      </span>
                    </label>
                    <input
                      id="db-pension"
                      type="number"
                      className="db-p-calc-field-input tnum"
                      value={pensionMonthly}
                      min={0}
                      max={20_000}
                      step={50}
                      onChange={(e) =>
                        setPensionMonthly(
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                    <span className="db-p-calc-field-help">
                      {t("db.form.retraite_help")}
                    </span>
                  </div>

                  {/* Capital */}
                  <div className="db-p-calc-field">
                    <label htmlFor="db-capital">
                      {t("db.form.capital_label")}
                      <span className="db-p-calc-field-unit">
                        {" "}
                        {t("db.form.unit.per_year")}
                      </span>
                    </label>
                    <input
                      id="db-capital"
                      type="number"
                      className="db-p-calc-field-input tnum"
                      value={capitalAnnuel}
                      min={0}
                      max={1_000_000}
                      step={500}
                      onChange={(e) =>
                        setCapitalAnnuel(
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                    <span className="db-p-calc-field-help">
                      {t("db.form.capital_help")}
                    </span>
                  </div>

                  {/* Indépendant CA */}
                  <div className="db-p-calc-field">
                    <label htmlFor="db-indep-ca">
                      {t("db.form.independant_label")}
                      <span className="db-p-calc-field-unit">
                        {" "}
                        {t("db.form.unit.per_year")}
                      </span>
                    </label>
                    <input
                      id="db-indep-ca"
                      type="number"
                      className="db-p-calc-field-input tnum"
                      value={indepCaAnnuel}
                      min={0}
                      max={1_000_000}
                      step={500}
                      onChange={(e) =>
                        setIndepCaAnnuel(
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                    <span className="db-p-calc-field-help">
                      {t("db.form.independant_help")}
                    </span>
                  </div>

                  {/* Type d'activité indépendante (si CA > 0) */}
                  {indepCaAnnuel > 0 && (
                    <div className="db-p-calc-field">
                      <label htmlFor="db-indep-type">
                        {t("db.form.indep_type_label")}
                      </label>
                      <select
                        id="db-indep-type"
                        className="db-p-calc-field-select"
                        value={indepType}
                        onChange={(e) =>
                          setIndepType(e.target.value as IndepActivityType)
                        }
                      >
                        {INDEP_TYPES.map((it) => (
                          <option key={it} value={it}>
                            {t(`db.form.indep_type.${it}`)}
                          </option>
                        ))}
                      </select>
                      <span className="db-p-calc-field-help">
                        {t("db.form.indep_type_help")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Propriétaire + TF */}
                <div className="db-p-calc-tf db-p-hero-advanced-tf">
                  <label className="db-p-calc-tf-toggle">
                    <input
                      type="checkbox"
                      checked={isOwner}
                      onChange={(e) => {
                        setIsOwner(e.target.checked);
                        if (!e.target.checked) setTfCustom(0);
                      }}
                    />
                    <span className="db-p-calc-tf-toggle-label">
                      {t("db.form.owner_label")}
                    </span>
                  </label>
                  {isOwner && (
                    <div className="db-p-calc-tf-input-wrap">
                      <label htmlFor="db-tf">{t("db.form.tf_label")}</label>
                      <div className="db-p-calc-tf-input-row">
                        <input
                          id="db-tf"
                          type="number"
                          className="db-p-calc-tf-input tnum"
                          value={
                            tfCustom > 0
                              ? tfCustom
                              : commune
                                ? estimateTaxeFonciereFromCommune(
                                    commune.impots_locaux_eur_hab,
                                  )
                                : 0
                          }
                          min={0}
                          max={20000}
                          step={50}
                          onChange={(e) =>
                            setTfCustom(Number(e.target.value) || 0)
                          }
                        />
                        <span className="db-p-calc-tf-unit">€/an</span>
                      </div>
                      <span className="db-p-calc-tf-help">
                        {tfCustom > 0
                          ? t("db.form.tf_help_custom")
                          : t("db.form.tf_help_auto").replace(
                              "{commune}",
                              commune?.nom || "—",
                            )}
                      </span>
                    </div>
                  )}
                  {!isOwner && (
                    <span className="db-p-calc-tf-note">
                      {t("db.form.owner_note")}
                    </span>
                  )}
                </div>
              </div>
            </details>

            {/* OpenFisca caveat — succès uniquement. Échec = silence (le calcul
                JS local reste actif, pas besoin d'alerter avec une marge
                d'erreur hardcodée). */}
            {openFiscaResult && (
              <p className="db-p-hero-openfisca-note">
                {t("db.openfisca.note")}
                {openFiscaEcartPct !== null && (
                  <>
                    {" "}
                    <span className="db-openfisca-ecart">
                      {t("db.openfisca.ecart").replace(
                        "{pct}",
                        (openFiscaEcartPct >= 0 ? "+" : "") +
                          openFiscaEcartPct.toFixed(1),
                      )}
                    </span>
                  </>
                )}
              </p>
            )}

          </div>
        </section>

        {/* ── PANNEAU 2 — DISPATCH ── */}
        {totalPerCapitaMonthly > 0 && (
          <section id="db-disp" className="db-panel db-p-disp">
            <div className="db-panel-wrap">
              <p className="db-panel-num">
                {t("db.disp.num")}
              </p>

              <h2 className="db-p-disp-q">
                {t("db.disp.q_a")} <em>{t("db.disp.q_b")}</em>
              </h2>
              <p className="db-p-disp-deck">
                {renderTagged(
                  t("db.disp.deck")
                    .replace("{monthly}", fmtEur(totalMonthly, locale, 0))
                    .replace(
                      "{perCapita}",
                      fmtEur(totalPerCapitaMonthly, locale, 0),
                    )
                    .replace("{year}", String(db?.apu_subsectors.year ?? "")),
                  {
                    b1: { color: "var(--p-secu)", fontWeight: 600 },
                    b2: { color: "var(--p-etat)", fontWeight: 600 },
                    b3: { color: "var(--p-local)", fontWeight: 600 },
                  },
                )}
              </p>

              {/* Per-capita national : shares S1314/S1311/S1313 dans S13. */}
              {(() => {
                const sumS13 = s1311Total + s1313Total + s1314Total;
                const secuPctNat = sumS13 > 0 ? s1314Total / sumS13 : 0;
                const etatPctNat = sumS13 > 0 ? s1311Total / sumS13 : 0;
                const localPctNat = sumS13 > 0 ? s1313Total / sumS13 : 0;
                return (
                  <div
                    ref={triStackRef}
                    className={`db-stack-tri${triStackRevealed ? " is-revealed" : ""}`}
                    style={{
                      gridTemplateColumns: `${secuPctNat * 100}fr ${etatPctNat * 100}fr ${localPctNat * 100}fr`,
                    }}
                  >
                    <div style={{ background: "var(--p-secu)" }}>
                      <div className="db-stack-tri-pct tnum">
                        <RevealCountNum
                          value={secuPctNat * 100}
                          revealed={triStackRevealed}
                          duration={600}
                          format={(v) => `${Math.round(v)} %`}
                        />
                      </div>
                      <div className="db-stack-tri-name">
                        {locale === "en" ? "Social security" : "Sécurité sociale"}
                      </div>
                      <div className="db-stack-tri-amt tnum">
                        <RevealCountNum
                          value={secuMonthly}
                          revealed={triStackRevealed}
                          duration={650}
                          format={(v) => `${fmtEur(v, locale, 0)} €/${locale === "en" ? "mo/hab" : "mois/hab"}`}
                        />
                      </div>
                    </div>
                    <div style={{ background: "var(--p-etat)" }}>
                      <div className="db-stack-tri-pct tnum">
                        <RevealCountNum
                          value={etatPctNat * 100}
                          revealed={triStackRevealed}
                          duration={600}
                          format={(v) => `${Math.round(v)} %`}
                        />
                      </div>
                      <div className="db-stack-tri-name">
                        {locale === "en" ? "Central government" : "État central"}
                      </div>
                      <div className="db-stack-tri-amt tnum">
                        <RevealCountNum
                          value={etatMonthly}
                          revealed={triStackRevealed}
                          duration={650}
                          format={(v) => `${fmtEur(v, locale, 0)} €/${locale === "en" ? "mo/hab" : "mois/hab"}`}
                        />
                      </div>
                    </div>
                    <div style={{ background: "var(--p-local)" }}>
                      <div className="db-stack-tri-pct tnum">
                        <RevealCountNum
                          value={localPctNat * 100}
                          revealed={triStackRevealed}
                          duration={600}
                          format={(v) => `${Math.round(v)} %`}
                        />
                      </div>
                      <div className="db-stack-tri-name">
                        {locale === "en" ? "Local" : "Local"}
                      </div>
                      <div className="db-stack-tri-amt tnum">
                        <RevealCountNum
                          value={localMonthly}
                          revealed={triStackRevealed}
                          duration={650}
                          format={(v) => `${fmtEur(v, locale, 0)} €/${locale === "en" ? "mo/hab" : "mois/hab"}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Galerie "À retenir" — 4 chiffres macro shareable (remplace
                  les anciens équivalents perso "valeur équivalente"). */}
              {db && (
                <div className="db-disp-key-figures">
                  <p className="db-disp-key-figures-title">
                    {t("db.disp.keyfigures.title")}
                  </p>
                  <div className="db-disp-key-figures-grid">
                    <div className="db-disp-key-figure">
                      <p className="db-disp-key-figure-num tnum">
                        {fmtBnEur(
                          s1311Total + s1313Total + s1314Total,
                          locale,
                        )}
                      </p>
                      <p className="db-disp-key-figure-label">
                        {t("db.disp.keyfigures.total")}
                      </p>
                    </div>
                    <div className="db-disp-key-figure">
                      <p className="db-disp-key-figure-num tnum">
                        ~175 Md€
                      </p>
                      <p className="db-disp-key-figure-label">
                        {t("db.disp.keyfigures.deficit")}
                      </p>
                    </div>
                    <div className="db-disp-key-figure">
                      <p className="db-disp-key-figure-num tnum">
                        ~215 Md€
                      </p>
                      <p className="db-disp-key-figure-label">
                        {t("db.disp.keyfigures.cotisations_employeurs")}
                      </p>
                    </div>
                    <div className="db-disp-key-figure">
                      <p className="db-disp-key-figure-num tnum">
                        ~23,3 Md€
                      </p>
                      <p className="db-disp-key-figure-label">
                        {t("db.disp.keyfigures.psr_ue")}
                      </p>
                    </div>
                  </div>
                  <p className="db-disp-key-figures-src">
                    {t("db.disp.keyfigures.sources")}
                  </p>
                </div>
              )}

              <p className="db-panel-foot-cue">{t("db.disp.foot_cue")}</p>
            </div>
          </section>
        )}

        {/* ── PANNEAU 3 — Zoom Sécu ── */}
        {assoBranches.length > 0 && (
          <section
            ref={panel3Ref}
            className={`db-panel db-p-zoom db-panel-fade${panel3Revealed ? " is-revealed" : ""}`}
          >
            <div className="db-panel-wrap">
              <p className="db-panel-num">
                {t("db.secu.num").replace(
                  "{monthly}",
                  fmtEur(secuMonthly, locale, 0),
                )}
              </p>

              <div className="db-p-zoom-grid">
                <div className="db-p-zoom-l-text">
                  {/* Hiérarchie : €/mois géant (angle perso) puis nom puis
                      % en ligne secondaire. Convention figée :
                      absolu d'abord (display large), pct en secondaire. */}
                  <p className="db-p-zoom-eur c-secu tnum">
                    {fmtEur(secuMonthly, locale, 0)}
                    <span className="eur-unit">
                      €/{locale === "en" ? "mo/inhab" : "mois/hab"}
                    </span>
                  </p>
                  <p className="db-p-zoom-name">{t("db.secu.name")}</p>
                  <p className="db-p-zoom-pct-line tnum">
                    <b>{Math.round(((s1311Total + s1313Total + s1314Total) > 0 ? s1314Total / (s1311Total + s1313Total + s1314Total) : 0) * 100)} %</b>{" "}
                    {locale === "en"
                      ? "of your contribution"
                      : "des dépenses publiques nationales"}
                  </p>
                  <div className="db-p-zoom-deck">
                    <p>{renderTagged(t("db.secu.deck1"))}</p>
                    <p>{t("db.secu.deck2")}</p>
                    <p className="db-p-zoom-source">
                      {t("db.secu.source")}
                    </p>
                  </div>
                </div>

                <BarList
                  items={assoBranches.map((b) => {
                    // Per-capita : b.monthly_eur est le national monthly
                    // total (S1314 × share / 12). Divisé par population pour
                    // afficher €/mois/habitant.
                    return {
                      key: b.key,
                      name: locale === "en" ? b.label_en : b.label_fr,
                      monthly: populationFr > 0 ? b.monthly_eur / populationFr : 0,
                      nationalAnnual: b.annual_eur,
                      share: b.share,
                      sub:
                        b.key === "part_cnav_retraites"
                          ? t("db.secu.retraite_sub")
                          : undefined,
                    };
                  })}
                  color="c-secu"
                  locale={locale}
                  clickableUrls={secuTopUrls}
                  profileQuery={profileQuery}
                />
              </div>

                                                                      <p className="db-panel-foot-cue">{t("db.secu.foot_cue")}</p>
            </div>
          </section>
        )}

        {/* ── PANNEAU 4 — Zoom État ── */}
        {stateBuckets.length > 0 && etatShare && (
          <section
            ref={panel4Ref}
            className={`db-panel db-p-zoom db-p-zoom-l db-panel-fade${panel4Revealed ? " is-revealed" : ""}`}
          >
            <div className="db-panel-wrap">
              <p className="db-panel-num">
                {t("db.etat.num").replace(
                  "{monthly}",
                  fmtEur(etatMonthly, locale, 0),
                )}
              </p>

              <div className="db-p-zoom-grid">
                <div className="db-p-zoom-l-text">
                  <p className="db-p-zoom-eur c-etat tnum">
                    {fmtEur(etatMonthly, locale, 0)}
                    <span className="eur-unit">
                      €/{locale === "en" ? "mo/inhab" : "mois/hab"}
                    </span>
                  </p>
                  <p className="db-p-zoom-name">{t("db.etat.name")}</p>
                  <p className="db-p-zoom-pct-line tnum">
                    <b>{Math.round(((s1311Total + s1313Total + s1314Total) > 0 ? s1311Total / (s1311Total + s1313Total + s1314Total) : 0) * 100)} %</b>{" "}
                    {locale === "en"
                      ? "of your contribution"
                      : "des dépenses publiques nationales"}
                  </p>
                  <div className="db-p-zoom-deck">
                    <p>{renderTagged(t("db.etat.deck1"))}</p>
                    <p>{t("db.etat.deck2")}</p>
                    <p className="db-p-zoom-source">
                      {t("db.etat.source")}
                    </p>
                  </div>
                </div>

                <BarList
                  items={(() => {
                    return stateBuckets.map((b) => {
                      const missionLabels = b.missions
                        .map((m) => m.label)
                        .slice(0, 3);
                      const overlayLabels = (b.overlay_items ?? [])
                        .map((it) =>
                          locale === "en" ? it.label_en : it.label_fr,
                        )
                        .slice(0, 4);
                      const subParts = [...missionLabels, ...overlayLabels];
                      // Per-capita : b.monthly_eur est le national monthly
                      // total (S1311 × share / 12). Divisé par population.
                      return {
                        key: b.key,
                        name: locale === "en" ? b.label_en : b.label_fr,
                        monthly: populationFr > 0 ? b.monthly_eur / populationFr : 0,
                        nationalAnnual: b.annual_eur,
                        share: b.share_of_state,
                        sub:
                          subParts.length > 1
                            ? subParts.join(" · ")
                            : undefined,
                      };
                    });
                  })()}
                  color="c-etat"
                  locale={locale}
                  clickableUrls={etatTopUrls}
                  profileQuery={profileQuery}
                />
              </div>

              <p className="db-panel-foot-cue">{t("db.etat.foot_cue")}</p>
            </div>
          </section>
        )}

        {/* ── PANNEAU 5 — Zoom Local ── */}
        {localLevels.length > 0 && localShare && (() => {
          // ─── Labels personnalisés selon la commune sélectionnée (Fix 2) ───
          // Bloc communal = nom de la commune (l'EPCI n'est pas dispo dans
          // notre dataset OFGL aujourd'hui — on garde le scaffold {city}+{epci}
          // pour quand on enrichira). Département / Région utilisent les
          // métadonnées de la commune.
          // Collectivité à statut particulier (Paris ville-département) :
          // dept est merged dans bloc → on n'affiche pas de ligne dept séparée
          // (sinon double-comptage), et le bloc label reflète la fusion.
          const isCollUnique = isCollectiviteUnique(commune?.slug);
          const blocLabel = isCollUnique && commune?.nom
            ? t("db.local.bloc_label_merged").replace("{city}", commune.nom)
            : (commune?.nom ?? t("db.local.bloc_default"));
          const deptLabel = commune?.dep_name
            ? t("db.local.dept_label").replace("{dep}", commune.dep_name)
            : t("db.local.dept_default");
          const regLabel = commune?.reg_name
            ? t("db.local.reg_label").replace("{reg}", commune.reg_name)
            : t("db.local.reg_default");
          const _dynamicTitle = isCollUnique
            ? t("db.local.title_dynamic_merged")
                .replace("{reg}", regLabel)
                .replace("{bloc}", blocLabel)
            : t("db.local.title_dynamic")
                .replace("{reg}", regLabel)
                .replace("{dept}", deptLabel)
                .replace("{bloc}", blocLabel);
          const _isParisStatut = commune?.insee === "75056";
          const _isLyonStatut = commune?.insee === "69123";
          // Map clé OFGL → label personnalisé pour les barres BarList.
          const _personalLabelByKey: Record<string, string> = {
            bloc_communal: blocLabel,
            departement: deptLabel,
            region: regLabel,
          };
          return (
          <section
            ref={panel5Ref}
            className={`db-panel db-p-zoom db-panel-fade${panel5Revealed ? " is-revealed" : ""}`}
          >
            <div className="db-panel-wrap">
              <p className="db-panel-num">
                {t("db.local.num").replace(
                  "{monthly}",
                  fmtEur(localMonthly, locale, 0),
                )}
              </p>

              <div className="db-p-zoom-grid">
                <div className="db-p-zoom-l-text">
                  <p className="db-p-zoom-eur c-local tnum">
                    {fmtEur(localMonthly, locale, 0)}
                    <span className="eur-unit">
                      €/{locale === "en" ? "mo/inhab" : "mois/hab"}
                    </span>
                  </p>
                  <p className="db-p-zoom-name">
                    {locale === "en"
                      ? "Local authorities (national average)"
                      : "Collectivités locales (moyenne nationale)"}
                  </p>
                  <p className="db-p-zoom-pct-line tnum">
                    <b>{Math.round(((s1311Total + s1313Total + s1314Total) > 0 ? s1313Total / (s1311Total + s1313Total + s1314Total) : 0) * 100)} %</b>{" "}
                    {locale === "en"
                      ? "of your contribution"
                      : "des dépenses publiques nationales"}
                  </p>
                  <div className="db-p-zoom-deck">
                    <p>
                      {renderTagged(
                        t("db.local.deck1")
                          .replace("{city}", commune?.nom ?? "")
                          .replace(
                            "{monthly}",
                            fmtEur(localMonthly, locale, 0),
                          ),
                      )}
                    </p>
                    <p>{renderTagged(t("db.local.deck2"))}</p>
                    <p className="db-p-zoom-source">
                      {t("db.local.source")}
                    </p>
                    {commune && (
                      <Link
                        href={`/fr/city/${commune.slug}`}
                        className="db-local-cta"
                      >
                        {t("db.local.cta").replace("{city}", commune.nom)} →
                      </Link>
                    )}
                  </div>
                </div>

                <BarList
                  items={localLevels.map((l) => {
                    // Per-capita national (Approche A) : utilise les shares
                    // OFGL nationales (55/30/15) × S1313 / pop / 12. Le
                    // ratio commune n'est PAS appliqué : on montre la
                    // moyenne nationale par habitant, pas projection Paris.
                    return {
                      key: l.key,
                      name: locale === "en" ? l.label_en : l.label_fr,
                      monthly: populationFr > 0 ? l.monthly_eur / populationFr : 0,
                      nationalAnnual: l.annual_eur,
                      share: l.share_of_local,
                    };
                  })}
                  color="c-local"
                  locale={locale}
                  // Bloc communal reste passif (le DeepDive juste en dessous
                  // ouvre les 9 fonctions cliquables). Dept et Région ouvrent
                  // leur 1re fonction (porte d'entrée vers le scope OFGL).
                  clickableUrls={localLevelsUrls}
                  profileQuery={profileQuery}
                />
              </div>

                                                        {/* MACRO → MICRO : pour Paris (et plus tard d'autres villes du portail détaillé), passerelle vers les pages où l'on peut voir QUI reçoit quel euro. */}
              {commune?.slug === "paris" && (
                <div className="db-macro-to-micro">
                  <div className="db-macro-to-micro-head">
                    <p className="db-macro-to-micro-eyebrow">
                      {t("db.macro_micro.eyebrow")}
                    </p>
                    <h3 className="db-macro-to-micro-title">
                      {renderTagged(t("db.macro_micro.title"), {
                        em: {
                          fontFamily: "var(--pf-serif)",
                          fontStyle: "italic",
                          fontWeight: 400,
                          color: "var(--p-local)",
                        },
                      })}
                    </h3>
                    <p className="db-macro-to-micro-deck">
                      {t("db.macro_micro.deck")}
                    </p>
                  </div>
                  <div className="db-macro-to-micro-grid">
                    <Link
                      href="/fr/city/paris/budget"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.budget.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.budget.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                    <Link
                      href="/fr/city/paris/subventions"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.qui_recoit.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.qui_recoit.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                    <Link
                      href="/fr/city/paris/marches"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.marches.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.marches.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                    <Link
                      href="/fr/city/paris/investissements"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.investissements.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.investissements.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                    <Link
                      href="/fr/city/paris/logement"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.logement.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.logement.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                    <Link
                      href="/fr/city/paris/dette"
                      className="db-macro-to-micro-card"
                    >
                      <span className="db-macro-to-micro-card-label">
                        {t("db.macro_micro.card.dette.label")}
                      </span>
                      <span className="db-macro-to-micro-card-title">
                        {t("db.macro_micro.card.dette.title")}
                      </span>
                      <span className="db-macro-to-micro-card-arrow">→</span>
                    </Link>
                  </div>
                </div>
              )}
              {commune && commune.slug !== "paris" && (
                <div className="db-macro-to-micro db-macro-to-micro-other">
                  <p className="db-macro-to-micro-eyebrow">
                    {t("db.macro_micro.eyebrow")}
                  </p>
                  <p className="db-macro-to-micro-other-text">
                    {t("db.macro_micro.other_text").replace(
                      "{commune}",
                      commune.nom,
                    )}
                  </p>
                  <Link
                    href={`/fr/city/${commune.slug}`}
                    className="db-macro-to-micro-other-link"
                  >
                    {t("db.macro_micro.other_link").replace(
                      "{commune}",
                      commune.nom,
                    )}{" "}
                    →
                  </Link>
                </div>
              )}

              <p className="db-panel-foot-cue">{t("db.local.foot_cue")}</p>
            </div>
          </section>
          );
        })()}

        {/* ── §06 Synthèse SUPPRIMÉE (refonte mai 2026) ──
         *
         * Drop : gap block (paies vs profites), équivalents "valeur
         * équivalente" (15 consultations/hab), context block.
         * Raisons : cadrage individualiste "déficitaire net" trompeur,
         * caveats philosophiques empilés qui sortent du champ d'un
         * simulateur. Les caveats sont déplacés en §06 méthode dans un
         * dépliant dédié "Limites éditoriales".
         *
         * §07 méthode devient §06 (renumérotation). */}

        {/* ── PANNEAU 7 — Méthode (refonte 2026-05) ──
         *
         * Anciennement §08 "Limites du calcul" : wall of italic paragraphs
         * sur les approximations. Refondu en FAQ-style avec dépliants
         * <details> HTML5 natifs (pas de JS), structure progressive :
         * intro courte + 6 dépliants par thème. Chaque dépliant a un
         * numéro court (01-06), un titre lisible et un body détaillé
         * avec sources cliquables (URSSAF / CGI / INSEE / Eurostat /
         * PLF / PLFSS / OFGL / DREES). */}
        <section
          ref={panel7Ref}
          className={`db-panel db-p-method db-panel-fade${panel7Revealed ? " is-revealed" : ""}`}
          style={{ minHeight: "auto", padding: "60px 0 100px", background: "var(--p-paper)" }}
        >
          <div className="db-panel-wrap">
            <p className="db-panel-num">
              {t("db.method.num")}
            </p>
            <h2 className="db-p-method-q" style={{ whiteSpace: "pre-line" }}>
              {renderTagged(t("db.method.title"), {
                em: { color: "var(--p-ink)", fontStyle: "italic", fontWeight: 400 },
              })}
            </h2>
            <p className="db-p-method-deck">{t("db.method.intro")}</p>

            <div className="db-p-method-faq">
              {/* 01 — Comment on calcule tes prélèvements */}
              <details className="db-p-method-faq-item">
                <summary>
                  <span className="db-p-method-faq-num">01</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.hypotheses")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.hypotheses.intro")}</p>
                  <ul>
                    <li>{t("db.method.body.hypotheses.salarie")}</li>
                    <li>{t("db.method.body.hypotheses.pension")}</li>
                    <li>{t("db.method.body.hypotheses.capital")}</li>
                    <li>{t("db.method.body.hypotheses.indep")}</li>
                    <li>{t("db.method.body.hypotheses.tva")}</li>
                    <li>{t("db.method.body.hypotheses.ir")}</li>
                    <li>{t("db.method.body.hypotheses.tf")}</li>
                  </ul>
                  <p className="db-p-method-faq-srcs">
                    {t("db.method.body.hypotheses.srcs_label")} :{" "}
                    <a href="https://www.urssaf.fr/portail/home/taux-et-baremes/taux-de-cotisations.html" target="_blank" rel="noreferrer">URSSAF</a>
                    {" · "}
                    <a href="https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069577/" target="_blank" rel="noreferrer">CGI art. 200 A</a>
                    {" · "}
                    <a href="https://www.impots.gouv.fr/particulier/calcul-de-limpot" target="_blank" rel="noreferrer">DGFiP barème 2025</a>
                  </p>
                </div>
              </details>

              {/* 02 — Ce qui n'est pas dans le calcul */}
              <details className="db-p-method-faq-item">
                <summary>
                  <span className="db-p-method-faq-num">02</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.exclusions")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.exclusions.intro")}</p>
                  <ul>
                    <li>{t("db.method.body.exclusions.credits")}</li>
                    <li>{t("db.method.body.exclusions.rfr")}</li>
                    <li>{t("db.method.body.exclusions.prestations")}</li>
                    <li>{t("db.method.body.exclusions.local_grain")}</li>
                  </ul>
                </div>
              </details>

              {/* 03 — D'où viennent les données nationales */}
              <details className="db-p-method-faq-item">
                <summary>
                  <span className="db-p-method-faq-num">03</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.sources")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.sources.intro")}</p>
                  <ul>
                    <li>
                      <a href="https://www.urssaf.fr/portail/home/taux-et-baremes.html" target="_blank" rel="noreferrer">URSSAF</a> — {t("db.method.body.sources.urssaf")}
                    </li>
                    <li>
                      <a href="https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069577/" target="_blank" rel="noreferrer">CGI</a> — {t("db.method.body.sources.cgi")}
                    </li>
                    <li>
                      <a href="https://www.insee.fr/fr/statistiques/serie/010003222" target="_blank" rel="noreferrer">INSEE</a> — {t("db.method.body.sources.insee")}
                    </li>
                    <li>
                      <a href="https://ec.europa.eu/eurostat/databrowser/view/gov_10a_main" target="_blank" rel="noreferrer">Eurostat gov_10a_main</a> — {t("db.method.body.sources.eurostat")}
                    </li>
                    <li>
                      <a href="https://www.data.gouv.fr/datasets/plf-2025-depenses-2025-selon-destination/" target="_blank" rel="noreferrer">PLF 2025</a> — {t("db.method.body.sources.plf")}
                    </li>
                    <li>
                      <a href="https://www.securite-sociale.fr/files-sso/files/2024/10/PLFSS-2025_Annexe5.pdf" target="_blank" rel="noreferrer">PLFSS 2025</a> — {t("db.method.body.sources.plfss")}
                    </li>
                    <li>
                      <a href="https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/" target="_blank" rel="noreferrer">OFGL 2025</a> — {t("db.method.body.sources.ofgl")}
                    </li>
                    <li>
                      <a href="https://drees.solidarites-sante.gouv.fr/publications-communique-de-presse/panoramas-de-la-drees/les-depenses-de-sante-en-2024" target="_blank" rel="noreferrer">DREES Comptes santé</a> — {t("db.method.body.sources.drees")}
                    </li>
                  </ul>
                </div>
              </details>

              {/* 04 — Périmètre Sécu / État / Local */}
              <details className="db-p-method-faq-item">
                <summary>
                  <span className="db-p-method-faq-num">04</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.perimetre")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.perimetre.intro")}</p>
                  <ul>
                    <li>{t("db.method.body.perimetre.s1311")}</li>
                    <li>{t("db.method.body.perimetre.s1313")}</li>
                    <li>{t("db.method.body.perimetre.s1314")}</li>
                  </ul>
                  <p>
                    <b>{t("db.method.body.perimetre.caveat_label")}</b>{" "}
                    {t("db.method.body.perimetre.caveat_229")}
                  </p>
                </div>
              </details>

              {/* 05 — Pourquoi un calcul perso et pas exact */}
              <details className="db-p-method-faq-item">
                <summary>
                  <span className="db-p-method-faq-num">05</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.pourquoi_perso")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.pourquoi_perso.p1")}</p>
                  <p>{t("db.method.body.pourquoi_perso.p2")}</p>
                  <p>{t("db.method.body.pourquoi_perso.p3")}</p>
                </div>
              </details>

              {/* 06 — Limites éditoriales (ajout mai 2026 après drop §06
                  synthèse). Déplace ici les caveats patrimoine + biens
                  non-marchands + collectif, plutôt que les empiler dans
                  une synthèse forcée. */}
              <details className="db-p-method-faq">
                <summary className="db-p-method-faq-summary">
                  <span className="db-p-method-faq-num">06</span>
                  <span className="db-p-method-faq-q">
                    {t("db.method.q.limites")}
                  </span>
                  <span aria-hidden className="db-p-method-faq-chevron">↓</span>
                </summary>
                <div className="db-p-method-faq-body">
                  <p>{t("db.method.body.limites.intro")}</p>
                  <p>
                    <b>{t("db.method.body.limites.patrimoine_title")}</b>
                  </p>
                  <p>{t("db.method.body.limites.patrimoine_body")}</p>
                  <p>
                    <b>{t("db.method.body.limites.nonmarchand_title")}</b>
                  </p>
                  <p>{t("db.method.body.limites.nonmarchand_body")}</p>
                  <p>
                    <b>{t("db.method.body.limites.collectif_title")}</b>
                  </p>
                  <p>{t("db.method.body.limites.collectif_body")}</p>
                </div>
              </details>
            </div>

            <div className="db-p-method-foot">
              <Link
                href={profileQuery ? `/fr/national/budget?${profileQuery}` : "/fr/national/budget"}
                className="db-p-method-foot-link"
              >
                {t("budget.cross_link.from_db")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="theme-fusion">
        <Footer />
      </div>
    </div>
  );
}
// ─── DeepDive sub-component ─────────────────────────────────────────────

// ─── BarList sub-component ─────────────────────────────────────────────

function BarList({
  items,
  color,
  locale,
  clickableUrls,
  profileQuery,
}: {
  items: Array<{
    key?: string;
    name: string;
    monthly: number;
    /** Montant annuel national (€) — affiché en complément du personnel. */
    nationalAnnual?: number;
    share: number;
    sub?: string;
    color?: string;
  }>;
  color: "c-secu" | "c-etat" | "c-local";
  locale: string;
  /** Optional : si l'item a une `key` présente dans cette map, la barre
   *  devient cliquable (drill vers `/fr/national/daily-bread/bucket/<bucket>/<level2>`). */
  clickableUrls?: Map<string, string>;
  /** Query string profil (sans `?`), append à l'URL drill — propage le
   *  contexte ?net=...&parts=...&c=... pour que le drawer affiche les
   *  €/mois projetés (lead + sub-rows). Sans ça, les pages drawer reçoivent
   *  un `searchParams` vide et `personalMonthlyLabel` est null. */
  profileQuery?: string;
}) {
  const max = Math.max(...items.map((i) => i.share), 0.01);
  const appendProfile = (u: string): string => {
    if (!profileQuery) return u;
    const sep = u.includes("?") ? "&" : "?";
    return `${u}${sep}${profileQuery}`;
  };
  return (
    <div className="db-p-zoom-bars">
      {items.map((item, i) => {
        const pct = (item.share / max) * 100;
        const rawUrl = item.key ? clickableUrls?.get(item.key) : undefined;
        const url = rawUrl ? appendProfile(rawUrl) : undefined;
        const isClickable = Boolean(url);
        const inner = (
          <>
            <div className="db-p-zoom-bar-head">
              <span className="db-p-zoom-bar-name">
                {item.name}
                {isClickable && (
                  <span aria-hidden className="db-p-zoom-bar-chevron">→</span>
                )}
              </span>
              <span className="db-p-zoom-bar-val tnum">
                <span className="db-p-zoom-bar-val-perso">
                  {fmtEur(item.monthly, locale, 0)} €
                </span>
                <span className="db-p-zoom-bar-natl tnum">
                  {item.nationalAnnual != null && item.nationalAnnual > 0 && (
                    <>
                      {fmtBnEur(item.nationalAnnual, locale)}
                      {locale === "en" ? "/yr" : "/an"}
                      <span className="db-p-zoom-bar-natl-pct">{" · "}</span>
                    </>
                  )}
                  <span className="db-p-zoom-bar-natl-pct">
                    {(item.share * 100).toLocaleString(
                      numLocale(locale),
                      { maximumFractionDigits: 0 },
                    )}{" "}
                    %
                  </span>
                </span>
              </span>
            </div>
            <div className="db-p-zoom-bar-track">
              <div
                className={`db-p-zoom-bar-fill ${color}`}
                style={{
                  width: `${pct}%`,
                  background: item.color ?? undefined,
                }}
              />
            </div>
            {item.sub && <div className="db-p-zoom-bar-sub">{item.sub}</div>}
          </>
        );
        if (isClickable && url) {
          // Link avec scroll={false} = soft nav qui déclenche l'intercept
          // parallel-route `@drawer/(.)bucket/...` au lieu d'un router.push
          // qui forçait une full-nav (perte du slot drawer).
          return (
            <Link
              key={i}
              href={url}
              scroll={false}
              prefetch={false}
              className="db-p-zoom-bar db-p-zoom-bar-clickable"
            >
              {inner}
            </Link>
          );
        }
        return (
          <div key={i} className="db-p-zoom-bar">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
