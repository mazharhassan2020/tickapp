/**
 * Keeps an account without a live plan out of the product.
 *
 * When a subscription lapses the panel should not sit there half-usable — the
 * owner is sent to the plans page and nothing else renders. A team member
 * cannot buy anything, so they get told to speak to their admin rather than
 * being dropped on a checkout they have no authority over.
 */
import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Redirect } from "wouter";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

interface SubscriptionStatus {
  active: boolean;
  endDate: string | null;
  planName: string | null;
  role: string;
  isOwner: boolean;
}

/** Pages that must stay reachable without a plan, or there is no way back in. */
const ALLOWED_PREFIXES = [
  "/plans",
  "/plan-upgrade",
  "/payment",
  "/account",
  "/login",
  "/signup",
  "/verify-email",
];

export function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [location] = useLocation();

  const { data: status, isLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscriptions/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/subscriptions/status");
      return res.json();
    },
    enabled: isAuthenticated && user?.role !== "superadmin",
    staleTime: 60_000,
  });

  // Never hold the app back while the answer is still unknown — a flash of the
  // paywall for a paying customer is worse than a moment of the real thing.
  if (
    authLoading ||
    !isAuthenticated ||
    user?.role === "superadmin" ||
    isLoading ||
    !status ||
    status.active
  ) {
    return <>{children}</>;
  }

  if (ALLOWED_PREFIXES.some((p) => location.startsWith(p))) {
    return <>{children}</>;
  }

  if (!status.isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            This workspace has no active plan
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            Your administrator needs to renew the subscription before the team
            can carry on working.
          </p>
        </div>
      </div>
    );
  }

  return <Redirect to="/plans" />;
}
