import fonctionsManifest from '@/data/communes-fonctions-manifest.json';
import { MARCHES_EXPLORER_MIN } from '@/app/[lang]/france/[slug]/page-ville-data';
import { listAllCommunesMeta } from '@/lib/all-communes';
import { hasDedicatedRoutes } from '@/lib/cities';
import { marchesManifestSlugs } from '@/lib/commune-marches';
import { readDataJsonOrNull } from '@/lib/data/read';
import { loadLieuxIndex } from '@/lib/lieux-data';
import { SITE_URL } from '@/lib/seo';
import { ANALYSES_PUBLIC } from '@/lib/analyses-visibility';
import { loadSfPlacesIndex } from '@/lib/us/sf-places-data';

/**
 * The file AI engines read to understand the site (llmstxt.org).
 *
 * It used to be a hand-written public/llms.txt, and its counts drifted from the
 * pages as soon as an export moved (182 places, 34 932 communes, 7 912
 * contratos…) while ~50 000 pages built since — a commune's spending by
 * policy and by form, its procurement explorer — went unmentioned. Every count
 * is now read from the export the pages render from. Rendered at build
 * (force-static), where the data is on disk; a count that cannot be read is
 * dropped from its sentence rather than guessed.
 */
export const dynamic = 'force-static';

function count(read: () => number): string | null {
  try {
    const n = read();
    return n > 0 ? n.toLocaleString('en-GB') : null;
  } catch {
    return null;
  }
}

/** "182 places" / "places" when the count is unavailable. */
function counted(n: string | null, noun: string): string {
  return n ? `${n} ${noun}` : noun;
}

type FonctionsManifest = { communes: Record<string, { fonctions?: string[]; natures?: string[] }> };

function body(): string {
  const u = SITE_URL;
  const communes = (fonctionsManifest as FonctionsManifest).communes;

  const parisPlaces = count(() => loadLieuxIndex().length);
  const sfPlaces = count(() => loadSfPlacesIndex().length);
  const recifeContracts = count(
    () => readDataJsonOrNull<{ contratos?: unknown[] }>('br/recife/contratos.json')?.contratos?.length ?? 0,
  );
  const recifePlaces = count(
    () => readDataJsonOrNull<{ places?: unknown[] }>('br/recife/places.json')?.places?.length ?? 0,
  );
  const allCommunes = count(() => listAllCommunesMeta().length);
  const policyCommunes = count(() => Object.keys(communes).length);
  const policyPages = count(() => Object.values(communes).reduce((s, e) => s + (e.fonctions?.length ?? 0), 0));
  const naturePages = count(() => Object.values(communes).reduce((s, e) => s + (e.natures?.length ?? 0), 0));
  const marchesPages = count(
    () => marchesManifestSlugs(MARCHES_EXPLORER_MIN).filter((s) => !hasDedicatedRoutes(s)).length,
  );

  const policyLine = policyPages
    ? `- For ${counted(policyCommunes, 'communes')}, one page per public policy (${policyPages} pages) and one per form of spending (${naturePages ?? 'more'} pages), from the DGFiP accounts presented by function and by nature:`
    : `- For the communes whose accounts are published by function, one page per public policy and one per form of spending, from the DGFiP accounts:`;

  return `# Qipu

> Public money, made legible. Qipu takes the data a city already publishes —
> budgets, contracts, grants, payroll, public works — and turns it into pages a
> resident can read, with every figure linked back to the file it came from.
> Three cities are live in three languages, alongside every French commune.

Independent project, open pipeline. Sources are official open data portals and
public accounts: Paris Open Data, DGFiP/OFGL, DECP (France), DataSF and the
Internet Archive (United States), Prefeitura do Recife (Brazil). Each figure
carries a link to the dataset it comes from.

Every address starts with its language, then its country:
${u}/fr/… (French), ${u}/en/… (English), ${u}/pt/… (Portuguese, Recife).
A country's pages are written in its language; the English versions of France's
and Brazil's hubs exist too.

## Cities

- [Paris](${u}/fr/france/paris): budget, grants, public contracts, investments, social housing,
  debt, and ${counted(parisPlaces, 'places')} with the money that reached each.
- [San Francisco](${u}/en/usa/san-francisco): budget and a timeline back to 1888, contracts,
  payroll, who the city pays, ${counted(sfPlaces, 'places')} with their archival
  record, and every neighbourhood and street of the city map.
- [Recife](${u}/pt/brasil/recife): orçamento, ${counted(recifeContracts, 'contratos')},
  quem recebe, and ${counted(recifePlaces, 'lugares')}. In Portuguese.
- [Marseille](${u}/fr/france/marseille): the City's voted budget, grants (2017-2022),
  investments, debt, social housing, 12 places with what the City paid each,
  and its public contracts from the national DECP file (2020 onwards).

## France, nationally

- [State budget](${u}/fr/france/budget): where national revenue comes from and
  where it goes.
- [Daily bread](${u}/fr/france/simulateur-prelevements): the same money seen per inhabitant,
  per day.
- [Debt](${u}/fr/france/dette) · [Taxation](${u}/fr/france/fiscalite) ·
  [The State](${u}/fr/france/etat)
- **Every French commune** has a page at \`${u}/fr/france/{commune-slug}\` —
  ${counted(allCommunes, 'of them')}, built from the accounts published by the
  DGFiP and harmonised by the OFGL. It answers « Combien dépense {commune} ? »:
  spending per inhabitant against communes of the same size, what the money is
  for (by public policy), a comparison with a neighbour, what the commune
  builds and buys, its property-tax rate, its debt, its mayor.
  Example: [Lille](${u}/fr/france/lille).
${policyLine}
  - \`${u}/fr/france/{commune-slug}/fonction/{policy}\` — e.g. \`enseignement-formation\`, education and training
  - \`${u}/fr/france/{commune-slug}/nature/{form}\` — e.g. \`salaires\`, staff pay
- ${counted(marchesPages, 'communes')} have a public-contracts explorer at
  \`${u}/fr/france/{commune-slug}/marches\` (DECP), with a page per supplier at
  \`${u}/fr/france/{commune-slug}/fournisseur/{siren}\`.
- [Compare communes](${u}/comparer)

## Paris sections

Every section follows the same grammar: the figure and its sentence, a year
rail, a scene to click, the lines that weigh most, « Comprendre » (understand),
« Voir aussi » (see also) with the neighbouring sections' figures, and a source line.

- [Budget](${u}/fr/france/paris/budget) ·
  [Grants](${u}/fr/france/paris/subventions) ·
  [Public contracts](${u}/fr/france/paris/marches) ·
  [Investments](${u}/fr/france/paris/investissements) ·
  [Social housing](${u}/fr/france/paris/logement) ·
  [Debt and assets](${u}/fr/france/paris/dette) ·
  [Places](${u}/fr/france/paris/lieux)

## Entity pages

Every organisation, contract, supplier and place has its own page:

- \`${u}/fr/france/paris/lieu/{slug}\` — a Paris place
- \`${u}/fr/france/paris/subventions/association/{slug}\` — a grant recipient
- \`${u}/fr/france/paris/marches/contrat/{number}\` — a Paris contract
- \`${u}/fr/france/paris/marches/fournisseur/{siren}\` — a Paris supplier
- \`${u}/en/usa/san-francisco/places/place/{slug}\` — a San Francisco place
- \`${u}/en/usa/san-francisco/who-gets-paid/payee/{slug}\` — a San Francisco payee
- \`${u}/en/usa/san-francisco/contracts/contract/{number}\` — a San Francisco contract
- \`${u}/en/usa/san-francisco/the-city/neighbourhood/{slug}\` — a San Francisco neighbourhood
- \`${u}/pt/brasil/recife/lugares/{slug}\` — a Recife place
- \`${u}/pt/brasil/recife/quem-recebe/{cnpj}\` — a Recife recipient
- \`${u}/pt/brasil/recife/contratos/{id}\` — a Recife contract

## Method and limits

- [Method](${u}/methode): how each figure is built, source by source.
- [Corrections](${u}/corrections): every correction, with its date and scope.
${ANALYSES_PUBLIC ? `- [Explainers](${u}/analyses): how to read a public document, and how a given figure on this site is built.\n` : ''}- [For cities](${u}/pour-les-villes): what it takes to build this for another city.

Known limits, stated because they matter when citing this site: the number of
Paris grant lines drops sharply in 2020 and 2021 while the amounts hold, so
counts and averages across that gap are not comparable; French procurement
coverage depends on what each authority declares to DECP; San Francisco's paid
and agreed contract amounts come from two different datasets and do not always
reconcile; individual private persons who receive grants are never named or
indexed.

## Contact

daniel@qipu.org
`;
}

export function GET(): Response {
  return new Response(body(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
