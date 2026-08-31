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

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loading } from "@/components/ui/loading";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Ban,
  Archive,
  Trash2,
  MessageCircle,
  Check,
  X,
  ArrowLeft,
  UserPlus,
  User as UserIcon,
  Pin,
  PinOff,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { normalizeDate } from "./utils";
import { isToday } from "date-fns";
import MessageItem from "./MessageItem";
import MessageComposer from "./MessageComposer";
import type { Message } from "./types";
import type { Conversation } from "@shared/schema";
import { isDemoUser, maskName, maskPhone } from "@/utils/maskUtils";
import { useMaskPhone } from "@/hooks/useMaskPhone";

const LIMIT = 1000;
const TeamAssignDropdown = ({
  conversationId,
  currentAssignee,
  currentAssigneeName,
  onAssign,
}: {
  conversationId: string;
  currentAssignee?: string;
  currentAssigneeName?: string;
  onAssign: (assignedTo: string, assignedToName: string) => void;
}) => {
  const { data: users = [] } = useQuery({
    queryKey: ["/api/team/members", LIMIT],
    queryFn: async () => {
      const response = await fetch( `/api/team/members?limit=${LIMIT}`);
      
      if (!response.ok) throw new Error("Failed to fetch users");
    const data = await response.json()
    return data.data;
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="w-4 h-4" />
          {currentAssignee ? `Reassign (${currentAssigneeName})` : "Assign"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Assign to team member</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {currentAssignee && (
          <>
            <DropdownMenuItem onClick={() => onAssign("", "")}>
              <UserIcon className="w-4 h-4 mr-2" />
              Unassign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {users?.map((user: any) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() =>
              onAssign(
                user.id,
                `${user.firstName} ${user.lastName}`.trim() || user.username
              )
            }
          >
            <UserIcon className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span>
                {user.firstName} {user.lastName}
              </span>
              <span className="text-xs text-gray-500">@{user.username}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface MessageThreadProps {
  selectedConversation: Conversation;
  messages: Message[];
  messagesLoading: boolean;
  isTyping: boolean;
  typingUser: string;
  user: any;
  messageText: string;
  onTyping: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: () => void;
  onFileAttachment: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectTemplate: (template: any, variables: { type?: string; value?: string }[], mediaId?: string, headerType?: string | null, buttonParameters?: string[]) => void;
  is24HourWindowExpired: boolean;
  activeChannelId?: string;
  sendMessagePending: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onBack: () => void;
  onUpdateStatus: (status: string) => void;
  onViewContact: () => void;
  onArchiveChat: () => void;
  onBlockContact: () => void;
  onDeleteChat: () => void;
  onAssignConversation: (assignedTo: string, assignedToName: string) => void;
  hasMoreMessages?: boolean;
  onLoadMoreMessages?: () => void;
  loadingMoreMessages?: boolean;
  isPinned?: boolean;
  onTogglePin?: (conversationId: string, currentlyPinned: boolean) => void;
}

const MessageThread = ({
  selectedConversation,
  messages,
  messagesLoading,
  isTyping,
  typingUser,
  user,
  messageText,
  onTyping,
  onSendMessage,
  onFileAttachment,
  onFileChange,
  onSelectTemplate,
  is24HourWindowExpired,
  activeChannelId,
  sendMessagePending,
  fileInputRef,
  messagesEndRef,
  onBack,
  onUpdateStatus,
  onViewContact,
  onArchiveChat,
  onBlockContact,
  onDeleteChat,
  onAssignConversation,
  hasMoreMessages = false,
  onLoadMoreMessages,
  loadingMoreMessages = false,
  isPinned = false,
  onTogglePin,
}: MessageThreadProps) => {
  const { t } = useTranslation();
  const demo = isDemoUser(user?.username);
  const { mask } = useMaskPhone();

  const headerName = demo
    ? maskName((selectedConversation as any)?.contactName || "")
    : (selectedConversation as any)?.contactName;
  const headerPhone = demo
    ? maskPhone(selectedConversation?.contactPhone || "")
    : mask(selectedConversation?.contactPhone);
  const headerPhoneDisplay = demo
    ? maskPhone((selectedConversation as any)?.contact?.phone || selectedConversation?.contactPhone || "")
    : mask((selectedConversation as any)?.contact?.phone || selectedConversation?.contactPhone || "");

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-gray-50">
      {/* On a phone this is the app's chat bar: coloured, back arrow, name only.
          On a desktop it stays the white toolbar with its extra controls. */}
      <div className="bg-[var(--primary,#16a34a)] md:bg-white border-b border-black/10 md:border-gray-100 px-2 md:px-6 py-2 md:py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 md:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 text-white hover:bg-white/15 hover:text-white shrink-0"
              onClick={onBack}
              data-testid="button-back-conversations"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-9 w-9 md:h-10 md:w-10 shrink-0">
              <AvatarFallback className="bg-emerald-500 text-white font-semibold text-sm">
                {demo ? "*" : ((selectedConversation as any).contactName?.[0]?.toUpperCase() || "?")}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white md:text-gray-900 text-[15px] truncate">
                  {headerName ||
                      headerPhone ||
                      "Unknown"}
                </h3>

                <Badge
                  variant={
                    selectedConversation.status === "resolved"
                      ? "secondary"
                      : "default"
                  }
                  className={cn(
                    "hidden md:flex text-[10px] font-medium px-2 py-0 h-5 rounded-full",
                    selectedConversation.status === "resolved"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-green-50 text-green-700 border border-green-200"
                  )}
                >
                  {selectedConversation.status || "open"}
                </Badge>
              </div>
              <p className="text-[12px] md:text-[13px] text-white/80 md:text-gray-500 mt-0 md:mt-0.5 truncate">
                {headerPhoneDisplay}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {((selectedConversation as any)?.contact?.id || (selectedConversation as any)?.contactId) && (
              <OptInToggle
                contactId={(selectedConversation as any)?.contact?.id || (selectedConversation as any)?.contactId}
              />
            )}
            {onTogglePin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-700"
                onClick={() =>
                  onTogglePin(selectedConversation.id, isPinned)
                }
                title={isPinned ? t("inbox.pin.unpin") : t("inbox.pin.pin")}
                aria-label={isPinned ? t("inbox.pin.unpin") : t("inbox.pin.pin")}
                data-testid="button-toggle-pin-header"
              >
                {isPinned ? (
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4" />
                )}
              </Button>
            )}
            {!demo &&
              (
              <TeamAssignDropdown
                conversationId={selectedConversation.id}
                currentAssignee={
                  selectedConversation.assignedTo || undefined
                }
                currentAssigneeName={
                  selectedConversation?.assignedToName || undefined
                }
                onAssign={onAssignConversation}
              /> )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={false}
                  onClick={() => onUpdateStatus("open")}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mark as Open
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={false}
                  onClick={() => onUpdateStatus("resolved")}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Mark as Resolved
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onViewContact}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  View Contact
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={false}
                  onClick={onArchiveChat}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Chat
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={false}
                  onClick={onBlockContact}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Block Contact
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={false}
                  className="text-red-600"
                  onClick={onDeleteChat}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 chat-wallpaper">
        <div>
          {messagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loading />
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No messages yet. Start a conversation!
            </div>
          ) : (
            <div className="space-y-1">
              {hasMoreMessages && (
                <div className="flex justify-center py-2 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onLoadMoreMessages}
                    disabled={loadingMoreMessages}
                    className="text-xs text-gray-500 border-gray-200"
                  >
                    {loadingMoreMessages ? "Loading..." : "Load older messages"}
                  </Button>
                </div>
              )}
              {messages.map((message: Message, index: number) => {
                const prevMessage =
                  index > 0 ? messages[index - 1] : null;
               const currentDate = normalizeDate(message.createdAt);
    const prevDate = prevMessage
      ? normalizeDate(prevMessage.createdAt)
      : null;

    const showDate =
      !prevDate ||
      !currentDate ||
      !isToday(currentDate) ||
      !isToday(prevDate);

                return (
                  <MessageItem
                    key={message.id}
                    message={message}
                    showDate={showDate}
                  />
                );
              })}

              {isTyping && (
                <div className="flex items-end gap-2 mb-4">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-200 text-xs">
                      {typingUser[0] || "V"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      ></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <MessageComposer
        selectedConversation={selectedConversation}
        messageText={messageText}
        onTyping={onTyping}
        onSendMessage={onSendMessage}
        onFileAttachment={onFileAttachment}
        onFileChange={onFileChange}
        onSelectTemplate={onSelectTemplate}
        is24HourWindowExpired={is24HourWindowExpired}
        activeChannelId={activeChannelId}
        sendMessagePending={sendMessagePending}
        fileInputRef={fileInputRef}
      />
    </div>
  );
};

export default MessageThread;

function OptInToggle({ contactId }: { contactId: string }) {
  const [isOptIn, setIsOptIn] = useState<boolean | null>(null);
  const lastContactId = useRef<string>("");
  const userToggled = useRef(false);

  useEffect(() => {
    if (contactId === lastContactId.current) return;
    lastContactId.current = contactId;
    userToggled.current = false;

    apiRequest("GET", `/api/contacts/${contactId}`)
      .then(r => r.json())
      .then(data => {
        if (contactId === lastContactId.current && !userToggled.current) {
          setIsOptIn(data?.optIn !== false);
        }
      })
      .catch(() => {});
  }, [contactId]);

  if (isOptIn === null) return null;

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        userToggled.current = true;
        const newVal = !isOptIn;
        setIsOptIn(newVal);
        apiRequest("PATCH", `/api/contacts/${contactId}/opt-in`, { optIn: newVal })
        .then(r => {
          if (!r.ok) { setIsOptIn(!newVal); userToggled.current = false; }
        }).catch(() => { setIsOptIn(!newVal); userToggled.current = false; });
      }}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-100"
      style={{ cursor: "pointer" }}
    >
      <span className="text-xs text-gray-500">{isOptIn ? "Opt-In" : "Opted Out"}</span>
      <div
        className="relative inline-flex items-center rounded-full"
        style={{
          height: 16, width: 28,
          backgroundColor: isOptIn ? "#22c55e" : "#ef4444",
          transition: "background-color 0.2s",
        }}
      >
        <span
          className="inline-block rounded-full bg-white"
          style={{
            height: 10, width: 10,
            transform: isOptIn ? "translateX(14px)" : "translateX(3px)",
            transition: "transform 0.2s",
          }}
        />
      </div>
    </button>
  );
}
