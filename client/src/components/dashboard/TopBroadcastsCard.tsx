import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useActiveChannelId } from "@/hooks/useActiveChannelId";

const RANGES = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
];

export function TopBroadcastsCard() {
  const channelId = useActiveChannelId();
  const [range, setRange] = useState("7");

  const { data } = useQuery<any>({
    queryKey: ["/api/analytics/campaigns", channelId, range],
    queryFn: async () => {
      const params = new URLSearchParams({ days: range });
      if (channelId) params.set("channelId", channelId);
      const res = await apiRequest("GET", `/api/analytics/campaigns?${params}`);
      return res.json();
    },
  });

  const campaigns = (data?.campaigns || [])
    .slice()
    .sort((a: any, b: any) => (b.sentCount || 0) - (a.sentCount || 0))
    .slice(0, 5);

  const fmt = (n: number) => Number(n || 0).toLocaleString();

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Top Performing Broadcasts</h3>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-12 text-xs font-medium text-gray-400 pb-2 border-b">
          <div className="col-span-5">Broadcast</div>
          <div className="col-span-2">Sent</div>
          <div className="col-span-2">Delivered</div>
          <div className="col-span-3">Read Rate</div>
        </div>

        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No broadcasts yet.</p>
        ) : (
          <div className="divide-y">
            {campaigns.map((c: any) => {
              const sent = Number(c.sentCount || 0);
              const delivered = Number(c.deliveredCount || 0);
              const delPct = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : "0.0";
              const readRate = Number(c.readRate || 0);
              return (
                <div key={c.id} className="grid grid-cols-12 items-center py-3 text-sm">
                  <div className="col-span-5">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="col-span-2 text-gray-700">{fmt(sent)}</div>
                  <div className="col-span-2 text-gray-700">
                    {fmt(delivered)}
                    <span className="text-xs text-gray-400"> ({delPct}%)</span>
                  </div>
                  <div className="col-span-3">
                    <p className="text-gray-700 mb-1">{readRate.toFixed(1)}%</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(readRate, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
