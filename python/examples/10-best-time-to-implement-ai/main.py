#!/usr/bin/env python3
"""
Example 10 - AI judges state, the graph schedules (simulated detectors, real model calls)

Example 09 was the raw, deterministic scheduler: task state (done / not, value, cost)
was given as data. This example fills that state with a MODEL. Each task carries a
plain-language `done_when` and `evidence` simulated from detectors (GitHub, deploys,
the filesystem). The `assess` stage - the seam example 09 reserved - is now a real
model-call transform: the model reads the evidence and judges {status, value, cost}.
The scheduler below it is UNCHANGED; it just consumes what the model produced.

The detectors are simulated; the AI is real. That is the point: this is the template
Tower implements later by swapping the simulated evidence for real detectors (GitHub
webhooks, GCP probes), with the same assess -> schedule graph.

Run:
    python3 python/examples/10-best-time-to-implement-ai/main.py          # offline stub
    MODEL=vertex_ai/minimaxai/minimax-m2-maas \\
      VERTEXAI_PROJECT=... VERTEXAI_LOCATION=global python3 .../main.py    # live (author)
    MODEL=openrouter/qwen/qwen3-coder OPENROUTER_API_KEY=... python3 .../main.py  # live (others)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    create_model_graph,
    create_transform,
    rank_sensitivity,
    useful_flow_score,
)

from model import assess_all  # noqa: E402

# The seed backlog: a generic small project shipping v1 (same shape as example 09).
# No status / value / cost here - the model infers those from `evidence`. Each task
# also carries `_stub`: the deterministic answer used only for the offline stub run,
# so the example reproduces a stable schedule with no key. The live model ignores it.
SEED = [
    {
        "id": "scaffold", "title": "Set up project scaffold", "deps": [],
        "done_when": "the repo is scaffolded with a build config",
        "evidence": "github: initial commit present; package.json + tsconfig committed; build config in place",
        "_stub": {"status": "done", "value": 3, "cost": 1, "confidence": 0.95, "reason": "scaffold + build config committed"},
    },
    {
        "id": "ci", "title": "Set up CI", "deps": ["scaffold"],
        "done_when": "CI runs the tests on every push to main",
        "evidence": "github: no workflow file under .github/workflows; the Actions tab is empty",
        "_stub": {"status": "todo", "value": 5, "cost": 2, "confidence": 0.9, "reason": "no workflow file; Actions empty"},
    },
    {
        "id": "auth", "title": "Add authentication", "deps": ["scaffold"],
        "done_when": "users can sign in",
        "evidence": "github: no auth module in src/; issue #12 'add login' is open",
        "_stub": {"status": "todo", "value": 8, "cost": 4, "confidence": 0.9, "reason": "no auth module; login issue open"},
    },
    {
        # Ambiguous on purpose: code exists, but on an unmerged PR. A real judgment call.
        "id": "storage-adapter", "title": "Build the storage adapter", "deps": ["scaffold"],
        "done_when": "the storage adapter is implemented and merged to main",
        "evidence": "github: PR #142 'storage adapter' is OPEN with CI green; src/storage_adapter.py exists on the branch and exports put()/get(); not yet merged to main",
        "_stub": {"status": "todo", "value": 4, "cost": 3, "confidence": 0.6, "reason": "code on an open PR (#142), not merged"},
    },
    {
        "id": "api-docs", "title": "Write API docs", "deps": ["auth"],
        "done_when": "the public API is documented",
        "evidence": "github: docs/ holds only a TODO stub; no API reference page",
        "_stub": {"status": "todo", "value": 3, "cost": 1, "confidence": 0.85, "reason": "docs are a TODO stub"},
    },
    {
        "id": "move-assets", "title": "Move assets into object storage", "deps": ["storage-adapter"],
        "done_when": "assets are served from object storage",
        "evidence": "deploy: the storage bucket is empty; the CLI has no 'assets push' command; no related PR",
        "_stub": {"status": "todo", "value": 8, "cost": 2, "confidence": 0.9, "reason": "bucket empty; no assets command"},
    },
    {
        "id": "tests", "title": "Write integration tests", "deps": ["auth", "storage-adapter"],
        "done_when": "integration tests cover the core flows",
        "evidence": "github: tests/ directory is empty; CI has no test step",
        "_stub": {"status": "todo", "value": 5, "cost": 3, "confidence": 0.9, "reason": "tests dir empty; no CI test step"},
    },
    {
        "id": "ship-v1", "title": "Ship v1", "deps": ["ci", "api-docs", "move-assets", "tests"],
        "done_when": "v1 is tagged and released",
        "evidence": "github: no release tag; milestone 'v1' is 0% complete",
        "_stub": {"status": "todo", "value": 10, "cost": 2, "confidence": 0.95, "reason": "no release tag; milestone 0%"},
    },
]

# Filled by the assess stage; the scheduler helpers read these (as in example 09).
_TASKS: list[dict] = []
_BY_ID: dict[str, dict] = {}


def get(task_id):
    return _BY_ID[task_id]


def is_done(task_id) -> bool:
    return get(task_id)["status"] == "done"


def phi_of(t) -> float:
    return useful_flow_score(t["value"], t["cost"]).score


def unmet_deps(t):
    return [d for d in t["deps"] if not is_done(d)]


def longest_cost_path():
    memo = {}

    def dist(task_id):
        if task_id in memo:
            return memo[task_id]
        t = get(task_id)
        best = {"dist": t["cost"], "via": None}
        for d in t["deps"]:
            through = t["cost"] + dist(d)["dist"]
            if through > best["dist"]:
                best = {"dist": through, "via": d}
        memo[task_id] = best
        return best

    end_id = _TASKS[0]["id"] if _TASKS else ""
    end_dist = float("-inf")
    for t in _TASKS:
        d = dist(t["id"])["dist"]
        if d > end_dist:
            end_dist = d
            end_id = t["id"]
    path = []
    cur = end_id
    while cur:
        path.insert(0, cur)
        cur = dist(cur)["via"]
    return {"path": path, "cost": end_dist}


def total_available_phi(progress) -> float:
    total = 0.0
    for t in _TASKS:
        avail = 1.0
        for d in t["deps"]:
            avail *= progress.get(d, 0.0)
        total += phi_of(t) * avail
    return total


def directly_unblocks(task_id):
    return [
        t["id"]
        for t in _TASKS
        if t["status"] == "todo" and task_id in t["deps"] and unmet_deps(t) == [task_id]
    ]


# Pipeline: assess (real model call) -> classify -> prioritize. The scheduler stages
# are identical to example 09; only assess changed from identity to a model call.
def _assess(seed, ctx):
    global _TASKS, _BY_ID
    judgments, run_mode = assess_all(seed)
    _TASKS = [{"id": t["id"], "title": t["title"], "deps": t["deps"], **judgments[t["id"]]} for t in seed]
    _BY_ID = {t["id"]: t for t in _TASKS}
    ctx.record_signal("assessed", len(_TASKS))
    return {"tasks": _TASKS, "judgments": judgments, "mode": run_mode}


def _classify(s, ctx):
    done, ready, blocked = [], [], []
    for t in s["tasks"]:
        if t["status"] == "done":
            done.append(t["id"])
        elif len(unmet_deps(t)) == 0:
            ready.append(t["id"])
        else:
            blocked.append({"id": t["id"], "until": unmet_deps(t)})
    ctx.record_signal("ready", len(ready))
    return {**s, "done": done, "ready": ready, "blocked": blocked}


def _prioritize(s, ctx):
    order = sorted(s["ready"], key=lambda i: (-phi_of(get(i)), i))
    cp = longest_cost_path()
    ctx.record_signal("critical_cost", cp["cost"])
    return {**s, "order": order, "doNow": order[0] if order else None, "criticalPath": cp["path"], "criticalCost": cp["cost"]}


planner = create_model_graph(
    "best-time-to-implement-ai",
    "Best Time To Implement (AI-assessed)",
    [
        create_transform("assess", "Assess", _assess),
        create_transform("classify", "Classify", _classify),
        create_transform("prioritize", "Prioritize", _prioritize),
    ],
)

ID_W = 16
TITLE_W = 32


def f2(x) -> str:
    return f"{x:.2f}"


def signed(x) -> str:
    return ("+" if x >= 0 else "-") + f2(abs(x))


def line(s: str) -> None:
    print(s.rstrip())


def main() -> None:
    run = planner.run(SEED)
    s = run.output
    j = s["judgments"]

    line("Best-time-to-implement (AI-assessed): the model judges state from evidence, the graph schedules")
    line(f"mode: {s['mode']}   (set MODEL to use a real model, e.g. vertex_ai/minimaxai/minimax-m2-maas)")
    line("")

    line("1. ASSESS  -  the model reads each task's evidence and judges its state")
    for t in s["tasks"]:
        jd = j[t["id"]]
        line(f"   {t['id'].ljust(ID_W)}{jd['status'].ljust(5)} v{jd['value']} c{jd['cost']}  conf {f2(jd['confidence'])}  {jd['reason']}")
    line("")

    line("2. STATE  -  done / ready / blocked, from the assessed state + dependencies")
    for task_id in s["done"]:
        t = get(task_id)
        line(f"   done    {task_id.ljust(ID_W)}{t['title'].ljust(TITLE_W)}")
    for task_id in (s["order"] or s["ready"]):
        t = get(task_id)
        line(f"   ready   {task_id.ljust(ID_W)}{t['title'].ljust(TITLE_W)}Phi {f2(phi_of(t))}")
    for b in s["blocked"]:
        t = get(b["id"])
        line(f"   blocked {b['id'].ljust(ID_W)}{t['title'].ljust(TITLE_W)}until: {', '.join(b['until'])}")
    line("")

    line("3. DO NOW  -  the ready set by Phi = value / cost (what earns its cost first)")
    for i, task_id in enumerate(s["order"]):
        t = get(task_id)
        line(f"   {i + 1}. {task_id.ljust(ID_W)}Phi {f2(phi_of(t))}  (value {t['value']}, cost {t['cost']})")
    line("")

    line("4. CRITICAL PATH  -  the longest dependency chain by cost (it sets the finish time)")
    line(f"   {' -> '.join(s['criticalPath'])}   cost {s['criticalCost']}")
    on_path = [i for i in s["criticalPath"] if get(i)["status"] == "todo"]
    line(f"   on it: {', '.join(on_path)}. Start these early even if their Phi is not the highest.")
    line("")

    line("5. WHAT UNBLOCKS THE MOST  -  sensitivity: completing X raises total available value/cost")
    done_progress, todo_knobs = {}, {}
    for t in _TASKS:
        if t["status"] == "done":
            done_progress[t["id"]] = 1
        else:
            todo_knobs[t["id"]] = 0
    unblock = rank_sensitivity(todo_knobs, lambda knobs: total_available_phi({**done_progress, **knobs}))
    for r in unblock:
        opens = directly_unblocks(r.name)
        tail = f"  (unblocks {', '.join(opens)})" if opens else ""
        line(f"   {r.name.ljust(ID_W)}{signed(r.gradient)}{tail}")
    line(f"   tune first: {unblock[0].name if unblock else 'n/a'} (largest unblock).")
    line("")

    # 6. SELF-CHECK - invariants hold for ANY assessment; stub mode also checks exact values.
    line("6. SELF-CHECK")
    checks = []
    ready_deps_ok = all(len(unmet_deps(get(i))) == 0 for i in s["ready"])
    blocked_deps_ok = all(len(b["until"]) >= 1 for b in s["blocked"])
    donow_is_top = s["doNow"] == s["order"][0] if s["order"] else (s["doNow"] is None)
    checks.append(("ready tasks have all deps done (invariant)", ready_deps_ok))
    checks.append(("blocked tasks have an unmet dep (invariant)", blocked_deps_ok))
    checks.append(("do-now is the highest-Phi ready task (invariant)", donow_is_top))
    if s["mode"] == "stub":
        checks.append(("[stub] ready set is auth, ci, storage-adapter", sorted(s["ready"]) == ["auth", "ci", "storage-adapter"]))
        checks.append(("[stub] do-now top is ci", s["doNow"] == "ci"))
        checks.append(("[stub] critical path scaffold -> auth -> tests -> ship-v1 (cost 10)", " -> ".join(s["criticalPath"]) == "scaffold -> auth -> tests -> ship-v1" and s["criticalCost"] == 10))
        checks.append(("[stub] top unblock is storage-adapter", bool(unblock) and unblock[0].name == "storage-adapter"))
    ok = True
    for label, passed in checks:
        line(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    print("\nPASS" if ok else "\nFAIL")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
