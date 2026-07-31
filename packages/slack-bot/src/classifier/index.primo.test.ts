/**
 * Primo's classifier-prompt guarantees, kept out of upstream's `index.test.ts`.
 *
 * That file churns on nearly every sync, so fork assertions live here instead —
 * a file upstream will never touch and git will never have to merge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, RepoConfig } from "../types";

const {
  mockMessagesCreate,
  mockGetAvailableRepos,
  mockBuildRepoDescriptions,
  mockGetRoutingRules,
  mockGetAvailableEnvironments,
} = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockGetAvailableRepos: vi.fn(),
  mockBuildRepoDescriptions: vi.fn(),
  mockGetRoutingRules: vi.fn(),
  mockGetAvailableEnvironments: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  // vitest 4 only treats `function`/`class` implementations as constructable;
  // an arrow function here throws "is not a constructor" on `new Anthropic()`.
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

vi.mock("./repos", () => ({
  getAvailableRepos: mockGetAvailableRepos,
  buildRepoDescriptions: mockBuildRepoDescriptions,
  getRoutingRules: mockGetRoutingRules,
}));

vi.mock("./environments", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  getAvailableEnvironments: mockGetAvailableEnvironments,
  getEnvironmentById: vi.fn(),
}));

import { RepoClassifier } from "./index";
import { PRIMO_CLASSIFIER_INSTRUCTIONS } from "./primo-classifier-instructions";

const TEST_REPOS: RepoConfig[] = [
  {
    id: "acme/prod",
    owner: "acme",
    name: "prod",
    fullName: "acme/prod",
    displayName: "prod",
    description: "Production worker",
    defaultBranch: "main",
    private: true,
    aliases: ["production"],
    keywords: ["worker", "slack"],
  },
  {
    id: "acme/web",
    owner: "acme",
    name: "web",
    fullName: "acme/web",
    displayName: "web",
    description: "Web application",
    defaultBranch: "main",
    private: true,
    aliases: ["frontend"],
    keywords: ["react", "ui"],
  },
];

const TEST_ENV = {
  ANTHROPIC_API_KEY: "test-api-key",
  CLASSIFICATION_MODEL: "claude-haiku-4-5",
} as Env;

describe("RepoClassifier (Primo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableRepos.mockResolvedValue(TEST_REPOS);
    mockGetRoutingRules.mockResolvedValue([]);
    mockGetAvailableEnvironments.mockResolvedValue([]);
    mockBuildRepoDescriptions.mockResolvedValue("- acme/prod\n- acme/web");
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "toolu_primo",
          name: "classify_target",
          input: {
            targetId: "acme/prod",
            confidence: "high",
            reasoning: "Defaulted to the core repository.",
            alternatives: [],
          },
        },
      ],
    });
  });

  it("adds the Primo default-repository instructions to the LLM prompt", async () => {
    const classifier = new RepoClassifier(TEST_ENV);
    await classifier.classify("estas vivo infeliz?", undefined, "trace-primo");

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(PRIMO_CLASSIFIER_INSTRUCTIONS.trim()),
          }),
        ],
      })
    );
  });
});
