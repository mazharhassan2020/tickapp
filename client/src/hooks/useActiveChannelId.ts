import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";

/** The picked channel, or the account's active channel as fallback. */
export function useActiveChannelId(): string | undefined {
  const { selectedChannel } = useChannelContext();
  const { data: active } = useQuery<any>({
    queryKey: ["/api/channels/active"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channels/active");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !selectedChannel,
    staleTime: 60 * 1000,
  });
  return selectedChannel?.id || active?.id;
}
