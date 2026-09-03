/**
 * Platform-wide AI provider configuration (superadmin).
 *
 * One key here serves every channel: a channel with its own AI settings uses
 * those, anything else falls back to this row. Both Claude and ChatGPT speak
 * through the same reply pipeline — only the provider, key and model differ.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Brain, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Provider = "openai" | "anthropic";

const PROVIDERS: Record<
  Provider,
  { label: string; endpoint: string; keyHint: string; models: string[] }
> = {
  openai: {
    label: "ChatGPT (OpenAI)",
    endpoint: "https://api.openai.com/v1",
    keyHint: "sk-…",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
  },
  anthropic: {
    label: "Claude (Anthropic)",
    endpoint: "https://api.anthropic.com/v1",
    keyHint: "sk-ant-…",
    models: [
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-haiku-4-5-20251001",
    ],
  },
};

interface AiRow {
  id?: string;
  channelId?: string | null;
  provider: Provider;
  apiKey: string;
  model: string;
  endpoint: string;
  temperature: string;
  maxTokens: string;
  isActive: boolean;
}

const emptyRow = (provider: Provider): AiRow => ({
  provider,
  apiKey: "",
  model: PROVIDERS[provider].models[0],
  endpoint: PROVIDERS[provider].endpoint,
  temperature: "0.7",
  maxTokens: "2048",
  isActive: false,
});

export default function AIProviderSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState<AiRow>(emptyRow("openai"));
  const [existingId, setExistingId] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const { data: rows, isLoading } = useQuery<AiRow[]>({
    queryKey: ["/api/ai-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ai-settings");
      return res.json();
    },
  });

  // The platform-wide row is the one with no channel attached.
  useEffect(() => {
    if (!Array.isArray(rows)) return;
    const global = rows.find((r) => !r.channelId);
    if (!global) return;
    setExistingId(global.id || null);
    setForm({
      provider: (global.provider as Provider) || "openai",
      // The key comes back masked; leave it blank until the admin types a new
      // one, and only send it when they do.
      apiKey: "",
      model: global.model || "",
      endpoint: global.endpoint || "",
      temperature: global.temperature || "0.7",
      maxTokens: global.maxTokens || "2048",
      isActive: !!global.isActive,
    });
  }, [rows]);

  const changeProvider = (provider: Provider) => {
    setTestResult(null);
    setForm((f) => ({
      ...f,
      provider,
      endpoint: PROVIDERS[provider].endpoint,
      // A model name only means something to its own provider.
      model: PROVIDERS[provider].models[0],
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        provider: form.provider,
        model: form.model,
        endpoint: form.endpoint,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        isActive: form.isActive,
        channelId: null,
      };
      if (keyTouched && form.apiKey) payload.apiKey = form.apiKey;

      if (existingId) {
        return apiRequest("PUT", `/api/ai-settings/${existingId}`, payload);
      }
      if (!form.apiKey) throw new Error("An API key is required");
      return apiRequest("POST", "/api/ai-settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-settings"] });
      setKeyTouched(false);
      toast({ title: "AI settings saved" });
    },
    onError: (e: any) =>
      toast({
        title: "Could not save",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-settings/test", {
        provider: form.provider,
        model: form.model,
        endpoint: form.endpoint,
        // Falls back to the stored key when the field was left untouched.
        apiKey: keyTouched ? form.apiKey : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) =>
      setTestResult({
        ok: !!data.success,
        message: data.success
          ? `${PROVIDERS[form.provider].label} replied: "${data.reply}"`
          : data.error || "The provider rejected the request",
      }),
    onError: (e: any) =>
      setTestResult({ ok: false, message: e?.message || "Test failed" }),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const provider = PROVIDERS[form.provider];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Brain className="w-5 h-5" />
          AI provider
        </CardTitle>
        <CardDescription>
          The model that answers customers automatically. Channels without their
          own AI settings use this one.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium text-sm">Enable AI replies</p>
            <p className="text-sm text-gray-500">
              Incoming messages are answered by the model when no agent has taken
              over.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => changeProvider(v as Provider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">
                  {PROVIDERS.anthropic.label}
                </SelectItem>
                <SelectItem value="openai">{PROVIDERS.openai.label}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-key">API key</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              placeholder={
                existingId && !keyTouched
                  ? "•••••••• (saved — type to replace)"
                  : provider.keyHint
              }
              value={form.apiKey}
              onChange={(e) => {
                setKeyTouched(true);
                setForm((f) => ({ ...f, apiKey: e.target.value }));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model">Model</Label>
            {/* Free text with suggestions: providers ship new model ids far more
                often than this panel gets updated. */}
            <Input
              id="ai-model"
              list="ai-model-options"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
            <datalist id="ai-model-options">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-endpoint">API endpoint</Label>
            <Input
              id="ai-endpoint"
              value={form.endpoint}
              onChange={(e) =>
                setForm((f) => ({ ...f, endpoint: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-temp">Temperature</Label>
            <Input
              id="ai-temp"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={form.temperature}
              onChange={(e) =>
                setForm((f) => ({ ...f, temperature: e.target.value }))
              }
            />
            <p className="text-xs text-gray-500">
              Lower is more predictable; 0.7 suits support replies.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-tokens">Max tokens per reply</Label>
            <Input
              id="ai-tokens"
              type="number"
              min="64"
              value={form.maxTokens}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxTokens: e.target.value }))
              }
            />
          </div>
        </div>

        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              testResult.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending || (!existingId && !form.apiKey)}
          >
            {test.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Test connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
