import { useState } from "react";
import {
  Type, Image, Music, CornerDownLeft, List, MessageCircle,
  LayoutGrid, FileText, Video, File, Smile, MapPin, Workflow,
  Link2, Users, Globe, Variable, CheckCheck, CircleStop,
  HelpCircle, GitBranch, Clock, UserPlus, UserCog, ChevronRight,
} from "lucide-react";
import { NodeKind, BuilderNodeData } from "./types";

interface NodeItem {
  name: string;
  icon: React.ElementType;
  kind: NodeKind;
  overrides?: Partial<BuilderNodeData>;
}

export interface SidebarProps {
  onAddNode: (kind: NodeKind, overrides?: Partial<BuilderNodeData>) => void;
}

const groups: { label: string; items: NodeItem[] }[] = [
  {
    label: "MESSAGE",
    items: [
      { name: "Text", icon: Type, kind: "custom_reply", overrides: { message: "", buttons: [] } },
      { name: "Image", icon: Image, kind: "send_media", overrides: { mediaType: "image", mediaSourceType: "upload" } },
      { name: "Audio", icon: Music, kind: "send_media", overrides: { mediaType: "audio", mediaSourceType: "upload" } },
      {
        name: "Reply Button", icon: CornerDownLeft, kind: "custom_reply",
        overrides: { message: "", buttons: [{ id: "btn1", text: "Button Title", action: "next" }, { id: "btn2", text: "Button Title", action: "next" }] },
      },
      { name: "List", icon: List, kind: "send_list_message" },
      { name: "Quick Reply", icon: MessageCircle, kind: "user_reply" },
      { name: "Carousel", icon: LayoutGrid, kind: "custom_reply", overrides: { message: "", buttons: [] } },
      { name: "Message Template", icon: FileText, kind: "send_template" },
      { name: "Video", icon: Video, kind: "send_media", overrides: { mediaType: "video", mediaSourceType: "upload" } },
      { name: "Document", icon: File, kind: "send_media", overrides: { mediaType: "document", mediaSourceType: "upload" } },
      { name: "Sticker", icon: Smile, kind: "send_media", overrides: { mediaType: "document" } },
      { name: "Send Location", icon: MapPin, kind: "send_location" },
      { name: "WhatsApp Flow", icon: Workflow, kind: "send_template" },
      { name: "CTA URL Button", icon: Link2, kind: "custom_reply", overrides: { message: "", buttons: [{ id: "cta1", text: "Click Here", action: "custom", value: "https://" }] } },
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
    ],
  },
  {
    label: "PROMPTS",
    items: [
      { name: "Ask Question", icon: HelpCircle, kind: "user_reply" },
      { name: "Condition", icon: GitBranch, kind: "conditions" },
      { name: "Delay", icon: Clock, kind: "time_gap" },
      { name: "Add to Group", icon: UserPlus, kind: "add_to_group" },
      { name: "Update Contact", icon: UserCog, kind: "update_contact" },
    ],
  },
];

export function Sidebar({ onAddNode }: SidebarProps) {
  const [expanded, setExpanded] = useState<string | null>("MESSAGE");

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Add Node</h3>
        <p className="text-xs text-gray-400 mt-0.5">Click a node type to add to canvas</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <button
              onClick={() => setExpanded(expanded === group.label ? null : group.label)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <span className="text-xs font-semibold text-gray-500 tracking-wider">{group.label}</span>
              <ChevronRight
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded === group.label ? "rotate-90" : ""}`}
              />
            </button>

            {expanded === group.label && (
              <div className="border-b border-gray-100">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.name}-${item.kind}`}
                      onClick={() => onAddNode(item.kind, item.overrides)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors group text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:border-blue-200 transition-colors">
                        <Icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                      </div>
                      <span className="text-sm text-gray-700 group-hover:text-blue-700 transition-colors">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
