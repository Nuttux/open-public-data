import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { civicIndex, isChurchName } from "./civic";

/**
 * THE RULE, RUN OVER THE FILE IT WILL ACTUALLY MEET.
 *
 * `civic.test.ts` checks the rule against names taken out of the register by
 * hand. This checks it against the whole shipped register, because the thing
 * that goes wrong with a name rule is not the case you thought of — it is the
 * hundred you did not, and the only way to see those is to run it over all of
 * them and look at the totals.
 *
 * The counts are asserted exactly. If the register changes under this, the
 * test says so and the numbers in `civic.ts`'s own header have to move with
 * it, which is the point: those numbers are quoted as measurements.
 */
describe("the shipped register, in full", () => {
  it("gives 457 buildings a form, in the proportions the header states", () => {
    const marks = JSON.parse(readFileSync(
      "public/data/us/sf/city/base/marks.json", "utf8")) as Parameters<typeof civicIndex>[0];
    const idx = civicIndex(marks);
    const n: Record<string, number> = {};
    for (const v of idx.values()) n[v] = (n[v] ?? 0) + 1;
    expect(n).toEqual({
      school: 217,
      monument: 111,
      shed: 51,
      firehouse: 43,
      church: 35,
    });
    expect(idx.size).toBe(457);
  });

  it("names every church it finds, so a wrong one cannot slip in unseen", () => {
    const marks = JSON.parse(readFileSync(
      "public/data/us/sf/city/base/marks.json", "utf8")) as { t: string[]; b: string };
    const bin = atob(marks.b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bi = new Int32Array(u.buffer);
    const found = marks.t.filter((name, i) => bi[i] >= 0 && isChurchName(name)).sort();
    /* Every one of these is a church, a synagogue or a chapel. The list is
       written out rather than counted because the failure this guards is a
       BLOCK OF FLATS with a steeple, and a count cannot see that. */
    expect(found).toEqual([
      "Calvary Presbyterian Church",
      "Christian Science Church",
      "Church for the Fellowship of All People",
      "First Baptist Church",
      "First Congregational Church",
      "First Unitarian Church",
      "Glide Memorial Church",
      "Grace Cathedral",
      "Ingleside Presbyterian Church and \"The Great Cloud of Witnesses\"",
      "Notre Dame Des Victoires Church & Rector",
      "Ohabai Shalome/Bush Street Temple",
      "Old Holy Virgin Russian Orthodox Church",
      "Old St. Mary's Church",
      "Old St. Mary's Church Rectory",
      "Old St. Patrick's Church",
      "Our Lady of Guadalupe Church",
      "Presidio Chapel",
      "Sacred Heart Parish Complex",
      "Saint Francis Lutheran Church",
      "Saint Patrick's Church",
      "St Boniface Church",
      "St. Brigid's Church",
      "St. Francis of Assisi Church",
      "St. James Presbyterian Church",
      "St. John's Presbyterian Church",
      "St. Joseph's Catholic Church",
      "St. Joseph's Church and Complex",
      "St. Marks Lutheran Church",
      "St. Matthew's Church",
      "St. Nicholas Cathedral",
      "Swedenborgian Church",
      "Temple Sherith Israel",
      "Third Baptist Church Complex",
      "Trinity Episcopal Church",
      "Trinity Presbyterian Church",
    ]);
  });
});
