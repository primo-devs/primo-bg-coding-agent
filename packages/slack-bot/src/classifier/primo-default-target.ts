/**
 * Primo-specific fallback for LLM target classification.
 *
 * Primo Slack requests always run against the "core" repository unless the
 * model picks another repository or environment with confidence. Upstream's
 * classifier may answer "no repository" or ask the user to pick; for Primo
 * both resolve to core instead. Deterministic stages (routing rules, channel
 * associations) are left untouched.
 *
 * Kept in its own module, wired in by a one-line change to createClassifier,
 * so upstream classifier edits are less likely to conflict during syncs.
 */

import type { ClassificationResult, Env } from "../types";
import { loadTargetCatalog, type TargetCatalog } from "./catalog";
import type { RepoClassifier } from "./index";

export const PRIMO_DEFAULT_REPO_NAME = "core";

function keepsClassification(result: ClassificationResult): boolean {
  return (
    result.source !== "llm" ||
    (!result.needsClarification && result.target !== null && result.target.kind !== "none")
  );
}

export function applyPrimoDefaultTarget(
  result: ClassificationResult,
  catalog: TargetCatalog
): ClassificationResult {
  if (keepsClassification(result)) return result;

  const core = catalog.repos.find((r) => r.name.toLowerCase() === PRIMO_DEFAULT_REPO_NAME);
  if (!core) return result;

  return {
    target: { kind: "repository", repo: core },
    confidence: "high",
    reasoning: `Defaulted to ${core.fullName}.`,
    needsClarification: false,
    source: result.source,
  };
}

export function withPrimoDefaultTarget(classifier: RepoClassifier, env: Env): RepoClassifier {
  const classify = classifier.classify.bind(classifier);
  classifier.classify = async (message, context, traceId) => {
    const result = await classify(message, context, traceId);
    if (keepsClassification(result)) return result;
    const catalog = await loadTargetCatalog(env, traceId, context?.channelId, context?.userId);
    return applyPrimoDefaultTarget(result, catalog);
  };
  return classifier;
}
