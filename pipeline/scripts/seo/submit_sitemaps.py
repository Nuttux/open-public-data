"""Re-soumet les sitemaps du site à la Search Console, hôte par hôte.

À lancer après un changement qui touche beaucoup de pages (refonte de gabarit,
ré-export) : Google n'a aucune raison de revenir tant que personne ne lui dit
que ça a bougé. Le script prend les tranches que l'hôte déclare dans son
robots.txt (celles qui contiennent ses URL), saute celles qui seraient vides
(elles comptent comme des erreurs côté Google), et fait un PUT par tranche sur
l'API Search Console.

Authentification, dans cet ordre :
  - GOOGLE_ADC_JSON_B64 : la clé JSON d'un compte de service, en base64 sur une
    ligne (le format KEY=value de la routine cloud, qui n'a pas gcloud ; un
    `GOOGLE_ADC_JSON_B64=` collé en tête de la valeur est retiré). Le compte
    doit être propriétaire ou utilisateur complet des propriétés : un
    utilisateur restreint lit, mais ne soumet pas. Demande google-auth
    (pip install google-auth requests).
  - sinon, les identifiants par défaut de gcloud (compte propriétaire des
    propriétés), avec le projet de quota.
Il n'existe pas d'API pour demander l'indexation d'une page ordinaire : ça
reste un geste manuel dans l'interface.

    python3 pipeline/scripts/seo/submit_sitemaps.py            # fr + www + pt
    python3 pipeline/scripts/seo/submit_sitemaps.py fr.qipu.org
    python3 pipeline/scripts/seo/submit_sitemaps.py --dry-run  # liste, ne soumet rien
"""
from __future__ import annotations
import argparse, base64, json, re, subprocess, sys, time, urllib.parse, urllib.request

from search_report import env

PROJECT = "open-data-france-484717"
HOSTS = {"fr.qipu.org": "sc-domain:fr.qipu.org", "www.qipu.org": "sc-domain:qipu.org", "pt.qipu.org": "sc-domain:pt.qipu.org"}
SCOPE = "https://www.googleapis.com/auth/webmasters"


def auth_mode() -> str:
    return "compte de service (GOOGLE_ADC_JSON_B64)" if env("GOOGLE_ADC_JSON_B64") else "gcloud (application-default)"


def auth_headers() -> dict[str, str]:
    """Bearer token: the service account when its key is in the environment, gcloud otherwise."""
    key_b64 = env("GOOGLE_ADC_JSON_B64")
    if key_b64:
        from google.auth.transport.requests import Request  # type: ignore
        from google.oauth2 import service_account  # type: ignore

        info = json.loads(base64.b64decode(key_b64).decode("utf-8"))
        creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
        creds.refresh(Request())
        # A service account bills its own project: no quota-project header,
        # which would require serviceusage.services.use on top.
        return {"Authorization": f"Bearer {creds.token}"}
    tok = subprocess.run(["gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    return {"Authorization": f"Bearer {tok}", "x-goog-user-project": PROJECT}


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-sitemaps/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def submit(headers: dict[str, str], site: str, feed: str) -> int:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/sitemaps/{urllib.parse.quote(feed, safe='')}"
    req = urllib.request.Request(url, method="PUT", headers={**headers, "Content-Length": "0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main(hosts: list[str], dry_run: bool) -> int:
    print(f"authentification : {auth_mode()}{' (non utilisée : --dry-run)' if dry_run else ''}")
    headers = {} if dry_run else auth_headers()
    failures = 0
    for host in hosts:
        site = HOSTS[host]
        # La liste vient de robots.txt : un plafond fixe de tranches finit
        # toujours par couper les dernières quand le site grandit.
        _, robots = fetch(f"https://{host}/robots.txt")
        feeds = re.findall(r"^Sitemap:\s*(\S+)", robots, re.M)
        n = len(feeds)
        submitted = skipped = failed = 0
        for feed_clean in feeds:
            code, body = fetch(f"{feed_clean}?v={int(time.time())}")
            locs = len(re.findall(r"<loc>", body))
            if code != 200 or locs == 0:
                skipped += 1
                if dry_run:
                    print(f"  ignorée      {feed_clean} (HTTP {code}, {locs} URL)")
            elif dry_run:
                submitted += 1
                print(f"  soumettrait  {feed_clean} → {site} ({locs} URL)")
            else:
                st = submit(headers, site, feed_clean)
                if st in (200, 204):
                    submitted += 1
                else:
                    failed += 1
                    print(f"  {feed_clean} → HTTP {st}", file=sys.stderr)
            time.sleep(0.3)
        label = "à soumettre" if dry_run else "soumises"
        print(f"{host:14s} tranches={n} {label}={submitted} vides ignorées={skipped} échecs={failed}")
        failures += failed
    return 1 if failures else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("hosts", nargs="*", metavar="host", help=f"parmi {', '.join(HOSTS)} (défaut : tous)")
    ap.add_argument("--dry-run", action="store_true", help="liste les tranches qui seraient soumises, sans authentification ni PUT")
    a = ap.parse_args()
    unknown = [h for h in a.hosts if h not in HOSTS]
    if unknown:
        ap.error(f"hôte inconnu : {', '.join(unknown)} (parmi {', '.join(HOSTS)})")
    sys.exit(main(a.hosts or list(HOSTS), a.dry_run))
