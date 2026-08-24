import { useLocation } from "wouter";
import { Home, MessageSquare, Send, Users, Menu } from "lucide-react";
import { useSidebar } from "@/contexts/sidebar-context";
import { useAuth } from "@/contexts/auth-context";

const NAV_ITEMS = [
  { name: "Home", icon: Home, path: "/dashboard", permission: "dashboard:" },
  { name: "Chats", icon: MessageSquare, path: "/inbox", permission: "inbox:" },
  { name: "Broadcast", icon: Send, path: "/campaigns", permission: "campaigns:" },
  { name: "Contacts", icon: Users, path: "/contacts", permission: "contacts:" },
  { name: "More", icon: Menu, path: "__menu__", permission: null },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { toggle } = useSidebar();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (isAdmin) return true;
    if (!user?.permissions) return false;
    const perms = Array.isArray(user.permissions) ? user.permissions : Object.keys(user.permissions);
    return perms.some((p: string) => p.startsWith(item.permission!));
  });

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {visibleItems.map((item) => {
          const isActive = item.path !== "__menu__" && location.startsWith(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.name}
              onClick={() => {
                if (item.path === "__menu__") {
                  toggle();
                } else {
                  setLocation(item.path);
                }
              }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
              <span className={`text-[10px] mt-0.5 ${isActive ? "font-semibold" : ""}`}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
