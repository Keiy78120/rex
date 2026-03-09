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

// TODO: implement via discord.js or Discord Webhook API
export class DiscordAdapter implements ChannelAdapter {
  readonly name = 'discord';
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  isAvailable(): boolean {
    return false;
  }

  async send(_to: string, _msg: OutboundMessage): Promise<void> {
    throw new Error('Discord adapter not yet implemented');
  }

  normalize(_raw: unknown): GatewayMessage | null {
    return null;
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
