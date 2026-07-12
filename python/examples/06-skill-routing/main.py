#!/usr/bin/env python3
"""
Example 06 - Skill Routing (inspect + compare). Python parity of
typescript/examples/06-skill-routing.

The thesis in one runnable demo: a model-powered system becomes inspectable and
comparable when it is a graph. We route coding tasks to the right "skill" two
ways and compare the runs:

    Graph A  task -> naive keyword route -> skill            (no structured context)
    Graph B  task -> extract requirements -> select skill    (structured context)

Each step records signals (tokens, cost) via ctx.record_signal. An exact-match
evaluator scores chosen-skill vs expected-skill. The report shows accuracy,
cost, and WHERE error enters in the trace - not just a final number. Wall-clock
duration is intentionally NOT printed (it is the one nondeterministic signal;
compare_runs still aggregates it under "duration_ms" for the caller).

Run (no install needed):
    python3 python/examples/06-skill-routing/main.py
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    compare_runs,
    create_model_graph,
    create_transform,
    exact_match_evaluator,
)


@dataclass
class Skill:
    id: str  # skill identifier (also the routing answer)
    primary: str  # the single obvious keyword a naive router keys on
    tags: list[str]  # full keyword set a structured router scores against


@dataclass
class RoutingTask:
    task_text: str
    expected_skill: str


SKILLS = [
    Skill("payment-webhook-skill", "webhook",
          ["webhook", "stripe", "idempotency", "payment", "signature", "charge"]),
    Skill("auth-session-skill", "auth",
          ["auth", "login", "session", "jwt", "oauth", "token", "password"]),
    Skill("db-migration-skill", "migration",
          ["migration", "schema", "sql", "drizzle", "postgres", "index", "column"]),
    Skill("ui-form-skill", "form",
          ["form", "react", "validation", "input", "component", "field", "submit"]),
    Skill("email-notification-skill", "email",
          ["email", "smtp", "template", "notification", "send", "inbox"]),
]

TASKS = [
    RoutingTask("Fix Stripe webhook idempotency failing test", "payment-webhook-skill"),
    RoutingTask("Webhook endpoint returns 200 but charge not marked paid", "payment-webhook-skill"),
    RoutingTask("Stripe signature verification rejects valid events", "payment-webhook-skill"),
    RoutingTask("Login session expires too early after refresh", "auth-session-skill"),
    RoutingTask("JWT token not validated on protected routes", "auth-session-skill"),
    RoutingTask("Users stay logged in after password reset", "auth-session-skill"),
    RoutingTask("Schema migration drops column on rollback", "db-migration-skill"),
    RoutingTask("Postgres index not created after deploy", "db-migration-skill"),
    RoutingTask("Drizzle schema out of sync with database", "db-migration-skill"),
    RoutingTask("Form validation passes on empty required input", "ui-form-skill"),
    RoutingTask("React component re-renders and clears field value", "ui-form-skill"),
    RoutingTask("Submit button stays disabled after valid entry", "ui-form-skill"),
    RoutingTask("Email template renders broken on mobile inbox", "email-notification-skill"),
    RoutingTask("SMTP send fails silently for notification queue", "email-notification-skill"),
    RoutingTask("Index page form submit triggers a payment charge", "ui-form-skill"),
]

# Cost per token (USD). Static demo rate; only the relative cost matters.
RATE = 0.00002
REGISTRY_TOKENS = sum(len(s.tags) for s in SKILLS)


def words(text: str) -> list[str]:
    return [w for w in text.split() if w]


def round6(x: float) -> float:
    return round(x * 1e6) / 1e6


# ----- Graph A: naive single-keyword routing (no structured context) -----

def _naive_route(task: RoutingTask, ctx) -> str:
    tokens = len(words(task.task_text))
    ctx.record_signal("tokens", tokens)
    ctx.record_signal("cost_usd", round6(tokens * RATE))
    text = task.task_text.lower()
    for s in SKILLS:
        if s.primary in text:
            return s.id
    # No keyword matched: fall back to the most common skill (a naive prior).
    return SKILLS[0].id


graph_a = create_model_graph(
    "skill-route-a", "Graph A - naive route",
    [create_transform("naive-route", "Naive keyword route", _naive_route)],
    evaluator=exact_match_evaluator(),
)


# ----- Graph B: structured routing (extract requirements, score all tags) -----

def _extract_requirements(task: RoutingTask, ctx) -> dict:
    keywords = [w.lower() for w in words(task.task_text)]
    ctx.record_signal("tokens", len(keywords))
    ctx.record_signal("requirement_count", len(keywords))
    return {"text": task.task_text, "keywords": keywords}


def _select_skill(req: dict, ctx) -> str:
    # Structured routing reads the whole skill registry as context: more
    # tokens/cost than Graph A, but the signal it buys is higher accuracy.
    tokens = len(req["keywords"]) + REGISTRY_TOKENS
    ctx.record_signal("tokens", tokens)
    ctx.record_signal("cost_usd", round6(tokens * RATE))
    text = req["text"].lower()
    best = SKILLS[0]
    best_score = -1
    for skill in SKILLS:
        score = sum(1 for tag in skill.tags if tag in text)
        if score > best_score:
            best_score = score
            best = skill
    return best.id


graph_b = create_model_graph(
    "skill-route-b", "Graph B - structured route",
    [
        create_transform("extract-requirements", "Extract requirements", _extract_requirements),
        create_transform("select-skill", "Select skill (tag overlap)", _select_skill),
    ],
    evaluator=exact_match_evaluator(),
)


def run_over_tasks(graph, tasks):
    return [graph.run(t, target=t.expected_skill) for t in tasks]


def totals(runs):
    passed = tokens = 0
    cost_usd = 0.0
    for run in runs:
        if run.evaluation and run.evaluation.status == "pass":
            passed += 1
        for step in run.trace:
            m = step.metadata or {}
            if isinstance(m.get("tokens"), (int, float)):
                tokens += m["tokens"]
            if isinstance(m.get("cost_usd"), (int, float)):
                cost_usd += m["cost_usd"]
    return {
        "pass": passed,
        "total": len(runs),
        "accuracy": 0.0 if not runs else passed / len(runs),
        "tokens": tokens,
        "cost_usd": round6(cost_usd),
    }


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def print_comparison(label: str, cmp) -> None:
    print(f"\n{label}")
    print(f"  verdict:       {cmp.better}  ({cmp.reason})")
    print(f"  status:        A={cmp.status['a']} B={cmp.status['b']}")
    print(f"  score delta:   {cmp.score['delta'] if cmp.score['delta'] is not None else 'n/a'}")
    toks = cmp.signals.get("tokens")
    cost = cmp.signals.get("cost_usd")
    if toks:
        print(f"  tokens:        A={toks.a} B={toks.b} (delta {toks.delta})")
    if cost:
        print(f"  cost_usd:      A={cost.a} B={cost.b} (delta {round6(cost.delta)})")
    # duration_ms is aggregated by compare_runs but intentionally not printed.
    print(f"  diverged@step: {cmp.diverged_at_step if cmp.diverged_at_step is not None else 'none'}")


runs_a = run_over_tasks(graph_a, TASKS)
runs_b = run_over_tasks(graph_b, TASKS)

t_a = totals(runs_a)
t_b = totals(runs_b)

print("Skill Routing - Graph A (naive) vs Graph B (structured)\n")
print("Per-task (expected | A | B):")
for i, task in enumerate(TASKS):
    a, b = runs_a[i], runs_b[i]
    a_mark = "ok  " if a.evaluation.status == "pass" else "FAIL"
    b_mark = "ok  " if b.evaluation.status == "pass" else "FAIL"
    print(f"  {task.task_text[:46]:<48} {task.expected_skill:<24} "
          f"A:{a_mark} {str(a.output):<24} B:{b_mark} {b.output}")

delta_pp = (t_b["accuracy"] - t_a["accuracy"]) * 100
print("\nAggregate:")
print(f"  accuracy:   A {pct(t_a['accuracy'])}   B {pct(t_b['accuracy'])}   "
      f"({'+' if delta_pp >= 0 else ''}{delta_pp:.1f}pp)")
print(f"  tokens:     A {t_a['tokens']}        B {t_b['tokens']}")
print(f"  cost_usd:   A {t_a['cost_usd']}    B {t_b['cost_usd']}")

# Trace-level failure localization for Graph B.
failed_b = [r for r in runs_b if r.evaluation.status == "fail"]
extract_ok_in_failures = 0
for r in failed_b:
    ex = next((s for s in r.trace if s.transform_id == "extract-requirements"), None)
    rc = (ex.metadata or {}).get("requirement_count") if ex else None
    if isinstance(rc, (int, float)) and rc > 0:
        extract_ok_in_failures += 1

print("\nTrace-level failure localization (Graph B):")
print(f"  failed runs: {len(failed_b)}/{t_b['total']}")
print(f"  of those, requirement-extraction succeeded in {extract_ok_in_failures}/{len(failed_b)}")
print("  => error enters at the 'select-skill' step, not 'extract-requirements'")

# Two representative comparisons: one where B wins, one where A wins (honest).
b_wins = next((i for i in range(len(TASKS))
               if runs_a[i].evaluation.status == "fail"
               and runs_b[i].evaluation.status == "pass"), -1)
if b_wins >= 0:
    print_comparison(
        f'compare_runs - task "{TASKS[b_wins].task_text}" (B should win):',
        compare_runs(runs_a[b_wins], runs_b[b_wins]),
    )

a_wins = next((i for i in range(len(TASKS))
               if runs_a[i].evaluation.status == "pass"
               and runs_b[i].evaluation.status == "fail"), -1)
if a_wins >= 0:
    print_comparison(
        f'compare_runs - task "{TASKS[a_wins].task_text}" (A wins; B tie-break weakness):',
        compare_runs(runs_a[a_wins], runs_b[a_wins]),
    )

print("\nReading: B is far more accurate but spends more tokens/cost (the registry context).")
print("The trace shows the tradeoff and where error enters - the system is inspectable, not vibe-based.")
