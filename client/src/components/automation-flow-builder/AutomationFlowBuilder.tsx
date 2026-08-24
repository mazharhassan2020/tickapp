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

// AutomationFlowBuilder.tsx - Main Component

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background, BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Connection,
  Edge,
  Node,
  ReactFlowInstance,
  NodeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiRequest, apiRequestFormData } from "@/lib/queryClient";
import { queryKeys } from "@/lib/query-keys";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "@/lib/i18n";

// Zod schema for the automation's top-level metadata (owned by the builder
// header). Node/edge graph validation is handled server-side.
const automationMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter a name for your automation.")
    .max(120, "Name is too long"),
  description: z
    .string()
    .trim()
    .max(500, "Description is too long")
    .optional()
    .or(z.literal("")),
  trigger: z.enum(["new_conversation", "message_received"]),
});
type AutomationMetadata = z.infer<typeof automationMetadataSchema>;

import {
  AutomationFlowBuilderProps,
  BuilderNodeData,
  NodeKind,
  Template,
  Member,
} from "./types";
import { uid, defaultsByKind, transformAutomationToFlow } from "./utils";
import { nodeTypes } from "./NodeComponents";
import { CustomEdge } from "./CustomEdge";
import { ConfigPanel } from "./ConfigPanel";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { FlowBuilderContext } from "./FlowBuilderContext";
import { NodePickerPopup } from "./NodePickerPopup";

function getDraftStorageKey(channelId: string) {
  return `automation_drafts_${channelId}`;
}

function saveDraftToStorage(channelId: string, draft: any) {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(channelId));
    const drafts = raw ? JSON.parse(raw) : [];
    const existingIdx = drafts.findIndex((d: any) => d.id === draft.id);
    if (existingIdx >= 0) {
      drafts[existingIdx] = draft;
    } else {
      drafts.unshift(draft);
    }
    const trimmed = drafts.slice(0, 10);
    localStorage.setItem(getDraftStorageKey(channelId), JSON.stringify(trimmed));
  } catch (e) {
    console.error("Failed to save automation draft:", e);
  }
}

function removeDraftFromStorage(channelId: string, draftId: string) {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(channelId));
    const drafts = raw ? JSON.parse(raw) : [];
    localStorage.setItem(
      getDraftStorageKey(channelId),
      JSON.stringify(drafts.filter((d: any) => d.id !== draftId))
    );
  } catch (e) {
    console.error("Failed to remove automation draft:", e);
  }
}

export default function AutomationFlowBuilder({
  automation,
  channelId,
  onClose,
  onDraftSaved,
}: AutomationFlowBuilderProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const draftIdRef = useRef<string>(automation?._draftId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const savedSuccessRef = useRef(false);
  const onDraftSavedRef = useRef(onDraftSaved);
  const nodesRef = useRef<Node<BuilderNodeData>[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const nameRef = useRef<string>(automation?.name || "Send a message");
  const descriptionRef = useRef<string>(automation?.description || "");
  const triggerRef = useRef<string>(automation?.trigger || "new_conversation");

  // React Hook Form owns the metadata fields; name/description/trigger stay
  // available as reactive values via watch() so the rest of the builder
  // (draft persistence, node data, etc.) can keep reading them as before.
  const metadataForm = useForm<AutomationMetadata>({
    resolver: zodResolver(automationMetadataSchema),
    mode: "onBlur",
    defaultValues: {
      name: automation?.name || "Send a message",
      description: automation?.description || "",
      trigger:
        (automation?.trigger as AutomationMetadata["trigger"]) ||
        "new_conversation",
    },
  });
  const name = metadataForm.watch("name");
  const description = metadataForm.watch("description") ?? "";
  const trigger = metadataForm.watch("trigger");
  const setName = (v: string) =>
    metadataForm.setValue("name", v, { shouldValidate: true, shouldDirty: true });
  const setDescription = (v: string) =>
    metadataForm.setValue("description", v, { shouldDirty: true });
  const setTrigger = (v: string) =>
    metadataForm.setValue(
      "trigger",
      v as AutomationMetadata["trigger"],
      { shouldDirty: true }
    );

  const initialFlowRef = useRef<{
    nodes: Node<BuilderNodeData>[];
    edges: Edge[];
  } | null>(null);

  if (!initialFlowRef.current) {
    initialFlowRef.current = transformAutomationToFlow(automation);
  }

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialFlowRef.current?.nodes || []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialFlowRef.current.edges
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTriggerSelector, setShowTriggerSelector] = useState<boolean>(false);
  const [pickerState, setPickerState] = useState<{
    visible: boolean;
    sourceNodeId: string;
    sourceHandle: string | null;
    position: { x: number; y: number };
  }>({ visible: false, sourceNodeId: "", sourceHandle: null, position: { x: 0, y: 0 } });
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: false, type: "custom", sourceHandle: params.sourceHandle || undefined, markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1", width: 18, height: 18 } }, eds)
      ),
    [setEdges]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const builderNode = node as Node<BuilderNodeData>;
    setSelectedId(builderNode.id);
  }, []);

  const { data: templateDataOld } = useQuery({
    queryKey: ["/api/templates"],
    queryFn: () =>
      apiRequest("GET", "/api/templates").then((res) => res.json()),
  });
  const templateData: Template[] = templateDataOld?.data || [];
  const templates =
    templateData?.filter((t: Template) => t.status === "APPROVED") || [];
    

  const { data: teamMembers } = useQuery({
    queryKey: ["/api/team/members"],
    queryFn: () =>
      apiRequest("GET", "/api/team/members").then((res) => res.json()),
  });

  
  const members = teamMembers?.data || [];

  const addNode = (kind: NodeKind, overrides?: Partial<BuilderNodeData>, atPosition?: { x: number; y: number }): string => {
    const id = uid();
    const base = defaultsByKind[kind];

    const newNode: Node<BuilderNodeData> = {
      id,
      type: kind,
      position: atPosition || { x: 200, y: 200 },
      data: { ...(base as BuilderNodeData), ...(overrides || {}) },
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
    return id;
  };

  const openNodePicker = (sourceNodeId: string, sourceHandle: string | null, clickPos: { x: number; y: number }) => {
    const rfi = rfInstanceRef.current;
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    let position = clickPos;
    if (rfi && sourceNode) {
      // Use flow→screen for X so zoom/pan are accounted for; Y from click event (always correct)
      const NODE_W = 265;
      const screenRight = rfi.flowToScreenPosition({ x: sourceNode.position.x + NODE_W, y: 0 });
      position = { x: screenRight.x + 6, y: clickPos.y };
    }
    setPickerState({ visible: true, sourceNodeId, sourceHandle, position });
  };

  const handlePickerSelect = (kind: NodeKind, overrides?: Partial<BuilderNodeData>) => {
    // Position new node to the right of source node
    const sourceNode = nodes.find((n) => n.id === pickerState.sourceNodeId);
    const newPosition = sourceNode
      ? { x: sourceNode.position.x + 340, y: sourceNode.position.y }
      : { x: 400, y: 200 };

    const newId = addNode(kind, overrides, newPosition);
    if (pickerState.sourceNodeId) {
      setEdges((eds) =>
        addEdge(
          {
            id: `e-${pickerState.sourceNodeId}-${newId}`,
            source: pickerState.sourceNodeId,
            sourceHandle: pickerState.sourceHandle || undefined,
            target: newId,
            animated: false,
            type: "custom",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1", width: 18, height: 18 },
          },
          eds
        )
      );
    }
    setPickerState((s) => ({ ...s, visible: false }));
  };

  const deleteNode = () => {
    if (!selectedId || selectedId === "start") return;

    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedId && e.target !== selectedId)
    );
    setSelectedId(null);
  };

  const patchSelected = (patch: Partial<BuilderNodeData>) => {
    if (!selectedId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n
      )
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const formData = new FormData();
      formData.append("name", payload.name);
      formData.append("description", payload.description);
      formData.append("trigger", payload.trigger);
      formData.append("triggerConfig", JSON.stringify(payload.triggerConfig));
      formData.append("nodes", JSON.stringify(payload.nodes));
      formData.append("edges", JSON.stringify(payload.edges));

    if (channelId) {
      formData.append("channelId", channelId);
    }

      payload.nodes.forEach((node: any) => {
        if (node.data.imageFile && node.data.imageFile instanceof File) {
          formData.append(`${node.id}_imageFile`, node.data.imageFile);
        }
        if (node.data.videoFile && node.data.videoFile instanceof File) {
          formData.append(`${node.id}_videoFile`, node.data.videoFile);
        }
        if (node.data.audioFile && node.data.audioFile instanceof File) {
          formData.append(`${node.id}_audioFile`, node.data.audioFile);
        }
        if (node.data.documentFile && node.data.documentFile instanceof File) {
          formData.append(`${node.id}_documentFile`, node.data.documentFile);
        }
      });

      if (payload.automationId) {
        return await apiRequestFormData("PUT", `/api/automations/${payload.automationId}`, formData);
      } else {
        return await apiRequestFormData("POST", "/api/automations", formData);
      }
    },
    onSuccess: () => {
      savedSuccessRef.current = true;
      if (channelId) {
        removeDraftFromStorage(channelId, draftIdRef.current);
      }
      toast({
        title: automation?.id
          ? t("automations.updatedToast")
          : t("automations.createdToast"),
        description: t("automations.savedDesc"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all() });
      onClose();
    },
    onError: (error: any) => {
      console.error("Save mutation error:", error);
      toast({
        title: t("automations.saveFailedTitle"),
        description: error?.message || t("automations.saveFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Run the Zod schema before hitting the save mutation; surface the first
    // form error as a toast so the user is never blocked by a silent no-op.
    const parsed = automationMetadataSchema.safeParse(metadataForm.getValues());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: t("automations.checkDetails"),
        description: first?.message || t("automations.reviewForm"),
        variant: "destructive",
      });
      return;
    }

    const backendNodes = nodes
      .filter((n) => n.id !== "start")
      .map((node) => ({
        ...node,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      }));

    const normalizedEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      type: edge.type || "custom",
      animated: false,
    }));

    const uniqueEdges: typeof normalizedEdges = [];
    const seenConnections = new Set<string>();

    normalizedEdges.forEach((edge) => {
      const connectionKey = `${edge.source}-${edge.target}-${edge.sourceHandle || ''}`;
      if (!seenConnections.has(connectionKey)) {
        seenConnections.add(connectionKey);
        uniqueEdges.push(edge);
      }
    });

    // Validate all nodes before saving
    const startData = nodes.find((n) => n.id === "start")?.data as any;

    // Validate start node
    if (startData?.triggerType === "user_input" || startData?.triggerType === "keyword_reply") {
      if (!startData?.triggerValue?.trim()) {
        toast({
          title: "Validation Error",
          description: "Starting Node: Please enter a keyword/value for the trigger condition.",
          variant: "destructive",
        });
        setSelectedId("start");
        return;
      }
    }
    if (!startData?.triggerType) {
      toast({
        title: "Validation Error",
        description: "Starting Node: Please select an event type.",
        variant: "destructive",
      });
      setSelectedId("start");
      return;
    }

    // Validate other nodes
    const nonStartNodes = nodes.filter((n) => n.id !== "start");
    for (const node of nonStartNodes) {
      const d = node.data as any;
      const kind = d?.kind;

      if (kind === "custom_reply" && !d?.message?.trim()) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "Send Message"}" node: Please enter a message.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }

      if (kind === "custom_reply" && d?.buttons && d.buttons.length > 0) {
        const emptyBtn = d.buttons.find((b: any) => !b.text?.trim());
        if (emptyBtn) {
          toast({
            title: "Validation Error",
            description: `"${d?.label || "Send Message"}" node: Please enter text for all buttons.`,
            variant: "destructive",
          });
          setSelectedId(node.id);
          return;
        }
      }

      if (kind === "send_media" && !d?.mediaUrl && !d?.mediaId) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "Send Media"}" node: Please upload a file.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }

      if (kind === "send_template" && !d?.templateName) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "Template"}" node: Please select a template.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }

      if (kind === "send_list_message" && (!d?.body?.trim())) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "List Message"}" node: Please enter the message body.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }

      if (kind === "conditions" && (!d?.conditions || d.conditions.length === 0)) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "Condition"}" node: Please add at least one condition.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }

      if (kind === "webhook" && !d?.url?.trim()) {
        toast({
          title: "Validation Error",
          description: `"${d?.label || "Webhook"}" node: Please enter a webhook URL.`,
          variant: "destructive",
        });
        setSelectedId(node.id);
        return;
      }
    }

    // Validate additional conditions
    for (const cond of (startData?.additionalConditions || [])) {
      if ((cond.triggerType === "user_input" || cond.triggerType === "keyword_reply") && !cond.triggerValue?.trim()) {
        toast({
          title: "Validation Error",
          description: "Additional condition: Please enter a keyword/value.",
          variant: "destructive",
        });
        setSelectedId("start");
        return;
      }
    }

    const payload = {
      name,
      description,
      trigger,
      triggerConfig: {
        triggerType: startData?.triggerType || "",
        triggerLabel: startData?.triggerLabel || "",
        triggerCondition: startData?.triggerCondition || "equals",
        triggerValue: startData?.triggerValue || "",
        additionalConditions: startData?.additionalConditions || [],
      },
      nodes: backendNodes,
      edges: uniqueEdges,
      automationId: automation?.id || null,
    };

    saveMutation.mutate(payload);
  };

  useEffect(() => {
    onDraftSavedRef.current = onDraftSaved;
  }, [onDraftSaved]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);

  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);

  useEffect(() => {
    return () => {
      if (savedSuccessRef.current || !channelId) return;
      if (automation?.id && !automation?._isDraft) return;

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      const hasContent = currentNodes.length > 1;
      if (!hasContent) return;

      const serializableNodes = currentNodes
        .filter((n) => n.id !== "start")
        .map((n) => ({
          nodeId: n.id,
          type: n.type,
          position: n.position,
          data: Object.fromEntries(
            Object.entries(n.data).filter(([_, v]) => !(v instanceof File))
          ),
        }));

      const serializableEdges = currentEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      saveDraftToStorage(channelId, {
        id: draftIdRef.current,
        name: nameRef.current || "Untitled Draft",
        description: descriptionRef.current,
        trigger: triggerRef.current,
        nodes: serializableNodes,
        edges: serializableEdges,
        channelId,
        savedAt: new Date().toISOString(),
      });

      onDraftSavedRef.current?.();
    };
  }, []);

  const cleanupEdges = useCallback(() => {
    setEdges((currentEdges) => {
      const cleaned: Edge[] = [];
      const seen = new Set<string>();

      currentEdges.forEach((edge) => {
        const key = `${edge.source}-${edge.target}-${edge.sourceHandle || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          cleaned.push(edge);
        }
      });

      return cleaned;
    });
  }, [setEdges]);

  useEffect(() => {
    if (edges.length > nodes.length * 2) {
      cleanupEdges();
    }
  }, [edges.length, nodes.length, cleanupEdges]);

  const rfInstanceRef = useRef<ReactFlowInstance<Node<BuilderNodeData>, Edge> | null>(null);

  const onInit = useCallback((reactFlowInstance: any) => {
    const rfi = reactFlowInstance as ReactFlowInstance<Node<BuilderNodeData>, Edge>;
    rfInstanceRef.current = rfi;
    rfi.setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  // Update popup position when source node is dragged
  const onNodeDrag = useCallback((_: any, node: Node) => {
    setPickerState((prev) => {
      if (!prev.visible || node.id !== prev.sourceNodeId) return prev;
      const rfi = rfInstanceRef.current;
      if (!rfi) return prev;
      // Approximate right-center of node in flow coordinates
      const nodeRightX = node.position.x + 265;
      const nodeMiddleY = node.position.y + 50;
      const screenPos = rfi.flowToScreenPosition({ x: nodeRightX, y: nodeMiddleY });
      return { ...prev, position: { x: screenPos.x + 6, y: screenPos.y } };
    });
  }, []);

  const edgeTypes = useMemo(() => ({
    custom: (props: any) => <CustomEdge {...props} setEdges={setEdges} />,
  }), [setEdges]);

  const TRIGGERS = [
    { id: "user_input", label: "User Input", desc: "Triggered when user sends a message" },
    { id: "meta_lead", label: "Lead from Meta Ads", desc: "From Facebook/Instagram lead ads" },
    { id: "keyword_reply", label: "Keyword Reply", desc: "Triggered when a keyword matches" },
    { id: "optin_widget", label: "Opt-in Widget", desc: "When user opts in via widget" },
    { id: "new_conversation", label: "New Conversation", desc: "When a new chat starts" },
    { id: "incoming_message", label: "Incoming Message", desc: "On any incoming message" },
  ];

  const handleTriggerSelect = (t: { id: string; label: string; desc: string }) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "start"
          ? { ...n, data: { ...n.data, triggerType: t.id, triggerLabel: t.label, triggerDescription: t.desc } }
          : n
      )
    );
    setTrigger(t.id === "new_conversation" || t.id === "incoming_message" ? t.id as any : "new_conversation");
    setShowTriggerSelector(false);
  };

  if (showTriggerSelector) {
    return (
      <div className="h-full w-full flex flex-col bg-[#eceef2]">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Create New Flow</h2>
            <p className="text-xs text-gray-400">Choose what starts this automation</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-gray-900">Select Starting Trigger</h3>
              <p className="text-sm text-gray-500 mt-1">This determines when your automation begins</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TRIGGERS.map((trigger) => (
                <button
                  key={trigger.id}
                  onClick={() => handleTriggerSelect(trigger)}
                  className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{trigger.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{trigger.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Start node config panel (right panel when start node is selected)
  const startNodeData = nodes.find((n) => n.id === "start")?.data as any;
  const isStartSelected = selectedNode?.id === "start";

  const EVENT_OPTIONS = [
    { value: "user_input", label: "User Input" },
    { value: "new_conversation", label: "New Conversation" },
    { value: "keyword_reply", label: "Keyword Reply" },
    { value: "meta_lead", label: "Lead from Meta Ads" },
    { value: "optin_widget", label: "Opt-in Widget" },
    { value: "incoming_message", label: "Incoming Message" },
  ];

  const CONDITION_OPTIONS = [
    { value: "equals", label: "Equal to" },
    { value: "contains", label: "Contains" },
    { value: "starts_with", label: "Starts with" },
  ];

  const patchStartNode = (patch: any) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "start" ? { ...n, data: { ...n.data, ...patch } } : n
      )
    );
  };

  return (
    <FlowBuilderContext.Provider value={{ openNodePicker }}>
      <div className="h-full w-full flex flex-col bg-gray-50">
        <Header
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          trigger={trigger}
          setTrigger={setTrigger}
          automation={automation}
          onClose={onClose}
          onSave={handleSave}
          isSaving={saveMutation.isPending}
          isDemo={user?.username === "demouser"}
        />

        <div className="flex-1 flex overflow-hidden relative">
          {/* Canvas */}
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onInit={onInit}
              onPaneClick={() => { setSelectedId(null); setPickerState(p => ({ ...p, visible: false })); }}
              onNodeDrag={onNodeDrag}
              fitView
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ animated: false, type: "custom", markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1", width: 18, height: 18 } }}
            >
              <MiniMap
                nodeStrokeColor="#94a3b8"
                nodeColor="#f1f5f9"
                nodeBorderRadius={8}
                maskColor="rgba(241,245,249,0.7)"
                className="!bg-white !border !border-gray-200 !rounded-lg !shadow-sm"
              />
              <Controls className="!bg-white !border !border-gray-200 !rounded-lg !shadow-sm" />
              <Background color="#cbd5e1" gap={24} size={1} variant={BackgroundVariant.Dots} />
            </ReactFlow>
          </div>

          {/* Right panel: only when node selected */}
          {selectedNode && (
            <div className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              {isStartSelected ? (
                /* Starting Node config panel */
                <div className="flex flex-col h-full">
                  <div
                    className="flex items-center gap-2 px-4 py-3 shrink-0"
                    style={{ background: "linear-gradient(90deg, #f472b6 0%, #a78bfa 100%)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                    <span className="text-sm font-semibold text-white flex-1">Starting Node</span>
                    <button onClick={() => setSelectedId(null)} className="text-white/70 hover:text-white">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Event 1</p>

                      {/* Select Event */}
                      <div className="mb-3">
                        <label className="text-[11px] text-gray-500 mb-1 block">Select Event</label>
                        <select
                          value={startNodeData?.triggerType || ""}
                          onChange={(e) => {
                            const opt = EVENT_OPTIONS.find((o) => o.value === e.target.value);
                            patchStartNode({ triggerType: e.target.value, triggerLabel: opt?.label || e.target.value });
                          }}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="">-- Select Event --</option>
                          {EVENT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Condition + Value (for user_input and keyword_reply) */}
                      {(startNodeData?.triggerType === "user_input" || startNodeData?.triggerType === "keyword_reply") && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={startNodeData?.triggerCondition || "equals"}
                              onChange={(e) => patchStartNode({ triggerCondition: e.target.value })}
                              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-32"
                            >
                              {CONDITION_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={startNodeData?.triggerValue || ""}
                              onChange={(e) => patchStartNode({ triggerValue: e.target.value })}
                              placeholder="Value (e.g. BROCHURE)"
                              className="flex-1 text-xs border border-blue-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                          <p className="text-[10px] text-gray-400">Type the keyword that triggers this flow</p>
                        </div>
                      )}

                      {/* Additional conditions */}
                      {(startNodeData?.additionalConditions || []).map((cond: any, idx: number) => (
                        <div key={idx} className="space-y-2 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-2">
                            <select
                              value={cond.logic || "or"}
                              onChange={(e) => {
                                const updated = [...(startNodeData.additionalConditions || [])];
                                updated[idx] = { ...updated[idx], logic: e.target.value };
                                patchStartNode({ additionalConditions: updated });
                              }}
                              className="text-xs border border-purple-300 rounded-md px-2 py-1 bg-purple-50 font-semibold text-purple-700 w-16"
                            >
                              <option value="or">OR</option>
                              <option value="and">AND</option>
                            </select>
                            <select
                              value={cond.triggerType || "user_input"}
                              onChange={(e) => {
                                const updated = [...(startNodeData.additionalConditions || [])];
                                const opt = EVENT_OPTIONS.find((o) => o.value === e.target.value);
                                updated[idx] = { ...updated[idx], triggerType: e.target.value, triggerLabel: opt?.label || e.target.value };
                                patchStartNode({ additionalConditions: updated });
                              }}
                              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                            >
                              {EVENT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const updated = (startNodeData.additionalConditions || []).filter((_: any, i: number) => i !== idx);
                                patchStartNode({ additionalConditions: updated });
                              }}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                          {(cond.triggerType === "user_input" || cond.triggerType === "keyword_reply") && (
                            <div className="flex gap-2">
                              <select
                                value={cond.triggerCondition || "equals"}
                                onChange={(e) => {
                                  const updated = [...(startNodeData.additionalConditions || [])];
                                  updated[idx] = { ...updated[idx], triggerCondition: e.target.value };
                                  patchStartNode({ additionalConditions: updated });
                                }}
                                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white w-32"
                              >
                                {CONDITION_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={cond.triggerValue || ""}
                                onChange={(e) => {
                                  const updated = [...(startNodeData.additionalConditions || [])];
                                  updated[idx] = { ...updated[idx], triggerValue: e.target.value };
                                  patchStartNode({ additionalConditions: updated });
                                }}
                                placeholder="Value"
                                className="flex-1 text-xs border border-blue-300 rounded-md px-2 py-1.5 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const existing = startNodeData?.additionalConditions || [];
                        patchStartNode({
                          additionalConditions: [...existing, {
                            logic: "or",
                            triggerType: "user_input",
                            triggerLabel: "User Input",
                            triggerCondition: "equals",
                            triggerValue: "",
                          }],
                        });
                      }}
                      className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-2.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      Add Additional Condition
                    </button>
                  </div>
                </div>
              ) : (
                /* Regular node config panel */
                <>
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-[#2563eb] shrink-0">
                    <button
                      onClick={() => setSelectedId(null)}
                      className="p-1 rounded hover:bg-blue-500 text-white/70 hover:text-white transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                    </button>
                    <span className="text-xs font-semibold text-white">Configure Node</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <ConfigPanel
                      selected={selectedNode}
                      onChange={patchSelected}
                      onDelete={deleteNode}
                      templates={templates as Template[]}
                      members={members as Member[]}
                      channelId={channelId}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Floating node picker popup */}
          {pickerState.visible && (
            <NodePickerPopup
              position={pickerState.position}
              onSelect={handlePickerSelect}
              onClose={() => setPickerState((s) => ({ ...s, visible: false }))}
            />
          )}
        </div>
      </div>
    </FlowBuilderContext.Provider>
  );
}