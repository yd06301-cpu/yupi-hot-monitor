import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import dotenv from "dotenv";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

dotenv.config();

const server = new McpServer(
  { name: "yupi-hot-monitor", version: "1.0.0" },
  {
    capabilities: { resources: {} },
    instructions:
      "这是一个热点监控系统的 MCP 服务器。提供热点查询、关键词管理、日报生成、手动扫描等功能。所有工具描述均为中文。",
  }
);

registerTools(server);
registerResources(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🔥 yupi-hot-monitor MCP Server 已启动");
  console.error("📡 通过 StdioTransport 接收请求");
}

main().catch((error) => {
  console.error("MCP Server fatal error:", error);
  process.exit(1);
});
