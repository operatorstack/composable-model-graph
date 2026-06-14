# Example 09: Best time to implement (Python parity)

Python parity of `typescript/examples/09-best-time-to-implement`: same model, same
four readouts, byte-identical output (`expected-output.txt`). See that example's
README for the full write-up.

A backlog is a dependency graph, not a list: each task has a value, a cost, and the
tasks it waits on. From that, the best time to start a task falls out of the structure:

- **READY** - dependencies all done (startable now); else `done` or `blocked` (with the
  named, unmet dependency).
- **Phi = value / cost** (`useful_flow_score`) - the ready set by what earns its cost first.
- **Critical path** - the longest dependency chain by cost; it sets the finish time.
- **Sensitivity** (`rank_sensitivity`) - completing which task raises the most downstream
  available value/cost ("what unblocks the most").

It includes the case that motivated it: a task blocked on an unbuilt dependency ("move
assets into object storage" waits on "build the storage adapter"), held as
`blocked until` so it is not forgotten and surfaces when its blocker is done.

This is the raw, deterministic engine (state is data, every number hand-checkable). The
`assess` stage is the seam where a model later judges state from evidence and feeds the
same engine, without changing the scheduling logic.

## Run

```sh
python3 python/examples/09-best-time-to-implement/main.py
```

No keys, no network, no AI. Prints the schedule and a self-check, exits 0.
