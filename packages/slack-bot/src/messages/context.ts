function formatMessageSection(header: string, messages: string[]): string {
  if (messages.length === 0) return "";
  return `${header}:\n---\n${messages.join("\n")}\n---\n\n`;
}

export function formatThreadContext(previousMessages: string[]): string {
  return formatMessageSection("Context from the Slack thread", previousMessages);
}

export function formatInterimThreadContext(interimMessages: string[]): string {
  return formatMessageSection(
    "New messages in the Slack thread since your last task",
    interimMessages
  );
}

/**
 * Appended to the initial Slack session prompt. Unlike Linear (where every
 * session implements an issue), Slack is used for both questions and change
 * requests, so the pull-request step is conditional: the agent decides based
 * on whether a code change was actually requested.
 */
export const SLACK_CODE_CHANGE_PR_INSTRUCTION =
  "If this request asked you to make a code change, open a pull request with your changes when you're done. If it was only a question or discussion, you don't need to open a pull request.";

export function formatChannelContext(channelName: string, channelDescription?: string): string {
  let context = `Slack channel context:\n---\nChannel: #${channelName}`;
  if (channelDescription) context += `\nDescription: ${channelDescription}`;
  return `${context}\n---\n\n`;
}
