/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 *
 * Distributed under the Envato / CodeCanyon License Agreement.
 * Licensed to the purchaser for use as defined by the
 * Envato Market (CodeCanyon) Regular or Extended License.
 *
 * You are NOT permitted to redistribute, resell, sublicense,
 * or share this source code, in whole or in part.
 * Respect the author's rights and Envato licensing terms.
 * ============================================================
 */

/**
 * A group as a broadcast list: every template sent to it, newest at the
 * bottom, each with the delivery figures for this group's members and the
 * people behind each number one click away.
 *
 * Laid out as a conversation rather than a table because that is what it is -
 * a running history of what this audience has been told.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Users, Send, Check, CheckCheck, Eye, Reply, XCircle,
  MailQuestion, Search, Loader2, ChevronRight, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

interface Broadcast {
  id: string;
  name: string;
  templateName: string | null;
  templateBody: string | null;
  templateHeader: string | null;
  templateFooter: string | null;
  status: string | null;
  createdAt: string;
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  unread: number;
  replied: number;
  noResponse: number;
  failed: number;
}

interface Recipient {
  name: string | null;
  phone: string;
  status: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  errorMessage: string | null;
}

type Bucket =
  | "sent" | "delivered" | "read" | "unread" | "replied" | "noResponse" | "failed";

const BUCKETS: {
  key: Bucket;
  label: string;
  icon: typeof Check;
  tone?: string;
}[] = [
  { key: "sent", label: "Sent to", icon: Check },
  { key: "delivered", label: "Delivered to", icon: CheckCheck },
  { key: "unread", label: "Unread by", icon: MailQuestion },
  { key: "read", label: "Read by", icon: Eye },
  { key: "replied", label: "Replied by", icon: Reply },
  { key: "noResponse", label: "No response by", icon: MailQuestion },
  { key: "failed", label: "Failed", icon: XCircle, tone: "text-red-600" },
];

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function GroupBroadcastsPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const groupId = (params as any).id as string;

  const [memberSearch, setMemberSearch] = useState("");
  // Which stat row is expanded, keyed by campaign so two can't fight.
  const [openBucket, setOpenBucket] = useState<{ id: string; bucket: Bucket } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/groups", groupId, "broadcasts"],
    enabled: !!groupId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/groups/${groupId}/broadcasts`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{
        group: { id: string; name: string; memberCount: number; channelId: string | null };
        broadcasts: Broadcast[];
      }>;
    },
  });

  const group = data?.group;
  // Oldest first, so the newest sits at the bottom the way a chat reads.
  const broadcasts = useMemo(
    () => [...(data?.broadcasts ?? [])].reverse(),
    [data]
  );

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["/api/group-members", group?.channelId, group?.name, memberSearch],
    enabled: !!group?.name && !!group?.channelId,
    queryFn: async () => {
      const qs = new URLSearchParams({
        channelId: group!.channelId!,
        group: group!.name,
        page: "1",
        limit: "100",
      });
      if (memberSearch.trim()) qs.set("search", memberSearch.trim());
      const res = await fetch(`/api/contacts?${qs}`, {
        credentials: "include",
        headers: { "x-channel-id": group!.channelId! },
      });
      if (!res.ok) throw new Error("Failed to load members");
      return res.json();
    },
  });

  const members = useMemo(() => {
    const raw = membersData?.data || membersData?.contacts || [];
    return Array.isArray(raw) ? raw : [];
  }, [membersData]);

  return (
    <div className="fixed inset-0 lg:left-64 flex flex-col overflow-hidden z-10 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/groups")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
          <Users className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-gray-900">
            {group?.name ?? "Group"}
          </h1>
          <p className="text-xs text-gray-500">
            {group ? `${group.memberCount.toLocaleString()} members` : "…"}
          </p>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={!group}
          onClick={() =>
            // Same hand-off the Groups list uses for "Send campaign", so the
            // campaign composer opens with this group already selected.
            setLocation(
              `/campaigns?createWith=group:${encodeURIComponent(group!.id)}`
            )
          }
        >
          <Send className="mr-2 h-4 w-4" />
          Send WhatsApp Template
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Timeline */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f0f2f5] p-4 md:p-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : isError ? (
            <div className="mx-auto mt-10 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
              <p className="text-sm text-red-700">
                Could not load what has been sent to this group.
              </p>
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm text-center">
              <Send className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">
                No templates sent to this group yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Once you send a campaign to these contacts it appears here, with
                delivery and reply figures.
              </p>
            </div>
          ) : (
            broadcasts.map((b, i) => {
              const prev = i === 0 ? null : broadcasts[i - 1];
              const showDay =
                !prev || dayLabel(prev.createdAt) !== dayLabel(b.createdAt);
              return (
                <div key={b.id}>
                  {showDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-md bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">
                        {dayLabel(b.createdAt)}
                      </span>
                    </div>
                  )}
                  <BroadcastBubble
                    broadcast={b}
                    groupId={groupId}
                    openBucket={
                      openBucket?.id === b.id ? openBucket.bucket : null
                    }
                    onToggleBucket={(bucket) =>
                      setOpenBucket((cur) =>
                        cur?.id === b.id && cur.bucket === bucket
                          ? null
                          : { id: b.id, bucket }
                      )
                    }
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Members */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-gray-200 lg:flex">
          <div className="border-b border-gray-200 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search for members"
                className="pl-8"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {membersLoading ? (
              <div className="p-4 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : members.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">
                {memberSearch ? "No members match that search." : "No members yet."}
              </p>
            ) : (
              members.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {(m.name || m.phone || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {m.name || m.phone}
                    </p>
                    <p className="truncate text-xs text-gray-500">{m.phone}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-gray-200 p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/contacts")}
            >
              <Users className="mr-2 h-4 w-4" />
              Manage members
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BroadcastBubble({
  broadcast,
  groupId,
  openBucket,
  onToggleBucket,
}: {
  broadcast: Broadcast;
  groupId: string;
  openBucket: Bucket | null;
  onToggleBucket: (b: Bucket) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = broadcast.templateBody || broadcast.name;
  const long = body.length > 260;
  const shown = expanded || !long ? body : `${body.slice(0, 260)}…`;

  // Percentages are of the audience actually reached, not of the group, so a
  // contact who was never queued does not drag every figure down.
  const base = broadcast.audience || 1;
  const pct = (n: number) => `${((n / base) * 100).toFixed(1)}%`;

  return (
    <div className="mb-4 flex justify-end">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-[#a8d98a] bg-[#dcf8c6] shadow-sm">
        <div className="px-3 pt-2.5">
          <p className="mb-1 text-xs font-semibold text-emerald-800">
            {broadcast.templateName || "Template"}
          </p>
          {broadcast.templateHeader && (
            <p className="mb-1 text-sm font-semibold text-gray-900">
              {broadcast.templateHeader}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm text-gray-900">{shown}</p>
          {long && (
            <button
              className="mt-1 text-xs font-medium text-blue-600 hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Read More"}
            </button>
          )}
          {broadcast.templateFooter && (
            <p className="mt-1 text-xs text-gray-500">{broadcast.templateFooter}</p>
          )}
          <p className="mt-1 pb-1 text-right text-[11px] text-gray-500">
            {timeLabel(broadcast.createdAt)}
          </p>
        </div>

        <div className="border-t border-[#a8d98a]/60">
          {BUCKETS.map(({ key, label, icon: Icon, tone }) => {
            const count = broadcast[key];
            const isOpen = openBucket === key;
            return (
              <div key={key}>
                <button
                  disabled={count === 0}
                  onClick={() => onToggleBucket(key)}
                  className="flex w-full items-center gap-2 border-b border-[#a8d98a]/40 px-3 py-2 text-left text-sm last:border-0 enabled:hover:bg-[#d0f0b8] disabled:opacity-50"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${tone ?? "text-gray-600"}`} />
                  <span className={`font-medium ${tone ?? "text-gray-800"}`}>
                    {count.toLocaleString()}
                  </span>
                  <span className="text-gray-600">- {label}</span>
                  <span className="ml-auto text-gray-500">{pct(count)}</span>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <RecipientList
                    groupId={groupId}
                    campaignId={broadcast.id}
                    bucket={key}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecipientList({
  groupId,
  campaignId,
  bucket,
}: {
  groupId: string;
  campaignId: string;
  bucket: Bucket;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/groups", groupId, "broadcasts", campaignId, bucket],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/groups/${groupId}/broadcasts/${campaignId}/recipients?bucket=${bucket}`
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ recipients: Recipient[] }>;
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white/70 p-3 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="bg-white/70 p-3 text-center text-xs text-red-600">
        Could not load these recipients.
      </p>
    );
  }

  const list = data?.recipients ?? [];
  return (
    <div className="max-h-64 overflow-y-auto bg-white/70">
      {list.map((r, i) => (
        <div
          key={`${r.phone}-${i}`}
          className="flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-0"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-900">
              {r.name || r.phone}
            </p>
            {r.name && <p className="truncate text-[11px] text-gray-500">{r.phone}</p>}
            {bucket === "failed" && r.errorMessage && (
              <p className="mt-0.5 text-[11px] text-red-600">{r.errorMessage}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-gray-500">
            {r.repliedAt
              ? `replied ${timeLabel(r.repliedAt)}`
              : r.readAt
                ? `read ${timeLabel(r.readAt)}`
                : r.deliveredAt
                  ? `delivered ${timeLabel(r.deliveredAt)}`
                  : r.sentAt
                    ? `sent ${timeLabel(r.sentAt)}`
                    : ""}
          </span>
        </div>
      ))}
      {list.length >= 500 && (
        <p className="p-2 text-center text-[11px] text-gray-500">
          Showing the first 500. Export the campaign for the full list.
        </p>
      )}
    </div>
  );
}
