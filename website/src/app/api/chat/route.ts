import Anthropic from "@anthropic-ai/sdk";
import { resolveScope } from "@/lib/chat/scopes";
import { captureChatQuestion, distinctIdFromCookie } from "@/lib/chat/telemetry";
import { systemPromptFor, toolSchemasFor, runScopedTool } from "@/lib/chat/registry";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-5";
// Adaptive thinking (le modèle dose lui-même) ; max_tokens couvre thinking + texte + tool_use.
const MAX_TOKENS = 12000;
const MAX_TOOL_LOOPS = 8;

type ChatMessage = { role: "user" | "assistant"; content: string };

// Simple in-memory rate limit per IP. OK pour un seul process Next.js.
// Pour du multi-instance, brancher Upstash Redis.
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h
const RATE_MAX_REQ = Number(process.env.CHAT_RATE_MAX ?? 20);
const rateMap = new Map<string, number[]>();
function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX_REQ) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - arr[0])) / 1000);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  rateMap.set(ip, arr);
  // GC occasionnel
  if (rateMap.size > 5000) {
    for (const [k, v] of rateMap) if (v.every((t) => now - t > RATE_WINDOW_MS)) rateMap.delete(k);
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: `Trop de requêtes. Réessaie dans ${Math.ceil((rl.retryAfter ?? 60) / 60)} min.` }),
      { status: 429, headers: { "retry-after": String(rl.retryAfter ?? 60) } },
    );
  }

  let body: { messages?: ChatMessage[]; locale?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }
  const history = body.messages ?? [];
  if (!history.length) return new Response(JSON.stringify({ error: "empty" }), { status: 400 });
  if (history.length > 30) return new Response(JSON.stringify({ error: "conversation trop longue" }), { status: 400 });
  for (const m of history) {
    if (typeof m.content !== "string" || m.content.length > 4000) {
      return new Response(JSON.stringify({ error: "message invalide" }), { status: 400 });
    }
  }

  // La ville vient du client (la page que le lecteur regarde) mais n'est JAMAIS
  // prise au mot : resolveScope ne rend qu'un scope connu, Paris par défaut.
  // Le modèle ne reçoit ensuite que les outils de ce scope — il n'a aucun
  // paramètre par lequel demander les données d'une autre ville.
  const scope = resolveScope(body.scope);

  // Variantes stables du system par (scope, langue) — chacune reste cacheable.
  const sessionLang =
    scope.promptLang === "fr" && body.locale === "en"
      ? "\n\n# Langue de session\nL'interface de l'utilisateur est en ANGLAIS. Réponds ENTIÈREMENT en anglais — texte, tableaux, libellés de liens et relances <followups> — sauf si l'utilisateur écrit explicitement en français."
      : scope.promptLang === "en" && body.locale === "fr"
        ? "\n\n# Session language\nThe user's interface is in FRENCH. Answer ENTIRELY in French — prose, tables, link labels and <followups> — unless the user explicitly writes in English."
        : "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "missing key" }), { status: 500 });
  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  // Telemetry for the product digest (lib/chat/telemetry.ts): one event per answer.
  const startedAt = Date.now();
  const distinctId = distinctIdFromCookie(req.headers.get("cookie"));
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const toolsUsed: string[] = [];
  let toolResultChars = 0;
  let answerChars = 0;
  const record = (stopReason: string | null, error: string | null) =>
    captureChatQuestion(distinctId, {
      scope: scope.id,
      locale: body.locale ?? scope.promptLang,
      question: lastUser?.content ?? "",
      turn: history.filter((m) => m.role === "user").length,
      tools: toolsUsed,
      n_tool_calls: toolsUsed.length,
      tool_result_chars: toolResultChars,
      answer_chars: answerChars,
      stop_reason: stopReason,
      error,
      duration_ms: Date.now() - startedAt,
      page: req.headers.get("referer"),
      ...(ip !== "unknown" ? { $ip: ip } : {}),
    });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const deadline = Date.now() + 80_000; // sous maxDuration, coupe proprement
        for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
          if (Date.now() > deadline) {
            send("error", { message: "réponse trop longue, réessaie avec une question plus ciblée" });
            void record(null, "deadline");
            controller.close();
            return;
          }
          const turn = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive" },
            system: [
              { type: "text", text: systemPromptFor(scope) + sessionLang, cache_control: { type: "ephemeral" } },
            ],
            tools: toolSchemasFor(scope) as unknown as Anthropic.Tool[],
            messages,
          });

          let thinkingNotified = false;
          turn.on("streamEvent", (event) => {
            if (
              !thinkingNotified &&
              event.type === "content_block_start" &&
              event.content_block.type === "thinking"
            ) {
              thinkingNotified = true;
              send("thinking", { active: true });
            }
          });
          turn.on("text", (delta: string) => {
            answerChars += delta.length;
            send("text", delta);
          });

          const final = await turn.finalMessage();

          if (final.stop_reason === "tool_use") {
            // Le modèle écrit souvent une phrase AVANT de décider d'appeler un
            // outil ("je n'ai pas 1985…"), puis rédige la vraie réponse au tour
            // suivant : sans reset, le panneau affichait les deux collées, et
            // l'accroche chiffrée se retrouvait au milieu du texte. On jette le
            // texte partiel — le tour final le réénonce toujours en entier.
            if (final.content.some((b) => b.type === "text" && b.text.trim())) {
              send("reset", {});
              answerChars = 0;
            }
            messages.push({ role: "assistant", content: final.content });
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type === "tool_use") {
                send("tool", { name: block.name, input: block.input });
                const result = runScopedTool(scope, block.name, block.input);
                toolsUsed.push(block.name);
                toolResultChars += JSON.stringify(result).length;
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              }
            }
            messages.push({ role: "user", content: toolResults });
            continue;
          }

          send("done", { stop_reason: final.stop_reason });
          void record(final.stop_reason, null);
          controller.close();
          return;
        }
        send("error", { message: "tool loop limit reached" });
        void record(null, "tool loop limit reached");
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { message: msg });
        void record(null, msg.slice(0, 200));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
