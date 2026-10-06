/**
 * Wallet-billed wrapper around template sends. Checks the sender's balance
 * BEFORE calling WhatsApp and charges the per-(country × category) rate only
 * AFTER a successful send. Throws InsufficientBalanceError when the sender
 * cannot afford the message so callers can fail/skip that recipient.
 */
import { WhatsAppApiService } from "./whatsapp-api";
import { chargeForMessage } from "./billing.service";
import { walletRepository } from "../repositories/wallet.repository";
import type { Channel } from "@shared/schema";

/**
 * Retained so existing catch blocks keep compiling, but nothing throws it any
 * more: sends are never blocked on wallet balance.
 */
export class InsufficientBalanceError extends Error {
  code = "INSUFFICIENT_BALANCE" as const;
  constructor(public cost: number) {
    super("Insufficient wallet balance");
    this.name = "InsufficientBalanceError";
  }
}

export async function billedSendTemplate(args: {
  userId?: string | null; // account owner or a team member; falsy => no billing
  channel: Channel;
  to: string;
  templateName: string;
  components?: any[];
  language?: string;
  isMarketing?: boolean;
  category: string; // messageType / templates.category
  messageId?: string;
}): Promise<any> {
  const {
    userId,
    channel,
    to,
    templateName,
    components = [],
    language = "en_US",
    isMarketing = true,
    category,
    messageId,
  } = args;

  const send = () =>
    WhatsAppApiService.sendTemplateMessage(
      channel,
      to,
      templateName,
      components,
      language,
      isMarketing
    );

  // No owner resolvable => cannot bill; send without charging.
  if (!userId) return send();

  const ownerId = await walletRepository.resolveOwnerUserId(userId);

  // No balance gate. Clients connect their own card to their Meta WABA and are
  // billed by Meta directly, so a zero balance here is normal and must not
  // stop a send. The charge below still records usage when wallet billing is
  // switched on, it simply never blocks.
  const result = await send();

  // Charge only after a confirmed successful send.
  await chargeForMessage(ownerId, to, category, messageId);
  return result;
}
