# Sequential estimation: decoding a path through a trellis

Some problems are not "one input, one answer" but "a sequence of noisy
observations, one coherent explanation." You have, at each step, a few candidate
states — each with a score saying how well it explains that step's observation —
and a sense that consecutive states should *cohere* (a big jump between steps is
implausible). The answer is not the best state at each step taken independently;
it is the best **path** through all the steps at once.

That is what the `estimation` package computes.

## The shape

At each step `t` you supply candidate states, each an `id` and a `score` (higher
= better explanation of that step). You also supply a **transition cost**: how
implausible it is to move from one step's state to the next's. The decoder finds
the path `x*` that maximizes total score minus the transitions it pays for:

```
score(path) = sum_t  score(x_t)  -  w * sum_{t>=1} cost(x_{t-1}, x_t)
```

`w` (`transitionWeight`) sets the exchange rate between "trust this step's
observation" and "stay coherent with the neighbours." It is the one knob:

- `w = 0`: transitions are free, so the path is just the best state at each step
  independently — the pointwise answer. (This falls out of the recursion; it is
  not a special case in the code.)
- larger `w`: jumps get expensive, so the path smooths over a noisy step whose
  neighbours disagree with it.

## The two decoders

- **`decodePath`** — the full-path (Viterbi) decode. It sees the whole sequence
  and returns the single globally-best path. Choosing a state at step `t` can be
  revised by evidence at step `t+5`.
- **`decodePathFixedLag`** — a causal decode for streaming: it commits the state
  at step `t - lag` once it has seen `lag` more steps. `lag = 0` is pure
  filtering (commit each step as it arrives, using only the past). A larger
  `lag` buys lookahead; `lag >= T-1` reproduces `decodePath` exactly.

Both return a `DecodedPath` whose per-step record exposes *why* each state was
chosen: its own `score`, the `transitionCost` paid to enter it, and the
`cumulativeScore` of the best path through it. The split is the point — you can
see where the observation won and where coherence overruled it.

## What it is not

No probabilities are required or claimed. Scores are just numbers you compare;
you may read them as log-likelihoods if that suits your problem, but the decoder
is a linear-chain energy maximizer, nothing more. The package has **no
dependency on the rest of the library** — it is a pure algorithm over plain
data. Composing it with `ModelGraph`, evaluators, and feedback is shown in an
example, not baked into the primitive. See `16-estimation-in-the-graph` in the
TypeScript and Python example directories.

## Worked example (the number you can check by hand)

Three steps, three states per step, whose ids double as positions `0, 1, 2` on a
line. The transition cost is the distance moved, `cost = |pos(prev) - pos(next)|`,
and `w = 1`. Step 1 carries a **noise spike**: position 2 scores best there,
even though positions 0 dominate the steps around it.

```
scores        pos0  pos1  pos2
  step 0        5     0     0
  step 1        3     0     6      <- spike at pos 2
  step 2        8     0     0
```

Forward accumulation `cum[t][j] = score[t][j] + max_i (cum[t-1][i] - |i - j|)`:

```
cum[0] = [ 5,  0,  0 ]
cum[1] = [ 8,  4,  9 ]      (each best-reached from pos0 at step 0)
cum[2] = [16,  8,  9 ]
```

The best final state is pos0 (`16`); backtracking gives:

- **`decodePath` (w=1): path `0, 0, 0`, total `16`.** The spike is rejected — the
  cost of jumping out to pos2 and back (2 + 2) outweighs its 3-point emission
  edge, once the neighbours are taken into account.
- **`w = 0`: path `0, 2, 0`.** With free transitions the decoder just takes the
  best state at each step, so it follows the spike.
- **`decodePathFixedLag(lag=0)`: path `0, 2, 0`, total `15`.** Pure filtering
  commits pos2 at step 1 because, at that moment, it looks best; only later
  evidence (step 2) would have overturned it, and a lag-0 decoder never waits.
- **`decodePathFixedLag(lag>=1)`: path `0, 0, 0`.** One step of lookahead is
  enough here to see the spike is a detour and reject it, matching the full
  decode.

This fixture is exactly what the tests (`estimation.test.ts` /
`test_estimation.py`) assert, and the `13-track-snapping` example is the same
mechanism dressed as a sensor snapping to a grid.

## Domain influence

Trellis decoding is the shared skeleton of Viterbi decoding (communications),
hidden Markov model inference (speech, bioinformatics), and fixed-lag smoothing
(estimation and control). The primitive is that skeleton with the probability
story left optional — a domain-free tool the specialist recognizes on sight.
