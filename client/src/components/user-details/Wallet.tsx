import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Wallet as WalletIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

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

interface WalletData {
  balance: number;
  currency: string;
  transactions: WalletTx[];
}

export default function Wallet({ userId }: { userId: string }) {
  const { toast } = useToast();
  const { currency: userCurrency } = useAuth();
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const { data, isLoading } = useQuery<WalletData>({
    queryKey: [`/api/admin/wallet/${userId}`],
    queryFn: () =>
      apiRequest("GET", `/api/admin/wallet/${userId}`).then((r) => r.json()),
    enabled: !!userId,
  });

  const currency = data?.currency || userCurrency || "AED";
  const balance = data?.balance ?? 0;
  const transactions = data?.transactions ?? [];

  const adjust = useMutation({
    mutationFn: (signed: number) =>
      apiRequest("POST", "/api/admin/wallet/adjust", {
        userId,
        amount: signed,
        description: note || "Admin adjustment",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/wallet/${userId}`] });
      setAmount("");
      setNote("");
      toast({ title: "Wallet updated" });
    },
    onError: (e: any) =>
      toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const submit = (sign: 1 | -1) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    adjust.mutate(sign * amt);
  };

  const fmt = (n: number | string) =>
    Number(n).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletIcon className="w-5 h-5 text-green-600" /> Wallet Balance
            </CardTitle>
            <CardDescription>Prepaid balance for this user</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-gray-900">
              {isLoading ? "…" : Number(balance).toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">{currency}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adjust balance</CardTitle>
            <CardDescription>Add or deduct funds manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount ({currency})</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason / reference"
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => submit(1)}
                disabled={adjust.isPending}
              >
                Add funds
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => submit(-1)}
                disabled={adjust.isPending}
              >
                Deduct
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
  );
}
