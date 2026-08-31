/**
 * Import the members of a WhatsApp group as contacts.
 *
 * Scan a QR to link a WhatsApp account, pick one of its groups, choose who to
 * bring over, and they land in the segment. The link is read-only and can be
 * disconnected from here or from WhatsApp → Linked devices.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  MessageCircle,
  Loader2,
  Search,
  Users,
  ChevronLeft,
  Check,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface WaGroup {
  id: string;
  name: string;
  size: number;
}

interface WaMember {
  phone: string;
  name: string;
  isAdmin: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId?: string;
  /** Import straight into this group instead of creating a new segment. */
  targetGroupName?: string;
  onImported: () => void;
}

function defaultSegmentName(groupName: string): string {
  // Commas are avoided so the name survives every filter it passes through.
  return groupName.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

export default function ImportFromWhatsAppGroupDialog({
  open,
  onOpenChange,
  channelId,
  targetGroupName,
  onImported,
}: Props) {
  const { toast } = useToast();

  const [status, setStatus] = useState<
    "idle" | "connecting" | "qr" | "connected" | "disconnected"
  >("idle");
  const [qr, setQr] = useState<string | undefined>();
  const [me, setMe] = useState<{ phone?: string; name?: string } | undefined>();
  const [sessionError, setSessionError] = useState<string | undefined>();

  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [activeGroup, setActiveGroup] = useState<WaGroup | null>(null);
  const [members, setMembers] = useState<WaMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [segmentName, setSegmentName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    invalid: number;
    name: string;
  } | null>(null);

  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const resetAll = () => {
    stopPolling();
    setStatus("idle");
    setQr(undefined);
    setMe(undefined);
    setSessionError(undefined);
    setGroups([]);
    setGroupSearch("");
    setActiveGroup(null);
    setMembers([]);
    setMemberSearch("");
    setSelected(new Set());
    setSegmentName("");
    setResult(null);
  };

  // Opening the dialog picks up an existing link if there is one, so a second
  // import does not ask for another scan.
  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await apiRequest("GET", "/api/whatsapp-web/session");
        const data = await res.json();
        if (cancelled) return;
        applySessionState(data);
        if (data.status === "connected") void loadGroups();
      } catch {
        /* not linked yet — the connect button starts one */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => stopPolling, []);

  const applySessionState = (data: any) => {
    setStatus(data.status);
    setQr(data.qr);
    setMe(data.me);
    setSessionError(data.error);
    if (data.status === "connected") {
      stopPolling();
    }
  };

  const connect = async () => {
    setStatus("connecting");
    setSessionError(undefined);
    try {
      const res = await apiRequest("POST", "/api/whatsapp-web/session");
      applySessionState(await res.json());

      // The QR rotates every ~20s, so keep pulling the current one until the
      // phone completes the scan.
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const poll = await apiRequest("GET", "/api/whatsapp-web/session");
          const data = await poll.json();
          applySessionState(data);
          if (data.status === "connected") {
            toast({
              title: "WhatsApp connected",
              description: data.me?.phone ? `Linked to ${data.me.phone}` : undefined,
            });
            void loadGroups();
          }
        } catch {
          /* keep polling */
        }
      }, 2500);
    } catch (err: any) {
      setStatus("disconnected");
      setSessionError(err?.message || "Could not start a WhatsApp session");
      toast({
        title: "Could not connect",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const disconnect = async () => {
    try {
      await apiRequest("DELETE", "/api/whatsapp-web/session");
    } catch {
      /* it is going away either way */
    }
    resetAll();
    toast({ title: "Disconnected" });
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await apiRequest("GET", "/api/whatsapp-web/groups");
      const data = await res.json();
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (err: any) {
      toast({
        title: "Could not read your groups",
        description: err?.message || "Try reconnecting",
        variant: "destructive",
      });
    } finally {
      setLoadingGroups(false);
    }
  };

  const openGroup = async (group: WaGroup) => {
    setActiveGroup(group);
    setMembers([]);
    setSelected(new Set());
    setMemberSearch("");
    setSegmentName(targetGroupName || defaultSegmentName(group.name));
    setLoadingMembers(true);
    try {
      const res = await apiRequest(
        "GET",
        `/api/whatsapp-web/groups/${encodeURIComponent(group.id)}/members`
      );
      const data = await res.json();
      const list: WaMember[] = Array.isArray(data.members) ? data.members : [];
      setMembers(list);
      // Everyone is selected to begin with — the common case is "import them all".
      setSelected(new Set(list.map((m) => m.phone)));
    } catch (err: any) {
      toast({
        title: "Could not read this group",
        description: err?.message || "Try again",
        variant: "destructive",
      });
      setActiveGroup(null);
    } finally {
      setLoadingMembers(false);
    }
  };

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, groupSearch]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return q
      ? members.filter(
          (m) => m.name.toLowerCase().includes(q) || m.phone.includes(q)
        )
      : members;
  }, [members, memberSearch]);

  const allFilteredSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((m) => selected.has(m.phone));

  const toggleAllFiltered = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filteredMembers.forEach((m) => next.delete(m.phone));
    } else {
      filteredMembers.forEach((m) => next.add(m.phone));
    }
    setSelected(next);
  };

  const toggleOne = (phone: string) => {
    const next = new Set(selected);
    if (next.has(phone)) next.delete(phone);
    else next.add(phone);
    setSelected(next);
  };

  const doImport = async () => {
    const name = segmentName.trim();
    if (!name) {
      return toast({
        title: "Segment name is required",
        variant: "destructive",
      });
    }
    const chosen = members.filter((m) => selected.has(m.phone));
    if (chosen.length === 0) return;

    setIsImporting(true);
    try {
      if (!targetGroupName) {
        await apiRequest("POST", "/api/groups", {
          name,
          description: `Imported from the WhatsApp group "${activeGroup?.name}"`,
          channelId,
        }).catch(() => undefined);
      }

      const res = await apiRequest("POST", "/api/contacts/import", {
        channelId,
        groupName: name,
        contacts: chosen.map((m) => ({
          name: m.name,
          phone: m.phone,
          groups: [name],
        })),
      });
      const data = await res.json();

      setResult({
        imported: data.imported ?? 0,
        duplicates: data.duplicates ?? 0,
        invalid: data.invalid ?? 0,
        name,
      });
      onImported();
      toast({
        title: "Contacts imported",
        description: `${data.imported ?? 0} added to "${name}".`,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not import these contacts",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          stopPolling();
          setResult(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Import from a WhatsApp group
          </DialogTitle>
          <DialogDescription>
            {activeGroup
              ? `Choose who to bring over from "${activeGroup.name}".`
              : "Link a WhatsApp account to read the groups it belongs to."}
          </DialogDescription>
        </DialogHeader>

        {/* ---------- Result ---------- */}
        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-green-800">
                  {result.imported} contact{result.imported === 1 ? "" : "s"} added to
                  "{result.name}"
                </p>
                {result.duplicates > 0 && (
                  <p className="text-green-700 mt-1">
                    {result.duplicates} were already in your contacts and have been
                    tagged into this segment.
                  </p>
                )}
                {result.invalid > 0 && (
                  <p className="text-amber-700 mt-1">
                    {result.invalid} could not be read and were skipped.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setActiveGroup(null);
                }}
              >
                Import another group
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : status !== "connected" ? (
          /* ---------- Connect ---------- */
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">This links a real WhatsApp account</p>
                <p className="mt-1">
                  It appears under <b>Linked devices</b> on the phone and is only
                  used to read your groups — no messages are sent from it. Use an
                  account you own, and unlink it when you are done.
                </p>
              </div>
            </div>

            {status === "qr" && qr ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="rounded-lg border p-4 bg-white">
                  <QRCodeSVG value={qr} size={220} />
                </div>
                <ol className="text-sm text-gray-600 list-decimal ml-5 space-y-0.5">
                  <li>Open WhatsApp on your phone</li>
                  <li>
                    Tap <b>Settings → Linked devices → Link a device</b>
                  </li>
                  <li>Scan this code</li>
                </ol>
                <p className="text-xs text-gray-400">
                  The code refreshes by itself — keep this window open.
                </p>
              </div>
            ) : status === "connecting" ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin" />
                Preparing the QR code…
              </div>
            ) : (
              <div className="space-y-3">
                {sessionError && (
                  <p className="text-sm text-red-600">{sessionError}</p>
                )}
                <Button className="w-full" onClick={connect}>
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Connect WhatsApp
                </Button>
              </div>
            )}
          </div>
        ) : activeGroup ? (
          /* ---------- Members ---------- */
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setActiveGroup(null)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              All groups
            </Button>

            {loadingMembers ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin" />
                Reading members…
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search by name or number"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                    />
                    <span>
                      Select all{memberSearch ? " matching" : ""} (
                      {filteredMembers.length})
                    </span>
                  </label>
                  <span className="text-gray-500">{selected.size} selected</span>
                </div>

                <div className="rounded-lg border max-h-64 overflow-y-auto divide-y">
                  {filteredMembers.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-500">
                      No members match "{memberSearch}".
                    </p>
                  ) : (
                    filteredMembers.map((m) => (
                      <label
                        key={m.phone}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                      >
                        <Checkbox
                          checked={selected.has(m.phone)}
                          onCheckedChange={() => toggleOne(m.phone)}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {m.name}
                            {m.isAdmin && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                                admin
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{m.phone}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                {targetGroupName ? (
                  <p className="text-sm text-gray-600">
                    These will be added to <b>{targetGroupName}</b>.
                  </p>
                ) : (
                  <div>
                    <Label htmlFor="wa-segment-name">New segment name</Label>
                    <Input
                      id="wa-segment-name"
                      value={segmentName}
                      onChange={(e) => setSegmentName(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={doImport}
                    disabled={isImporting || selected.size === 0}
                  >
                    {isImporting && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Import {selected.size}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ---------- Group list ---------- */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Linked to <b>{me?.phone || "WhatsApp"}</b>
              </span>
              <Button variant="ghost" size="sm" onClick={disconnect}>
                <LogOut className="w-4 h-4 mr-1" />
                Disconnect
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search groups"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>

            {loadingGroups ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin" />
                Reading your groups…
              </div>
            ) : filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                {groups.length === 0
                  ? "This account is not in any groups."
                  : `No groups match "${groupSearch}".`}
              </p>
            ) : (
              <div className="rounded-lg border max-h-72 overflow-y-auto divide-y">
                {filteredGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => openGroup(g)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {g.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Users className="w-3 h-3" />
                        {g.size} member{g.size === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
