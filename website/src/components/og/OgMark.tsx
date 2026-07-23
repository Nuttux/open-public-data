/**
 * Shared brand mark for Open Graph cards (the Qipu quipu).
 *
 * Rendered inside `next/og` `ImageResponse` (Satori), which supports inline
 * SVG. This replaces the legacy "FO" (France Open Data) tile that was
 * copy-pasted across every opengraph-image route. The paths are the same four
 * knotted cords as `components/fusion/BrandMark.tsx`, flattened (no <g>
 * transform, per-element stroke/fill) for maximum Satori compatibility and
 * pre-offset by -2 on Y so the mark sits centred.
 *
 * Returns a 32px indigo tile with the white mark, matching the footprint of the
 * old tile so surrounding layouts don't shift. Pass `size` to scale.
 */
export function ogMark(size = 32) {
  const w = Math.round(size * 0.72);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#2a3680",
        borderRadius: Math.round(size * 0.19),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={w} height={w} viewBox="0 0 48 48" fill="none">
        <path d="M8 10 Q24 15 40 10" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
        <path d="M15 11.4 Q13.4 23 15 34" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
        <path d="M24 13 L24 42" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
        <path d="M33 11.4 Q34.6 20 33 28" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
        <circle cx="15" cy="22" r="3" fill="#fff" />
        <circle cx="24" cy="24" r="3" fill="#fff" />
        <circle cx="24" cy="34" r="3" fill="#fff" />
        <circle cx="33" cy="21" r="3" fill="#fff" />
      </svg>
    </div>
  );
}
