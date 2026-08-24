import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
  X,
  Search,
  Loader2,
  Shield,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  permissions: string[];
  memberCount: number;
  createdAt: string;
}

interface TeamMember {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  avatar: string | null;
}

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
];

// Permission groups for the UI
const PERMISSION_SECTIONS = [
  {
    label: "Dashboard",
    permissions: [
      { key: "dashboard:view", label: "View Dashboard" },
      { key: "dashboard:export", label: "Export Data" },
    ],
  },
  {
    label: "Inbox / Chats",
    permissions: [
      { key: "inbox:view", label: "View Inbox" },
      { key: "inbox:view_assigned", label: "View Assigned Chats Only" },
      { key: "inbox:view_unassigned", label: "View Unassigned Chats" },
      { key: "inbox:view_all", label: "View All Chats" },
      { key: "inbox:send", label: "Send Messages" },
      { key: "inbox:assign", label: "Assign Conversations" },
      { key: "inbox:close", label: "Close Conversations" },
    ],
  },
  {
    label: "Contacts",
    permissions: [
      { key: "contacts:view", label: "View Contacts" },
      { key: "contacts:create", label: "Create Contacts" },
      { key: "contacts:edit", label: "Edit Contacts" },
      { key: "contacts:delete", label: "Delete Contacts" },
      { key: "contacts:import", label: "Import Contacts" },
      { key: "contacts:export", label: "Export Contacts" },
    ],
  },
  {
    label: "Broadcast / Campaigns",
    permissions: [
      { key: "campaigns:view", label: "View Campaigns" },
      { key: "campaigns:create", label: "Create Campaigns" },
      { key: "campaigns:edit", label: "Edit Campaigns" },
      { key: "campaigns:send", label: "Send Campaigns" },
      { key: "campaigns:schedule", label: "Schedule Campaigns" },
    ],
  },
  {
    label: "Templates",
    permissions: [
      { key: "templates:view", label: "View Templates" },
      { key: "templates:create", label: "Create Templates" },
      { key: "templates:edit", label: "Edit Templates" },
      { key: "templates:sync", label: "Sync Templates" },
    ],
  },
  {
    label: "Automations / Flows",
    permissions: [
      { key: "automations:view", label: "View Automations" },
      { key: "automations:create", label: "Create Automations" },
      { key: "automations:edit", label: "Edit Automations" },
    ],
  },
  {
    label: "Analytics",
    permissions: [
      { key: "analytics:view", label: "View Analytics" },
      { key: "analytics:export", label: "Export Analytics" },
    ],
  },
  {
    label: "Team Management",
    permissions: [
      { key: "team:view", label: "View Team" },
      { key: "team:create", label: "Create Members" },
      { key: "team:edit", label: "Edit Members" },
      { key: "team:delete", label: "Delete Members" },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { key: "settings:view", label: "View Settings" },
      { key: "settings:channels", label: "Manage Channels" },
      { key: "settings:webhook", label: "Manage Webhooks" },
      { key: "settings:api", label: "Manage API Keys" },
    ],
  },
];

export default function UserGroupsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  // Fetch groups
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["/api/user-groups"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user-groups");
      return res.json();
    },
  });

  const groups: UserGroup[] = groupsData?.groups || [];

  // Fetch group members
  const { data: membersData } = useQuery({
    queryKey: ["/api/user-groups", selectedGroup?.id, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user-groups/${selectedGroup!.id}/members`);
      return res.json();
    },
    enabled: !!selectedGroup,
  });

  const groupMembers = membersData?.members || [];

  // Fetch team members for adding
  const { data: teamData } = useQuery({
    queryKey: ["/api/team/members", memberSearch],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/team/members?limit=50&search=${memberSearch}`);
      return res.json();
    },
    enabled: showAddMember,
  });

  const teamMembers: TeamMember[] = teamData?.data || [];

  // Create group
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; color: string; permissions: string[] }) => {
      const res = await apiRequest("POST", "/api/user-groups", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group created" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups"] });
      resetForm();
      setShowCreateDialog(false);
    },
    onError: () => toast({ title: "Failed to create group", variant: "destructive" }),
  });

  // Update group
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; description: string; color: string; permissions: string[] }) => {
      const res = await apiRequest("PUT", `/api/user-groups/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group updated", description: "Permissions synced to all members." });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups"] });
      resetForm();
      setEditingGroup(null);
    },
    onError: () => toast({ title: "Failed to update group", variant: "destructive" }),
  });

  // Delete group
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/user-groups/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Group deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups"] });
      if (selectedGroup) setSelectedGroup(null);
    },
    onError: () => toast({ title: "Failed to delete group", variant: "destructive" }),
  });

  // Add member
  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
      const res = await apiRequest("POST", `/api/user-groups/${groupId}/members`, { userIds });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member added", description: "Group permissions applied." });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups", selectedGroup?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups"] });
    },
    onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
  });

  // Remove member
  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const res = await apiRequest("DELETE", `/api/user-groups/${groupId}/members/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups", selectedGroup?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-groups"] });
    },
    onError: () => toast({ title: "Failed to remove member", variant: "destructive" }),
  });

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormColor("#6366f1");
    setFormPermissions([]);
  };

  const openEdit = (group: UserGroup) => {
    setFormName(group.name);
    setFormDescription(group.description || "");
    setFormColor(group.color);
    setFormPermissions(group.permissions || []);
    setEditingGroup(group);
  };

  const handleSubmit = () => {
    if (!formName.trim()) return;
    if (editingGroup) {
      updateMutation.mutate({ id: editingGroup.id, name: formName, description: formDescription, color: formColor, permissions: formPermissions });
    } else {
      createMutation.mutate({ name: formName, description: formDescription, color: formColor, permissions: formPermissions });
    }
  };

  const togglePermission = (key: string) => {
    setFormPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleSection = (section: typeof PERMISSION_SECTIONS[0]) => {
    const sectionKeys = section.permissions.map((p) => p.key);
    const allSelected = sectionKeys.every((k) => formPermissions.includes(k));
    if (allSelected) {
      setFormPermissions((prev) => prev.filter((p) => !sectionKeys.includes(p)));
    } else {
      setFormPermissions((prev) => [...new Set([...prev, ...sectionKeys])]);
    }
  };

  const existingMemberIds = new Set(groupMembers.map((m: any) => m.id));

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="User Groups" subtitle="Organize your team members into groups with specific access levels" />
      <main className="p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Groups list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Groups</h2>
              <Button
                size="sm"
                onClick={() => { resetForm(); setShowCreateDialog(true); }}
              >
                <Plus className="w-4 h-4 mr-1" />
                New Group
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : groups.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No groups yet</p>
                  <p className="text-xs text-gray-400 mt-1">Create a group to organize your team</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <Card
                    key={group.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedGroup?.id === group.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                          <div>
                            <p className="font-medium text-sm text-gray-900">{group.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(group.permissions || []).length} permissions
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{group.memberCount}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="p-1 rounded hover:bg-gray-100">
                                <MoreHorizontal className="w-4 h-4 text-gray-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(group); }}>
                                <Pencil className="w-3.5 h-3.5 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(group.id); }}
                                className="text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right: Group members */}
          <div className="lg:col-span-2">
            {selectedGroup ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: selectedGroup.color }}
                      />
                      <CardTitle className="text-lg">{selectedGroup.name}</CardTitle>
                      <span className="text-sm text-gray-400">
                        {groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(selectedGroup)}>
                        <Shield className="w-4 h-4 mr-1" />
                        Permissions
                      </Button>
                      <Button size="sm" onClick={() => { setMemberSearch(""); setShowAddMember(true); }}>
                        <UserPlus className="w-4 h-4 mr-1" />
                        Add Member
                      </Button>
                    </div>
                  </div>
                  {/* Show permission badges */}
                  {(selectedGroup.permissions || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {PERMISSION_SECTIONS
                        .filter((s) => s.permissions.some((p) => (selectedGroup.permissions || []).includes(p.key)))
                        .map((s) => (
                          <span key={s.label} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            {s.label}
                          </span>
                        ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {groupMembers.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No members in this group</p>
                      <p className="text-xs text-gray-400 mt-1">Click "Add Member" to add team members</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupMembers.map((member: any) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                                  <span className="text-xs text-white font-medium">
                                    {(member.firstName?.[0] || member.username[0]).toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-sm font-medium">
                                  {member.firstName} {member.lastName || ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">{member.email}</TableCell>
                            <TableCell>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 capitalize">
                                {member.role}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                member.status === "active"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}>
                                {member.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <button
                                onClick={() => removeMemberMutation.mutate({ groupId: selectedGroup.id, userId: member.id })}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Select a group to view its members</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingGroup} onOpenChange={(open) => {
        if (!open) { setShowCreateDialog(false); setEditingGroup(null); resetForm(); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create New Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Group Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Marketing, Agents, Sub Admin"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-2 pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${
                        formColor === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What is this group for?"
                rows={2}
              />
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                <Label className="text-base font-semibold">Access Permissions</Label>
              </div>
              <p className="text-xs text-gray-500">
                Select what members of this group can access. Permissions are automatically applied when members are added.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PERMISSION_SECTIONS.map((section) => {
                  const sectionKeys = section.permissions.map((p) => p.key);
                  const selectedCount = sectionKeys.filter((k) => formPermissions.includes(k)).length;
                  const allSelected = selectedCount === sectionKeys.length;

                  return (
                    <div
                      key={section.label}
                      className="border border-gray-200 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleSection(section)}
                          />
                          <span className="text-sm font-medium text-gray-900">{section.label}</span>
                        </div>
                        <span className="text-xs text-gray-400">{selectedCount}/{sectionKeys.length}</span>
                      </div>
                      <div className="pl-6 space-y-1.5">
                        {section.permissions.map((perm) => (
                          <div key={perm.key} className="flex items-center gap-2">
                            <Checkbox
                              checked={formPermissions.includes(perm.key)}
                              onCheckedChange={() => togglePermission(perm.key)}
                            />
                            <span className="text-xs text-gray-600">{perm.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingGroup(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formName.trim()}>
              {editingGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Members to {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search team members..."
                className="pl-9"
              />
            </div>
            <p className="text-xs text-gray-500">
              Group permissions will be applied to added members automatically.
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {teamMembers
                .filter((m) => !existingMemberIds.has(m.id))
                .map((member) => (
                  <button
                    key={member.id}
                    onClick={() => {
                      if (selectedGroup) {
                        addMemberMutation.mutate({ groupId: selectedGroup.id, userIds: [member.id] });
                      }
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-xs text-white font-medium">
                        {(member.firstName?.[0] || member.username[0]).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.firstName} {member.lastName || ""}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
                    </div>
                    <UserPlus className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              {teamMembers.filter((m) => !existingMemberIds.has(m.id)).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">No available team members</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
