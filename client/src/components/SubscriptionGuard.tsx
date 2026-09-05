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

  const { data: status, isLoading, isError } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscriptions/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/subscriptions/status");
      return res.json();
    },
    enabled: isAuthenticated && user?.role !== "superadmin",
    staleTime: 60_000,
  });

  const needsCheck = isAuthenticated && user?.role !== "superadmin";

  // If the check itself is broken, let people work — a billing lookup must not
  // take the product down.
  if (!needsCheck || authLoading || isError || (status && status.active)) {
    return <>{children}</>;
  }

  // Hold the page until the answer arrives. Rendering the app first showed an
  // expired account its dashboard for as long as the request took.
  if (isLoading || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
      </div>
    );
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
