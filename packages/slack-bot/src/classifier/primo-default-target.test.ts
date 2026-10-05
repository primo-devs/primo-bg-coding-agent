import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoConfig } from "@open-inspect/shared/types/repository-catalog";
import type { ClassificationResult, Env } from "../types";
import type { RepoClassifier } from "./index";

const { mockLoadTargetCatalog } = vi.hoisted(() => ({ mockLoadTargetCatalog: vi.fn() }));

vi.mock("./catalog", () => ({ loadTargetCatalog: mockLoadTargetCatalog }));

import { applyPrimoDefaultTarget, withPrimoDefaultTarget } from "./primo-default-target";

function repo(owner: string, name: string): RepoConfig {
  const fullName = `${owner}/${name}`;
  return {
    id: fullName,
    owner,
    name,
    fullName,
    displayName: name,
    description: "",
    defaultBranch: "main",
    private: true,
  };
}

const CORE = repo("primo-devs", "core");
const WEB = repo("primo-devs", "web");
const CATALOG = { repos: [WEB, CORE], environments: [] };

function llmResult(overrides: Partial<ClassificationResult>): ClassificationResult {
  return {
    target: null,
    confidence: "low",
    reasoning: "unclear",
    needsClarification: true,
    source: "llm",
    ...overrides,
  };
}

describe("applyPrimoDefaultTarget", () => {
  it("defaults a no-repository pick to core", () => {
    const result = applyPrimoDefaultTarget(
      llmResult({ target: { kind: "none" }, confidence: "high", needsClarification: false }),
      CATALOG
    );

    expect(result.target).toEqual({ kind: "repository", repo: CORE });
    expect(result.needsClarification).toBe(false);
  });

  it("defaults clarification requests to core", () => {
    const result = applyPrimoDefaultTarget(
      llmResult({
        target: { kind: "repository", repo: WEB },
        confidence: "medium",
        alternatives: [{ kind: "repository", repo: CORE }],
      }),
      CATALOG
    );

    expect(result.target).toEqual({ kind: "repository", repo: CORE });
    expect(result.needsClarification).toBe(false);
    expect(result.alternatives).toBeUndefined();
  });

  it("keeps a confident repository pick", () => {
    const confident = llmResult({
      target: { kind: "repository", repo: WEB },
      confidence: "high",
      needsClarification: false,
    });

    expect(applyPrimoDefaultTarget(confident, CATALOG)).toBe(confident);
  });

  it("keeps deterministic routing clarifications", () => {
    const routed = llmResult({ source: "routing_rule" });

    expect(applyPrimoDefaultTarget(routed, CATALOG)).toBe(routed);
  });

  it("leaves the result unchanged when core is not available", () => {
    const unclear = llmResult({});

    expect(applyPrimoDefaultTarget(unclear, { repos: [WEB], environments: [] })).toBe(unclear);
  });
});

describe("withPrimoDefaultTarget", () => {
  const env = {} as Env;
  const context = { channelId: "C1", userId: "U1" };

  beforeEach(() => {
    mockLoadTargetCatalog.mockReset().mockResolvedValue(CATALOG);
  });

  function classifierReturning(result: ClassificationResult): RepoClassifier {
    return { classify: vi.fn().mockResolvedValue(result) } as unknown as RepoClassifier;
  }

  it("routes unclear LLM classifications to core", async () => {
    const classifier = withPrimoDefaultTarget(classifierReturning(llmResult({})), env);

    const result = await classifier.classify("hola", context, "trace-1");

    expect(result.target).toEqual({ kind: "repository", repo: CORE });
    expect(mockLoadTargetCatalog).toHaveBeenCalledWith(env, "trace-1", "C1", "U1");
  });

  it("skips the catalog fetch when the classification is kept", async () => {
    const confident = llmResult({
      target: { kind: "repository", repo: WEB },
      confidence: "high",
      needsClarification: false,
    });
    const classifier = withPrimoDefaultTarget(classifierReturning(confident), env);

    await expect(classifier.classify("fix web", context)).resolves.toBe(confident);
    expect(mockLoadTargetCatalog).not.toHaveBeenCalled();
  });
});
