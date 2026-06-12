/**
 * Slack Web API client. The bot token is the first positional argument on
 * every method so that distinct workers (slack-bot, control-plane) can
 * supply their own token without sharing module-level state.
 *
 * Errors from the Slack API are returned as `{ ok: false, error }` envelopes;
 * HTTP-level failures (4xx/5xx, network errors, malformed bodies) are
 * mapped into the same envelope shape so callers never need to catch.
 */

import { computeHmacHex, timingSafeEqual } from "../auth";

const SLACK_API_BASE = "https://slack.com/api";

/**
 * Discriminated success/failure envelope returned by every Slack API method.
 *
 * The success arm is `{ ok: true } & T`; the failure arm carries an `error`
 * string (Slack's `error` field, or one of the synthesized values
 * `network_error` / `invalid_response` / `http_<status>` / `ratelimited`).
 */
export type SlackEnvelope<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; retryAfter?: number };

async function slackFetch<T>(
  token: string,
  endpoint: string,
  method: "GET" | "POST",
  init?: { query?: Record<string, string>; body?: Record<string, unknown> }
): Promise<SlackEnvelope<T>> {
  const url = init?.query
    ? `${SLACK_API_BASE}/${endpoint}?${new URLSearchParams(init.query).toString()}`
    : `${SLACK_API_BASE}/${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (init?.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (response.status === 429) {
    const retryHeader = response.headers.get("retry-after");
    const parsed = retryHeader ? parseInt(retryHeader, 10) : NaN;
    return {
      ok: false,
      error: "ratelimited",
      ...(Number.isFinite(parsed) ? { retryAfter: parsed } : {}),
    };
  }

  if (!response.ok) {
    return { ok: false, error: `http_${response.status}` };
  }

  try {
    return (await response.json()) as SlackEnvelope<T>;
  } catch {
    return { ok: false, error: "invalid_response" };
  }
}

function slackGet<T>(
  token: string,
  endpoint: string,
  query?: Record<string, string>
): Promise<SlackEnvelope<T>> {
  return slackFetch<T>(token, endpoint, "GET", query ? { query } : undefined);
}

function slackPost<T>(
  token: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<SlackEnvelope<T>> {
  return slackFetch<T>(token, endpoint, "POST", body ? { body } : undefined);
}

/**
 * Verify a Slack request signature using the Web Crypto API.
 *
 * Enforces a 5-minute replay-attack window on the timestamp.
 */
export async function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
  signingSecret: string
): Promise<boolean> {
  if (!signature || !timestamp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body}`;
  const hashHex = await computeHmacHex(baseString, signingSecret);
  const expectedSignature = `v0=${hashHex}`;

  return timingSafeEqual(signature, expectedSignature);
}

export function postMessage(
  token: string,
  channel: string,
  text: string,
  options?: {
    thread_ts?: string;
    blocks?: unknown[];
    reply_broadcast?: boolean;
  }
): Promise<SlackEnvelope<{ channel: string; ts: string }>> {
  return slackPost(token, "chat.postMessage", {
    channel,
    text,
    thread_ts: options?.thread_ts,
    blocks: options?.blocks,
    reply_broadcast: options?.reply_broadcast,
  });
}

export function getPermalink(
  token: string,
  channel: string,
  messageTs: string
): Promise<SlackEnvelope<{ permalink: string; channel: string }>> {
  return slackGet(token, "chat.getPermalink", { channel, message_ts: messageTs });
}

export function updateMessage(
  token: string,
  channel: string,
  ts: string,
  text: string,
  options?: { blocks?: unknown[] }
): Promise<SlackEnvelope> {
  return slackPost(token, "chat.update", {
    channel,
    ts,
    text,
    blocks: options?.blocks,
  });
}

export function addReaction(
  token: string,
  channel: string,
  messageTs: string,
  name: string
): Promise<SlackEnvelope> {
  return slackPost(token, "reactions.add", { channel, timestamp: messageTs, name });
}

export function removeReaction(
  token: string,
  channel: string,
  messageTs: string,
  name: string
): Promise<SlackEnvelope> {
  return slackPost(token, "reactions.remove", { channel, timestamp: messageTs, name });
}

export interface SlackChannelInfo {
  id: string;
  name: string;
  topic?: { value: string };
  purpose?: { value: string };
}

export function getChannelInfo(
  token: string,
  channelId: string
): Promise<SlackEnvelope<{ channel: SlackChannelInfo }>> {
  return slackGet(token, "conversations.info", { channel: channelId });
}

export interface SlackThreadMessage {
  ts: string;
  text: string;
  user?: string;
  bot_id?: string;
}

export function getThreadMessages(
  token: string,
  channelId: string,
  threadTs: string,
  limit = 10
): Promise<SlackEnvelope<{ messages: SlackThreadMessage[] }>> {
  return slackGet(token, "conversations.replies", {
    channel: channelId,
    ts: threadTs,
    limit: String(limit),
  });
}

/**
 * A file shared in a Slack message. Present in the `files` array of message
 * events when the bot has the `files:read` scope. `url_private_download`
 * requires an authenticated request (bot token) to fetch the bytes.
 */
export interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

export function getFileInfo(
  token: string,
  fileId: string
): Promise<SlackEnvelope<{ file: SlackFile }>> {
  return slackGet(token, "files.info", { file: fileId });
}

/**
 * Download the bytes of a Slack file from its private URL using the bot token.
 *
 * Slack returns the raw file bytes on success. When the token lacks access or
 * the URL is stale, Slack responds 200 with an HTML login page rather than an
 * error, so an `text/html` content type is treated as failure.
 */
export async function downloadSlackFile(
  token: string,
  urlPrivate: string
): Promise<SlackEnvelope<{ bytes: Uint8Array; contentType: string | null }>> {
  let response: Response;
  try {
    response = await fetch(urlPrivate, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (response.status === 429) {
    const retryHeader = response.headers.get("retry-after");
    const parsed = retryHeader ? parseInt(retryHeader, 10) : NaN;
    return {
      ok: false,
      error: "ratelimited",
      ...(Number.isFinite(parsed) ? { retryAfter: parsed } : {}),
    };
  }

  if (!response.ok) {
    return { ok: false, error: `http_${response.status}` };
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("text/html")) {
    return { ok: false, error: "unauthorized_or_expired" };
  }

  try {
    const buffer = await response.arrayBuffer();
    return { ok: true, bytes: new Uint8Array(buffer), contentType };
  } catch {
    return { ok: false, error: "invalid_response" };
  }
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    email?: string;
  };
}

export function getUserInfo(
  token: string,
  userId: string
): Promise<SlackEnvelope<{ user: SlackUser }>> {
  return slackGet(token, "users.info", { user: userId });
}

export function publishView(
  token: string,
  userId: string,
  view: Record<string, unknown>
): Promise<SlackEnvelope> {
  return slackPost(token, "views.publish", { user_id: userId, view });
}

export function openView(
  token: string,
  triggerId: string,
  view: Record<string, unknown>
): Promise<SlackEnvelope> {
  return slackPost(token, "views.open", { trigger_id: triggerId, view });
}
