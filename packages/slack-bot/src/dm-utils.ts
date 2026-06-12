import { applyMentionPolicy } from "@open-inspect/shared";

/**
 * Strip Slack user mention tokens (e.g. <@U12345>) from text and collapse
 * resulting whitespace. DMs may include self-mentions when users type
 * "@Bot <request>".
 */
export function stripMentions(text: string): string {
  return applyMentionPolicy(text, "strip").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if a Slack message event should be dispatched as a DM.
 * Filters out subtypes (bot_message, message_changed, message_deleted, etc.)
 * to prevent processing bot replies and edit/delete notifications.
 */
export function isDmDispatchable(event: {
  type: string;
  subtype?: string;
  channel_type?: string;
  text?: string;
  channel?: string;
  ts?: string;
  user?: string;
  files?: unknown[];
}): boolean {
  // Dispatchable when the DM carries text or files. File-only messages arrive
  // with the "file_share" subtype and empty text, so that subtype is allowed;
  // all other subtypes (edits, deletes, bot replies) are still ignored.
  const hasContent = !!event.text || !!event.files?.length;
  const allowedSubtype = !event.subtype || event.subtype === "file_share";
  return (
    event.type === "message" &&
    allowedSubtype &&
    event.channel_type === "im" &&
    hasContent &&
    !!event.channel &&
    !!event.ts &&
    !!event.user
  );
}
