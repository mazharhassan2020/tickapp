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

import { Handle, Position } from "@xyflow/react";
import { useFlowBuilder } from "./FlowBuilderContext";
import { Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import {
  Zap,
  GitBranch,
  MessageCircle,
  HelpCircle,
  Clock,
  FileText,
  Users,
  Video,
  FileAudio,
  FileIcon,
  Globe,
  CircleStop,
  Image,
  UserPlus,
  UserCog,
  Variable,
  MapPin,
  List,
  Paperclip,
  CheckCheck,
  PlayCircle,
} from "lucide-react";
import { BuilderNodeData } from "./types";

function NodeShell({
  children,
  icon,
  title,
  selected,
  nodeId,
  noSource,
}: {
  children?: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  selected?: boolean;
  nodeId?: string;
  noSource?: boolean;
}) {
  return (
    <div className="relative">
      {/* LEFT: target handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-blue-400 !w-2.5 !h-2.5 !border-2 !border-white !shadow-sm"
        style={{ left: -6 }}
      />

      <div
        className={`rounded-lg bg-white shadow-md min-w-[220px] max-w-[260px] overflow-hidden transition-all duration-200 border ${
          selected
            ? "border-blue-500 ring-2 ring-blue-100 shadow-lg"
            : "border-gray-200 hover:shadow-lg"
        }`}
      >
        <div className="flex items-center gap-2.5 px-3 py-2 bg-[#2563eb]">
          <div className="w-5 h-5 flex items-center justify-center text-white/80 shrink-0">
            {icon}
          </div>
          <span className="font-semibold text-xs text-white flex-1 truncate">{title}</span>
        </div>
        {children && (
          <div className="px-3 py-2.5 text-xs text-gray-600 space-y-2">
            {children}
          </div>
        )}
      </div>

      {/* RIGHT: source handle + plus button */}
      {!noSource && (
        <div className="absolute" style={{ right: -15, top: "50%", transform: "translateY(-50%)" }}>
          {/* PlusButton behind for click-to-add */}
          {nodeId && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              <PlusButton nodeId={nodeId} handleId="out" />
            </div>
          )}
          {/* Handle on top for drag-to-connect */}
          <Handle
            type="source"
            position={Position.Right}
            id="out"
            className="!w-5 !h-5 !rounded-full !border-2 !border-white !shadow-sm !relative !transform-none !top-auto !left-auto"
            style={{ opacity: 0, zIndex: 2, cursor: "crosshair" }}
          />
        </div>
      )}
    </div>
  );
}

function PlusButton({ nodeId, handleId }: { nodeId: string; handleId?: string }) {
  const ctx = useFlowBuilder();
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        // Pass clientY (accurate mouse Y); X will be calculated from node flow coords in openNodePicker
        ctx?.openNodePicker(nodeId, handleId || null, { x: 0, y: e.clientY });
      }}
      className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700 transition-colors nodrag border-2 border-white"
    >
      <Plus className="w-2.5 h-2.5" />
    </button>
  );
}

export function StartNode({ data, id }: { data?: any; id?: string }) {
  return (
    <div className="relative">
      <div className="rounded-lg bg-white shadow-lg border border-purple-200 min-w-[220px] max-w-[260px] overflow-hidden">
        {/* Pink-purple gradient header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: "linear-gradient(90deg, #f472b6 0%, #a78bfa 100%)" }}
        >
          <PlayCircle className="w-4 h-4 text-white shrink-0" />
          <span className="text-xs font-semibold text-white flex-1">Starting Node</span>
          <span className="text-[10px] bg-white/25 text-white px-1.5 py-0.5 rounded font-medium">Add</span>
        </div>
        {/* Body */}
        <div className="px-3 py-3">
          {data?.triggerType ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-800">{data.triggerLabel || data.triggerType}</p>
              {data.triggerValue && (
                <p className="text-[11px] text-gray-500">
                  {data.triggerCondition === "contains" ? "Contains" : "Equal to"}{" "}
                  <span className="text-blue-600 font-medium">{data.triggerValue}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Select Event</p>
          )}
        </div>
      </div>

      {/* Source handle (invisible, for manual connections) */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!opacity-0 !w-3 !h-3"
        style={{ right: -6, top: "50%" }}
      />

      {/* + button overlay on handle */}
      <div
        className="absolute"
        style={{ right: -14, top: "50%", transform: "translateY(-50%)" }}
      >
        <PlusButton nodeId={id || "start"} handleId="out" />
      </div>
    </div>
  );
}

export function ConditionsNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-4 !h-4 !border-2 !border-white !shadow-md" style={{ left: -8 }} />
      <div className="rounded-lg bg-white shadow-md min-w-[220px] max-w-[260px] overflow-hidden border border-gray-200">
        <div className="flex items-center gap-2.5 px-3 py-2 bg-[#2563eb]">
          <GitBranch className="w-4 h-4 text-white/80" />
          <span className="font-semibold text-xs text-white">{t("automations.nodes.condition")}</span>
        </div>
        <div className="px-3 py-2.5 text-xs text-gray-600 space-y-2">
          {data.conditionType === "keyword" && data.keywords && data.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.keywords.slice(0, 3).map((kw, i) => (
                <span key={i} className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-medium">{kw}</span>
              ))}
              {data.keywords.length > 3 && <span className="text-purple-400 text-[10px]">+{data.keywords.length - 3}</span>}
            </div>
          ) : (
            <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noConditions")}</div>
          )}
        </div>
      </div>
      {/* YES branch */}
      <Handle type="source" position={Position.Right} id="condition-true" className="!bg-green-500 !w-2.5 !h-2.5 !border-2 !border-white !shadow-sm" style={{ right: -6, top: "35%" }} />
      <div className="absolute" style={{ right: -15, top: "35%", transform: "translateY(-50%)" }}>
        <PlusButton nodeId={id} handleId="condition-true" />
      </div>
      <span className="absolute text-[8px] font-bold text-green-600 uppercase" style={{ right: 20, top: "calc(35% - 14px)" }}>YES</span>
      {/* NO branch */}
      <Handle type="source" position={Position.Right} id="condition-false" className="!bg-red-400 !w-2.5 !h-2.5 !border-2 !border-white !shadow-sm" style={{ right: -6, top: "65%" }} />
      <div className="absolute" style={{ right: -15, top: "65%", transform: "translateY(-50%)" }}>
        <PlusButton nodeId={id} handleId="condition-false" />
      </div>
      <span className="absolute text-[8px] font-bold text-red-500 uppercase" style={{ right: 20, top: "calc(65% - 14px)" }}>NO</span>
    </div>
  );
}

export function CustomReplyNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  const hasButtons = data.buttons && data.buttons.length > 0;
  return (
    <NodeShell nodeId={id} noSource={hasButtons}
        icon={<MessageCircle className="w-4 h-4" />}
        title={t("automations.nodes.sendMessage")}
      >
        {data.message ? (
          <p className="line-clamp-2 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100">
            {data.message.length > 80 ? `${data.message.slice(0, 80)}...` : data.message}
          </p>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noMessage")}</div>
        )}

        <div className="flex flex-wrap gap-1">
          {data.imagePreview && (
            <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
              <Image className="w-2.5 h-2.5" /> Image
            </span>
          )}
          {data.videoPreview && (
            <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
              <Video className="w-2.5 h-2.5" /> Video
            </span>
          )}
          {data.audioPreview && (
            <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
              <FileAudio className="w-2.5 h-2.5" /> Audio
            </span>
          )}
          {data.documentPreview && (
            <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-medium">
              <FileIcon className="w-2.5 h-2.5" /> Doc
            </span>
          )}
        </div>

        {hasButtons && (
          <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
            {data.buttons!.map((btn) => (
              <div key={btn.id} className="relative flex items-center pr-7">
                <span className="flex-1 text-[11px] border border-blue-200 rounded-md px-2 py-1.5 bg-blue-50/50 text-blue-700 font-medium truncate">
                  {btn.text}
                </span>
                {/* Per-button source handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={btn.id}
                  className="!opacity-0 !w-2 !h-2"
                  style={{ right: -6 }}
                />
                <div className="absolute" style={{ right: 2, top: '50%', transform: 'translateY(-50%)' }}>
                  <PlusButton nodeId={id} handleId={btn.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </NodeShell>
  );
}

export function UserReplyNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  const hasButtons = data.buttons && data.buttons.length > 0;
  return (
    <NodeShell nodeId={id} noSource={hasButtons}
        icon={<HelpCircle className="w-4 h-4" />}
        title="Ask Question"
      >
        {data.question ? (
          <p className="line-clamp-2 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100">
            {data.question.length > 80 ? `${data.question.slice(0, 80)}...` : data.question}
          </p>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noQuestion")}</div>
        )}
        {data.saveAs && (
          <div className="text-[10px] text-blue-600 font-medium font-mono">${data.saveAs}</div>
        )}
        {hasButtons && (
          <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
            {data.buttons!.map((btn) => (
              <div key={btn.id} className="relative flex items-center pr-7">
                <span className="flex-1 text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-gray-50 text-gray-700 truncate">
                  {btn.text}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={btn.id}
                  className="!opacity-0 !w-2 !h-2"
                  style={{ right: -6 }}
                />
                <div className="absolute" style={{ right: 2, top: '50%', transform: 'translateY(-50%)' }}>
                  <PlusButton nodeId={id} handleId={btn.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </NodeShell>
  );
}

export function TimeGapNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const seconds = data.delay ?? 0;
  const display = seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    : seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
  return (
    <NodeShell nodeId={id}
        icon={<Clock className="w-4 h-4" />}
        title="Wait / Delay"
      >
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
          <span className="text-lg font-bold text-slate-700">{display}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase">pause</span>
        </div>
      </NodeShell>
  );
}

export function SendTemplateNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<FileText className="w-4 h-4" />}
        title="Send Template"
        color="text-teal-700"
        bgColor="bg-teal-50"
        borderColor="border-teal-100"
      >
        {data.templateId ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
            <FileText className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-[11px] text-gray-600 font-medium">{t("automations.nodes.templateSelected")}</span>
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noTemplate")}</div>
        )}
      </NodeShell>
  );
}

export function AssignUserNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<Users className="w-4 h-4" />}
        title="Assign Agent"
        color="text-indigo-700"
        bgColor="bg-indigo-50"
        borderColor="border-indigo-100"
      >
        {data.assigneeId ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[11px] text-gray-600 font-medium">{t("automations.nodes.agentAssigned")}</span>
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noAgent")}</div>
        )}
      </NodeShell>
  );
}

export function WebhookNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<Globe className="w-4 h-4" />}
        title="Webhook"
        color="text-orange-700"
        bgColor="bg-orange-50"
        borderColor="border-orange-100"
      >
        {data.webhookUrl ? (
          <div className="space-y-1.5">
            <span className="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {data.webhookMethod || "POST"}
            </span>
            <div className="text-[11px] text-gray-500 truncate bg-gray-50 rounded px-2 py-1 font-mono border border-gray-100">{data.webhookUrl}</div>
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noWebhook")}</div>
        )}
      </NodeShell>
  );
}

export function EndNode({ data }: { data: BuilderNodeData }) {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col items-center">
      <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white shadow-md border-2 border-white">
        <CircleStop className="w-6 h-6" />
      </div>
      <div className="mt-1.5 px-2.5 py-0.5 bg-white rounded-full shadow-sm border border-gray-200">
        <span className="text-[10px] font-semibold text-red-700 uppercase">{data.endMessage || "End"}</span>
      </div>
    </div>
  );
}

export function AddToGroupNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<UserPlus className="w-4 h-4" />}
        title="Add to Group"
        color="text-emerald-700"
        bgColor="bg-emerald-50"
        borderColor="border-emerald-100"
      >
        {data.groupName ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
            <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] text-gray-600 font-medium truncate">{data.groupName}</span>
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noGroup")}</div>
        )}
      </NodeShell>
  );
}

export function UpdateContactNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<UserCog className="w-4 h-4" />}
        title="Update Contact"
        color="text-cyan-700"
        bgColor="bg-cyan-50"
        borderColor="border-cyan-100"
      >
        {data.contactField ? (
          <div className="space-y-1">
            <span className="inline-block bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded text-[10px] font-bold capitalize">
              {data.contactField}
            </span>
            {data.contactFieldValue && (
              <div className="text-[11px] text-gray-500 truncate bg-gray-50 rounded px-2 py-1 border border-gray-100">
                {data.contactFieldValue}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noField")}</div>
        )}
      </NodeShell>
  );
}

export function SetVariableNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<Variable className="w-4 h-4" />}
        title="Set Variable"
        color="text-violet-700"
        bgColor="bg-violet-50"
        borderColor="border-violet-100"
      >
        {data.variableName ? (
          <div className="space-y-1">
            <div className="text-[10px] text-violet-600 font-medium font-mono">
              ${data.variableName}
            </div>
            {data.variableValue && (
              <div className="text-[11px] text-gray-500 truncate bg-gray-50 rounded px-2 py-1 border border-gray-100">
                = {data.variableValue}
              </div>
            )}
            {data.variableSource && data.variableSource !== "static" && (
              <span className="inline-block bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                {data.variableSource === "from_message" ? "From Message" : "From Webhook"}
              </span>
            )}
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noVariable")}</div>
        )}
      </NodeShell>
  );
}

export function SendLocationNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<MapPin className="w-4 h-4" />}
        title="Send Location"
        color="text-rose-700"
        bgColor="bg-rose-50"
        borderColor="border-rose-100"
      >
        {data.locationName || (data.latitude && data.longitude) ? (
          <div className="space-y-1">
            {data.locationName && (
              <div className="text-[11px] text-gray-700 font-medium">{data.locationName}</div>
            )}
            {data.latitude && data.longitude && (
              <div className="text-[10px] text-gray-400 font-mono bg-gray-50 rounded px-2 py-1 border border-gray-100">
                {data.latitude}, {data.longitude}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noLocation")}</div>
        )}
      </NodeShell>
  );
}

export function SendListMessageNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  const totalRows = (data.listSections || []).reduce((sum, s) => sum + (s.rows?.length || 0), 0);
  return (
    <NodeShell nodeId={id}
        icon={<List className="w-4 h-4" />}
        title="List Message"
      >
        {data.message ? (
          <p className="line-clamp-2 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100">
            {data.message.length > 60 ? `${data.message.slice(0, 60)}...` : data.message}
          </p>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noBody")}</div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-block bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
            {data.listSections?.length || 0} sections
          </span>
          <span className="text-[10px] text-gray-400">{totalRows} items</span>
        </div>
      </NodeShell>
  );
}

export function SendMediaNode({ data, id }: { data: BuilderNodeData; id: string }) {
  const { t } = useTranslation();
  const mediaLabel = data.mediaType ? data.mediaType.charAt(0).toUpperCase() + data.mediaType.slice(1) : "Media";
  return (
    <NodeShell nodeId={id}
        icon={<Paperclip className="w-4 h-4" />}
        title="Send Media"
      >
        <span className="inline-block bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
          {mediaLabel}
        </span>
        {data.mediaUrl ? (
          <div className="text-[11px] text-gray-500 truncate bg-gray-50 rounded px-2 py-1 font-mono border border-gray-100">
            {data.mediaUrl}
          </div>
        ) : (
          <div className="text-gray-400 italic text-[11px]">{t("automations.nodes.noMedia")}</div>
        )}
        {data.mediaCaption && (
          <p className="text-[10px] text-gray-400 truncate">{data.mediaCaption}</p>
        )}
      </NodeShell>
  );
}

export function MarkAsReadNode({ id }: { id?: string }) {
  const { t } = useTranslation();
  return (
    <NodeShell nodeId={id}
        icon={<CheckCheck className="w-4 h-4" />}
        title="Mark as Read"
      >
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
          <CheckCheck className="w-3.5 h-3.5 text-lime-600" />
          <span className="text-[11px] text-gray-600 font-medium">{t("automations.nodes.sendReadReceipts")}</span>
        </div>
      </NodeShell>
  );
}

export const nodeTypes = {
  start: StartNode,
  conditions: ConditionsNode,
  custom_reply: CustomReplyNode,
  user_reply: UserReplyNode,
  time_gap: TimeGapNode,
  send_template: SendTemplateNode,
  assign_user: AssignUserNode,
  webhook: WebhookNode,
  end: EndNode,
  add_to_group: AddToGroupNode,
  update_contact: UpdateContactNode,
  set_variable: SetVariableNode,
  send_location: SendLocationNode,
  send_list_message: SendListMessageNode,
  send_media: SendMediaNode,
  mark_as_read: MarkAsReadNode,
};
