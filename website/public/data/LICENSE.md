# Licence of the published data

These files are **derived databases** produced by Qipu (https://qipu.org) from
open government sources. A derived database carries the licence of its most
restrictive source.

| Path | Source | Licence | Obligations |
|---|---|---|---|
| (root and Paris topical subdirs) | Paris Open Data (+ French State data) | **ODbL 1.0** | Attribution + **share-alike** |
| `br/` | Prefeitura do Recife (Dados Abertos) | **ODbL 1.0** | Attribution + **share-alike** |
| `communes*/` | DGFiP, OFGL, DECP, INSEE | Licence Ouverte v2.0 | Attribution: « DGFiP ; calcul OFGL - source DGFiP ; DECP ; Source : Insee » |
| `marseille/`, `fr/` | Ville de Marseille (data.gouv.fr), Métropole Aix-Marseille-Provence, OFGL | Licence Ouverte v2.0 | Attribution |
| `national/` | Eurostat, INSEE, PLF, PLFSS, DGFiP, OFGL | CC BY 4.0 (Eurostat) + Licence Ouverte v2.0 | Attribution; state that Eurostat figures were reprocessed |
| `us/` | DataSF | PDDL | Public domain — none |

Licences checked on each source portal on 13 September 2026.

## ODbL files (root, topical subdirs, `br/`)

Each object-shaped JSON carries a top-level `license` block stating this.

**You must:**

1. **Attribute the original producer** in the form it requires — for the City of
   Paris: `Nom du jeu de données, Ville de Paris, sous licence ODbL`; for Recife:
   `Prefeitura do Recife (Dados Abertos), sob licença ODbL`.
2. **Credit Qipu** as producer of the derived database:
   `Qipu · base dérivée, sous licence ODbL`.
3. **Share alike** — if you publicly redistribute a database derived from these
   files, or offer it as a service, that database must itself be under ODbL 1.0.

Full text: https://opendatacommons.org/licenses/odbl/1-0/

## Non-ODbL files

`us/` derives from DataSF, released as PDDL (public domain): no obligation.
`communes*/`, `marseille/`, `fr/` and `national/` derive only from public data
under Licence Ouverte v2.0 (and Eurostat's CC BY 4.0 for `national/`):
attribution in the form each producer asks for, no share-alike. Their `license`
block names that attribution.

Stamps are produced by `pipeline/scripts/export/stamp_licenses.py`
(`--check` fails on drift).
