/**
 * Fork-only coverage for the pull-request instruction appended to new session
 * prompts. Kept out of `session-launcher.test.ts` so that upstream's copy of
 * that file merges without conflicts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import type { SlackSessionTarget } from "../targets";
import type { SlackActorIdentity } from "../user-identity";
import { startSessionAndSendPrompt } from "./session-launcher";
import { SLACK_CODE_CHANGE_PR_INSTRUCTION } from "../messages/primo-pr-instruction";
import { getAvailableModels } from "../app-home/models";
import { getUserRepoBranchPreference } from "../branch-preferences";
import { getResolvedUserPreferences } from "../user-preferences";
import { createSession } from "./control-plane-client";
import { deliverPrompt } from "./prompt-delivery";
import { buildThreadSession, storeThreadSession } from "./thread-session-store";
import { postMessage } from "@open-inspect/shared/slack";
import { prepareImageAttachments } from "../attachments";
import { getSlackSettings } from "../slack-settings";

vi.mock("@open-inspect/shared/slack", () => ({
  postMessage: vi.fn(),
}));

vi.mock("../attachments", () => ({
  prepareImageAttachments: vi.fn(async () => ({ files: [], dropped: [] })),
  notifyDroppedAttachments: vi.fn(async () => {}),
}));

vi.mock("./prompt-delivery", () => ({ deliverPrompt: vi.fn() }));

vi.mock("../app-home/models", () => ({
  getAvailableModels: vi.fn(),
}));

vi.mock("../slack-settings", () => ({ getSlackSettings: vi.fn() }));

vi.mock("../branch-preferences", () => ({ getUserRepoBranchPreference: vi.fn() }));

vi.mock("../user-preferences", () => ({ getResolvedUserPreferences: vi.fn() }));

vi.mock("./control-plane-client", () => ({ createSession: vi.fn() }));

vi.mock("./thread-session-store", () => ({
  buildThreadSession: vi.fn(),
  storeThreadSession: vi.fn(),
}));

function makeEnv(prInstructionEnabled?: string): Env {
  return {
    SLACK_BOT_TOKEN: "xoxb-test",
    DEFAULT_MODEL: "openai/gpt-5.4",
    WEB_APP_URL: "https://app.example.com",
    LOG_LEVEL: "error",
    SLACK_CODE_CHANGE_PR_INSTRUCTION_ENABLED: prInstructionEnabled,
  } as Env;
}

const repositoryTarget: SlackSessionTarget = {
  kind: "repository",
  repo: {
    id: "acme/app",
    owner: "acme",
    name: "app",
    fullName: "acme/app",
    displayName: "acme/app",
    description: "Application repository",
    defaultBranch: "main",
    private: true,
  },
};

const actor: SlackActorIdentity = {
  userId: "U123",
  senderLabel: "R (U123)",
  displayName: "R",
};

async function launch(env: Env) {
  await startSessionAndSendPrompt(env, {
    target: repositoryTarget,
    channel: "C123",
    threadTs: "111.222",
    messageText: "Fix the failing deploy",
    actor,
  });
  return vi.mocked(deliverPrompt).mock.calls[0][1].content;
}

describe("Slack code-change PR instruction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAvailableModels).mockResolvedValue([
      { label: "GPT 5.4", value: "openai/gpt-5.4" },
    ]);
    vi.mocked(getSlackSettings).mockResolvedValue({});
    vi.mocked(getResolvedUserPreferences).mockResolvedValue({
      model: "openai/gpt-5.4",
      reasoningEffort: "high",
      branch: undefined,
    });
    vi.mocked(getUserRepoBranchPreference).mockResolvedValue(undefined);
    vi.mocked(createSession).mockResolvedValue({ sessionId: "session-1", status: "created" });
    vi.mocked(prepareImageAttachments).mockResolvedValue({ files: [], dropped: [] });
    vi.mocked(deliverPrompt).mockResolvedValue({ ok: true, data: { messageId: "message-1" } });
    vi.mocked(buildThreadSession).mockReturnValue({
      sessionId: "session-1",
      repoId: "acme/app",
      repoFullName: "acme/app",
      model: "openai/gpt-5.4",
      reasoningEffort: "high",
      createdAt: 123,
    });
    vi.mocked(storeThreadSession).mockResolvedValue(undefined);
    vi.mocked(postMessage).mockResolvedValue({ ok: true, channel: "C123", ts: "111.333" });
  });

  it('appends the instruction when the binding is exactly "true"', async () => {
    expect(await launch(makeEnv("true"))).toBe(
      `Fix the failing deploy\n\n${SLACK_CODE_CHANGE_PR_INSTRUCTION}`
    );
  });

  it("leaves the prompt untouched when the binding is unset", async () => {
    expect(await launch(makeEnv())).toBe("Fix the failing deploy");
  });

  it('leaves the prompt untouched for any value other than "true"', async () => {
    expect(await launch(makeEnv("TRUE"))).toBe("Fix the failing deploy");
    vi.mocked(deliverPrompt).mockClear();
    expect(await launch(makeEnv("1"))).toBe("Fix the failing deploy");
  });
});
