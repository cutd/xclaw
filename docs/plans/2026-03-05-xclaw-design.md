# xclaw 项目设计文档

> 受 OpenClaw 启发的全新自托管 AI 助手网关，聚焦成本优化、使用体验、安全性和生态兼容性。

## 1. 项目定位

- **类型**：受 OpenClaw 启发的全新项目，独立架构设计
- **目标用户**：个人开发者优先，架构预留团队/企业扩展能力
- **核心价值**：在 OpenClaw 的多平台 AI 助手基础上，针对成本、体验、安全、兼容四个维度做系统性改进
- **技术栈**：TypeScript 5.x + Node.js >= 22 + pnpm monorepo

## 2. 整体架构

融合三种架构范式：**分层为骨架，插件为血肉，Agent 为灵魂**。

```
┌─────────────────────────────────────────────────────────┐
│                   渠道层 (Channels)                       │
│  Telegram │ Slack │ Discord │ 飞书 │ 企微 │ Web │ CLI   │
│  [插件化，可动态加载卸载]                                  │
└──────────────────────┬──────────────────────────────────┘
                       │ 统一消息格式
┌──────────────────────▼──────────────────────────────────┐
│              安全核心层 (Security Core)                    │
│  [硬编码核心，不可绕过]                                    │
│  认证配对 │ 密钥管理 │ 风险评估 │ 审批确认 │ 审计日志      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│        智能路由 & Agent 编排层 (Brain)                     │
│  任务分析器 │ Agent 调度器 │ 上下文管理器 │ Token 预算     │
│  [按任务复杂度选择模型和 Agent 级别]                       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              执行层 (Execution Layer)                     │
│  沙箱执行器 │ Skill 执行 │ 工具调用 │ 子代理              │
│  [沙箱隔离，插件化 Skills]                                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│           兼容适配层 (Compatibility Adapters)             │
│  OpenClaw 自动适配 │ MCP 协议桥接 │ Claude Code 兼容     │
│  [透明无感，放进去就能用]                                  │
└─────────────────────────────────────────────────────────┘
```

### 2.1 设计原则

- **分层骨架**：5 个明确层次，安全层和路由层是硬编码核心，不可插件化绕过
- **层内插件**：渠道层和执行层完全插件化，可动态加载卸载
- **Agent 灵魂**：路由层核心是 Agent 编排，按任务复杂度自动选择模型和 Agent 级别
- **告知不拒绝**：安全系统只告知风险，最终决策权永远在用户
- **透明兼容**：自动识别 OpenClaw/MCP/Claude Code 格式，无需用户手动导入

## 3. 成本优化

### 3.1 任务复杂度分析器 (Task Analyzer)

将任务分为 4 个级别，对应不同的 Token 预算和模型选择：

| 级别 | 场景 | 模型 | Token 预算 |
|------|------|------|-----------|
| TRIVIAL | 简单问候、状态查询 | 小模型 (如 Haiku) | ~500 tokens |
| SIMPLE | 知识问答、翻译 | 中等模型 (如 Sonnet) | ~2K tokens |
| STANDARD | 代码生成、分析 | 标准模型 (如 Sonnet) | ~8K tokens |
| COMPLEX | 多步推理、架构设计 | 大模型 (如 Opus) | ~32K+ tokens |

**分级策略**：
- 使用轻量级本地分类器（基于规则 + 小模型）对用户消息进行复杂度评估
- 评估维度：消息长度、关键词、历史对话上下文、是否需要工具调用
- 分级结果决定：选用模型、Token 预算上限、上下文窗口大小

### 3.2 上下文管理器 (Context Manager)

```
用户消息历史 → 滑动窗口 → 重要性评分 → 摘要压缩 → 语义缓存
```

- **滑动窗口**：保留最近 N 轮完整对话，N 根据任务级别动态调整
- **渐进摘要**：超出窗口的历史对话自动用小模型生成摘要
- **重要性评分**：标记关键信息（用户偏好、重要决策），即使超出窗口也保留
- **语义缓存**：对相似查询复用之前的回复，用向量相似度匹配
- **工具结果缓存**：工具调用结果有 TTL 缓存，避免重复调用

### 3.3 Token 预算管理

- 每个用户/会话有可配置的月度 Token 预算
- 实时 Token 使用量统计和可视化
- 接近预算上限时自动降级（更小模型或更激进的上下文压缩）
- 用户可为不同渠道设置不同预算

## 4. 使用体验优化

### 4.1 引导式配置 (Guided Setup)

**零配置启动**原则：只需 API Key 就能用，其他全部有合理默认值。

```
$ xclaw init

🦞 欢迎使用 xclaw! 让我帮你完成初始配置。

? 你想用哪个 AI 提供商？
  ❯ Anthropic Claude (推荐)
    OpenAI / Google Gemini / 自定义

? 请输入你的 API Key: sk-ant-****
  ✓ API Key 验证通过，已加密存储

? 你想连接哪些消息平台？(可稍后添加)
  ❯ [x] Telegram ...

✅ 配置完成! 运行 `xclaw start` 开始使用
```

核心原则：
- **对话式引导**：通过交互式问答收集配置，而非让用户编辑文件
- **渐进式配置**：先跑起来，再按需添加渠道和功能
- **即时验证**：每一步即时验证（API Key 是否有效、Bot Token 是否能连接）
- **敏感信息加密**：API Key 等敏感信息在存储时自动加密

### 4.2 智能错误处理 & 通知

结构化错误信息：

```typescript
interface XClawError {
  code: string;           // 如 "CHANNEL.TELEGRAM.AUTH_FAILED"
  message: string;        // 人类可读的错误描述
  severity: 'info' | 'warning' | 'error' | 'fatal';
  suggestion: string;     // 修复建议
  docLink?: string;       // 相关文档链接
  context?: object;       // 调试上下文
}
```

通知机制：
- 当前会话：直接在对话中回复
- 控制台：CLI 实时输出
- 备用渠道：通过其他消息平台通知
- Web UI：Dashboard 告警

### 4.3 健康检查 & 自诊断

```bash
$ xclaw doctor

检查系统状态...
✅ Node.js v22.14.0
✅ 配置文件: ~/.xclaw/config.yaml
✅ API Key (Anthropic): 有效，余额充足
⚠️ Docker: 未安装 (沙箱功能受限)
   建议: brew install docker
❌ Slack: Token 已过期
   修复: xclaw config update slack.token
```

## 5. 安全体系

### 5.1 核心哲学："告知 + 确认"

xclaw 是用户的工具，不是用户的管家。安全系统的职责是**充分告知风险**，最终决策权永远在用户手上。**永远不直接拒绝任何操作。**

### 5.2 风险评估引擎

4 个风险等级，没有 "BLOCKED" 级别：

| 等级 | 行为 | 示例 |
|------|------|------|
| INFO | 静默记录，直接执行 | 读取文件、查询信息 |
| NOTICE | 在结果中附注提醒 | 访问新域名 |
| WARNING | 执行前弹出简单确认 | 删除文件、修改配置 |
| DANGER | 展示详细风险说明 + 确认 + 提供降级选项 | 执行未签名 Skill、敏感系统命令 |

DANGER 级别交互示例：

```
🔴 风险提示:
  操作: 执行未签名的第三方 Skill 'xxx'
  风险: 该 Skill 请求网络和文件系统完全访问权限
  静态分析: 发现 eval() 调用 2 处
  建议: 在沙箱中运行以降低风险

  [1] 在沙箱中执行 (降低风险)
  [2] 直接执行 (我信任此 Skill)
  [3] 取消
```

用户选择任何非取消选项 → 立即执行。

### 5.3 用户偏好记忆

- 用户可为特定操作类型设置"始终允许"
- 可为特定 Skill 设置信任级别
- 可全局调整风险提示阈值：`xclaw config set security.promptLevel warning`
- 专家模式：`xclaw config set security.promptLevel none` 关闭所有提示
- 随时可恢复提示

### 5.4 网络安全

- 默认仅监听 127.0.0.1（回环地址）
- 如需远程访问，推荐反向代理（Nginx/Caddy + TLS）、SSH 隧道或 VPN（Tailscale）
- 绝不直接暴露 WebSocket 控制面、API 管理接口、调试端口

### 5.5 密钥管理

分级存储：
- **LOW**（非敏感配置）：明文 config.yaml
- **MEDIUM**（Bot Token 等）：本地加密文件 (AES-256-GCM)
- **HIGH**（API Key、支付凭证）：系统钥匙串（macOS Keychain / Linux Secret Service / Windows Credential Manager）

敏感信息永远不明文存储。支持环境变量注入（`XCLAW_ANTHROPIC_KEY`）兼容 CI/CD 场景。

### 5.6 沙箱执行

**轻量优先，不依赖 Docker**，支持持久化和一次性两种模式。

#### 沙箱类型

| 类型 | 特点 | 适用场景 |
|------|------|---------|
| 一次性沙箱 (Ephemeral) | 执行完即销毁，无状态，最小资源开销 | 单次工具调用 |
| 持久化沙箱 (Persistent) | 有名字和 ID，状态可保存/恢复，工作区文件持久化 | 多步任务 |

#### 隔离后端（按平台自动选择）

| 平台 | 后端 | 说明 |
|------|------|------|
| macOS | sandbox-exec (App Sandbox) | 原生沙箱，零额外依赖 |
| Linux | bubblewrap (bwrap) | 轻量级 namespace 隔离，无 daemon、无 root |
| 通用回退 | Node.js isolated-vm + 进程隔离 | 纯 Node.js，跨平台 |

#### 统一资源限制

- CPU: cgroup (Linux) / ulimit
- 内存: 可配置上限，默认 512MB
- 磁盘: tmpfs + 配额
- 时间: 执行超时，默认 30s（可配置）
- 网络: 白名单控制出站连接

持久化沙箱工作目录：`~/.xclaw/sandboxes/<name>/`，支持 snapshot/restore，闲置超时自动暂停。

### 5.7 Skill 安全校验

```
下载 Skill → 签名验证 → 静态分析 → 风险报告 → 用户确认 → 安装
```

校验内容：
- 签名验证（官方/社区 Skill 需代码签名）
- 静态分析（扫描 `eval`、`exec`、`fs.rm` 等危险 API）
- 权限声明审查（Skill 必须声明需要的权限）
- 沙箱测试运行

所有校验结果汇总为风险报告交给用户确认，**永不自动拒绝安装**。

### 5.8 审计日志

所有操作和用户决策都记录日志，安全靠事后审计而非事前阻断。

## 6. 兼容性 — 透明无感

### 6.1 自动格式检测

xclaw 自动扫描以下路径并识别格式：

| 路径 | 格式 |
|------|------|
| `~/.xclaw/skills/`, `~/.xclaw/extensions/` | xclaw 原生 |
| `~/.openclaw/skills/`, `~/.openclaw/extensions/` | OpenClaw（自动适配） |
| `.claude/` | Claude Code（自动适配） |
| mcp_servers 配置 | MCP（自动连接） |

检测依据：package.json keywords/engines、manifest 格式、目录结构、导出接口签名。

### 6.2 运行时适配

**OpenClaw 插件**：
- 自动包装生命周期方法
- 自动映射事件
- 自动注入兼容 API shim
- 自动基于静态分析添加安全权限声明

**MCP Server**：
- xclaw 既是 MCP Client 也是 MCP Server
- 作为 Client：自动连接 MCP Server，注册 Tools 为 xclaw 工具
- 作为 Server：将 xclaw Skills 暴露为 MCP Tools，其他 MCP Client 可接入

**Claude Code**：
- 自动识别 skill 文件格式
- hooks 和 settings 直接兼容
- xclaw skills 可导出为 Claude Code skill 格式

### 6.3 用户体验

```bash
# OpenClaw skill 直接复制过来就能用
cp -r ~/.openclaw/skills/github ~/.xclaw/skills/

# MCP server 在配置中引用即可
# config.yaml
mcp_servers:
  - name: filesystem
    command: npx @modelcontextprotocol/server-filesystem

# Claude Code skill 直接放进来
cp -r .claude/skills/ ~/.xclaw/skills/
```

无需导入命令，无需格式转换，放进去就能用。

### 6.4 统一 Skill Manifest

```typescript
interface XClawSkillManifest {
  name: string;
  version: string;
  description: string;
  compatibility: {
    xclaw: string;
    openclaw?: string;
    mcp?: boolean;
    claudeCode?: boolean;
  };
  permissions: {
    network?: string[];
    filesystem?: string[];
    system?: string[];
  };
  tools: ToolDefinition[];
}
```

## 7. 项目结构

```
xclaw/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── vitest.config.ts
│
├── packages/
│   ├── core/                       # 核心引擎
│   │   └── src/
│   │       ├── gateway/            # WebSocket 网关
│   │       ├── security/           # 安全核心层 (硬编码)
│   │       │   ├── auth.ts
│   │       │   ├── secrets.ts
│   │       │   ├── approval.ts
│   │       │   ├── audit.ts
│   │       │   └── rateLimit.ts
│   │       ├── router/             # 智能路由层
│   │       │   ├── taskAnalyzer.ts
│   │       │   ├── modelRouter.ts
│   │       │   └── contextMgr.ts
│   │       ├── agent/              # Agent 编排
│   │       │   ├── dispatcher.ts
│   │       │   ├── lightweight.ts
│   │       │   ├── standard.ts
│   │       │   └── expert.ts
│   │       ├── sandbox/            # 沙箱引擎
│   │       │   ├── manager.ts
│   │       │   ├── bwrap.ts
│   │       │   ├── macSandbox.ts
│   │       │   └── vmIsolate.ts
│   │       ├── compat/             # 兼容适配引擎
│   │       │   ├── detector.ts
│   │       │   ├── openclawAdapter.ts
│   │       │   ├── mcpBridge.ts
│   │       │   └── claudeCodeAdapter.ts
│   │       └── plugin/             # 插件系统
│   │           ├── loader.ts
│   │           ├── registry.ts
│   │           └── lifecycle.ts
│   │
│   ├── cli/                        # CLI 工具
│   │   └── src/
│   │       ├── commands/
│   │       │   ├── init.ts
│   │       │   ├── start.ts
│   │       │   ├── doctor.ts
│   │       │   ├── config.ts
│   │       │   └── sandbox.ts
│   │       └── tui/
│   │
│   ├── providers/                  # LLM 提供商
│   │   └── src/
│   │       ├── anthropic.ts
│   │       ├── openai.ts
│   │       ├── google.ts
│   │       ├── ollama.ts
│   │       └── base.ts
│   │
│   └── sdk/                        # 插件开发 SDK
│       └── src/
│           ├── channel.ts
│           ├── skill.ts
│           ├── types.ts
│           └── testing.ts
│
├── channels/                       # 渠道插件
│   ├── telegram/
│   ├── slack/
│   ├── discord/
│   ├── feishu/
│   ├── wechat-work/
│   ├── web/
│   └── cli/
│
├── skills/                         # 内置技能
│   ├── github/
│   ├── notes/
│   ├── browser/
│   └── filesystem/
│
├── ui/                             # Web 控制面板
│   └── dashboard/
│
├── docker/                         # 容器化配置 (可选)
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── docs/
│   ├── plans/
│   ├── guides/
│   └── api/
│
└── test/
    ├── unit/
    ├── integration/
    └── e2e/
```

## 8. 技术栈

| 层面 | 选型 |
|------|------|
| 语言 | TypeScript 5.x (ES modules) |
| 运行时 | Node.js >= 22 |
| 包管理 | pnpm (monorepo) |
| 构建 | tsdown / tsup |
| 测试 | Vitest |
| Lint | oxlint + prettier |
| CLI 框架 | citty 或 commander |
| Web UI | Lit (web components) |
| 数据存储 | SQLite (本地) + LanceDB (向量缓存) |
| 密钥存储 | keytar (系统钥匙串) |
| 沙箱 | bubblewrap (Linux) / sandbox-exec (macOS) / isolated-vm (回退) |
| MCP | @modelcontextprotocol/sdk |

## 9. LLM 提供商支持

至少与 OpenClaw 保持一致：
- Anthropic Claude (Claude 4 Opus / Sonnet / Haiku)
- OpenAI (GPT-4o, GPT-4o-mini, o1, o3)
- Google Gemini (2.5 Pro, Flash)
- 本地模型 (Ollama, vLLM)
- 更多可通过 Provider 插件扩展

## 10. 部署方式

- **本地安装**：`npm install -g xclaw`
- **容器化**：Docker / Podman 一键部署
- **云服务器**：Fly.io / Render / 自有服务器
- **Raspberry Pi**：ARM 架构支持
