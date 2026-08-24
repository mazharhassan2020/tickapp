import { Router } from "express";
import { db } from "../db";
import { userGroups, userGroupMembers, users } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

// Sync group permissions to all members of that group
async function syncGroupPermissionsToMembers(groupId: string, permissions: string[]) {
  const members = await db
    .select({ userId: userGroupMembers.userId })
    .from(userGroupMembers)
    .where(eq(userGroupMembers.groupId, groupId));

  for (const member of members) {
    await db
      .update(users)
      .set({ permissions, updatedAt: new Date() })
      .where(eq(users.id, member.userId));
  }
}

// Get all user groups for the current admin
router.get("/", requireAuth, async (req, res) => {
  try {
    const loggedInUser = req.user as any;
    const ownerId =
      loggedInUser.role === "superadmin"
        ? undefined
        : loggedInUser.role === "team"
        ? loggedInUser.createdBy
        : loggedInUser.id;

    const whereClause = ownerId
      ? eq(userGroups.createdBy, ownerId)
      : undefined;

    const groups = await db
      .select()
      .from(userGroups)
      .where(whereClause)
      .orderBy(desc(userGroups.createdAt));

    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(userGroupMembers)
          .where(eq(userGroupMembers.groupId, group.id));
        return {
          ...group,
          memberCount: Number(countResult[0]?.count || 0),
        };
      })
    );

    res.json({ success: true, groups: groupsWithCounts });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ error: "Failed to fetch user groups" });
  }
});

// Create a user group
router.post("/", requireAuth, async (req, res) => {
  try {
    const loggedInUser = req.user as any;
    const { name, description, color, permissions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const ownerId =
      loggedInUser.role === "team"
        ? loggedInUser.createdBy
        : loggedInUser.id;

    const [group] = await db
      .insert(userGroups)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || "#6366f1",
        permissions: permissions || [],
        createdBy: ownerId,
      })
      .returning();

    res.json({ success: true, group });
  } catch (error) {
    console.error("Error creating user group:", error);
    res.status(500).json({ error: "Failed to create user group" });
  }
});

// Update a user group
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, permissions } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (color !== undefined) updateData.color = color;
    if (permissions !== undefined) updateData.permissions = permissions;

    const [group] = await db
      .update(userGroups)
      .set(updateData)
      .where(eq(userGroups.id, id))
      .returning();

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Sync permissions to all members when group permissions change
    if (permissions !== undefined) {
      await syncGroupPermissionsToMembers(id, permissions);
    }

    res.json({ success: true, group });
  } catch (error) {
    console.error("Error updating user group:", error);
    res.status(500).json({ error: "Failed to update user group" });
  }
});

// Delete a user group
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(userGroups)
      .where(eq(userGroups.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ success: true, message: "Group deleted" });
  } catch (error) {
    console.error("Error deleting user group:", error);
    res.status(500).json({ error: "Failed to delete user group" });
  }
});

// Get members of a group
router.get("/:id/members", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const members = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        avatar: users.avatar,
        addedAt: userGroupMembers.addedAt,
        membershipId: userGroupMembers.id,
      })
      .from(userGroupMembers)
      .innerJoin(users, eq(userGroupMembers.userId, users.id))
      .where(eq(userGroupMembers.groupId, id));

    res.json({ success: true, members });
  } catch (error) {
    console.error("Error fetching group members:", error);
    res.status(500).json({ error: "Failed to fetch group members" });
  }
});

// Add members to a group
router.post("/:id/members", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array is required" });
    }

    // Get group permissions
    const [group] = await db
      .select()
      .from(userGroups)
      .where(eq(userGroups.id, id));

    for (const userId of userIds) {
      const existing = await db
        .select()
        .from(userGroupMembers)
        .where(
          and(
            eq(userGroupMembers.userId, userId),
            eq(userGroupMembers.groupId, id)
          )
        );
      if (existing.length === 0) {
        await db.insert(userGroupMembers).values({ userId, groupId: id });

        // Apply group permissions to the user
        if (group?.permissions && group.permissions.length > 0) {
          await db
            .update(users)
            .set({ permissions: group.permissions, updatedAt: new Date() })
            .where(eq(users.id, userId));
        }
      }
    }

    res.json({ success: true, message: `${userIds.length} member(s) added` });
  } catch (error) {
    console.error("Error adding members:", error);
    res.status(500).json({ error: "Failed to add members" });
  }
});

// Remove a member from a group
router.delete("/:id/members/:userId", requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;

    await db
      .delete(userGroupMembers)
      .where(
        and(
          eq(userGroupMembers.groupId, id),
          eq(userGroupMembers.userId, userId)
        )
      );

    // Check if user is still in any other groups
    const otherMemberships = await db
      .select({ groupId: userGroupMembers.groupId })
      .from(userGroupMembers)
      .where(eq(userGroupMembers.userId, userId));

    if (otherMemberships.length === 0) {
      // User is not in any group - clear all permissions
      await db
        .update(users)
        .set({ permissions: [], updatedAt: new Date() })
        .where(eq(users.id, userId));
    } else {
      // User is in other groups - merge permissions from remaining groups
      const remainingGroups = await db
        .select()
        .from(userGroups)
        .where(sql`${userGroups.id} IN (${sql.join(otherMemberships.map(m => sql`${m.groupId}`), sql`, `)})`);

      const mergedPermissions = [...new Set(remainingGroups.flatMap(g => g.permissions || []))];
      await db
        .update(users)
        .set({ permissions: mergedPermissions, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    res.json({ success: true, message: "Member removed" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

export default router;
