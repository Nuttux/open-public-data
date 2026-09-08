# Probes for `/us/city/sf/the-city`

One-off Playwright measurements behind the 2026-09 performance pass on the
city page (phone tile map + desktop WebGPU model). They are kept because
the numbers in the commit messages came out of them, and a re-measure should
run the same script, not a rewrite.

Run from `website/` (Playwright resolves from there); every script reads the
server from `BASE` (default `http://localhost:3007`, the render worktree) and
`SCR` for where to drop screenshots:

    SCR=/tmp/shots BASE=https://www.qipu.org node scripts/probes/phone_shots.mjs

| script | measures |
| --- | --- |
| `phone_shots.mjs` | phone layout at 664 / 844 px tall: stage height, chrome, screenshots |
| `mboot.mjs`, `m4g.mjs` | phone boot: time to map, bytes, on a 4G + 4× CPU throttle |
| `hit2.mjs` | block-pick hit rate coarse vs fine DEM, DEM request timing |
| `tap.mjs` | search → tap → sheet on a phone |
| `play.mjs` | year play at district: tiles, bytes, paper |
| `overlaycheck.mjs` | tiles baked with a dev overlay (saturation < 0.12) |
| `release_ab.mjs`, `heap.mjs`, `idle.mjs` | desktop heap with/without CPU-array release, idle cost |
| `calls.mjs`, `fps.mjs`, `gldiag.mjs` | draw calls, fps with vsync off, GPU backend |
| `filmrow.mjs`, `filmplay.mjs` | the phone film row and that the video loads and plays |
