/**
 * Fork-only prompt suffix asking the agent to open a pull request.
 *
 * This lives in its own file, and behind a binding that is off by default, so
 * that upstream's `messages/context.ts` and `sessions/session-launcher.test.ts`
 * stay byte-identical to upstream. Both files were conflict sites during the
 * 2026-07-24 sync: a fork behavior change that alters prompt text breaks
 * upstream's own assertions, which forces us to edit their tests — the very
 * files that churn most. With the feature dark by default, upstream tests pass
 * unmodified and our coverage lives in `session-launcher.primo.test.ts`.
 *
 * Enabled in production via `plain_text_binding_overrides` in
 * `terraform/environments/production/primo-overrides.tf`.
 */

import type { Env } from "../types";

/**
 * Unlike Linear (where every session implements an issue), Slack is used for
 * both questions and change requests, so the pull-request step is conditional:
 * the agent decides based on whether a code change was actually requested.
 */
export const SLACK_CODE_CHANGE_PR_INSTRUCTION =
  "If this request asked you to make a code change, open a pull request with your changes when you're done. If it was only a question or discussion, you don't need to open a pull request.";

/**
 * The suffix to append to a new session's prompt, including its separating
 * blank line — or an empty string when the feature is off, so callers can
 * concatenate unconditionally.
 */
export function slackCodeChangePrInstructionSuffix(env: Env): string {
  if (env.SLACK_CODE_CHANGE_PR_INSTRUCTION_ENABLED !== "true") return "";
  return `\n\n${SLACK_CODE_CHANGE_PR_INSTRUCTION}`;
}
