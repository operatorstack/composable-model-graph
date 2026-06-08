import {
  createModelGraph,
  createTransform,
  type GraphRun,
  type RunContext,
} from "@composable-model-graph/core";
import { thresholdEvaluator } from "@composable-model-graph/evaluators";
import { withContract, header, selfCheck, type ContractResult } from "./shared.js";

/**
 * Demo C — Research / knowledge synthesis (static, deterministic stand-in)
 *
 * Pipeline:  question -> retrieve-sources -> extract-claims -> synthesize-answer
 *
 * The system contract: every load-bearing claim in the answer must trace back to
 * supporting evidence. `synthesize-answer` has a FAULT: it asserts every claim
 * with high confidence regardless of whether any retrieved source supports it.
 * Each node returns a valid shape and nothing throws — but the evidence-support
 * relation that the whole answer depends on is corrupted.
 *
 * (No model call here; the data is hand-built so the example is deterministic.)
 */

type Source = { id: string; supports: string[] };
type Claim = { id: string; text: string };
type ResearchInput = { question: string; corpus: Source[] };
type RetrieveState = { question: string; sources: Source[] };
type ClaimState = { question: string; sources: Source[]; claims: Claim[] };
type AnswerClaim = { id: string; confidence: number };
type Answer = { claims: AnswerClaim[] };

const QUESTION = "Is the new API ready to deploy?";

const CLAIMS: Claim[] = [
  { id: "c1", text: "types are generated" },
  { id: "c2", text: "unit tests pass" },
  { id: "c3", text: "load test passed" },
];

// Full evidence: c1 and c2 are supported; c3 is supported by NO source.
const CORPUS: Source[] = [
  { id: "s1", supports: ["c1"] },
  { id: "s2", supports: ["c2"] },
];

const ASSERT_THRESHOLD = 0.5;

const supportCount = (sources: Source[], claimId: string): number =>
  sources.filter((s) => s.supports.includes(claimId)).length;

const retrieveSources = createTransform<ResearchInput, RetrieveState>({
  id: "retrieve-sources",
  name: "retrieve-sources",
  run: ({ question, corpus }) => ({ question, sources: [...corpus] }),
});

const extractClaims = createTransform<RetrieveState, ClaimState>({
  id: "extract-claims",
  name: "extract-claims",
  run: ({ question, sources }) => ({ question, sources, claims: CLAIMS }),
});

const synthesizeAnswer = createTransform<ClaimState, Answer>({
  id: "synthesize-answer",
  name: "synthesize-answer",
  // FAULT: assert every claim at high confidence, ignoring whether the retrieved
  // sources actually support it. Shape is a valid Answer; evidence flow is lost.
  run: ({ claims }) => ({
    claims: claims.map((c) => ({ id: c.id, confidence: 0.9 })),
  }),
});

// Node contract: every confidently-asserted claim must have supporting evidence.
const claimsAreSupported = (input: ClaimState, output: Answer): ContractResult => {
  for (const a of output.claims) {
    if (a.confidence >= ASSERT_THRESHOLD && supportCount(input.sources, a.id) === 0) {
      return { ok: false, detail: `claim ${a.id} asserted at ${a.confidence} with no supporting source` };
    }
  }
  return { ok: true };
};

const nonEmpty = (label: string) => (_input: unknown, output: { sources?: Source[]; claims?: Claim[] }): ContractResult => {
  const list = output.sources ?? output.claims ?? [];
  return { ok: list.length > 0, detail: list.length > 0 ? undefined : `${label} produced nothing` };
};

const graph = createModelGraph<ResearchInput, Answer>({
  id: "evidence-synthesis",
  name: "evidence-synthesis",
  transforms: [
    withContract(retrieveSources, nonEmpty("retrieve-sources")),
    withContract(extractClaims, nonEmpty("extract-claims")),
    withContract(synthesizeAnswer, claimsAreSupported),
  ],
});

const confidenceOf = (run: GraphRun<ResearchInput, Answer>, claimId: string): number =>
  run.output.claims.find((c) => c.id === claimId)?.confidence ?? 0;

const evidenceFor = (run: GraphRun<ResearchInput, Answer>, claimId: string): number => {
  const retrieve = run.trace.find((s) => s.transformId === "retrieve-sources")!
    .output as RetrieveState;
  return supportCount(retrieve.sources, claimId);
};

export async function runResearch(): Promise<boolean> {
  header("Demo C — Research / knowledge synthesis");

  const run = await graph.run({ question: QUESTION, corpus: CORPUS });
  const answer = run.output;

  // Support score: fraction of asserted claims that have supporting evidence.
  const asserted = answer.claims.filter((c) => c.confidence >= ASSERT_THRESHOLD);
  const supported = asserted.filter((c) => supportCount(CORPUS, c.id) > 0);
  const supportScore = asserted.length === 0 ? 1 : supported.length / asserted.length;

  console.log(`\n  pipeline:        question -> retrieve-sources -> extract-claims -> synthesize-answer`);
  console.log(`  question:        ${QUESTION}`);
  console.log(`  retrieved:       ${CORPUS.map((s) => `${s.id}->[${s.supports.join(",")}]`).join("  ")}`);
  console.log(`  answer:          ${answer.claims.map((c) => `${c.id}@${c.confidence}`).join("  ")}`);
  console.log(`  (no source supports c3, yet it is asserted at 0.9)`);

  const ctx: RunContext = { runId: "research-final-answer" };
  const supportEval = thresholdEvaluator({
    id: "evidence-support",
    name: "evidence-support",
    threshold: 1,
    direction: "atLeast",
  });
  const finalAnswer = await supportEval.evaluate(supportScore, undefined, ctx);

  console.log(`\n  [1] Final Answer Check (needs a target: full evidence support):`);
  console.log(`    support score=${supportScore.toFixed(2)}  status=${finalAnswer.status}`);
  console.log(`    => detects THAT the answer is under-supported, not WHERE.`);

  console.log(`\n  [2] Node Contract Check (declared local expectations, read from the trace):`);
  for (const step of run.trace) {
    const ok = step.metadata?.contractOk;
    const detail = step.metadata?.contractDetail;
    const mark = ok === false ? "BROKE" : "ok   ";
    console.log(`    ${mark} ${step.transformName}${detail && ok === false ? `  (${detail})` : ""}`);
  }
  const faultyStep = run.trace.find((s) => s.metadata?.contractOk === false);
  console.log(`    => trace localization: ${faultyStep?.transformName ?? "none"}`);

  // [3] Trace Relation Check — remove the evidence for a supported claim and
  // re-run. Expected relation: confidence in that claim must strictly decrease.
  const targetClaim = "c1";
  const reducedCorpus = CORPUS.filter((s) => !s.supports.includes(targetClaim));
  const runReduced = await graph.run({ question: QUESTION, corpus: reducedCorpus });

  const before = confidenceOf(run, targetClaim);
  const after = confidenceOf(runReduced, targetClaim);
  const evidenceDropped = evidenceFor(run, targetClaim) > evidenceFor(runReduced, targetClaim);
  const relationBroken = evidenceDropped && !(after < before);

  console.log(`\n  [3] Trace Relation Check (no target — related runs):`);
  console.log(`    expected relation: remove evidence for ${targetClaim} => confidence(${targetClaim}) decreases`);
  console.log(`    confidence(${targetClaim}): full=${before}  evidence-removed=${after}  (evidence ${evidenceDropped ? "dropped" : "unchanged"})`);
  if (relationBroken) {
    console.log(`    relation BROKEN: evidence fell but confidence did not.`);
    console.log(`    => trace localization: synthesize-answer (it set confidence ignoring its evidence input)`);
  } else {
    console.log(`    relation holds.`);
  }

  return selfCheck("research", [
    ["final answer check detects failure", finalAnswer.status === "fail"],
    ["node contract localizes to synthesize-answer", faultyStep?.transformId === "synthesize-answer"],
    ["trace relation detects corrupted evidence flow", relationBroken],
  ]);
}
