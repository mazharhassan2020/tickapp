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

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Receipt, ExternalLink, FileText } from "lucide-react";

interface InvoiceRow {
  transaction: {
    id: string;
    amount: string | number | null;
    currency: string | null;
    status: string | null;
    billingCycle: string | null;
    paymentMethod: string | null;
    paidAt: string | null;
    createdAt: string | null;
    metadata?: Record<string, any> | null;
  };
  plan?: { name?: string | null } | null;
  provider?: { name?: string | null } | null;
}

const SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹",
  AED: "AED ", NGN: "₦", BRL: "R$",
};

function symbolFor(code?: string | null) {
  const upper = (code || "USD").toUpperCase();
  return SYMBOLS[upper] ?? `${upper} `;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Paid is the common case; anything else is called out so a failed charge
 *  is not mistaken for a successful one. */
function statusChip(status?: string | null) {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    processing: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-gray-100 text-gray-600 border-gray-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        map[s] ?? "bg-gray-100 text-gray-600 border-gray-200"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Every invoice on the account, newest first.
 *
 * Covers past subscriptions and renewals, not just the current cycle - the
 * cards above only ever showed the latest transaction for the active
 * subscription.
 */
export default function InvoiceHistory({ userId }: { userId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/transactions/user", userId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/transactions/user/${userId}`);
      const json = await res.json();
      return (Array.isArray(json?.data) ? json.data : []) as InvoiceRow[];
    },
    enabled: !!userId,
  });

  const invoices = data ?? [];

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-emerald-600" />
        <h3 className="text-base font-semibold text-gray-900">
          Invoice history
        </h3>
        {invoices.length > 0 && (
          <span className="text-sm text-gray-500">({invoices.length})</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Could not load your invoices.
        </p>
      ) : invoices.length === 0 ? (
        <div className="py-8 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">No invoices yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Invoices appear here after each payment, including renewals.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Cycle</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invoices.map(({ transaction: t, plan, provider }) => {
                const meta = t.metadata || {};
                const receiptUrl = meta.hostedInvoiceUrl || meta.invoicePdf;
                const amount =
                  t.amount == null ? null : Number(t.amount).toFixed(2);
                return (
                  <tr
                    key={t.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                      {formatDate(t.paidAt || t.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">
                      {plan?.name || "—"}
                      {meta.kind === "subscription_renewal" && (
                        <span className="ml-2 text-xs text-gray-400">
                          renewal
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 capitalize text-gray-600">
                      {t.billingCycle || "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-medium text-gray-900">
                      {amount === null
                        ? "—"
                        : `${symbolFor(t.currency)}${amount}`}
                    </td>
                    <td className="py-3 pr-4">{statusChip(t.status)}</td>
                    <td className="py-3 text-right">
                      {receiptUrl ? (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Receipt
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">
                          {provider?.name || ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
