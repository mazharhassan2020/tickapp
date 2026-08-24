import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Features {
  numberMasking: boolean;
  googleSheets: boolean;
  orderingBot: boolean;
  customAttributes: boolean;
  googleSheetsUrl?: string | null;
}

const APPS_SCRIPT = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.clearContents();
  sheet.appendRow(data.columns);
  data.rows.forEach(function(r){ sheet.appendRow(r); });
  return ContentService.createTextOutput("OK");
}`;

const ITEMS: { key: keyof Features; title: string; desc: string }[] = [
  {
    key: "numberMasking",
    title: "Number masking",
    desc: "Hide customers' full phone numbers from team agents.",
  },
  {
    key: "customAttributes",
    title: "Custom attributes",
    desc: "Add custom fields on contacts (with per-plan quotas).",
  },
  {
    key: "orderingBot",
    title: "Automated ordering bot",
    desc: "Let customers place orders through an automated WhatsApp flow.",
  },
  {
    key: "googleSheets",
    title: "Google Sheets integration",
    desc: "Sync contacts and data with Google Sheets.",
  },
];

export function FeatureSettings(): JSX.Element {
  const { toast } = useToast();
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const { data } = useQuery<Features>({
    queryKey: ["/api/features"],
    queryFn: async () => {
      const j = await apiRequest("GET", "/api/features").then((r) => r.json());
      if (sheetUrl === null) setSheetUrl(j.googleSheetsUrl || "");
      return j;
    },
  });

  const saveUrl = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/features", { googleSheetsUrl: sheetUrl || "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/features"] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const syncNow = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/google-sheets/sync"),
    onSuccess: async (r: any) => {
      const j = await r.json().catch(() => ({}));
      toast({ title: `Synced ${j.synced ?? ""} contacts to Google Sheet` });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: (patch: Partial<Features>) =>
      apiRequest("PUT", "/api/admin/features", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/features"] });
      toast({ title: "Feature updated" });
    },
    onError: (e: any) =>
      toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>
            Turn optional features on or off for the whole platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 divide-y">
          {ITEMS.map((it) => (
            <div key={it.key} className="flex items-center justify-between py-4">
              <div className="pr-4">
                <Label className="text-sm font-medium">{it.title}</Label>
                <p className="text-sm text-gray-500">{it.desc}</p>
              </div>
              <Switch
                checked={!!data?.[it.key]}
                disabled={toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ [it.key]: v } as Partial<Features>)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {data?.googleSheets && (
        <Card>
          <CardHeader>
            <CardTitle>Google Sheets sync</CardTitle>
            <CardDescription>
              Push your contacts into a Google Sheet — no Google API keys needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="text-sm text-gray-600 list-decimal ml-5 space-y-1">
              <li>Open a Google Sheet → <b>Extensions → Apps Script</b>.</li>
              <li>Paste this script and Save:</li>
            </ol>
            <pre className="text-xs bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto">
{APPS_SCRIPT}
            </pre>
            <ol className="text-sm text-gray-600 list-decimal ml-5 space-y-1" start={3}>
              <li><b>Deploy → New deployment → Web app</b>. Set “Who has access” to <b>Anyone</b>. Copy the Web app URL.</li>
              <li>Paste the URL below, Save, then Sync.</li>
            </ol>
            <div>
              <Label htmlFor="sheeturl">Apps Script Web App URL</Label>
              <Input
                id="sheeturl"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={sheetUrl ?? ""}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => saveUrl.mutate()} disabled={saveUrl.isPending}>
                Save URL
              </Button>
              <Button
                variant="outline"
                onClick={() => syncNow.mutate()}
                disabled={syncNow.isPending || !sheetUrl}
              >
                {syncNow.isPending ? "Syncing…" : "Sync contacts now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
