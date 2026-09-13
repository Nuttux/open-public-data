"""Re-soumet les sitemaps du site à la Search Console, hôte par hôte.

À lancer après un changement qui touche beaucoup de pages (refonte de gabarit,
ré-export) : Google n'a aucune raison de revenir tant que personne ne lui dit
que ça a bougé. Le script prend les tranches que l'hôte déclare dans son
robots.txt (celles qui contiennent ses URL), saute celles qui seraient vides
(elles comptent comme des erreurs côté Google), et fait un PUT par tranche sur
l'API Search Console.

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
            else:
                st = submit(tok, site, feed_clean)
                if st in (200, 204):
                    submitted += 1
                else:
                    failed += 1
                    print(f"  {feed_clean} → HTTP {st}", file=sys.stderr)
            time.sleep(0.3)
        print(f"{host:14s} tranches={n} soumises={submitted} vides ignorées={skipped} échecs={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or list(HOSTS)))
