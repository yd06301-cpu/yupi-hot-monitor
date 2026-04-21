import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import * as z from "zod";
import { prisma } from "../db.js";
import { sortHotspots } from "../utils/sortHotspots.js";
import { runHotspotCheck } from "../jobs/hotspotChecker.js";
import { analyzeContent, expandKeyword, preMatchKeyword } from "../services/ai.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types";

/**
 * 注册所有 MCP 工具
 */
export function registerTools(server: McpServer): void {
  // ========== 1. list_hotspots ==========
  server.registerTool("list_hotspots", {
    description: "获取热点列表，支持多种筛选和排序选项",
    inputSchema: {
      page: z.number().default(1).describe("页码，从1开始"),
      limit: z.number().default(20).describe("每页数量"),
      source: z.string().optional().describe("来源筛选（twitter, bing, google, hackernews, sogou, bilibili, weibo）"),
      importance: z.string().optional().describe("重要程度筛选（low, medium, high, urgent）"),
      keywordId: z.string().optional().describe("关键词ID筛选"),
      isReal: z.boolean().optional().describe("是否真实热点筛选"),
      timeRange: z.string().optional().describe("时间范围（1h, today, 7d, 30d）"),
      sortBy: z.string().default("createdAt").describe("排序字段"),
      sortOrder: z.string().default("desc").describe("排序方向（asc, desc）"),
    },
    annotations: { readOnlyHint: true } as ToolAnnotations,
  }, async ({ page, limit, source, importance, keywordId, isReal, timeRange, sortBy, sortOrder }) => {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (source) where.source = source;
      if (importance) where.importance = importance;
      if (keywordId) where.keywordId = keywordId;
      if (isReal !== undefined) where.isReal = isReal;

      // 时间范围筛选
      if (timeRange) {
        const now = new Date();
        let dateFrom: Date | null = null;
        switch (timeRange) {
          case "1h":
            dateFrom = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case "today":
            dateFrom = new Date(now);
            dateFrom.setHours(0, 0, 0, 0);
            break;
          case "7d":
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        }
        if (dateFrom) {
          where.createdAt = { gte: dateFrom };
        }
      }

      const needsMemorySort = sortBy === "importance" || sortBy === "hot";
      const order = sortOrder === "asc" ? "asc" : "desc";

      let orderBy: any;
      switch (sortBy) {
        case "publishedAt":
          orderBy = [{ publishedAt: order }, { createdAt: "desc" }];
          break;
        case "relevance":
          orderBy = { relevance: order };
          break;
        case "importance":
        case "hot":
          orderBy = { createdAt: "desc" };
          break;
        default:
          orderBy = { createdAt: order };
          break;
      }

      const [rawHotspots, total] = await Promise.all([
        prisma.hotspot.findMany({
          where,
          orderBy,
          ...(needsMemorySort ? {} : { skip, take: limit }),
          include: {
            keyword: { select: { id: true, text: true, category: true } },
          },
        }),
        prisma.hotspot.count({ where }),
      ]);

      let hotspots;
      if (needsMemorySort) {
        const sorted = sortHotspots(rawHotspots, sortBy, order);
        hotspots = sorted.slice(skip, skip + limit);
      } else {
        hotspots = rawHotspots;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                data: hotspots,
                pagination: {
                  page,
                  limit,
                  total,
                  totalPages: Math.ceil(total / limit),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error("list_hotspots error:", error);
      return {
        content: [{ type: "text", text: `获取热点列表失败: ${error}` }],
        isError: true,
      };
    }
  });

  // ========== 2. get_hotspot_detail ==========
  server.registerTool("get_hotspot_detail", {
    description: "获取单个热点的详细信息",
    inputSchema: {
      id: z.string().describe("热点ID"),
    },
    annotations: { readOnlyHint: true } as ToolAnnotations,
  }, async ({ id }) => {
    try {
      const hotspot = await prisma.hotspot.findUnique({
        where: { id },
        include: { keyword: true },
      });

      if (!hotspot) {
        return {
          content: [{ type: "text", text: "未找到该热点" }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(hotspot, null, 2) }],
      };
    } catch (error) {
      console.error("get_hotspot_detail error:", error);
      return {
        content: [{ type: "text", text: `获取热点详情失败: ${error}` }],
        isError: true,
      };
    }
  });

  // ========== 3. list_tutorials ==========
  server.registerTool("list_tutorials", {
    description: "获取教程列表（该功能尚未启用）",
    inputSchema: {
      page: z.number().default(1).describe("页码"),
      limit: z.number().default(20).describe("每页数量"),
      category: z.string().optional().describe("分类筛选"),
    },
    annotations: { readOnlyHint: true } as ToolAnnotations,
  }, async () => {
    return {
      content: [
        {
          type: "text",
          text: "教程功能尚未启用。当前系统支持热点监控和关键词管理功能。",
        },
      ],
    };
  });

  // ========== 4. get_tutorial_content ==========
  server.registerTool("get_tutorial_content", {
    description: "获取教程全文内容（该功能尚未启用）",
    inputSchema: {
      id: z.string().describe("教程ID"),
    },
    annotations: { readOnlyHint: true } as ToolAnnotations,
  }, async () => {
    return {
      content: [
        {
          type: "text",
          text: "教程功能尚未启用。当前系统支持热点监控和关键词管理功能。",
        },
      ],
    };
  });

  // ========== 5. generate_daily_briefing ==========
  server.registerTool("generate_daily_briefing", {
    description: "生成当日热点日报，按重要程度汇总",
    inputSchema: {
      date: z.string().optional().describe("日期（ISO格式），默认为今天"),
      format: z.enum(["markdown", "json"]).default("markdown").describe("输出格式"),
    },
    annotations: { readOnlyHint: true, idempotentHint: true } as ToolAnnotations,
  }, async ({ date, format }) => {
    try {
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      const todayHotspots: any[] = await prisma.hotspot.findMany({
        where: { createdAt: { gte: targetDate } },
        orderBy: [{ importance: "desc" }, { relevance: "desc" }],
        take: 50,
        include: { keyword: true },
      });

      if (format === "json") {
        const briefing = {
          date: targetDate.toISOString(),
          total: todayHotspots.length,
          byImportance: {
            urgent: todayHotspots.filter((h) => h.importance === "urgent").length,
            high: todayHotspots.filter((h) => h.importance === "high").length,
            medium: todayHotspots.filter((h) => h.importance === "medium").length,
            low: todayHotspots.filter((h) => h.importance === "low").length,
          },
          hotspots: todayHotspots.map((h) => ({
            title: h.title,
            url: h.url,
            source: h.source,
            importance: h.importance,
            relevance: h.relevance,
            keyword: h.keyword?.text,
            summary: h.summary,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(briefing, null, 2) }],
        };
      }

      // Markdown 格式
      const urgent = todayHotspots.filter((h) => h.importance === "urgent");
      const high = todayHotspots.filter((h) => h.importance === "high");
      const medium = todayHotspots.filter((h) => h.importance === "medium");
      const low = todayHotspots.filter((h) => h.importance === "low");

      let md = `# 热点监控日报\n\n`;
      md += `📅 日期: ${targetDate.toLocaleDateString("zh-CN")}\n`;
      md += `📊 总计: ${todayHotspots.length} 条热点\n\n`;

      md += `## 概览\n`;
      md += `- 🔴 紧急: ${urgent.length}\n`;
      md += `- 🟠 高: ${high.length}\n`;
      md += `- 🟡 中: ${medium.length}\n`;
      md += `- 🟢 低: ${low.length}\n\n`;

      if (urgent.length > 0) {
        md += `## 🔴 紧急热点\n`;
        urgent.forEach((h) => {
          md += `- [${h.title}](${h.url}) ${h.summary ? `- ${h.summary}` : ""}\n`;
        });
        md += "\n";
      }

      if (high.length > 0) {
        md += `## 🟠 高优先级热点\n`;
        high.forEach((h) => {
          md += `- [${h.title}](${h.url}) ${h.summary ? `- ${h.summary}` : ""}\n`;
        });
        md += "\n";
      }

      if (medium.length > 0) {
        md += `## 🟡 中等优先级热点\n`;
        const displayed = medium.slice(0, 10);
        displayed.forEach((h) => {
          md += `- [${h.title}](${h.url})\n`;
        });
        if (medium.length > 10) {
          md += `- ...还有 ${medium.length - 10} 条\n`;
        }
        md += "\n";
      }

      md += `---\n*由 yupi-hot-monitor MCP 服务器生成*`;

      return {
        content: [{ type: "text", text: md }],
      };
    } catch (error) {
      console.error("generate_daily_briefing error:", error);
      return {
        content: [{ type: "text", text: `生成日报失败: ${error}` }],
        isError: true,
      };
    }
  });

  // ========== 6. trigger_hotspot_check ==========
  server.registerTool("trigger_hotspot_check", {
    description: "手动触发热点扫描任务，立即检查所有激活的关键词",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as ToolAnnotations,
  }, async () => {
    try {
      await runHotspotCheck();
      return {
        content: [
          {
            type: "text",
            text: "✅ 热点扫描已完成。请查看数据库或使用 list_hotspots 工具查看新发现的热点。",
          },
        ],
      };
    } catch (error) {
      console.error("trigger_hotspot_check error:", error);
      return {
        content: [{ type: "text", text: `触发热点扫描失败: ${error}` }],
        isError: true,
      };
    }
  });

  // ========== 7. manage_keywords ==========
  server.registerTool("manage_keywords", {
    description: "管理监控关键词，支持查询、创建、更新、删除和切换状态",
    inputSchema: {
      action: z.enum(["list", "get", "create", "update", "delete", "toggle"]).describe("操作类型"),
      id: z.string().optional().describe("关键词ID（get/update/delete/toggle 时需要）"),
      text: z.string().optional().describe("关键词文本（create/update 时可用）"),
      category: z.string().optional().describe("分类（create/update 时可用）"),
      isActive: z.boolean().optional().describe("是否激活（update 时可用）"),
    },
    annotations: { readOnlyHint: false } as ToolAnnotations,
  }, async ({ action, id, text, category, isActive }) => {
    try {
      switch (action) {
        case "list": {
          const keywords = await prisma.keyword.findMany({
            orderBy: { createdAt: "desc" },
            include: {
              _count: { select: { hotspots: true } },
            },
          });
          return {
            content: [{ type: "text", text: JSON.stringify(keywords, null, 2) }],
          };
        }

        case "get": {
          if (!id) {
            return {
              content: [{ type: "text", text: "错误: 需要提供关键词ID" }],
              isError: true,
            };
          }
          const keyword = await prisma.keyword.findUnique({
            where: { id },
            include: {
              hotspots: { orderBy: { createdAt: "desc" }, take: 20 },
            },
          });
          if (!keyword) {
            return {
              content: [{ type: "text", text: "未找到该关键词" }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(keyword, null, 2) }],
          };
        }

        case "create": {
          if (!text || text.trim().length === 0) {
            return {
              content: [{ type: "text", text: "错误: 需要提供关键词文本" }],
              isError: true,
            };
          }
          const keyword = await prisma.keyword.create({
            data: {
              text: text.trim(),
              category: category?.trim() || null,
            },
          });
          return {
            content: [{ type: "text", text: `✅ 关键词已创建: ${JSON.stringify(keyword, null, 2)}` }],
          };
        }

        case "update": {
          if (!id) {
            return {
              content: [{ type: "text", text: "错误: 需要提供关键词ID" }],
              isError: true,
            };
          }
          const updateData: any = {};
          if (text !== undefined) updateData.text = text.trim();
          if (category !== undefined) updateData.category = category?.trim() || null;
          if (isActive !== undefined) updateData.isActive = isActive;

          const keyword = await prisma.keyword.update({
            where: { id },
            data: updateData,
          });
          return {
            content: [{ type: "text", text: `✅ 关键词已更新: ${JSON.stringify(keyword, null, 2)}` }],
          };
        }

        case "delete": {
          if (!id) {
            return {
              content: [{ type: "text", text: "错误: 需要提供关键词ID" }],
              isError: true,
            };
          }
          await prisma.keyword.delete({ where: { id } });
          return {
            content: [{ type: "text", text: "✅ 关键词已删除" }],
          };
        }

        case "toggle": {
          if (!id) {
            return {
              content: [{ type: "text", text: "错误: 需要提供关键词ID" }],
              isError: true,
            };
          }
          const keyword = await prisma.keyword.findUnique({ where: { id } });
          if (!keyword) {
            return {
              content: [{ type: "text", text: "未找到该关键词" }],
              isError: true,
            };
          }
          const updated = await prisma.keyword.update({
            where: { id },
            data: { isActive: !keyword.isActive },
          });
          return {
            content: [
              {
                type: "text",
                text: `✅ 关键词状态已切换: ${updated.isActive ? "激活" : "停用"} - ${JSON.stringify(updated, null, 2)}`,
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `未知操作: ${action}` }],
            isError: true,
          };
      }
    } catch (error: any) {
      console.error("manage_keywords error:", error);
      if (error.code === "P2025") {
        return {
          content: [{ type: "text", text: "错误: 关键词不存在" }],
          isError: true,
        };
      }
      if (error.code === "P2002") {
        return {
          content: [{ type: "text", text: "错误: 关键词已存在" }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `关键词操作失败: ${error}` }],
        isError: true,
      };
    }
  });

  // ========== 8. search_hotspots ==========
  server.registerTool("search_hotspots", {
    description: "搜索热点内容，使用 AI 分析搜索结果的相关性",
    inputSchema: {
      query: z.string().describe("搜索查询"),
      sources: z.array(z.string()).default(["twitter", "bing"]).describe("搜索来源列表"),
    },
    annotations: { readOnlyHint: true } as ToolAnnotations,
  }, async ({ query, sources }) => {
    try {
      if (!query) {
        return {
          content: [{ type: "text", text: "错误: 需要提供搜索查询" }],
          isError: true,
        };
      }

      const results: any[] = [];

      // 动态导入搜索服务
      const { searchTwitter } = await import("../services/twitter.js");
      const { searchBing } = await import("../services/search.js");

      if (sources.includes("twitter")) {
        try {
          const tweets = await searchTwitter(query);
          results.push(...tweets);
        } catch (error) {
          console.error("Twitter search failed:", error);
        }
      }

      if (sources.includes("bing")) {
        try {
          const webResults = await searchBing(query);
          results.push(...webResults);
        } catch (error) {
          console.error("Bing search failed:", error);
        }
      }

      // AI 分析前几个结果
      const analyzedResults = await Promise.all(
        results.slice(0, 10).map(async (item) => {
          try {
            const analysis = await analyzeContent(
              item.title + " " + item.content,
              query
            );
            return { ...item, analysis };
          } catch {
            return { ...item, analysis: null };
          }
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ results: analyzedResults }, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("search_hotspots error:", error);
      return {
        content: [{ type: "text", text: `搜索失败: ${error}` }],
        isError: true,
      };
    }
  });
}
