import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useChannelContext } from "@/contexts/channel-context";
import { apiRequest } from "@/lib/queryClient";
import { Phone, ChevronRight, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { BusinessProfileEditor } from "@/components/settings/BusinessProfileEditor";

const TIERS = [
  { key: "TIER_250", label: "250" },
  { key: "TIER_1K", label: "2K" },
  { key: "TIER_10K", label: "10K" },
  { key: "TIER_100K", label: "100K" },
  { key: "TIER_UNLIMITED", label: "Unlimited" },
];

function normalizeTier(v?: string): string {
  const s = (v || "").toUpperCase();
  if (s.includes("UNLIMITED")) return "TIER_UNLIMITED";
  if (s.includes("100K") || s.includes("100000")) return "TIER_100K";
  if (s.includes("10K") || s.includes("10000")) return "TIER_10K";
  if (s.includes("1K") || s.includes("1000") || s.includes("2K")) return "TIER_1K";
  if (s.includes("250")) return "TIER_250";
  return "";
}

// NOTE: this app remaps Tailwind's `green`/`red`/`yellow` palette to blue-ish
// brand colors, so we use explicit hex values to guarantee true colors.
const GREEN = "#16a34a";
const YELLOW = "#f59e0b";
const RED = "#dc2626";

function qualityStyle(q?: string): { label: string; color: string; note: string } {
  const s = (q || "").toUpperCase();
  if (s.includes("GREEN") || s === "HIGH")
    return { label: "Green", color: GREEN, note: "Ready to send to opted-in contacts" };
  if (s.includes("YELLOW") || s === "MEDIUM")
    return { label: "Yellow", color: YELLOW, note: "Only ongoing conversations" };
  if (s.includes("RED") || s === "LOW")
    return { label: "Red", color: RED, note: "Do not send any messages" };
  return { label: "Unknown", color: "#9ca3af", note: "Quality not available yet" };
}

export function ChannelHealthCard() {
  const { selectedChannel } = useChannelContext();

  // Fall back to the account's active channel when none is picked in the switcher.
  const { data: activeChannel } = useQuery<any>({
    queryKey: ["/api/channels/active"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channels/active");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !selectedChannel,
    staleTime: 60 * 1000,
  });

  const channel: any = selectedChannel || activeChannel;

  if (!channel) {
    return (
      <Card className="fade-in h-full">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">No WhatsApp channel connected</p>
            <p className="text-sm text-gray-500">
              Connect a channel to see its number, sending limit and quality here.
            </p>
          </div>
          <Link
            href="/settings?tab=whatsapp"
            className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap"
          >
            Connect channel →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const hd: any = channel.healthDetails || {};
  const number = hd.phone_number || channel.phoneNumber || "—";
  const currentTier = normalizeTier(hd.messaging_limit);
  const quality = qualityStyle(hd.quality_rating);
  const status = hd.status || channel.healthStatus || "—";
  const verifiedName = hd.verified_name || channel.name;

  const [showBusinessProfile, setShowBusinessProfile] = useState(false);

  const { data: channelProfile } = useQuery<any>({
    queryKey: ["/api/channels", channel.id, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/channels/${channel.id}/profile`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!channel.id,
  });

  return (
    <Card className="fade-in h-full">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Number + sending limit */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowBusinessProfile(true)}
                className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden  transition-colors cursor-pointer"
                title="Edit Business Profile"
              >
                {channelProfile?.profile_picture_url ? (
                  <img
                    src={channelProfile.profile_picture_url}
                    alt="WhatsApp Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Phone className="w-6 h-6 text-blue-600" />
                )}
              </button>
              <div>
                <p className="text-lg font-semibold text-gray-900">WABA Number</p>
                <p className="text-sm text-gray-600">{number}</p>
                {verifiedName && (
                  <p className="text-xs text-gray-400">{verifiedName}</p>
                )}
              </div>
              <span
                className={`ml-auto text-xs font-medium px-2 py-1 rounded-full ${
                  String(status).toUpperCase().includes("CONNECT") ||
                  String(status).toUpperCase().includes("LIVE") ||
                  String(status).toUpperCase() === "HEALTHY"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {String(status).replace(/_/g, " ")}
              </span>
            </div>

            <div className="border rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Daily Sending Limit</p>
              <div className="flex items-center flex-wrap gap-1 text-sm">
                {TIERS.map((tier, i) => {
                  const active = tier.key === currentTier;
                  return (
                    <span key={tier.key} className="flex items-center gap-1">
                      <span
                        className={active ? "font-bold text-base" : "text-gray-400"}
                        style={active ? { color: GREEN } : undefined}
                      >
                        {tier.label}
                      </span>
                      {i < TIERS.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Account quality */}
          <div className="border rounded-lg p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Account Quality</p>
              <p className="text-3xl font-black" style={{ color: quality.color }}>
                {quality.label}
              </p>
            </div>
            <p className="text-xs text-gray-500">{quality.note}</p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              <div>
                <p className="font-semibold" style={{ color: RED }}>Red</p>
                <p className="text-gray-400">Do not send</p>
              </div>
              <div>
                <p className="font-semibold" style={{ color: YELLOW }}>Yellow</p>
                <p className="text-gray-400">Ongoing only</p>
              </div>
              <div>
                <p className="font-semibold" style={{ color: GREEN }}>Green</p>
                <p className="text-gray-400">Send to opted-in</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      {channel.id && (
        <BusinessProfileEditor
          open={showBusinessProfile}
          onOpenChange={setShowBusinessProfile}
          channelId={channel.id}
          channelName={number}
          verifiedName={verifiedName}
        />
      )}
    </Card>
  );
}
