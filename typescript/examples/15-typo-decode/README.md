# 15 — Typo decoding (text / sequence labeling)

Recover the intended word from a mistyped one. Each position's candidates are
the typed letter (free) plus its keyboard neighbours (a small penalty); the
transition cost is 0 for an allowed letter pair and 1 otherwise (a tiny bigram
"language model").

- **weight 0** echoes what was typed (`chsir`).
- **weight 1** corrects the slip to `chair` — the neighbour `a` pays one key
  penalty but removes two disallowed letter pairs.

Same trellis decode as tracking and HMMs, over letters. No dictionary lookup.

## Run

```bash
pnpm --filter @composable-model-graph/example-15-typo-decode start   # TypeScript
python3 python/examples/15-typo-decode/main.py                        # Python (byte-identical)
```

Output: [`expected-output.txt`](expected-output.txt).
