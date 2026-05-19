import fs from "node:fs/promises";
import path from "node:path";

export type CorrectionCategory = "data" | "methodology" | "editorial";

export type CorrectionEntry = {
  id: string;
  date: string;
  category: CorrectionCategory;
  scope: string;
  title: { fr: string; en: string };
  summary: { fr: string; en: string };
  trigger?: { fr: string; en: string };
  before?: { fr: string; en: string };
  after?: { fr: string; en: string };
  links?: Array<{ label: string; url: string }>;
};

export type CorrectionsDoc = {
  version: string;
  policy: { fr: string; en: string };
  entries: CorrectionEntry[];
};

export async function loadCorrections(): Promise<CorrectionsDoc> {
  const filePath = path.join(process.cwd(), "public/data/corrections.json");
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as CorrectionsDoc;
  parsed.entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  return parsed;
}
