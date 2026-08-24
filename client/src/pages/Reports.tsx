import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import Header from "@/components/layout/header";
import {
  FileText,
  Download,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Clock,
  Eye,
  Send,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const Reports = () => {
  const [days, setDays] = useState("30");
  const { selectedChannel } = useChannelContext();
  const channelId = selectedChannel?.id;

  // Fetch message analytics
  const { data: messageData, isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/analytics/messages", channelId, days],
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (channelId) params.set("channelId", channelId);
      const res = await apiRequest("GET", `/api/analytics/messages?${params}`);
      return res.json();
    },
  });

  // Fetch campaign analytics
  const { data: campaignData, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/analytics/campaigns", channelId, days],
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (channelId) params.set("channelId", channelId);
      const res = await apiRequest("GET", `/api/analytics/campaigns?${params}`);
      return res.json();
    },
  });

  // Fetch dashboard stats for contacts
  const { data: dashData } = useQuery({
    queryKey: ["/api/dashboard/user/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard/user/stats");
      return res.json();
    },
  });

  const isLoading = messagesLoading || campaignsLoading;

  const overall = messageData?.overall || {};
  const dailyStats: any[] = messageData?.dailyStats || [];

  const totalMessages = Number(overall.totalMessages || 0);
  const totalOutbound = Number(overall.totalOutbound || 0);
  const totalInbound = Number(overall.totalInbound || 0);
  const totalDelivered = Number(overall.totalDelivered || 0);
  const totalRead = Number(overall.totalRead || 0);
  const totalFailed = Number(overall.totalFailed || 0);
  const totalReplied = Number(overall.totalReplied || 0);
  const uniqueContacts = Number(overall.uniqueContacts || 0);

  const deliveryRate = totalOutbound > 0 ? ((totalDelivered / totalOutbound) * 100).toFixed(1) : "0";
  const readRate = totalOutbound > 0 ? ((totalRead / totalOutbound) * 100).toFixed(1) : "0";
  const responseRate = totalOutbound > 0 ? ((totalReplied / totalOutbound) * 100).toFixed(1) : "0";
  const failureRate = totalOutbound > 0 ? ((totalFailed / totalOutbound) * 100).toFixed(1) : "0";

  const avgResponseTime = messageData?.avgResponseTime
    ? `${Math.round(messageData.avgResponseTime / 60000)}m`
    : "N/A";

  const campaigns = campaignData?.campaigns || [];
  const totalCampaigns = campaigns.length;
  const completedCampaigns = campaigns.filter((c: any) => c.status === "completed").length;

  const totalContacts = dashData?.totalContacts || 0;

  // Get max bar height for chart
  const maxMessages = Math.max(...dailyStats.map((d: any) => Number(d.totalSent || 0)), 1);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Reports" subtitle="Analyze your WhatsApp messaging performance" />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Date Range Selector */}
        <div className="flex items-center justify-between">
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="1">Last 24 Hours</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Overview Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Total Messages"
                value={totalMessages.toLocaleString()}
                sub={`${totalOutbound.toLocaleString()} sent · ${totalInbound.toLocaleString()} received`}
                icon={MessageSquare}
                color="blue"
              />
              <MetricCard
                title="Delivery Rate"
                value={`${deliveryRate}%`}
                sub={`${totalDelivered.toLocaleString()} delivered of ${totalOutbound.toLocaleString()} sent`}
                icon={Send}
                color="green"
              />
              <MetricCard
                title="Read Rate"
                value={`${readRate}%`}
                sub={`${totalRead.toLocaleString()} read`}
                icon={Eye}
                color="purple"
              />
              <MetricCard
                title="Response Rate"
                value={`${responseRate}%`}
                sub={`${totalReplied.toLocaleString()} replied`}
                icon={MessageSquare}
                color="orange"
              />
            </div>

            {/* Second Row Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Failed Messages"
                value={totalFailed.toLocaleString()}
                sub={`${failureRate}% failure rate`}
                icon={TrendingDown}
                color="red"
              />
              <MetricCard
                title="Avg Response Time"
                value={avgResponseTime}
                sub="Average time to first reply"
                icon={Clock}
                color="cyan"
              />
              <MetricCard
                title="Unique Contacts"
                value={uniqueContacts.toLocaleString()}
                sub={`of ${totalContacts.toLocaleString()} total contacts`}
                icon={Users}
                color="indigo"
              />
              <MetricCard
                title="Campaigns"
                value={totalCampaigns.toString()}
                sub={`${completedCampaigns} completed`}
                icon={BarChart3}
                color="pink"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Message Volume */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Daily Message Volume
                  </h3>
                  {dailyStats.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                      No data for this period
                    </div>
                  ) : (
                    <div className="h-48 flex items-end gap-1">
                      {dailyStats.slice(-14).map((day: any, i: number) => {
                        const sent = Number(day.totalSent || 0);
                        const h = Math.max((sent / maxMessages) * 180, 4);
                        const dateStr = new Date(day.date).toLocaleDateString("en", { month: "short", day: "numeric" });
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${dateStr}: ${sent} sent`}>
                            <span className="text-[9px] text-gray-500">{sent || ""}</span>
                            <div
                              className="w-full bg-primary/20 rounded-t hover:bg-primary/40 transition-colors"
                              style={{ height: `${h}px` }}
                            />
                            <span className="text-[9px] text-gray-400 truncate w-full text-center">
                              {dateStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Delivery Breakdown */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Delivery Breakdown
                  </h3>
                  <div className="space-y-4">
                    <ProgressBar label="Delivery Rate" value={Number(deliveryRate)} color="bg-green-500" />
                    <ProgressBar label="Read Rate" value={Number(readRate)} color="bg-blue-500" />
                    <ProgressBar label="Response Rate" value={Number(responseRate)} color="bg-purple-500" />
                    <ProgressBar label="Failure Rate" value={Number(failureRate)} color="bg-red-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Campaign Performance Table */}
            {campaigns.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">
                    Recent Campaigns
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivered</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Read</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {campaigns.slice(0, 10).map((c: any) => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{c.totalSent || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{c.delivered || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{c.read || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{c.failed || 0}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                c.status === "completed" ? "bg-green-50 text-green-700" :
                                c.status === "sending" ? "bg-blue-50 text-blue-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function MetricCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub: string; icon: any; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
          <div className={`p-2.5 rounded-lg bg-${color}-100`}>
            <Icon className={`w-5 h-5 text-${color}-600`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-medium text-gray-900">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export default Reports;
