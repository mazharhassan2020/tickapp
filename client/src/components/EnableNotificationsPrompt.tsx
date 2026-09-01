/**
 * Asks for notification permission and registers the device for push.
 *
 * Browsers only grant permission from a real click, so this offers a button
 * rather than prompting on load — which Chrome would ignore and which users
 * reflexively refuse. Once permission is granted the subscription is renewed
 * silently on every visit, since a browser can drop it at any time.
 */
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DISMISSED_KEY = "push-prompt-dismissed";

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** VAPID keys travel as base64url but the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribeDevice(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  const keyRes = await apiRequest("GET", "/api/push/public-key");
  const { publicKey } = await keyRes.json();
  if (!publicKey) throw new Error("Push is not configured on the server");

  // An existing subscription made with a different key has to go first, or the
  // browser refuses to create the new one.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const sameKey =
      existing.options?.applicationServerKey &&
      btoa(
        String.fromCharCode(
          ...new Uint8Array(existing.options.applicationServerKey as ArrayBuffer)
        )
      ) === btoa(String.fromCharCode(...urlBase64ToUint8Array(publicKey)));
    if (!sameKey) await existing.unsubscribe();
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await apiRequest("POST", "/api/push/subscribe", subscription.toJSON());
}

export function EnableNotificationsPrompt() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !pushSupported()) return;

    if (Notification.permission === "granted") {
      // Already allowed — keep the server's copy of the subscription fresh.
      void subscribeDevice().catch(() => undefined);
      return;
    }

    if (Notification.permission === "denied") return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    setVisible(true);
  }, [isAuthenticated]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      await subscribeDevice();
      setVisible(false);
      toast({
        title: "Notifications on",
        description: "You will be alerted when a new message arrives.",
      });
    } catch (err: any) {
      toast({
        title: "Could not enable notifications",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed left-3 right-3 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:left-auto lg:right-4 lg:bottom-4 lg:w-80 z-[61]">
      <div className="rounded-xl bg-white shadow-lg border border-gray-200 p-3 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--primary,#16a34a)]/10 flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-[var(--primary,#16a34a)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            Turn on message alerts
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Get notified when a customer replies, even with the app closed.
          </p>
          <Button size="sm" className="mt-2 h-8" onClick={enable} disabled={busy}>
            {busy ? "Enabling…" : "Enable"}
          </Button>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
