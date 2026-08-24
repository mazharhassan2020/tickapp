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

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

interface ChannelLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; username: string; channelCount?: number; channelLimit?: number | null } | null;
  onSuccess: () => void;
}

/**
 * Sets how many WhatsApp channels an account is allowed to connect.
 * Opened from the channel-count badge on the users list.
 */
export default function ChannelLimitModal({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ChannelLimitModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const connected = Number(user?.channelCount ?? 0);
  const [limit, setLimit] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setLimit(Number(user?.channelLimit ?? 1));
  }, [open, user?.id, user?.channelLimit]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await apiRequest("PUT", `/api/admin/users/${user.id}/channel-limit`, {
        channelLimit: limit,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to update channel limit");

      toast({
        title: t("users.channelLimit.updated"),
        description: `${user.username}: ${limit}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t("users.channels.errorTitle"),
        description: error?.message || t("users.channels.unknownError"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("users.channelLimit.title")}</DialogTitle>
          <DialogDescription>
            {t("users.channelLimit.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-600">{t("users.channelLimit.connected")}</span>
            <span className="font-semibold text-gray-900">{connected}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("users.channelLimit.allowed")}
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setLimit((n) => Math.max(connected, n - 1))}
                disabled={limit <= connected}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={connected}
                max={1000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setLimit((n) => Math.min(1000, n + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {limit < connected && (
              <p className="mt-2 text-xs text-red-600">
                {t("users.channelLimit.belowConnected")}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("users.channels.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || limit < connected}>
            {saving ? t("users.edituser.saving") : t("users.edituser.savechanges")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
