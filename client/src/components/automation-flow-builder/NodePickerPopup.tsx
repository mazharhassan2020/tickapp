import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  Type, Image, Music, CornerDownLeft, List, MessageCircle,
  LayoutGrid, FileText, Video, File, Smile, MapPin, Workflow,
  Link2, Users, Globe, Variable, CheckCheck, CircleStop,
  HelpCircle, GitBranch, Clock, UserPlus, UserCog, ChevronRight, BellOff,
} from "lucide-react";
import { NodeKind, BuilderNodeData } from "./types";

interface NodeItem {
  name: string;
  icon: React.ElementType;
  kind: NodeKind;
  overrides?: Partial<BuilderNodeData>;
}

const groups: { label: string; items: NodeItem[] }[] = [
  {
    label: "MESSAGE",
    items: [
      { name: "Text", icon: Type, kind: "custom_reply", overrides: { message: "", buttons: [] } },
      { name: "Image", icon: Image, kind: "send_media", overrides: { mediaType: "image", mediaSourceType: "upload" } },
      { name: "Audio", icon: Music, kind: "send_media", overrides: { mediaType: "audio", mediaSourceType: "upload" } },
      { name: "Reply Button", icon: CornerDownLeft, kind: "custom_reply", overrides: { message: "", buttons: [{ id: "btn1", text: "", action: "next" }, { id: "btn2", text: "", action: "next" }] } },
      { name: "List", icon: List, kind: "send_list_message" },
      { name: "Quick Reply", icon: MessageCircle, kind: "user_reply" },
      { name: "Carousel", icon: LayoutGrid, kind: "custom_reply", overrides: { message: "", buttons: [] } },
      { name: "Message Template", icon: FileText, kind: "send_template" },
      { name: "Video", icon: Video, kind: "send_media", overrides: { mediaType: "video", mediaSourceType: "upload" } },
      { name: "Document", icon: File, kind: "send_media", overrides: { mediaType: "document", mediaSourceType: "upload" } },
      { name: "Sticker", icon: Smile, kind: "send_media", overrides: { mediaType: "document" } },
      { name: "Send Location", icon: MapPin, kind: "send_location" },
      { name: "WhatsApp Flow", icon: Workflow, kind: "send_template" },
      { name: "CTA URL Button", icon: Link2, kind: "custom_reply", overrides: { message: "", buttons: [{ id: "cta1", text: "", action: "custom", value: "" }] } },
      { name: "Ask Question", icon: HelpCircle, kind: "user_reply" },
    ],
  },
  {
    label: "ACTIONS",
    items: [
      { name: "Assign Agent", icon: Users, kind: "assign_user" },
      { name: "Webhook", icon: Globe, kind: "webhook" },
      { name: "Set Variable", icon: Variable, kind: "set_variable" },
      { name: "Mark as Read", icon: CheckCheck, kind: "mark_as_read" },
      { name: "End Flow", icon: CircleStop, kind: "end" },
      { name: "Delay", icon: Clock, kind: "time_gap" },
      { name: "Condition", icon: GitBranch, kind: "conditions" },
      { name: "Update Contact", icon: UserCog, kind: "update_contact" },
      { name: "Add to Group", icon: UserPlus, kind: "add_to_group" },
      { name: "Opt Out Contact", icon: BellOff, kind: "opt_out" },
    ],
  },
];

interface NodePickerPopupProps {
  position: { x: number; y: number };
  onSelect: (kind: NodeKind, overrides?: Partial<BuilderNodeData>) => void;
  onClose: () => void;
}

export function NodePickerPopup({ position, onSelect, onClose }: NodePickerPopupProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Caret is 10px wide, category panel 200px, items panel 185px (when open)
  const CARET_W = 10;
  const CAT_W = 200;
  const ITEMS_W = 185;
  const POPUP_W = CARET_W + CAT_W + (activeGroup ? ITEMS_W : 0);
  const POPUP_H = 170; // 3 categories × ~50px + padding

  const fitsRight = position.x + POPUP_W < window.innerWidth - 8;
  const left = fitsRight ? position.x : Math.max(8, position.x - POPUP_W - 8);
  // Vertically center on the button position
  const rawTop = position.y - POPUP_H / 2;
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - (activeGroup ? 340 : POPUP_H) - 8));

  const style: React.CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
  };

  const activeItems = groups.find((g) => g.label === activeGroup)?.items || [];

  return (
    <div ref={ref} style={style}>
      {/* Left-pointing caret arrow (pointing back toward the node) */}
      <div style={{
        width: 0,
        height: 0,
        borderTop: "9px solid transparent",
        borderBottom: "9px solid transparent",
        borderRight: "10px solid #e5e7eb",
        flexShrink: 0,
      }} />
      <div style={{
        width: 0,
        height: 0,
        borderTop: "8px solid transparent",
        borderBottom: "8px solid transparent",
        borderRight: "9px solid white",
        marginLeft: -9,
        flexShrink: 0,
      }} />

      {/* Popup panel */}
      <div className="flex shadow-2xl rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {/* Left: categories */}
        <div style={{ width: CAT_W }} className="relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
          >
            <X className="w-3 h-3 text-gray-500" />
          </button>

          <div className="py-2">
            {groups.map((g) => (
              <button
                key={g.label}
                onMouseEnter={() => setActiveGroup(g.label)}
                onClick={() => setActiveGroup(g.label)}
                className={`w-full flex items-center justify-between px-5 py-3 pr-10 text-sm font-semibold tracking-wide transition-colors ${
                  activeGroup === g.label
                    ? "text-blue-600 bg-blue-50"
                    : "text-blue-500 hover:bg-gray-50"
                }`}
              >
                {g.label}
                <ChevronRight className="w-4 h-4 ml-2 text-gray-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Right: items - only shown on hover */}
        {activeGroup && (
          <div
            className="border-l border-gray-100 py-1 overflow-y-auto"
            style={{ width: ITEMS_W, maxHeight: 340 }}
          >
            {activeItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => {
                    onSelect(item.kind, item.overrides);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center shrink-0 bg-white">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <span className="text-sm text-gray-700">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
