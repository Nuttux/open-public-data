# Licence of the published data

These files are **derived databases** produced by Qipu (https://qipu.org) from
open government sources. A derived database carries the licence of its most
restrictive source.

| Path | Source | Licence | Obligations |
|---|---|---|---|
| (root and topical subdirs) | Paris Open Data + French State | **ODbL 1.0** | Attribution + **share-alike** |
| `br/` | Prefeitura do Recife (Dados Abertos) | **ODbL 1.0** | Attribution + **share-alike** |
| `us/` | DataSF | PDDL | Public domain — none |
| `marseille/` | AMP Métropole | Mostly Licence Ouverte 2.0 | Attribution — verify per dataset |

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
Exports built solely from French State data (DGFiP, DECP, INSEE, DRIHL) are
under Licence Ouverte 2.0: attribution only, no share-alike.

Stamps are produced by `pipeline/scripts/export/stamp_licenses.py`
(`--check` fails on drift).
