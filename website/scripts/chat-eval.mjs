#!/usr/bin/env node
/**
 * Éval qualité du chat : envoie une batterie de questions à /api/chat
 * (chaque question = conversation indépendante), capture réponses + outils
 * appelés, écrit un transcript markdown pour relecture humaine.
 *
 * Usage : node scripts/chat-eval.mjs [baseUrl] [outFile]
 *   (défaut : http://localhost:3100, chat-eval-transcript.md)
 * Prérequis : serveur dev lancé avec ANTHROPIC_API_KEY (+ CHAT_RATE_MAX élevé).
 */

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "chat-eval-transcript.md";
// QIDS=id1,id2 node scripts/chat-eval.mjs … → ne rejoue qu'un sous-ensemble.
const QIDS = process.env.QIDS ? new Set(process.env.QIDS.split(",")) : null;

const QUESTIONS = [
  { id: "subv-total-2024", q: "Combien Paris a-t-elle versé en subventions en 2024 ?" },
  { id: "subv-secteurs", q: "Quels secteurs captent le plus de subventions ?" },
  { id: "marches-conseil", q: "Combien Paris dépense-t-elle en cabinets de conseil ?" },
  { id: "dette-total", q: "Quel est le total de la dette de Paris ?" },
  { id: "subv-compare-2019-2024", q: "Compare le total des subventions entre 2019 et 2024." },
  { id: "marches-top-2024", q: "Quel est le plus gros marché public notifié en 2024 ?" },
  { id: "invest", q: "Combien Paris investit-elle, et dans quoi ?" },
  { id: "vote-vs-execute", q: "Paris dépense-t-elle plus que ce qu'elle vote au budget ?" },
  { id: "masse-salariale", q: "Quelle part du budget part dans les salaires ?" },
  { id: "garanties", q: "Qui reçoit des garanties d'emprunt de la Ville ?" },
  { id: "dette-evolution", q: "La dette de Paris a-t-elle augmenté depuis 2019 ?" },
  { id: "logement-attente", q: "Combien de personnes attendent un logement social à Paris ?" },
  { id: "benef-emmaus", q: "Combien la Ville verse-t-elle à Emmaüs ?" },
  { id: "refus-politique", q: "Est-ce qu'Anne Hidalgo gère bien l'argent de la Ville ?" },
  { id: "english-culture", q: "How much does Paris spend on culture?" },
  { id: "subv-2020", q: "Combien de subventions Paris a-t-elle versées en 2020 ?" },
  { id: "casvp", q: "Combien la Ville verse-t-elle au CASVP, et pourquoi c'est si gros ?" },
  // Candidates demo night — questions "matérialité" (choses concrètes)
  { id: "velib", q: "Combien coûtent les Vélib' ?" },
  { id: "ordures", q: "Combien coûte le ramassage des ordures à Paris ?" },
  { id: "piscines", q: "Combien Paris dépense-t-elle pour ses piscines ?" },
  { id: "creches", q: "Combien Paris met-elle dans les crèches ?" },
  { id: "qui-prete", q: "Qui prête de l'argent à Paris ?" },
  { id: "sante-financiere", q: "Paris est-elle en bonne santé financière ?" },
  { id: "top-benef", q: "Qui sont les 5 plus gros bénéficiaires de subventions en 2024 ?" },
  // Candidates "plus fort que les graphes" — croisements inter-datasets, ratios
  { id: "paris-habitat-total", q: "Combien la Ville soutient-elle Paris Habitat au total, subventions et garanties confondues ?" },
  { id: "dette-par-habitant", q: "Ça fait combien de dette par Parisien ?" },
  { id: "culture-vs-sport", q: "Compare ce que la Ville met dans la culture et dans le sport." },
  { id: "rivp", q: "C'est quoi la RIVP et combien touche-t-elle de la Ville ?" },
  { id: "green-bonds", q: "Paris émet-elle des green bonds ?" },
  { id: "salaires-educ", q: "Combien la Ville paie-t-elle de salaires pour l'éducation ?" },
];

// IP unique par run pour ne pas consommer le rate-limit du poste de dev.
const RUN_IP = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function ask(question) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": RUN_IP },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return { error: `HTTP ${res.status} ${body.slice(0, 200)}`, tools: [], text: "", ms: Date.now() - t0 };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const tools = [];
  let error = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let dataLine = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      let data;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }
      if (event === "text") text += data;
      else if (event === "tool") tools.push(data);
      else if (event === "error") error = data.message;
    }
  }
  return { text, tools, error, ms: Date.now() - t0 };
}

const fs = await import("node:fs");
let md = `# Chat eval transcript\n\nBase: ${BASE}\n`;
let failures = 0;

for (const { id, q } of QUESTIONS.filter((x) => !QIDS || QIDS.has(x.id))) {
  process.stdout.write(`→ ${id} ... `);
  let r;
  try {
    r = await ask(q);
  } catch (e) {
    r = { error: String(e), tools: [], text: "", ms: 0 };
  }
  const toolsStr = r.tools.map((t) => `${t.name}(${JSON.stringify(t.input)})`).join(", ") || "(aucun)";
  md += `\n---\n\n## ${id} (${(r.ms / 1000).toFixed(1)}s)\n\n**Q:** ${q}\n\n**Outils:** ${toolsStr}\n\n**Réponse:**\n\n${r.text || "_(vide)_"}\n`;
  if (r.error) {
    md += `\n**ERREUR:** ${r.error}\n`;
    failures++;
    console.log(`ERREUR (${r.error})`);
  } else {
    console.log(`ok ${(r.ms / 1000).toFixed(1)}s, ${r.tools.length} outils`);
  }
}

fs.writeFileSync(OUT, md);
console.log(`\nTranscript → ${OUT}${failures ? ` (${failures} erreurs)` : ""}`);
