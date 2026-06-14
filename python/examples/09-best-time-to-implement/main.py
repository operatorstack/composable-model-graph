#!/usr/bin/env python3
"""
Example 09 - Best time to implement (a task graph that schedules itself). Python
parity of typescript/examples/09-best-time-to-implement; same model, byte-identical
output.

A backlog is a dependency graph: each task has a value, a cost, and the tasks it
waits on. Given that graph, the best time to start a task falls out of the structure:
    - READY    a task whose dependencies are all done (you can start it now)
    - Phi      value / cost, so the ready set sorts by what earns its cost first
    - critical path  the longest dependency chain by cost: it sets the finish time
    - sensitivity    completing which task raises the most downstream value/cost

This is the RAW, deterministic engine: task state (done / not, value, cost, deps) is
given as data, so every number is hand-checkable. A later layer lets a model JUDGE
that state from evidence and feed this same engine, at the `assess` seam. Uses only
core + math.

Run (no install needed):
    python3 python/examples/09-best-time-to-implement/main.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from composable_model_graph import (  # noqa: E402
    create_model_graph,
    create_transform,
    rank_sensitivity,
    useful_flow_score,
)

# The seed backlog: a generic small software project shipping v1. It includes the
# canonical case - a task BLOCKED on an unbuilt dependency you do not want to forget
# ("move assets into object storage" waits on "build the storage adapter"). The
# planner holds it and surfaces it only once the blocker is done.
TASKS = [
    {"id": "scaffold", "title": "Set up project scaffold", "status": "done", "value": 3, "cost": 1, "deps": []},
    {"id": "ci", "title": "Set up CI", "status": "todo", "value": 5, "cost": 2, "deps": ["scaffold"]},
    {"id": "auth", "title": "Add authentication", "status": "todo", "value": 8, "cost": 4, "deps": ["scaffold"]},
    {"id": "storage-adapter", "title": "Build the storage adapter", "status": "todo", "value": 4, "cost": 3, "deps": ["scaffold"]},
    {"id": "api-docs", "title": "Write API docs", "status": "todo", "value": 3, "cost": 1, "deps": ["auth"]},
    {"id": "move-assets", "title": "Move assets into object storage", "status": "todo", "value": 8, "cost": 2, "deps": ["storage-adapter"]},
    {"id": "tests", "title": "Write integration tests", "status": "todo", "value": 5, "cost": 3, "deps": ["auth", "storage-adapter"]},
    {"id": "ship-v1", "title": "Ship v1", "status": "todo", "value": 10, "cost": 2, "deps": ["ci", "api-docs", "move-assets", "tests"]},
]

# Model helpers (pure, shared by the graph and the analyses below).
_BY_ID = {t["id"]: t for t in TASKS}


def get(task_id):
    return _BY_ID[task_id]


def is_done(task_id) -> bool:
    return get(task_id)["status"] == "done"


def phi_of(t) -> float:
    return useful_flow_score(t["value"], t["cost"]).score


def unmet_deps(t):
    return [d for d in t["deps"] if not is_done(d)]


# Critical path: the longest dependency chain by summed cost. It is the lower bound
# on finish time, so tasks on it gate the schedule even when their Phi is modest.
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

    end_id = TASKS[0]["id"] if TASKS else ""
    end_dist = float("-inf")
    for t in TASKS:
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


# Sensitivity objective: total value/cost currently AVAILABLE to work on. A task is
# available in proportion to how done its dependencies are (product of their
# progress). Nudging a task toward done and watching this rise is its unblock power.
def total_available_phi(progress) -> float:
    total = 0.0
    for t in TASKS:
        avail = 1.0
        for d in t["deps"]:
            avail *= progress.get(d, 0.0)
        total += phi_of(t) * avail
    return total


def directly_unblocks(task_id):
    return [
        t["id"]
        for t in TASKS
        if t["status"] == "todo" and task_id in t["deps"] and unmet_deps(t) == [task_id]
    ]


# The pipeline as a cmg ModelGraph: assess -> classify -> prioritize. Each stage
# records a signal, so the run's trace shows how the plan was built. `assess` is the
# seam where a model will later JUDGE state; here it is the identity.
def _assess(tasks, ctx):
    ctx.record_signal("tasks", len(tasks))
    return tasks  # Phase 2: a model fills status / value / cost / deps from evidence.


def _classify(tasks, ctx):
    done, ready, blocked = [], [], []
    for t in tasks:
        if t["status"] == "done":
            done.append(t["id"])
        elif len(unmet_deps(t)) == 0:
            ready.append(t["id"])
        else:
            blocked.append({"id": t["id"], "until": unmet_deps(t)})
    ctx.record_signal("ready", len(ready))
    return {"done": done, "ready": ready, "blocked": blocked, "order": [], "doNow": None, "criticalPath": [], "criticalCost": 0}


def _prioritize(plan, ctx):
    order = sorted(plan["ready"], key=lambda i: (-phi_of(get(i)), i))
    cp = longest_cost_path()
    ctx.record_signal("critical_cost", cp["cost"])
    plan = {**plan, "order": order, "doNow": order[0] if order else None, "criticalPath": cp["path"], "criticalCost": cp["cost"]}
    return plan


planner = create_model_graph(
    "best-time-to-implement",
    "Best Time To Implement",
    [
        create_transform("assess", "Assess", _assess),
        create_transform("classify", "Classify", _classify),
        create_transform("prioritize", "Prioritize", _prioritize),
    ],
)

# Formatting helpers so TS and Python print byte-identical output.
ID_W = 16
TITLE_W = 32


def f2(x) -> str:
    return f"{x:.2f}"


def signed(x) -> str:
    return ("+" if x >= 0 else "-") + f2(abs(x))


def line(s: str) -> None:
    print(s.rstrip())


def main() -> None:
    run = planner.run(TASKS)
    plan = run.output

    line("Best-time-to-implement: a task graph that schedules itself (the AI judges state later)")
    line("")

    line("1. STATE  -  done, ready, or blocked, derived from dependencies")
    for task_id in plan["done"]:
        t = get(task_id)
        line(f"   done    {task_id.ljust(ID_W)}{t['title'].ljust(TITLE_W)}")
    for task_id in (plan["order"] or plan["ready"]):
        t = get(task_id)
        line(f"   ready   {task_id.ljust(ID_W)}{t['title'].ljust(TITLE_W)}Phi {f2(phi_of(t))}")
    for b in plan["blocked"]:
        t = get(b["id"])
        line(f"   blocked {b['id'].ljust(ID_W)}{t['title'].ljust(TITLE_W)}until: {', '.join(b['until'])}")
    line("")

    line("2. DO NOW  -  the ready set by Phi = value / cost (what earns its cost first)")
    for i, task_id in enumerate(plan["order"]):
        t = get(task_id)
        line(f"   {i + 1}. {task_id.ljust(ID_W)}Phi {f2(phi_of(t))}  (value {t['value']}, cost {t['cost']})")
    line("")

    line("3. CRITICAL PATH  -  the longest dependency chain by cost (it sets the finish time)")
    line(f"   {' -> '.join(plan['criticalPath'])}   cost {plan['criticalCost']}")
    on_path = [i for i in plan["criticalPath"] if get(i)["status"] == "todo"]
    line(f"   on it: {', '.join(on_path)}. Start these early even if their Phi is not the highest.")
    line("")

    line("4. WHAT UNBLOCKS THE MOST  -  sensitivity: completing X raises total available value/cost")
    done_progress = {}
    todo_knobs = {}
    for t in TASKS:
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

    # 5. SELF-CHECK - every claim is hand-derivable from the seed data above.
    line("5. SELF-CHECK")
    ready_sorted = sorted(plan["ready"])
    move_assets = next((b for b in plan["blocked"] if b["id"] == "move-assets"), None)
    checks = [
        ("ready set is auth, ci, storage-adapter", ready_sorted == ["auth", "ci", "storage-adapter"]),
        ("do-now top is ci (highest Phi)", plan["doNow"] == "ci"),
        ("move-assets blocked until storage-adapter", move_assets is not None and move_assets["until"] == ["storage-adapter"]),
        ("critical path is scaffold -> auth -> tests -> ship-v1 (cost 10)", " -> ".join(plan["criticalPath"]) == "scaffold -> auth -> tests -> ship-v1" and plan["criticalCost"] == 10),
        ("top unblock is storage-adapter", bool(unblock) and unblock[0].name == "storage-adapter"),
    ]
    ok = True
    for label, passed in checks:
        line(f"   {'ok  ' if passed else 'FAIL'} {label}")
        ok = ok and passed
    print("\nPASS" if ok else "\nFAIL")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
