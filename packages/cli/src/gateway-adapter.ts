/** @module GATEWAY */

import { createLogger } from './logger.js';

const log = createLogger('gateway-adapter');

export const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface GatewayMessage {
  channel: string;       // 'telegram' | 'discord' | 'slack' | 'ws'
  from: string;          // display name of sender
  text: string;          // message text
  ts: string;            // ISO timestamp
  meta?: Record<string, unknown>;  // channel-specific metadata
}

export interface OutboundMessage {
  text: string;
  parseMode?: 'Markdown' | 'HTML' | 'plain';
  buttons?: Array<Array<{ label: string; callbackData: string }>>;
}

export interface ChannelAdapter {
  name: string;
  isAvailable(): boolean;
  send(to: string, msg: OutboundMessage): Promise<void>;
  normalize(raw: unknown): GatewayMessage | null;
}

// ─── Telegram types ───────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: {
    inline_keyboard: TelegramInlineButton[][];
  };
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

// ─── TelegramAdapter ──────────────────────────────────────────────────────────

export class TelegramAdapter implements ChannelAdapter {
  readonly name = 'telegram';
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  isAvailable(): boolean {
    return !!this.token;
  }

  async send(chatId: string, msg: OutboundMessage): Promise<void> {
    const payload: TelegramSendMessagePayload = {
      chat_id: chatId,
      text: msg.text,
    };

    if (msg.parseMode && msg.parseMode !== 'plain') {
      payload.parse_mode = msg.parseMode;
    }

    if (msg.buttons && msg.buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: msg.buttons.map((row) =>
          row.map((btn) => ({
            text: btn.label,
            callback_data: btn.callbackData,
          }))
        ),
      };
    }

    const url = `${TELEGRAM_API_BASE}${this.token}/sendMessage`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Telegram fetch error: ${message}`);
      throw new Error(`Telegram send failed: ${message}`);
    }

    const result = (await response.json()) as TelegramApiResponse;

    if (!result.ok) {
      const desc = result.description ?? 'unknown error';
      log.error(`Telegram API error: ${desc}`);
      throw new Error(`Telegram API error: ${desc}`);
    }

    log.debug(`Telegram message sent to ${chatId}`);
  }

  normalize(raw: unknown): GatewayMessage | null {
    if (!raw || typeof raw !== 'object') return null;

    const update = raw as Partial<TelegramUpdate>;

    if (!update.message?.text) return null;

    const msg = update.message;
    const from = msg.from?.username ?? msg.from?.first_name ?? '?';
    const ts = new Date(msg.date * 1000).toISOString();

    return {
      channel: 'telegram',
      from,
      text: msg.text,
      ts,
      meta: {
        update_id: update.update_id,
        chat_id: msg.chat.id,
        message_id: msg.message_id,
      },
    };
  }
}

// ─── DiscordAdapter ───────────────────────────────────────────────────────────

interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }>;
}

interface DiscordInteractionMessage {
  id: string;
  content?: string;
  author?: { username?: string; global_name?: string };
  timestamp?: string;
}

/**
 * Discord adapter using Webhook URL for send (outbound-only).
 * Webhook URL is stored as `token` — full https://discord.com/api/webhooks/... URL.
 * Receive (normalize) parses Discord interaction payloads (for future bot support).
 */
export class DiscordAdapter implements ChannelAdapter {
  readonly name = 'discord';
  private readonly webhookUrl: string;

  constructor(token: string) {
    this.webhookUrl = token;
  }

  isAvailable(): boolean {
    return !!this.webhookUrl && this.webhookUrl.startsWith('https://discord.com/api/webhooks/');
  }

  async send(_to: string, msg: OutboundMessage): Promise<void> {
    if (!this.isAvailable()) throw new Error('Discord webhook URL not configured');

    // Strip Telegram Markdown (* ** ``) → plain text for Discord
    const text = msg.parseMode === 'Markdown'
      ? msg.text.replace(/\*\*/g, '**').replace(/(?<!\*)\*(?!\*)/g, '*')
      : msg.text;

    const payload: DiscordWebhookPayload = {
      username: 'REX',
      content: text.length <= 2000 ? text : text.slice(0, 1997) + '…',
    };

    let response: Response;
    try {
      response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Discord fetch error: ${message}`);
      throw new Error(`Discord send failed: ${message}`);
    }

    // Discord returns 204 No Content on success for webhooks
    if (!response.ok && response.status !== 204) {
      const body = await response.text().catch(() => '');
      log.error(`Discord webhook error ${response.status}: ${body.slice(0, 100)}`);
      throw new Error(`Discord webhook error: ${response.status}`);
    }

    log.debug(`Discord message sent via webhook`);
  }

  normalize(raw: unknown): GatewayMessage | null {
    // Discord webhooks are send-only; this handles potential bot interaction payloads
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw as Partial<DiscordInteractionMessage>;
    if (!payload.content) return null;
    return {
      channel: 'discord',
      from: payload.author?.global_name ?? payload.author?.username ?? 'discord',
      text: payload.content,
      ts: payload.timestamp ?? new Date().toISOString(),
      meta: { id: payload.id },
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAdapter(channel: string, token: string): ChannelAdapter {
  switch (channel) {
    case 'telegram':
      return new TelegramAdapter(token);
    case 'discord':
      return new DiscordAdapter(token);
    default:
      throw new Error(`Unknown gateway channel: ${channel}`);
  }
}

export function getAvailableAdapters(config: {
  telegram?: string;
  discord?: string;
}): ChannelAdapter[] {
  const adapters: ChannelAdapter[] = [];

  if (config.telegram !== undefined) {
    adapters.push(new TelegramAdapter(config.telegram));
  }
  if (config.discord !== undefined) {
    adapters.push(new DiscordAdapter(config.discord));
  }

  return adapters.filter((a) => a.isAvailable());
}

/**
 * Load all configured adapters from environment + settings.json.
 * Keys: REX_TELEGRAM_BOT_TOKEN, REX_DISCORD_WEBHOOK_URL.
 */
export async function loadAdaptersFromEnv(): Promise<ChannelAdapter[]> {
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');

  let settingsEnv: Record<string, string> = {};
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { env?: Record<string, string> };
      settingsEnv = data.env ?? {};
    }
  } catch {}

  const telegramToken = process.env.REX_TELEGRAM_BOT_TOKEN ?? settingsEnv.REX_TELEGRAM_BOT_TOKEN ?? '';
  const discordWebhook = process.env.REX_DISCORD_WEBHOOK_URL ?? settingsEnv.REX_DISCORD_WEBHOOK_URL ?? '';

  return getAvailableAdapters({ telegram: telegramToken || undefined, discord: discordWebhook || undefined });
}
