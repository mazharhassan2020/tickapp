/**
 * Offers to install the panel as an app.
 *
 * Chrome hands us a real install prompt through `beforeinstallprompt`; Safari
 * never has, so on iOS the same banner explains the Share → Add to Home Screen
 * steps instead of showing a button that could not work.
 *
 * It stays out of the way: never inside an already-installed window, and it
 * does not come back once dismissed.
 */
import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports it here rather than through display-mode.
    (window.navigator as any).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      // Keep the event so the install can happen on a real user gesture.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Safari fires nothing, so offer the manual route on iOS.
    if (isIos()) {
      setShowIosSteps(true);
      setVisible(true);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="lg:hidden fixed left-3 right-3 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-[60]">
      <div className="rounded-xl bg-white shadow-lg border border-gray-200 p-3 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--primary,#16a34a)]/10 flex items-center justify-center shrink-0">
          <Download className="h-4 w-4 text-[var(--primary,#16a34a)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Install this app</p>
          {showIosSteps ? (
            <p className="text-xs text-gray-600 mt-0.5">
              Tap <Share className="inline h-3 w-3 -mt-0.5" /> Share, then
              <b> Add to Home Screen</b>.
            </p>
          ) : (
            <p className="text-xs text-gray-600 mt-0.5">
              Add it to your home screen for full-screen access.
            </p>
          )}

          {!showIosSteps && (
            <Button size="sm" className="mt-2 h-8" onClick={install}>
              Install
            </Button>
          )}
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
