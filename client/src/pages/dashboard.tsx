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

import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Loading } from "@/components/ui/loading";
import { MessageChart } from "@/components/charts/message-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Megaphone,
  CheckCircle,
  Users,
  TrendingUp,
  Clock,
  Activity,
  Zap,
  Upload,
  FileText,
  BarChart3,
  ExternalLink,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Eye,
  Target,
  LayoutGrid,
} from "lucide-react";
import { useDashboardStats, useAnalytics } from "@/hooks/use-dashboard";
import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { User, LogOut, LogIn, Edit, PlusCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { DashboardStarApiDataType } from "./types/type";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import AdminStats from "@/components/AdminStats";
import { ChannelHealthCard } from "@/components/dashboard/ChannelHealthCard";
import { QuickStatsCard } from "@/components/dashboard/QuickStatsCard";
import { TopBroadcastsCard } from "@/components/dashboard/TopBroadcastsCard";
import { TopAgentsCard } from "@/components/dashboard/TopAgentsCard";

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: activeChannel } = useQuery({
    queryKey: ["/api/channels/active"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/channels/active");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const isAdmin = user?.role === "superadmin";

  const { data: activityLogs = [], isLoading } = useQuery({
    queryKey: ["/api/team/activity-logs"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/team/activity-logs");
      return await response.json();
    },
  });




  // console.log("activity logs response ", activityLogs);

  const [timeRange, setTimeRange] = useState<number>(30);

  // Fetch campaign analytics
  const { data: campaignAnalytics, isLoading: campaignLoading } = useQuery({
    queryKey: ["/api/analytics/campaigns", activeChannel?.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(activeChannel?.id && { channelId: activeChannel.id }),
      });
      const response = await apiRequest("GET", `/api/analytics/campaigns?${params}`);
      return await response.json();
    },
    enabled: !!activeChannel,
  });

  const { data: stats, isLoading: statsLoading } = useDashboardStats(
    activeChannel?.id
  );
  // const { data: analytics, isLoading: analyticsLoading } = useAnalytics(7, activeChannel?.id);

  // Fetch message analytics
  const { data: messageAnalytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/analytics/messages", activeChannel?.id, timeRange],

    queryFn: async () => {
      const params = new URLSearchParams({
        days: timeRange.toString(),
        ...(user?.role !== "superadmin" && activeChannel?.id && {
          channelId: activeChannel.id,
        }),
      });

      const response = await apiRequest("GET", `/api/analytics/messages?${params}`);
      return await response.json();
    },

    enabled:
      user?.role === "superadmin"
        ? true
        : !!activeChannel?.id,
  });


  // console.log("this is stats ", stats);

  if (statsLoading) {
    return (
      <div className="flex-1 min-h-screen" style={{ backgroundColor: "#eceef2" }}>
        <Header title={t("dashboard.title")} subtitle={t("dashboard.loadingData")} />
        <div className="p-6">
          <Loading size="lg" text={t("dashboard.loadingDashboard")} />
        </div>
      </div>
    );
  }

  // const chartData = analytics || [];
  const chartData =
    messageAnalytics?.dailyStats?.map((stat: any) => ({
      date: new Date(stat.date).toLocaleDateString(),
      sent: stat.totalSent || 0,
      delivered: stat.delivered || 0,
      read: stat.read || 0,
      failed: stat.failed || 0,
    })) || [];

  const messageMetrics = messageAnalytics?.overall || {};

  // Calculate rates — use outbound-only counts, capped at 100%
  const totalOutbound = Number(messageMetrics.totalOutbound) || 0;
  const deliveryRate =
    totalOutbound > 0
      ? Math.min(((messageMetrics.totalDelivered || 0) / totalOutbound) * 100, 100)
      : 0;

  const getActivityMeta = (action: string) => {
    switch (action) {
      case "login":
        return {
          icon: <LogIn className="w-4 h-4 text-green-600" />,
          color: "bg-green-100",
          label: t("dashboard.activity.login"),
        };
      case "logout":
        return {
          icon: <LogOut className="w-4 h-4 text-gray-600" />,
          color: "bg-gray-100",
          label: t("dashboard.activity.logout"),
        };
      case "user_created":
        return {
          icon: <PlusCircle className="w-4 h-4 text-blue-600" />,
          color: "bg-blue-100",
          label: t("dashboard.activity.user_created"),
        };
      case "user_updated":
        return {
          icon: <Edit className="w-4 h-4 text-yellow-600" />,
          color: "bg-yellow-100",
          label: t("dashboard.activity.user_updated"),
        };
      default:
        return {
          icon: <Activity className="w-4 h-4 text-purple-600" />,
          color: "bg-purple-100",
          label: t("dashboard.activity.default"),
        };
    }
  };

  const getWeekComparison = (stats: DashboardStarApiDataType) => {
    const thisWeek = stats?.weekContacts || 0;
    const lastWeek = stats?.lastWeekContacts || 0;

    if (lastWeek === 0) {
      return {
        percentage: thisWeek > 0 ? "+100.0" : "0.0",
        isUp: thisWeek > 0,
      };
    }

    const change = ((thisWeek - lastWeek) / lastWeek) * 100;
    const sign = change >= 0 ? "+" : "";

    return {
      percentage: `${sign}${change.toFixed(1)}`,
      isUp: change >= 0,
    };
  };

  type ActivityLog = {
    action: string;
    createdAt: string; // or Date
    [key: string]: any; // other optional fields
  };

  const getMonthlyGrowth = (stats: DashboardStarApiDataType) => {
    const thisMonth = stats?.thisMonthMessages || 0;
    const lastMonth = stats?.lastMonthMessages || 0;

    if (lastMonth === 0) {
      return {
        growth: thisMonth > 0 ? 100 : 0,
        isPositive: thisMonth > 0,
        isFlat: thisMonth === 0,
      };
    }

    const growthRate = ((thisMonth - lastMonth) / lastMonth) * 100;

    return {
      growth: Math.abs(growthRate).toFixed(1),
      isPositive: growthRate >= 0,
      isFlat: growthRate === 0,
    };
  };

  return (
    <div className="flex-1 min-h-screen" style={{ backgroundColor: "#eceef2" }}>
      {user?.role === "superadmin" ? (
        <Header title="" subtitle="" />
      ) : (
        <Header
          title=""
          subtitle=""
          action={{
            label: t("dashboard.newCampaign"),
            onClick: () => setLocation("/campaigns"),
          }}
        />
      )}

      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
            {t("dashboard.title")}
          </h1>
          <p className="text-gray-500 mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {/* Superadmin dashboard: platform-wide stats, message activity, activity log */}
        {user?.role === "superadmin" && (
          <>
            <AdminStats />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  {t("dashboard.messageAnalytics")}
                </CardTitle>
                <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {[
                    { days: 7, label: t("dashboard.7Days") },
                    { days: 30, label: t("dashboard.30Days") },
                    { days: 90, label: t("dashboard.3Months") },
                  ].map(({ days, label }) => (
                    <button
                      key={days}
                      onClick={() => setTimeRange(days)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        timeRange === days
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
                ) : chartData.length > 0 ? (
                  <MessageChart data={chartData} />
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-gray-500">
                    {t("dashboard.noRecentActivities")}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <Card className="lg:col-span-2 h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-600" />
                    {t("dashboard.recentActivity")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <p className="text-sm text-gray-500">{t("dashboard.loadingActivities")}</p>
                  ) : (Array.isArray(activityLogs) ? activityLogs : []).length === 0 ? (
                    <p className="text-sm text-gray-500">{t("dashboard.noRecentActivities")}</p>
                  ) : (
                    <div className="space-y-3">
                      {(activityLogs as ActivityLog[]).slice(0, 8).map((log, i) => {
                        const meta = getActivityMeta(log.action);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${meta.color}`}>{meta.icon}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {meta.label}
                                {log.username ? ` — ${log.username}` : ""}
                              </p>
                              <p className="text-xs text-gray-500">
                                {log.createdAt
                                  ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                                  : ""}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-600" />
                    {t("dashboard.deliveryRate")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-4xl font-black text-gray-900">
                      {deliveryRate.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {t("dashboard.delivered")} / {t("dashboard.sent")} ({timeRange}d)
                    </p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{t("dashboard.sent")}</span>
                      <span className="font-semibold">{totalOutbound.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{t("dashboard.delivered")}</span>
                      <span className="font-semibold text-green-600">
                        {Number(messageMetrics.totalDelivered || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{t("dashboard.read")}</span>
                      <span className="font-semibold text-violet-600">
                        {Number(messageMetrics.totalRead || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{t("dashboard.failed")}</span>
                      <span className="font-semibold text-red-600">
                        {Number(messageMetrics.totalFailed || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Non-superadmin dashboard: channel health, quick stats, broadcasts, agents */}
        {user?.role !== "superadmin" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-2 h-full">
                <ChannelHealthCard />
              </div>
              <QuickStatsCard />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-2 h-full">
                <TopBroadcastsCard />
              </div>
              <TopAgentsCard />
            </div>
          </>
        )}

      </main>
    </div>
  );
}
