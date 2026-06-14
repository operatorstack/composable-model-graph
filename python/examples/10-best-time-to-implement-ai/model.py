"""Model adapter for example 10 - kept IN the example, never in cmg core (the LLM
client is a domain concern; see CLAUDE.md / docs).

It mirrors how intelligence-flow runs terminal-bench calls: LiteLLM with model-string
routing, so switching provider is one env var. Set MODEL to pick the provider:

    # the author's setup: GCP Vertex MaaS, MiniMax, auth via ADC (gcloud)
    export MODEL=vertex_ai/minimaxai/minimax-m2-maas
    export VERTEXAI_PROJECT=your-project VERTEXAI_LOCATION=global

    # regular providers (others testing the example):
    export MODEL=openrouter/qwen/qwen3-coder      # + OPENROUTER_API_KEY
    export MODEL=openai/gpt-4o-mini               # + OPENAI_API_KEY
    export MODEL=gemini/gemini-2.5-flash          # + GEMINI_API_KEY

With no MODEL set (or litellm not installed, or a call failing), it falls back to a
deterministic STUB so the example still runs offline and reproducibly. The stub is a
stand-in for the model, not a real judgment: each seed task carries its canned answer
under `_stub`. The point of the example is the LIVE path, where the model judges.
"""

from __future__ import annotations

import json
import os


def model_name() -> str:
    return os.environ.get("MODEL", "").strip()


def _litellm_available() -> bool:
    try:
        import litellm  # noqa: F401

        return True
    except Exception:
        return False


def mode() -> str:
    name = model_name()
    return f"live:{name}" if (name and _litellm_available()) else "stub"


# --- robust JSON extraction (mirrors operatorstack_harbor.py _first_json_object) ---


def _iter_json_objects(text: str):
    """Yield every balanced top-level JSON object in text. Tolerates fences / prose."""
    i, n = 0, len(text)
    while i < n:
        start = text.find("{", i)
        if start == -1:
            return
        depth, in_str, escape, j = 0, False, False, start
        for j in range(start, n):
            ch = text[j]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        yield json.loads(text[start : j + 1])
                    except json.JSONDecodeError:
                        pass
                    break
        i = max(start + 1, j + 1)


def _first_judgment(text: str) -> dict:
    """First JSON object that carries a 'status' field; else first object; else {}."""
    fallback: dict = {}
    for obj in _iter_json_objects(text):
        if not isinstance(obj, dict):
            continue
        if "status" in obj:
            return obj
        if not fallback:
            fallback = obj
    return fallback


def _normalize(obj: dict) -> dict:
    status = str(obj.get("status", "todo")).lower()
    status = "done" if status == "done" else "todo"
    try:
        value = int(round(float(obj.get("value", 1))))
    except (TypeError, ValueError):
        value = 1
    try:
        cost = int(round(float(obj.get("cost", 1))))
    except (TypeError, ValueError):
        cost = 1
    value = max(1, min(10, value))
    cost = max(1, min(10, cost))
    try:
        confidence = float(obj.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    reason = str(obj.get("reason", "")).strip().replace("\n", " ")
    return {"status": status, "value": value, "cost": cost, "confidence": confidence, "reason": reason}


_SYSTEM = (
    "You assess software task completion from detector evidence. "
    "Reply with exactly one JSON object and nothing else."
)


def _prompt(task: dict) -> str:
    return (
        f"Task: {task['title']}\n"
        f"Definition of done: {task['done_when']}\n"
        f"Evidence (from detectors such as GitHub, deploys, the filesystem):\n"
        f"{task['evidence']}\n\n"
        "Judge whether it is done, and estimate its value and cost. Return one JSON object:\n"
        '{"status": "done" | "todo", "value": <int 1-10>, "cost": <int 1-10>, '
        '"confidence": <float 0-1>, "reason": "<one short sentence>"}'
    )


def _assess_live(task: dict, name: str) -> dict:
    import litellm

    resp = litellm.completion(
        model=name,
        messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": _prompt(task)}],
        temperature=0,
        response_format={"type": "json_object"},
        num_retries=4,
    )
    content = resp.choices[0].message.content or ""
    return _normalize(_first_judgment(content))


def _assess_stub(task: dict) -> dict:
    # Deterministic stand-in: the canned answer the seed carries for offline runs.
    return _normalize(dict(task.get("_stub", {})))


def assess_all(tasks: list[dict]) -> tuple[dict, str]:
    """Return ({task_id: judgment}, mode). Judgment = {status, value, cost, confidence, reason}."""
    name = model_name()
    live = bool(name) and _litellm_available()
    out: dict = {}
    for t in tasks:
        if live:
            try:
                out[t["id"]] = _assess_live(t, name)
                continue
            except Exception:
                live = False  # fall back to stub for the rest if the provider fails
        out[t["id"]] = _assess_stub(t)
    return out, (f"live:{name}" if (name and _litellm_available()) else "stub")
