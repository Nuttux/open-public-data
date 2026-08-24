"""Photograph the NOT ON THIS MAP badge, before and after.

    python3 pipeline/scripts/us_sf_reach/reach_badge_shot.py <label>

Writes pipeline/scripts/us_sf_reach/badge-<label>.png and -crop.png.

The badge only exists while the film is RUNNING and on the Hetch Hetchy shot
(`lib/city/film.ts`: badge is set when `s.id === 'hetch-hetchy'` and the segment
is not a move), so this seeks with the product's own read-and-seek hook,
`window.__cityFilm`, and shoots during the hold. NIGHT.md trap 2 is the reason
the shot asserts `where().id === 'hetch-hetchy'` and `seg !== 'move'` at the
shutter rather than trusting the clock.
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "http://localhost:3000/us/city/sf/the-city"
W, H, DPR = 1440, 940, 2


async def run(label: str, w: int = W, h: int = H) -> int:
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={"width": w, "height": h},
                               device_scale_factor=DPR,
                               is_mobile=w < 820, has_touch=w < 820)
        await pg.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        # `__cityFilm.ready` is `liveRef.current`, which the film only builds
        # when it plays — so the button comes FIRST and the wait comes after.
        for _ in range(200):
            b = pg.locator("button:has-text('Watch the century')").first
            if await b.count():
                await b.click()
                break
            await pg.wait_for_timeout(250)
        else:
            print("the play control never appeared", file=sys.stderr)
            return 1
        for _ in range(150):
            if await pg.evaluate("!!window.__cityFilm && window.__cityFilm.ready"):
                break
            await pg.wait_for_timeout(200)
        else:
            print("film never became ready", file=sys.stderr)
            return 1
        await pg.wait_for_timeout(600)
        shots = await pg.evaluate("window.__cityFilm.shots()")
        payload = await pg.evaluate(
            "fetch('/data/us/sf/city/film/film.json').then(r=>r.json())"
            ".then(d=>d.shots.map(s=>({id:s.id,move:s.move,shot:s.shot})))")
        i = next(k for k, s in enumerate(payload) if s["id"] == "hetch-hetchy")
        t = shots[i] + payload[i]["move"] + 2600
        await pg.evaluate(f"window.__cityFilm.seek({t})")
        await pg.wait_for_timeout(900)
        where = await pg.evaluate("window.__cityFilm.where()")
        if where["id"] != "hetch-hetchy" or where["seg"] == "move":
            print(f"wrong frame at the shutter: {where}", file=sys.stderr)
            return 1
        badge = pg.locator(".fx-film-badge").first
        if not await badge.count():
            print("no badge on screen", file=sys.stderr)
            return 1
        out = HERE / f"badge-{label}.png"
        await pg.screenshot(path=str(out))
        plate = pg.locator(".fx-film-plate").first
        await plate.screenshot(path=str(HERE / f"badge-{label}-crop.png"))
        txt = (await badge.inner_text()).replace("\n", " / ")
        box = await badge.bounding_box()
        print(f"{out.name}  shot={where['id']} seg={where['seg']} "
              f"year={where['year']}")
        print(f"  badge text: {txt[:200]}")
        print(f"  badge box : {box['width']:.0f} x {box['height']:.0f} px")
        await br.close()
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    raise SystemExit(asyncio.run(run(a[0] if a else "x",
                                     int(a[1]) if len(a) > 1 else W,
                                     int(a[2]) if len(a) > 2 else H)))
