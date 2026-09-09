/**
 * Server-side PostHog event for the chat — the browser SDK never sees the
 * question (the route streams it), so the API route records one
 * `chat_question` per answer: what was asked, in which scope, which tools ran,
 * whether it failed. Read weekly by the product digest routine.
 *
 * Fire-and-forget: a failure here never touches the answer. The visitor id is
 * the browser SDK's own (cookie `ph_<key>_posthog`), so the question joins the
 * person's pageviews in PostHog. Nothing else identifying is sent.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = "https://eu.i.posthog.com";

export type ChatQuestionProps = {
  scope: string;
  /** typed = organic; suggestion / followup / page_chip = our own prompts clicked. */
  origin: string;
  locale: string;
  question: string;
  turn: number;
  tools: string[];
  n_tool_calls: number;
  tool_result_chars: number;
  answer_chars: number;
  stop_reason: string | null;
  error: string | null;
  duration_ms: number;
  page: string | null;
  $ip?: string;
};

/** The browser SDK's visitor id, from its cookie, so server events join the person. */
export function distinctIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader || !KEY) return null;
  const name = `ph_${KEY}_posthog=`;
  const part = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(name));
  if (!part) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(part.slice(name.length))) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" ? parsed.distinct_id : null;
  } catch {
    return null;
  }
}

export function captureChatQuestion(distinctId: string | null, props: ChatQuestionProps): Promise<void> {
  if (!KEY) return Promise.resolve();
  const body = {
    api_key: KEY,
    event: "chat_question",
    distinct_id: distinctId ?? "chat-anonymous",
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      question: props.question.slice(0, 500),
      $lib: "qipu-server",
      // An anonymous id must not create a person profile per question.
      ...(distinctId ? {} : { $process_person_profile: false }),
    },
  };
  return fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  })
    .then(() => undefined)
    .catch(() => undefined);
}
