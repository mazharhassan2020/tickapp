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
import { Send, CheckCheck, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useActiveChannelId } from "@/hooks/useActiveChannelId";

const RANGES = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "1", label: "Today" },
];

export function QuickStatsCard() {
  const channelId = useActiveChannelId();
  const [range, setRange] = useState("7");

  const { data } = useQuery<any>({
    queryKey: ["/api/analytics/messages", channelId, range],
    queryFn: async () => {
      const params = new URLSearchParams({ days: range });
      if (channelId) params.set("channelId", channelId);
      const res = await apiRequest("GET", `/api/analytics/messages?${params}`);
      return res.json();
    },
  });

  const o = data?.overall || {};
  const rows = [
    { icon: Send, label: "Messages Sent", value: Number(o.totalSent ?? o.totalOutbound ?? 0), color: "text-blue-600 bg-blue-50" },
    { icon: CheckCheck, label: "Messages Delivered", value: Number(o.totalDelivered ?? 0), color: "text-green-600 bg-green-50" },
    { icon: Eye, label: "Messages Read", value: Number(o.totalRead ?? 0), color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${r.color}`}>
                <r.icon className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-600 flex-1">{r.label}</span>
              <span className="text-base font-bold text-gray-900">
                {r.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
