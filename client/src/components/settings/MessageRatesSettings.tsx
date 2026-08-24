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
import { Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Rate {
  id: string;
  countryCode: string;
  category: string;
  rate: string;
}

interface Settings {
  currency: string;
  defaultRate: string;
  markup?: string;
  walletBillingEnabled?: boolean;
}

const CATEGORIES = ["marketing", "utility", "authentication"];

export function MessageRatesSettings(): JSX.Element {
  const { toast } = useToast();
  const { currency: storeCurrency } = useAuth();
  const [defaultRate, setDefaultRate] = useState<string>("");
  const [markup, setMarkup] = useState<string>("");
  const [walletBilling, setWalletBilling] = useState<boolean>(true);
  const [country, setCountry] = useState<string>("");
  const [category, setCategory] = useState<string>("marketing");
  const [rate, setRate] = useState<string>("");

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/admin/billing-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/billing-settings");
      const json = await res.json();
      setDefaultRate(String(json.defaultRate ?? ""));
      setMarkup(String(json.markup ?? "0"));
      setWalletBilling(json.walletBillingEnabled !== false);
      return json;
    },
  });

  const markupNum = Number(markup) || 0;

  const { data: rates = [] } = useQuery<Rate[]>({
    queryKey: ["/api/admin/message-rates"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/message-rates").then((r) => r.json()),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/billing-settings", {
        defaultRate: Number(defaultRate),
        markup: Number(markup),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-settings"] });
      toast({ title: "Saved — markup applied to all rates" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" }),
  });

  const toggleWalletBilling = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/admin/billing-settings", {
        walletBillingEnabled: enabled,
      }),
    onSuccess: (_d, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-settings"] });
      toast({
        title: enabled
          ? "Wallet billing enabled — messages are charged per send"
          : "Wallet billing disabled — messages are not charged",
      });
    },
    onError: (e: any) => {
      setWalletBilling((prev) => !prev); // revert the switch
      toast({ title: "Failed to update", description: e?.message, variant: "destructive" });
    },
  });

  const upsertRate = useMutation({
    mutationFn: () => {
      if (!country.trim()) throw new Error("Enter a country code");
      if (rate === "" || Number(rate) < 0 || Number.isNaN(Number(rate)))
        throw new Error("Enter a valid rate");
      return apiRequest("POST", "/api/admin/message-rates", {
        countryCode: country.trim().toUpperCase(),
        category,
        rate: Number(rate),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-rates"] });
      setCountry("");
      setRate("");
      toast({ title: "Rate saved" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to save rate", description: e?.message, variant: "destructive" }),
  });

  const deleteRate = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/message-rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-rates"] });
      toast({ title: "Rate deleted" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wallet billing</CardTitle>
          <CardDescription>
            When ON, every template/campaign message is charged to the sender's
            wallet and sending stops when the balance runs out. Turn it OFF to
            let plans/trials send without any wallet balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            checked={walletBilling}
            onCheckedChange={(checked) => {
              setWalletBilling(checked);
              toggleWalletBilling.mutate(checked);
            }}
            disabled={toggleWalletBilling.isPending}
          />
          <span className="text-sm font-medium">
            {walletBilling ? "Enabled — charge per message" : "Disabled — no wallet charges"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing settings</CardTitle>
          <CardDescription>
            <strong>Markup</strong> is added on top of every base rate (and the
            default rate) for every message — change it here and it applies to
            all countries at once. <strong>Default rate</strong> is the base
            used when a country/category has no specific rate or the recipient's
            country can't be determined. Currency: {settings?.currency || storeCurrency}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="markup">Markup (added to every rate)</Label>
            <Input
              id="markup"
              type="number"
              min="0"
              step="0.0001"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="defaultRate">Default base rate</Label>
            <Input
              id="defaultRate"
              type="number"
              min="0"
              step="0.0001"
              value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Country rates</CardTitle>
          <CardDescription>
            Set a per-message price for each country and message category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="country">Country code (ISO-2)</Label>
              <Input
                id="country"
                placeholder="AE"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                className="w-24"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rate">Base rate</Label>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.0001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              onClick={() => upsertRate.mutate()}
              disabled={upsertRate.isPending}
            >
              Add / Update
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Base rate</TableHead>
                  <TableHead className="text-right">Charged (+{markupNum})</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                      No rates configured — the default rate applies to everything.
                    </TableCell>
                  </TableRow>
                ) : (
                  rates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.countryCode}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell className="text-right">{r.rate}</TableCell>
                      <TableCell className="text-right font-medium">
                        {(Number(r.rate) + markupNum).toFixed(4)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteRate.mutate(r.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
