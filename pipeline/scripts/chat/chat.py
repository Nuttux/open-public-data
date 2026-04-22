#!/usr/bin/env python3
"""REPL de chat citoyen sur les données open-public-data.

Usage:
    cd pipeline/scripts/chat
    pip install anthropic python-dotenv
    python chat.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import anthropic

sys.path.insert(0, str(Path(__file__).parent))
from system_prompt import SYSTEM_PROMPT
from tools import TOOL_SCHEMAS, run_tool

load_dotenv(Path(__file__).parent / ".env")

MODEL = "claude-opus-4-5"  # défaut stable ; override via env var MODEL
import os as _os
MODEL = _os.environ.get("CHAT_MODEL", MODEL)
MAX_TOKENS = 2000

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def ask(messages: list[dict]) -> str:
    """Envoie messages au modèle et résout les tool calls en boucle."""
    while True:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            tools=TOOL_SCHEMAS,
            messages=messages,
        )

        if resp.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": resp.content})
            tool_results = []
            for block in resp.content:
                if block.type == "tool_use":
                    print(f"  → tool: {block.name}({json.dumps(block.input, ensure_ascii=False)})", file=sys.stderr)
                    result = run_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                    })
            messages.append({"role": "user", "content": tool_results})
            continue

        # end_turn
        text_parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        return "\n".join(text_parts).strip()


def main() -> None:
    print("Chat open-public-data — Ctrl+C pour quitter.\n")
    history: list[dict] = []
    while True:
        try:
            user = input("\033[1m> \033[0m").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user:
            continue
        history.append({"role": "user", "content": user})
        try:
            answer = ask(history)
        except Exception as e:
            print(f"[erreur: {e}]", file=sys.stderr)
            history.pop()
            continue
        history.append({"role": "assistant", "content": answer})
        print(f"\n{answer}\n")


if __name__ == "__main__":
    main()
