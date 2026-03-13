import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import type { WhatsAppConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class WhatsAppExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'whatsapp',
    version: '0.1.0',
    description: 'WhatsApp channel via Baileys (multi-device)',
    type: 'extension',
    provides: { channels: ['whatsapp'] },
    permissions: { network: ['*.whatsapp.net', '*.whatsapp.com'] },
  };

  private config: WhatsAppConfig;
  private sock: any = null;
  protected messageHandler?: MessageHandler;

  constructor(config: WhatsAppConfig) {
    super();
    this.config = { printQrInTerminal: true, ...config };
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async onLoad(): Promise<void> {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } =
      await import('@whiskeysockets/baileys');
    const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: this.config.printQrInTerminal,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          this.onLoad();
        }
      }
    });

    this.sock.ev.on('messages.upsert', async (upsert: any) => {
      if (!this.messageHandler) return;
      for (const msg of upsert.messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid ?? '';
        const text =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          '';
        if (!text) continue;
        if (
          this.config.allowFrom?.length &&
          !this.config.allowFrom.includes(jid) &&
          !this.config.allowFrom.includes('*')
        )
          continue;

        const unified: UnifiedMessage = {
          id: msg.key.id ?? `wa-${Date.now()}`,
          source: {
            channel: 'whatsapp',
            userId: jid,
            sessionId: `wa-${jid}`,
          },
          content: { type: 'text', text },
          timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
        };
        await this.messageHandler(unified);
      }
    });
  }

  async onUnload(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    await this.sock.sendMessage(msg.targetUserId, {
      text: msg.content.text ?? '',
    });
  }
}
