# Example 10: AI judges state, the graph schedules

[Example 09](../09-best-time-to-implement) was the raw, deterministic scheduler: task
state (done or not, value, cost) was handed in as data. That is the weak point of any
planner. "Is this actually done, and what is it worth?" is a judgment call, not a
lookup. This example hands that judgment to a model, and changes nothing else.

The split is the whole idea: **the model does the fuzzy judgment, the graph does the
exact, inspectable scheduling.** The model is never load-bearing for the scheduling
logic; it only supplies the inputs the proven engine already consumes.

## Simulated detectors, real AI

Each task carries a plain-language `done_when` and `evidence` simulated from detectors
(GitHub, deploys, the filesystem):

```
storage-adapter   done_when: implemented and merged to main
                  evidence:  PR #142 OPEN, CI green, file exists on the branch, not merged
```

The detectors here are **simulated**; the AI judgment is **real**. The `assess` stage,
the seam example 09 reserved, is now a model-call transform: it reads each task's
evidence and returns `{status, value, cost, confidence, reason}`. The `storage-adapter`
case above is deliberately ambiguous (code exists, but on an unmerged PR), so the model
has to actually judge it rather than match a keyword.

This is the **template Tower implements** later: swap the simulated `evidence` for real
detectors (GitHub webhooks, GCP probes), keep the exact same `assess -> classify ->
prioritize` graph.

## Run

```sh
# offline, no key, deterministic (a canned stub stands in for the model)
python3 python/examples/10-best-time-to-implement-ai/main.py
```

It prints the model's judgment table, then the same four readouts as example 09
(state, do-now by Phi, critical path, what-unblocks-most), then a self-check.

### Live (real model calls)

Install LiteLLM and set `MODEL`. Provider switching is one env var, mirroring how
intelligence-flow runs its terminal-bench calls.

```sh
pip install -r python/examples/10-best-time-to-implement-ai/requirements.txt

# GCP Vertex MaaS (MiniMax), auth via Application Default Credentials:
export MODEL=vertex_ai/minimaxai/minimax-m2-maas
export VERTEXAI_PROJECT=<your-project> VERTEXAI_LOCATION=global
python3 python/examples/10-best-time-to-implement-ai/main.py

# or a regular provider:
MODEL=openrouter/qwen/qwen3-coder OPENROUTER_API_KEY=... python3 .../main.py
MODEL=openai/gpt-4o-mini          OPENAI_API_KEY=...     python3 .../main.py
MODEL=gemini/gemini-2.5-flash     GEMINI_API_KEY=...     python3 .../main.py
```

In live mode the judgment table is the model's real call on the evidence; the schedule
recomputes from it. Output varies by model (that is the nature of a live call), so the
committed `expected-output.txt` is the deterministic stub run. A real MiniMax run (via
Vertex MaaS) is included as `sample-live-output.txt` for reference: the model judged the
unmerged-PR `storage-adapter` as not-done, and its value/cost estimates shifted the
critical path and the top unblock versus the stub.

## What it demonstrates

- **A model-call transform** (cmg capability gap #1) done the right way: the LLM adapter
  lives in the example (`model.py`), never in `core`.
- **The seam pattern**: `assess` went from identity (example 09) to a real model call,
  and the scheduler below it did not change. Correctness was proven first; AI was added
  at a clean seam.
- **Robustness**: deterministic offline stub for CI / sharing; live providers by one env
  var; tolerant JSON parsing of model output.

## Self-check

The self-check asserts invariants that hold for ANY assessment (ready tasks have all
deps done; blocked tasks have an unmet dep; do-now is the highest-Phi ready task). In
stub mode it also checks the exact known schedule. So a live run is still validated for
structural correctness even though its numbers vary.

## Takeaways: what cmg let us do (vs how you'd build this today)

The point of examples 09 and 10 is less the planner and more the way of working. cmg let
us prove an idea deterministically, confirm it works, and only then add AI, at a seam.
Here is that, against how the same feature usually gets built.

1. **Prove the idea before paying for AI.** Today you wire the model in from line one,
   and when the output is wrong you cannot tell if it is your logic or the model. With
   cmg you model it as a deterministic graph and prove it with a hand-checkable output +
   self-check (example 09), then add the model (example 10). When it breaks, you know
   which half broke.
2. **AI sits at a seam, not woven through.** Today model calls are sprinkled across the
   logic, so correctness and the model are entangled and non-determinism makes it hard to
   test. With cmg the model only fills the `assess` seam; the scheduler under it did not
   change one line from 09 to 10. The model is an input, never load-bearing for
   correctness.
3. **You can see what the AI changed.** Today an AI planner emits an answer and you cannot
   see why, or what moved. With cmg, stub vs live is a diff you can read: same engine, the
   model's judgments moved the critical path (cost 10 to 21) and the top unblock
   (storage-adapter to auth). The plan is inspectable, and so is the model's effect on it.
4. **Swap the provider or the detectors without touching the engine.** Today it is a
   bespoke integration per provider and per data source, tightly coupled. With cmg the
   provider is one env var (a LiteLLM model-string), the detectors are simulated here and
   real later, and the graph is unchanged across 09, 10, and the production version.
5. **The decision is the deliverable.** Today "what should I build, and when?" is a gut
   call. With cmg it is computed and legible: Phi (value per cost), the critical path
   (timing), and sensitivity (leverage). You can argue with a number; you cannot argue
   with a vibe.

## Honest limit

The detectors are simulated and the value/cost scale is illustrative. The real work in
Tower is the detector layer (turning real GitHub / deploy / filesystem state into
evidence) and deciding when to re-assess (event-driven, not a global cron). This example
is the engine and the seam they plug into.
