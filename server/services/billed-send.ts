/**
 * Wallet-billed wrapper around template sends. Checks the sender's balance
 * BEFORE calling WhatsApp and charges the per-(country × category) rate only
 * AFTER a successful send. Throws InsufficientBalanceError when the sender
 * cannot afford the message so callers can fail/skip that recipient.
 */
import { WhatsAppApiService } from "./whatsapp-api";
import { hasSufficientBalance, chargeForMessage } from "./billing.service";
import { walletRepository } from "../repositories/wallet.repository";
import type { Channel } from "@shared/schema";

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
  const check = await hasSufficientBalance(ownerId, to, category);
  if (!check.ok) throw new InsufficientBalanceError(check.cost);

  const result = await send();

  // Charge only after a confirmed successful send.
  await chargeForMessage(ownerId, to, category, messageId);
  return result;
}
