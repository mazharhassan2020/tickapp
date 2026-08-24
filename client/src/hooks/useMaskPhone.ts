import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { maskPhone } from "@/utils/maskUtils";

interface Features {
  numberMasking?: boolean;
}

/**
 * Returns a `mask(phone)` function. When the "Number masking" feature is ON
 * and the current user is a team agent (not admin/superadmin), phone numbers
 * are masked; otherwise returned unchanged.
 */
export function useMaskPhone() {
  const { user } = useAuth();

  const { data } = useQuery<Features>({
    queryKey: ["/api/features"],
    queryFn: () => apiRequest("GET", "/api/features").then((r) => r.json()),
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const isAgent = user?.role === "team";
  const active = !!data?.numberMasking && isAgent;

  const mask = (phone?: string | null): string => {
    const val = phone ?? "";
    return active ? maskPhone(val) : val;
  };

  return { mask, masking: active };
}
