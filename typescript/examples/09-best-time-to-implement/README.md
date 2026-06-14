# Example 09: Best time to implement (a task graph that schedules itself)

You have a pile of things to do. Some are ready, some are waiting on something else,
some matter more than others, and a few are easy to forget precisely because they are
blocked today. A flat to-do list flattens all of that into one column and loses it.

A backlog is not a list. It is a **dependency graph**: each task has a value, a cost,
and the tasks it waits on. Once you write it that way, the question "what should I do,
and when?" stops being a matter of taste. The best time to start a task falls out of
the structure of the graph.

This example is the **raw, deterministic engine**. Task state (done or not, value,
cost, dependencies) is given as data, so every number it prints is hand-checkable. A
later layer lets a model judge that state from evidence and feed this same engine,
without changing any of the scheduling logic (see [Phase 2](#phase-2-let-the-model-judge-state)).

## Run

```sh
pnpm --filter @composable-model-graph/example-09-best-time-to-implement start
```

No keys, no network, no AI. It prints the schedule and a self-check, and exits 0.

## The four readouts

Given the task graph, four lenses answer "what now, and when":

- **READY** - a task whose dependencies are all done. You can start it today. Everything
  else is either `done` or `blocked` (waiting on a named, unmet dependency).
- **Phi = value / cost** (`usefulFlowScore`, core) - the ready set sorted by what earns
  its cost first. Highest value per unit of cost goes to the top of "do now".
- **Critical path** - the longest dependency chain by cost. It is the lower bound on
  the finish time, so tasks on it gate the whole schedule even when their own Phi is
  modest. This is where Phi and timing disagree, and the disagreement is the point.
- **Sensitivity** (`rankSensitivity`, math) - completing which task raises the most
  *downstream* available value/cost. This is "what unblocks the most": the finite-
  difference gradient of total available Phi with respect to each task's progress. The
  front of the list is the highest-leverage thing to build next, even if it is not the
  highest-Phi thing to do next.

The seed backlog is a generic small project shipping v1. The highest-Phi ready task is
`ci`, but the critical path runs through `auth -> tests`, and the highest-leverage
unblock is `storage-adapter`. Three lenses, three different answers, all correct: that
is what makes the graph worth keeping over a list.

## The blocked thing you do not want to forget

The backlog includes the case that motivated this: a task **blocked on an unbuilt
dependency**. "Move assets into object storage" waits on "build the storage adapter".
On a flat list you either drop it (forgotten) or pin it to the top (noise, since you
cannot do it yet). On the graph it is held as `blocked until: storage-adapter`, out of
your way but not lost, and it surfaces into the ready set the moment its blocker is
done. The graph remembers the pieces so you do not have to.

## The graph is real

The schedule is produced by a cmg `ModelGraph` of three transforms,
`assess -> classify -> prioritize`, each recording a signal via
`RunContext.recordSignal`, so the run's trace shows how the plan was built. The
self-check then confirms every claim against the seed data (the ready set, the do-now
order, the blocked-until edge, the critical path and its cost, the top unblock).

## Phase 2: let the model judge state

The weak point of any planner is "is this actually done, and what is it worth?" That
is a judgment call, not a lookup. `assess` is the seam for it: today it is the identity
(state comes from data); next it becomes a model-call transform that reads each task's
evidence and returns `{ status, value, cost, deps }`. The deterministic engine below it
does not change. The graph stays the exact, inspectable part; the model only supplies
the fuzzy inputs, and is never load-bearing for the scheduling itself. That separation
is the whole idea: prove the graph first, then embed AI at a clean seam.

## Why this matters

When a model can do the work, the scarce asset is **discernment**: deciding what is
worth doing, in what order, and when. Phi, the critical path, and sensitivity are that
discernment written as something you can compute and inspect, rather than vibe. This
example is the smallest honest version of it.

## Parity

Uses only `core` + `math`, so the Python version in
`python/examples/09-best-time-to-implement/` is identical in shape and produces
byte-identical output (`expected-output.txt`).

## Honest limit

The value/cost numbers in the seed are illustrative; the structure is the real part.
Critical path here counts summed task cost (a stand-in for duration); sensitivity is
evaluated at the current done/not-done state, so it surfaces the immediate unblocks
(the last remaining blocker of a downstream task) rather than the full transitive
chain. Swap in your own backlog and the same four readouts apply.

## Next

This is the deterministic half. [Example 10](../../python/examples/10-best-time-to-implement-ai)
fills the task state with a real model at the `assess` seam, and its README closes with the
takeaways: what this way of working (prove it first, then add AI) buys you versus how the same
feature usually gets built.
