/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/ground-plate.ts — THE FLAT PLATE, AND IT IS TEMPORARY.

   Block 0 needs one thing on screen to prove the pipeline: data in, camera
   applied, pixels out. This is that — the city's own DEM extent as a single
   quad at sea level, in the paper's colour.

   **It is replaced by the real terrain in Block 1** and this file goes with
   it. It is here rather than in a scratch file because a layer that mounts
   through the same interface as the real ones is what proves the interface.
   ═══════════════════════════════════════════════════════════════════════ */

import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial } from "three";

import type { CityLayer } from "../engine";

export interface GroundPlateOptions {
  /** the DEM's own origin and span, in world metres */
  x0: number;
  y0: number;
  spanM: number;
  colour: string;
}

export function groundPlate(o: GroundPlateOptions): CityLayer & { mesh: Mesh } {
  const g = new BufferGeometry();
  const x1 = o.x0 + o.spanM;
  const y1 = o.y0 + o.spanM;
  // scene coordinates: (world x, exaggerated vertical, world y)
  const v = [
    o.x0, 0, o.y0,
    x1, 0, o.y0,
    x1, 0, y1,
    o.x0, 0, o.y0,
    x1, 0, y1,
    o.x0, 0, y1,
  ];
  g.setAttribute("position", new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const m = new MeshBasicMaterial({ color: new Color(o.colour) });
  const mesh = new Mesh(g, m);

  return {
    name: "ground-plate",
    mesh,
    dispose() {
      g.dispose();
      m.dispose();
    },
  };
}
