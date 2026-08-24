import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useActiveChannelId } from "@/hooks/useActiveChannelId";

interface Agent {
  id: string;
  name: string;
  avatar?: string | null;
  openChats: number;
}

const COLORS = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];

export function TopAgentsCard() {
  const channelId = useActiveChannelId();

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/analytics/top-agents", channelId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (channelId) params.set("channelId", channelId);
      const res = await apiRequest("GET", `/api/analytics/top-agents?${params}`);
      return res.json();
    },
  });

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Agents by Open Chats</h3>
        <div className="grid grid-cols-12 text-xs font-medium text-gray-400 pb-2 border-b">
          <div className="col-span-9">Agents</div>
          <div className="col-span-3 text-right">Open Chats</div>
        </div>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No open chats yet.</p>
        ) : (
          <div className="divide-y">
            {agents.map((a, i) => (
              <div key={a.id} className="grid grid-cols-12 items-center py-3">
                <div className="col-span-9 flex items-center gap-3">
                  {a.avatar ? (
                    <img src={a.avatar} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${COLORS[i % COLORS.length]} flex items-center justify-center text-white text-xs font-semibold`}>
                      {a.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                </div>
                <div className="col-span-3 text-right text-sm font-semibold text-gray-900">
                  {a.openChats}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
