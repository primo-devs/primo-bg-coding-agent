/**
 * Primo-specific Slack repository classification instructions.
 *
 * Keep fork-only prompt changes here so upstream prompt edits in index.ts are
 * less likely to conflict during syncs.
 */
export const PRIMO_CLASSIFIER_INSTRUCTIONS = `
## Primo Repository Default

For Primo Slack requests, if the user does not specify a repository and there is no stronger routing signal, classify the request as referring to the repository named "core". Do not ask which repository they mean solely because the repository was omitted.`;
