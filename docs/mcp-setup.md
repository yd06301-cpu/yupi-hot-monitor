# MCP 服务器配置指南

将 yupi-hot-monitor 系统作为 MCP (Model Context Protocol) 服务器运行，使 Claude Desktop 等客户端能够通过标准协议调用热点监控功能。

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 编译项目

```bash
npm run build
```

编译后的 MCP 服务器入口为 `dist/mcp/server.js`。

### 3. 配置 Claude Desktop

在 Claude Desktop 配置文件中添加 MCP 服务器：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "yupi-hot-monitor": {
      "command": "node",
      "args": ["/absolute/path/to/yupi-hot-monitor/server/dist/mcp/server.js"],
      "env": {
        "DATABASE_URL": "file:./dev.db",
        "OPENROUTER_API_KEY": "your_openrouter_api_key"
      }
    }
  }
}
```

注意：
- `args` 中的路径必须是绝对路径
- `env` 中的 `DATABASE_URL` 路径相对于 `server/` 目录
- 需要设置 `OPENROUTER_API_KEY` 才能使用 AI 分析和搜索功能

## 可用工具

| 工具名称 | 描述 |
|---------|------|
| `list_hotspots` | 获取热点列表，支持筛选和排序 |
| `get_hotspot_detail` | 获取单个热点详情 |
| `list_tutorials` | 获取教程列表（功能待启用） |
| `get_tutorial_content` | 获取教程全文（功能待启用） |
| `generate_daily_briefing` | 生成当日热点日报 |
| `trigger_hotspot_check` | 手动触发热点扫描 |
| `manage_keywords` | 管理监控关键词（增删改查） |
| `search_hotspots` | 搜索热点内容 |

## MCP CLI 测试

使用 MCP Inspector 测试服务器：

```bash
cd server
npm run build
npx @modelcontextprotocol/inspector node dist/mcp/server.js
```

或直接运行：

```bash
node dist/mcp/server.js < /dev/null
```

## 故障排除

### 数据库连接失败

确保 `DATABASE_URL` 环境变量正确设置，且 SQLite 数据库文件存在。

### AI 功能不可用

需要配置 `OPENROUTER_API_KEY` 环境变量。未配置时 AI 分析会返回默认值。

### 编译错误

运行 `npm run build` 查看 TypeScript 编译错误。确保所有依赖已安装。

### 同时运行 Express 和 MCP 服务器

两个服务器可以同时对同一 SQLite 数据库进行读操作，但应避免同时写入。建议在生产环境中使用 WAL 模式或 PostgreSQL/MySQL。
