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
 * Per-recipient breakdown of one campaign — who it went to, who received it,
 * who read it, who replied, and why the rest failed — with a CSV export of
 * whichever rows and columns the user is looking at.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { isDemoUser, maskName, maskPhone } from "@/utils/maskUtils";

type StatusFilter =
  | "all"
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed";

interface Recipient {
  id: string;
  name?: string | null;
  phone: string;
  status?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  whatsappMessageId?: string | null;
}

interface RecipientsResponse {
  recipients: Recipient[];
  counts: Record<string, number>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "read", label: "Read" },
  { key: "replied", label: "Replied" },
  { key: "failed", label: "Failed" },
  { key: "pending", label: "Pending" },
];

/** Column keys must match EXPORT_COLUMNS in campaign-recipients.controller.ts. */
const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "sentAt", label: "Sent at" },
  { key: "deliveredAt", label: "Delivered at" },
  { key: "readAt", label: "Read at" },
  { key: "repliedAt", label: "Replied at" },
  { key: "errorCode", label: "Error code" },
  { key: "errorMessage", label: "Error message" },
  { key: "cost", label: "Cost" },
  { key: "whatsappMessageId", label: "WhatsApp message ID" },
];

const PAGE_SIZE = 25;

function statusBadge(recipient: Recipient) {
  // A reply is the strongest signal we have, and outranks the send status.
  if (recipient.repliedAt) {
    return <Badge className="bg-purple-600 hover:bg-purple-600">Replied</Badge>;
  }
  const status = recipient.status || "pending";
  const styles: Record<string, string> = {
    read: "bg-blue-600 hover:bg-blue-600",
    delivered: "bg-green-600 hover:bg-green-600",
    sent: "bg-slate-500 hover:bg-slate-500",
  };
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "pending") return <Badge variant="outline">Pending</Badge>;
  return (
    <Badge className={styles[status] || "bg-slate-500 hover:bg-slate-500"}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return format(d, "MMM d, h:mm a");
}

export function CampaignRecipients({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const demo = isDemoUser(user?.username);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    EXPORT_COLUMNS.map((c) => c.key)
  );

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Any change to the filters invalidates the page the user is on.
  useEffect(() => setPage(1), [status, debouncedSearch]);

  const params = new URLSearchParams({
    status,
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  if (debouncedSearch) params.set("search", debouncedSearch);

  const { data, isLoading, error } = useQuery<RecipientsResponse>({
    queryKey: ["campaign-recipients", campaignId, status, debouncedSearch, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/campaigns/${campaignId}/recipients?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load recipients");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const recipients = data?.recipients || [];
  const counts = data?.counts || {};
  const totalPages = data?.totalPages || 1;

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      toast({
        title: "Pick at least one column",
        description: "Choose the columns you want in the CSV.",
        variant: "destructive",
      });
      return;
    }
    setExporting(true);
    try {
      const exportParams = new URLSearchParams({
        status,
        columns: selectedColumns.join(","),
      });
      if (debouncedSearch) exportParams.set("search", debouncedSearch);

      const res = await fetch(
        `/api/campaigns/${campaignId}/recipients/export?${exportParams.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "campaign-recipients.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: "Export ready", description: "Your CSV has downloaded." });
    } catch (err) {
      toast({
        title: "Export failed",
        description: "Could not export these recipients.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={status === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(tab.key)}
          >
            {tab.label}
            <span className="ml-2 text-xs opacity-80">
              {counts[tab.key] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {/* Search + export */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone"
            className="pl-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={demo}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <p className="mb-3 text-sm font-medium">Columns to export</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {EXPORT_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={selectedColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Exports the rows matching the current filter
              {debouncedSearch ? " and search" : ""}.
            </p>
            <Button
              className="mt-3 w-full"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Download CSV"}
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Could not load recipients for this campaign.
        </div>
      ) : recipients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {debouncedSearch || status !== "all"
            ? "No recipients match this filter."
            : "This campaign has no recipients yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Replied</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {demo ? maskName(r.name || "") : r.name || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {demo ? maskPhone(r.phone) : r.phone}
                  </TableCell>
                  <TableCell>{statusBadge(r)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmt(r.sentAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmt(r.deliveredAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmt(r.readAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmt(r.repliedAt)}
                  </TableCell>
                  <TableCell className="max-w-[220px] text-sm text-destructive">
                    {r.errorMessage || r.errorCode || ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} recipients
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
