import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

interface WalletTx {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  country?: string | null;
  category?: string | null;
  description?: string | null;
  createdAt: string;
}

interface Provider {
  id: string;
  name: string;
  providerKey: string;
  isActive?: boolean;
}

const QUICK_AMOUNTS = [10, 25, 50, 100];

export default function WalletPage() {
  const { user, walletBalance, currency: storeCurrency } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("25");
  const [providerId, setProviderId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: balanceData } = useQuery<{ balance: number; currency: string }>({
    queryKey: ["/api/wallet/balance"],
    queryFn: () =>
      apiRequest("GET", "/api/wallet/balance").then((r) => r.json()),
    enabled: !!user?.id,
  });

  const { data: transactions = [] } = useQuery<WalletTx[]>({
    queryKey: ["/api/wallet/transactions"],
    queryFn: () =>
      apiRequest("GET", "/api/wallet/transactions").then((r) => r.json()),
    enabled: !!user?.id,
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/payment-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/payment-providers");
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || [];
    },
    enabled: !!user?.id,
  });

  const balance = balanceData?.balance ?? walletBalance ?? 0;
  const currency = balanceData?.currency || storeCurrency || "AED";

  const handleTopup = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!providerId) {
      toast({ title: "Select a payment method", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/wallet/topup/initiate", {
        amount: amt,
        paymentProviderId: providerId,
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Could not start checkout", variant: "destructive" });
      }
    } catch (err: any) {
      toast({
        title: "Top-up failed",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number | string) => Number(n).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Wallet" subtitle="Prepaid balance & top-up" />

      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        {/* Balance + top-up */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-green-600" /> Current Balance
              </CardTitle>
              <CardDescription>Charged per message you send</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-gray-900">
                {Number(balance).toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{currency}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top up</CardTitle>
              <CardDescription>Add funds to your wallet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {QUICK_AMOUNTS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant={String(a) === amount ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAmount(String(a))}
                  >
                    {a}
                  </Button>
                ))}
              </div>
              <div>
                <Label htmlFor="amount">Amount ({currency})</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment method</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a gateway" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers
                      .filter((p) => p.isActive !== false)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleTopup}
                disabled={submitting}
              >
                {submitting ? "Redirecting…" : "Proceed to pay"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-gray-500">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const amt = Number(tx.amount);
                      const credit = amt >= 0;
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(tx.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={credit ? "default" : "secondary"}>
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {tx.description}
                            {tx.country ? ` · ${tx.country}` : ""}
                            {tx.category ? ` · ${tx.category}` : ""}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              credit ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {credit ? "+" : ""}
                            {fmt(amt)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {fmt(tx.balanceAfter)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
