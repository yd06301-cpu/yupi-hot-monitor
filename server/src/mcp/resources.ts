import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { prisma } from "../db.js";

/**
 * 注册 MCP 资源
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "system-stats",
    "hotspot-monitor://stats/system",
    {
      title: "系统统计数据",
      description: "热点监控系统的实时统计数据，包括热点总数、今日新增、紧急热点数量、各来源分布",
      mimeType: "application/json",
    },
    async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [total, todayCount, urgentCount, sourceStats, keywordCount] = await Promise.all([
        prisma.hotspot.count(),
        prisma.hotspot.count({ where: { createdAt: { gte: today } } }),
        prisma.hotspot.count({ where: { importance: "urgent" } }),
        prisma.hotspot.groupBy({ by: ["source"], _count: { source: true } }),
        prisma.keyword.count(),
      ]);

      const stats = {
        totalHotspots: total,
        todayHotspots: todayCount,
        urgentHotspots: urgentCount,
        activeKeywords: keywordCount,
        bySource: sourceStats.reduce((acc: Record<string, number>, item: { source: string; _count: { source: number } }) => {
          acc[item.source] = item._count.source;
          return acc;
        }, {} as Record<string, number>),
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri: "hotspot-monitor://stats/system",
            text: JSON.stringify(stats, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
