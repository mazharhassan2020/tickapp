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
import { useLocation } from "wouter";
import { Lock, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
// The plans page carries both the subscription card and the plan grid, so the
// overlay reuses it rather than rebuilding a second pricing table.
import PlansPage from "@/pages/plans";

interface SubscriptionStatus {
  active: boolean;
  endDate: string | null;
  planName: string | null;
  role: string;
  isOwner: boolean;
}

/**
 * Returning from a payment provider has to reach the real page. Everything else
 * is replaced by the overlay below — including /plans, which the overlay draws
 * itself so the sidebar and the rest of the product stay out of the way.
 */
const ALLOWED_PREFIXES = ["/payment", "/login", "/signup", "/verify-email"];

export function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
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

  // Everything from here on is drawn over a dimmed screen with the app behind
  // it removed entirely — there is one thing to do, so there is one thing to
  // look at.
  if (!status.isOwner) {
    return (
      <Backdrop>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
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
          <button
            onClick={logout}
            className="mt-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <div className="w-full max-w-5xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {status.planName ? "Your plan has expired" : "Choose a plan to get started"}
          </h1>
          <p className="text-sm text-white/70 mt-2">
            {status.planName
              ? "Renew to pick up exactly where you left off — your data is untouched."
              : "Pick a plan to unlock your workspace."}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <PlansPage />
        </div>

        <div className="text-center mt-6">
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/** Dimmed full-screen shell: nothing of the product shows through. */
function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/95 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
        {children}
      </div>
    </div>
  );
}
