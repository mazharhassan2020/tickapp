/**
 * A temporary, read-only WhatsApp Web link used for one thing: listing the
 * groups an account is in and the members of one of them, so those numbers can
 * be imported as contacts.
 *
 * This talks to WhatsApp the way the desktop app does (Baileys), not through
 * the Cloud API — the Cloud API cannot see a personal account's groups at all.
 * It never sends a message; it reads group metadata and closes.
 *
 * One session per tenant, kept in memory with its credentials on disk so a
 * refresh does not force another QR scan. Idle sessions are dropped.
 */
import fs from "fs";
import path from "path";

type SessionStatus = "connecting" | "qr" | "connected" | "disconnected";

interface WaSession {
  ownerId: string;
  sock: any;
  status: SessionStatus;
  qr?: string;
  me?: { phone?: string; name?: string };
  error?: string;
  /** jid → best known display name, filled from the account's own contact list. */
  names: Map<string, string>;
  lastUsedAt: number;
  closing?: boolean;
}

const sessions = new Map<string, WaSession>();

const SESSION_ROOT = path.resolve(process.cwd(), "uploads", "wa-web");
/** A link left open with nobody using it is closed. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function sessionDir(ownerId: string) {
  return path.join(SESSION_ROOT, ownerId.replace(/[^a-zA-Z0-9_-]/g, ""));
}

/**
 * "971501234567@s.whatsapp.net" → "971501234567".
 *
 * The domain matters: WhatsApp also identifies people by a LID
 * ("100176219869204@lid"), which is an internal id, not a number. A LID looks
 * enough like a phone number to be imported by mistake and would then be
 * messaged into the void, so only phone-number JIDs are accepted here.
 */
function phoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const raw = String(jid);
  const [userPart, domain] = raw.split("@");
  if (domain && domain !== "s.whatsapp.net" && domain !== "c.us") return null;
  const digits = (userPart?.split(":")[0] ?? "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

/** The LID half of a participant, when that is how the group addresses them. */
function participantLid(p: any): string | null {
  for (const candidate of [p?.id, p?.lid, p?.jid]) {
    if (typeof candidate === "string" && candidate.endsWith("@lid")) return candidate;
  }
  return null;
}

/** A participant's phone number, if the group exposes one at all. */
function participantPhone(p: any): string | null {
  return (
    phoneFromJid(p?.phoneNumber) ?? phoneFromJid(p?.id) ?? phoneFromJid(p?.jid)
  );
}

function touch(session: WaSession) {
  session.lastUsedAt = Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [ownerId, session] of sessions) {
    if (now - session.lastUsedAt > IDLE_TIMEOUT_MS) {
      void closeSession(ownerId, { forget: false });
    }
  }
}, 60_000).unref?.();

async function loadBaileys() {
  // Imported lazily: the rest of the server must boot even if this optional
  // dependency is missing from an install.
  const mod: any = await import("@whiskeysockets/baileys");
  return {
    makeWASocket: mod.default ?? mod.makeWASocket,
    useMultiFileAuthState: mod.useMultiFileAuthState,
    fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    DisconnectReason: mod.DisconnectReason,
  };
}

/** Quiet logger — Baileys expects a pino-shaped object. */
function silentLogger(): any {
  const noop = () => {};
  const logger: any = {
    level: "silent",
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  };
  logger.child = () => logger;
  return logger;
}

export async function startSession(ownerId: string): Promise<WaSession> {
  const existing = sessions.get(ownerId);
  if (existing && existing.status !== "disconnected") {
    touch(existing);
    return existing;
  }

  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } =
    await loadBaileys();

  const dir = sessionDir(ownerId);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger(),
    printQRInTerminal: false,
    browser: ["WhatsWay Importer", "Chrome", "1.0.0"],
    // Nothing here reads messages; skipping history keeps the link light.
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  const session: WaSession = {
    ownerId,
    sock,
    status: "connecting",
    names: new Map(),
    lastUsedAt: Date.now(),
  };
  sessions.set(ownerId, session);

  sock.ev.on("creds.update", saveCreds);

  // WhatsApp pushes the account's address book on connect; that is where the
  // saved names for group members come from.
  const rememberNames = (list: any[]) => {
    for (const c of list || []) {
      const name = c?.name || c?.notify || c?.verifiedName;
      if (!name) continue;
      for (const id of [c.id, c.phoneNumber, c.lid]) {
        if (id) session.names.set(String(id), name);
      }
    }
  };
  sock.ev.on("contacts.upsert", rememberNames);
  sock.ev.on("contacts.update", rememberNames);
  sock.ev.on("messaging-history.set", (h: any) => rememberNames(h?.contacts || []));

  sock.ev.on("connection.update", (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = qr;
      session.status = "qr";
    }

    if (connection === "open") {
      session.status = "connected";
      session.qr = undefined;
      session.error = undefined;
      const meId = sock.user?.id;
      session.me = {
        phone: phoneFromJid(meId) ?? undefined,
        name: sock.user?.name || sock.user?.verifiedName,
      };
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      // 401 means the link was removed from the phone — the stored credentials
      // are useless, so drop them rather than retrying into a loop.
      const loggedOut = statusCode === 401;
      session.status = "disconnected";
      session.error = loggedOut
        ? "This device was unlinked from WhatsApp. Scan again to reconnect."
        : lastDisconnect?.error?.message;
      if (loggedOut) {
        fs.rmSync(sessionDir(ownerId), { recursive: true, force: true });
      }
      sessions.delete(ownerId);
    }
  });

  return session;
}

export interface SessionState {
  status: SessionStatus;
  qr?: string;
  me?: { phone?: string; name?: string };
  error?: string;
}

export function getSessionState(ownerId: string): SessionState {
  const session = sessions.get(ownerId);
  if (!session) return { status: "disconnected" };
  touch(session);
  return {
    status: session.status,
    qr: session.qr,
    me: session.me,
    error: session.error,
  };
}

function requireConnected(ownerId: string): WaSession {
  const session = sessions.get(ownerId);
  if (!session || session.status !== "connected") {
    throw new Error("WhatsApp is not connected. Scan the QR code first.");
  }
  touch(session);
  return session;
}

export interface WaGroupSummary {
  id: string;
  name: string;
  size: number;
}

export async function listGroups(ownerId: string): Promise<WaGroupSummary[]> {
  const session = requireConnected(ownerId);
  const all = await session.sock.groupFetchAllParticipating();

  return Object.values(all || {})
    .map((g: any) => ({
      id: g.id,
      name: g.subject || g.id,
      size: g.size ?? g.participants?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface WaGroupMember {
  phone: string;
  name: string;
  isAdmin: boolean;
}

/**
 * Some groups address their members by LID rather than by phone number. Ask the
 * signal store to translate them; whatever it cannot translate has no phone
 * number available to us at all.
 */
async function resolveLidPhones(
  session: WaSession,
  lids: string[]
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (lids.length === 0) return resolved;

  const store = session.sock?.signalRepository?.lidMapping;
  if (!store) return resolved;

  const record = (lid?: string, pn?: string) => {
    const phone = phoneFromJid(pn);
    if (lid && phone) resolved.set(lid, phone);
  };

  try {
    if (typeof store.getPNsForLIDs === "function") {
      const pairs = await store.getPNsForLIDs(lids);
      for (const pair of pairs || []) record(pair?.lid, pair?.pn);
    }
  } catch {
    /* fall through to the one-at-a-time path */
  }

  // Anything the batch call did not cover — older stores only have the single
  // lookup, and a partial batch result is normal.
  const missing = lids.filter((lid) => !resolved.has(lid));
  if (missing.length > 0 && typeof store.getPNForLID === "function") {
    await Promise.all(
      missing.map(async (lid) => {
        try {
          record(lid, await store.getPNForLID(lid));
        } catch {
          /* unresolvable */
        }
      })
    );
  }

  return resolved;
}

export async function listGroupMembers(
  ownerId: string,
  groupId: string
): Promise<{
  group: WaGroupSummary;
  members: WaGroupMember[];
  hidden: number;
}> {
  const session = requireConnected(ownerId);
  const meta = await session.sock.groupMetadata(groupId);
  const participants: any[] = meta?.participants || [];

  // Translate LID-only participants up front, in one pass.
  const pendingLids = participants
    .filter((p) => !participantPhone(p))
    .map((p) => participantLid(p))
    .filter((lid): lid is string => !!lid);
  const lidPhones = await resolveLidPhones(session, Array.from(new Set(pendingLids)));

  const seen = new Set<string>();
  const members: WaGroupMember[] = [];
  let hidden = 0;

  for (const p of participants) {
    const lid = participantLid(p);
    const phone = participantPhone(p) ?? (lid ? lidPhones.get(lid) ?? null : null);
    // WhatsApp hides the number of members who are not reachable by phone JID
    // — importing their LID would create a contact nobody can message.
    if (!phone) {
      hidden++;
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);

    // Saved name first, then whatever the person set as their own WhatsApp
    // name; a number with neither is imported under the number itself.
    const name =
      session.names.get(p.id) ||
      session.names.get(p.phoneNumber) ||
      session.names.get(p.lid) ||
      session.names.get(`${phone}@s.whatsapp.net`) ||
      p.name ||
      p.notify ||
      p.verifiedName ||
      phone;

    members.push({
      phone,
      name: String(name),
      isAdmin: !!p.admin || !!p.isAdmin || !!p.isSuperAdmin,
    });
  }

  members.sort((a, b) => a.name.localeCompare(b.name));

  return {
    group: {
      id: meta.id,
      name: meta.subject || meta.id,
      size: meta.size ?? participants.length,
    },
    members,
    hidden,
  };
}

export async function closeSession(
  ownerId: string,
  { forget = true }: { forget?: boolean } = {}
): Promise<void> {
  const session = sessions.get(ownerId);
  sessions.delete(ownerId);

  if (session && !session.closing) {
    session.closing = true;
    try {
      // logout unlinks the device on the phone; a plain close just drops the
      // socket and keeps the credentials for next time.
      if (forget) await session.sock.logout();
      else session.sock.end?.(undefined);
    } catch {
      try {
        session.sock.end?.(undefined);
      } catch {
        /* already gone */
      }
    }
  }

  if (forget) {
    fs.rmSync(sessionDir(ownerId), { recursive: true, force: true });
  }
}
