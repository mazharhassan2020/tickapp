import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

export interface AppFeatures {
  numberMasking?: boolean;
  googleSheets?: boolean;
  orderingBot?: boolean;
  customAttributes?: boolean;
}

/** Reads the platform feature flags (Settings → Features). */
export function useFeatures(): AppFeatures {
  const { user } = useAuth();
  const { data } = useQuery<AppFeatures>({
    queryKey: ["/api/features"],
    queryFn: () => apiRequest("GET", "/api/features").then((r) => r.json()),
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });
  return data || {};
}
