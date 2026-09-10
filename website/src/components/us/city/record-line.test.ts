/**
 * The rules in `record-line.ts` were written against 100 hand-scored records
 * and then scored again on a held-out 200. These are the cases that changed a
 * verdict — each one is a real line from the published shards, and each one is
 * here because getting it wrong is a defect a reader would see.
 */
import { describe, expect, it } from "vitest";
import {
  compactMoney,
  fileStem,
  statusRank,
  cleanLine,
  formatSum,
  isReadableLine,
  placeOf,
  recordLine,
  trimLine,
  undangle,
  statusWord,
} from "./record-line";

describe("what never becomes a headline", () => {
  it("drops the talking, keeps the record", () => {
    for (const talk of [
      "Supervisor Chan moved that the matter be continued to the call of the Chair",
      "By Supervisor Peskin: that a letter be sent to the Department of Public Works",
      "11 - Avalos, Breed, Campos, Christensen, Cohen, Farrell, Kim, Mar, Tang, Wiener",
      "REFERRED FOR ADOPTION WITHOUT COMMITTEE REFERENCE AGENDA AT THE NEXT MEETING",
    ])
      expect(isReadableLine(talk)).toBe(false);
    expect(
      isReadableLine("Designating The Bransten House at 1735 Franklin Street as a landmark"),
    ).toBe(true);
  });

  it("rejects a list of streets however many streets are in it", () => {
    // the first version matched exactly two joined by a comma
    expect(isReadableLine("Arietta Avenue, Elliott Street and Raymond Avenue")).toBe(false);
    expect(isReadableLine("1198 South Van Ness Avenue; 635 Fulton Street")).toBe(false);
    // a description that happens to name streets is not a list
    expect(
      isReadableLine(
        "Along the westerly side of Fortieth avenue, commencing at a point 100 feet northerly from Santiago street",
      ),
    ).toBe(true);
  });

  it("keeps the appropriations that an over-eager continuation rule would eat", () => {
    // `The`, `To`, `For`, `Of` and `In` are deliberately NOT continuation words
    expect(
      isReadableLine("The sum of $1,865.24 be and the same is hereby set aside and appropriated"),
    ).toBe(true);
    expect(isReadableLine("And ratifying and approving any action heretofore taken")).toBe(false);
  });

  it("cuts a preposition-led scrap only when it is short", () => {
    expect(isReadableLine("In the residence of J. McCluskey, Assistant")).toBe(false);
    expect(
      isReadableLine(
        "For construction of curbs and pavement, southerly one-half of Fulton street from Arguello boulevard",
      ),
    ).toBe(true);
  });
});

describe("cutting the boilerplate out of the middle", () => {
  it("keeps the building when the citation is in front of it", () => {
    const line = cleanLine(
      "Initiating landmark designation under Article 10 of the Planning Code of 2 Henry Adams Street",
    );
    expect(line).toContain("2 Henry Adams Street");
    expect(line).not.toContain("Article 10");
  });

  it("replaces a case number rather than deleting it", () => {
    // deleting left "Approving on property located at 2815 Diamond Street"
    expect(
      cleanLine(
        "Approving Conditional Use Application No. 2002.0124CVR on property located at 2815 Diamond Street",
      ),
    ).toBe("Approving a conditional use on property located at 2815 Diamond Street");
  });

  it("does not turn 'the transfer of a licence' into 'the transfer a licence'", () => {
    // the doubled-article repair once matched "of a", which is good English
    expect(
      cleanLine("Determining that the transfer of a Type 21 off-sale general licence"),
    ).toContain("the transfer of a Type 21");
    expect(cleanLine("Authorizing the a multifamily housing revenue note")).toContain(
      "Authorizing a multifamily",
    );
  });

  it("takes the modern Clerk's bracket and leaves the file number and sponsors", () => {
    expect(
      cleanLine(
        "150879 [Multifamily Housing Revenue Note - 666 Ellis Street - Not to Exceed $22,168,000] Sponsors: Mayor, Kim",
      ),
    ).toBe("Multifamily Housing Revenue Note - 666 Ellis Street - Not to Exceed $22,168,000");
  });

  it("keeps a building's alias and cuts one the scan broke off", () => {
    expect(
      cleanLine("Approving map of 728 Pacific Avenue, also known as Miriwa Center"),
    ).toContain("Miriwa Center");
    expect(cleanLine("Approving map of 1255 California Street, also known as the")).toBe(
      "Approving map of 1255 California Street",
    );
  });

  it("never ends a line on a function word", () => {
    expect(undangle("Amending City Planning Code by adding Section 249 to create an")).toBe(
      "Amending City Planning Code by adding Section 249 to create",
    );
    expect(trimLine("Install Telephones — In the Hancock School, Greenwich street near")).not.toMatch(
      /\bnear$/,
    );
  });

  it("trims at a clause boundary, not at the character that fits", () => {
    const long =
      "Authorizing the Director of Property, on behalf of the Department of Homelessness and Supportive Housing, to execute a lease";
    const cut = trimLine(long);
    expect(cut.length).toBeLessThanOrEqual(114);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/\s(of|the|to|on)…$/);
  });
});

describe("where it happened", () => {
  it("prefers the street in the sentence over the block's cross-streets", () => {
    // the block is not wrong — it is just not the street the sentence names
    expect(
      placeOf(
        "Along the easterly side of Nineteenth avenue, commencing at Pacheco street",
        "23rd Ave · 24th Ave",
      ),
    ).toBe("Nineteenth Ave");
    expect(placeOf("Pacific Hat Co., at 741 Mission street, 10 horsepower", "3rd St · 4th St")).toBe(
      "741 Mission Street",
    );
  });

  it("falls back to the block when the line names nothing", () => {
    expect(placeOf("Confirming report of assessment costs", "Bush St · Pierce St")).toBe(
      "Bush St · Pierce St",
    );
    expect(placeOf("Confirming report of assessment costs", null)).toBe(null);
  });
});

describe("the outcome word", () => {
  it("reads the status the line itself carries, and nothing else", () => {
    expect(statusWord("Bike lanes on Fell Street finally passed")).toBe("passed");
    expect(statusWord("Loan for the Opera House, adopted")).toBe("passed");
    expect(statusWord("Zoning change passed on first reading")).toBe("moving");
    expect(statusWord("Garage permit sent to committee")).toBe("moving");
    expect(statusWord("$600,000 sought for safety work on Market Street")).toBe("proposed");
    expect(statusWord("Reflector sign installed on Fourteenth Street")).toBeNull();
  });
});

describe("how much", () => {
  it("reads a sum and ignores a width", () => {
    expect(formatSum("Not to Exceed $22,168,000")).toBe("$22.2M");
    expect(formatSum("The sum of $1,865.24 be and the same is hereby set aside")).toBe("$1,865");
    // "732 Sacramento street, 27 feet" carries no money at all
    expect(formatSum("732 Sacramento street, 27 feet — Kung Wo")).toBe(null);
    expect(formatSum("$40 for the repair")).toBe(null);
  });
});

describe("the row", () => {
  it("uses the line when it reads and the subject when it does not", () => {
    const good = recordLine(
      "Designating The Bransten House at 1735 Franklin Street as a landmark",
      "Landmarks and old buildings",
      "Franklin St · Sacramento St",
    );
    expect(good.headline).toBe(
      "Designating The Bransten House at 1735 Franklin Street as a landmark",
    );
    expect(good.tag).toBe("Landmarks and old buildings");
    expect(good.place).toBe("1735 Franklin Street");

    const bad = recordLine(
      "Arietta Avenue, Elliott Street and Raymond Avenue",
      "The city buys land",
      "Arietta Ave · Leland Ave",
    );
    expect(bad.headline).toBe("The city buys land");
    expect(bad.tag).toBe(null);
  });

  it("leaves nothing to print when there is no line and no subject", () => {
    const empty = recordLine("Ayes: 9", null, null);
    expect(empty.headline).toBe(null);
  });
});

describe("money, one way", () => {
  it("compacts a long figure of a million or more", () => {
    expect(compactMoney("Transdev paratransit contract to rise to $339,102,572 over two more years"))
      .toBe("Transdev paratransit contract to rise to $339.1M over two more years");
    expect(compactMoney("$1,500,000 state prohousing grant sought")).toBe("$1.5M state prohousing grant sought");
  });
  it("leaves short figures and words alone", () => {
    expect(compactMoney("$450,000 for a school site")).toBe("$450,000 for a school site");
    expect(compactMoney("$9 billion of airport bond proceeds")).toBe("$9 billion of airport bond proceeds");
    expect(compactMoney("$20.1M, adopted")).toBe("$20.1M, adopted");
  });
});

describe("one file, several steps", () => {
  it("folds the procedural steps of one file to one stem", () => {
    const a = fileStem("Police policy for electronic location trackers finally passed");
    const b = fileStem("Police policy for electronic location trackers moved for approval");
    const c = fileStem("Police policy for electronic location trackers passed on first reading");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it("folds a contract's two money lines", () => {
    expect(fileStem("Rafiki Coalition health access contract to rise to $20,083,870"))
      .toBe(fileStem("Rafiki Coalition health access contract raised to $20.1M, adopted"));
  });
  it("keeps different files apart", () => {
    expect(fileStem("Chain store rules would be loosened across the city"))
      .not.toBe(fileStem("More uses to be allowed in historic buildings citywide"));
  });
  it("ranks the final vote above the first reading above committee", () => {
    expect(statusRank("X finally passed")).toBeGreaterThan(statusRank("X passed on first reading"));
    expect(statusRank("X passed on first reading")).toBeGreaterThan(statusRank("X sent to committee"));
  });
});
