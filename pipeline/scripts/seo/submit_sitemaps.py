"""Re-soumet les sitemaps du site à la Search Console, hôte par hôte.

À lancer après un changement qui touche beaucoup de pages (refonte de gabarit,
ré-export) : Google n'a aucune raison de revenir tant que personne ne lui dit
que ça a bougé. Le script parcourt /sitemap/N.xml jusqu'au premier 404, saute
les tranches vides (elles comptent comme des erreurs côté Google), et fait un
PUT par tranche sur l'API Search Console.

Authentification : les identifiants par défaut de gcloud (compte propriétaire
des propriétés), avec le projet de quota. Il n'existe pas d'API pour demander
l'indexation d'une page ordinaire : ça reste un geste manuel dans l'interface.

    python3 pipeline/scripts/seo/submit_sitemaps.py            # fr + www + pt
    python3 pipeline/scripts/seo/submit_sitemaps.py fr.qipu.org
"""
from __future__ import annotations
import re, subprocess, sys, time, urllib.parse, urllib.request

PROJECT = "open-data-france-484717"
HOSTS = {"fr.qipu.org": "sc-domain:fr.qipu.org", "www.qipu.org": "sc-domain:qipu.org", "pt.qipu.org": "sc-domain:pt.qipu.org"}


def token() -> str:
    return subprocess.run(["gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-sitemaps/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def submit(tok: str, site: str, feed: str) -> int:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/sitemaps/{urllib.parse.quote(feed, safe='')}"
    req = urllib.request.Request(url, method="PUT", headers={"Authorization": f"Bearer {tok}", "x-goog-user-project": PROJECT, "Content-Length": "0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main(hosts: list[str]) -> int:
    tok = token()
    for host in hosts:
        site = HOSTS[host]
        n = 0
        submitted = skipped = failed = 0
        while n < 60:
            feed = f"https://{host}/sitemap/{n}.xml?v={int(time.time())}"
            code, body = fetch(feed)
            if code == 404:
                break
            feed_clean = f"https://{host}/sitemap/{n}.xml"
            locs = len(re.findall(r"<loc>", body))
            if code != 200 or locs == 0:
                skipped += 1
            else:
                st = submit(tok, site, feed_clean)
                if st in (200, 204):
                    submitted += 1
                else:
                    failed += 1
                    print(f"  {host} sitemap/{n}.xml → HTTP {st}", file=sys.stderr)
            n += 1
            time.sleep(0.3)
        print(f"{host:14s} tranches={n} soumises={submitted} vides ignorées={skipped} échecs={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or list(HOSTS)))
