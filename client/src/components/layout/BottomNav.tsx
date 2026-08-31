/**
 * The phone's app bar, in the shape people expect from a messaging app:
 * four destinations around a raised action button in the middle.
 *
 * Dashboard · Broadcast · (New Chat) · Chats · Profile
 */
import { useLocation } from "wouter";
import { LayoutDashboard, Send, Plus, MessageSquare, User } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useUnreadCount } from "@/contexts/UnreadCountContext";

interface NavItem {
  name: string;
  icon: typeof LayoutDashboard;
  path: string;
  /** Permission prefix; null means everyone sees it. */
  permission: string | null;
}

const LEFT_ITEMS: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", permission: "dashboard:" },
  { name: "Broadcast", icon: Send, path: "/campaigns", permission: "campaigns:" },
];

const RIGHT_ITEMS: NavItem[] = [
  { name: "Chats", icon: MessageSquare, path: "/inbox", permission: "inbox:" },
  { name: "Profile", icon: User, path: "/account", permission: null },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const unreadCount = useUnreadCount();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const canSee = (item: NavItem) => {
    if (!item.permission) return true;
    if (isAdmin) return true;
    if (!user?.permissions) return false;
    const perms = Array.isArray(user.permissions)
      ? user.permissions
      : Object.keys(user.permissions);
    return perms.some((p: string) => p.startsWith(item.permission!));
  };

  const left = LEFT_ITEMS.filter(canSee);
  const right = RIGHT_ITEMS.filter(canSee);

  const renderItem = (item: NavItem) => {
    const isActive = location.startsWith(item.path);
    const Icon = item.icon;
    const badge = item.path === "/inbox" ? unreadCount : 0;

    return (
      <button
        key={item.name}
        onClick={() => setLocation(item.path)}
        className={`relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
          isActive ? "text-[var(--primary,#16a34a)]" : "text-gray-400"
        }`}
      >
        <span className="relative">
          <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 2} />
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className={`text-[10px] leading-none ${isActive ? "font-semibold" : ""}`}>
          {item.name}
        </span>
      </button>
    );
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="relative flex items-center h-14">
        {left.map(renderItem)}

        {/* The action sits in its own column so the four destinations stay
            evenly spaced around it, and lifts above the bar like the apps this
            layout is modelled on. */}
        <div className="flex-1 flex items-start justify-center">
          <button
            onClick={() => setLocation("/contacts")}
            aria-label="New chat"
            className="-mt-6 h-14 w-14 rounded-full bg-[var(--primary,#16a34a)] text-white shadow-lg shadow-black/20 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
        </div>

        {right.map(renderItem)}
      </div>
    </nav>
  );
}
