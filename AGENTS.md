# AGENTS.md

## 1. 适用范围

本文件适用于 WeKnora 仓库根目录。

WeKnora 包含多个可独立开发和构建的部分：

- Go 主后端
- Vue 3 Web 前端
- Python + gRPC DocReader
- Wails 桌面端
- 独立 Go CLI 模块
- 独立 Go SDK 模块
- MCP Server
- Docker、Helm 和裸机部署资源

在子目录工作时，先确认该目录是否有自己的 `AGENTS.md`。当前已知 `cli/AGENTS.md` 存在，修改 `cli/` 时还应遵循该文件。

依据：

- `go.mod`
- `cmd/server/main.go`
- `frontend/package.json`
- `docreader/main.py`
- `cli/AGENTS.md`
- `website-docs/02-architecture/01-overview.md`

---

## 2. 技术栈与模块边界

### 根 Go 主模块

- Go 1.26
- Gin 提供 HTTP API
- GORM 访问 PostgreSQL 或 SQLite
- uber/dig 负责依赖注入
- Redis + Asynq 负责标准部署中的异步任务
- 未配置 `REDIS_ADDR` 时使用进程内 `SyncTaskExecutor`
- 数据库迁移使用 golang-migrate

主要入口：

- `cmd/server/main.go`
- `internal/container/container.go`

### 前端

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- TDesign Vue Next
- SSE 使用 `@microsoft/fetch-event-source`

主要入口：

- `frontend/src/main.ts`
- `frontend/src/router/index.ts`

### DocReader

- Python >= 3.10.18
- gRPC
- Python 依赖由 `uv` 管理
- 默认 gRPC 端口为 `50051`

主要入口：

- `docreader/main.py`
- `docreader/pyproject.toml`

### CLI 和 SDK

- `cli/` 和 `client/` 是独立 Go module
- 根目录执行 `go test ./...` 不会替代这些独立模块的测试
- 修改子模块时，在对应目录执行该模块的检查

---

## 3. 目录说明

| 路径 | 职责 |
|---|---|
| `cmd/server/` | 主后端入口、监听端口、启动引导和优雅退出 |
| `cmd/desktop/` | Wails 桌面端入口 |
| `cmd/download/` | 模型或资源下载辅助工具 |
| `internal/container/` | 依赖注入、基础设施、Repository、Service、Router 和 Worker 装配 |
| `internal/router/` | HTTP 路由注册、RBAC 和 API Key 路由策略 |
| `internal/middleware/` | 认证、日志、错误处理、限流和访问控制 |
| `internal/handler/` | HTTP 请求解析、参数校验和 Service 调用 |
| `internal/handler/session/` | 会话、聊天、SSE、停止、重连和 Agent 流处理 |
| `internal/application/service/` | 核心业务编排 |
| `internal/application/service/chat_pipeline/` | RAG 插件流水线 |
| `internal/application/repository/` | GORM 和具体检索引擎的数据访问 |
| `internal/agent/` | Agent 推理、工具、审批、协作和运行控制 |
| `internal/models/` | Chat、Embedding、Rerank、VLM 等模型适配 |
| `internal/stream/` | 内存或 Redis 流管理 |
| `internal/mcpserver/` | 主服务内置 MCP Server |
| `frontend/` | Vue Web UI |
| `docreader/` | Python 文档解析服务 |
| `migrations/versioned/` | PostgreSQL/ParadeDB 迁移 |
| `migrations/sqlite/` | Lite 模式 SQLite 迁移 |
| `config/` | 主配置、Agent 配置、提示词模板和模型目录示例 |
| `docs/` | 旧文档入口及自动生成的 Swagger 文件 |
| `website-docs/` | 当前产品、API、架构和开发文档 |
| `docker/` | 应用、DocReader、Sandbox 等镜像 |
| `deploy/` | 裸机部署资源 |
| `helm/` | Kubernetes Chart |
| `cli/` | `weknora` CLI，独立 Go module |
| `client/` | Go SDK，独立 Go module |
| `miniprogram/` | 微信小程序 |
| `packages/` | 独立集成包 |
| `tests/`、`testdata/` | 集成测试与测试数据 |

有关 `docs/` 与 `website-docs/` 的关系：

- 当前产品文档在 `website-docs/`
- `docs/README.md` 明确说明旧手写文档已迁移
- `docs/docs.go`、`docs/swagger.json`、`docs/swagger.yaml` 是编译或生成资源

---

## 4. 环境变量与配置

### 已确认的文件

- `.env.example`：受 Git 跟踪的环境变量模板
- `.env.lite.example`：受 Git 跟踪的 Lite 环境变量模板
- `.env.local`：开发脚本支持的可选覆盖文件
- `config/config.yaml`：主服务配置
- `config/builtin_agents.yaml`：内置 Agent
- `config/agent_type_presets.yaml`：Agent 类型预设
- `config/prompt_templates/`：提示词模板

### 安全要求

- `.env`、`.env.local` 以及任何本地环境变量文件都可能包含密钥。
- 不得把 `.env` 内容复制到日志、Issue、测试 fixture、提交消息或最终回复。
- 不得提交真实 API Key、Cookie、Token、数据库密码或云凭据。
- 如果测试需要真实凭据，使用仓库文档规定的环境变量，并确保只存在于本地或 CI Secret 中。

### Lite 模式注意事项

`make run-lite` 要求根目录存在 `.env.lite`。

当前仓库只确认存在 `.env.lite.example`，不能假设 `.env.lite` 已经被创建。

TODO：

- 确认推荐的 `.env.lite` 初始化命令。
- 确认该初始化文档应放在 README、开发指南还是脚本帮助中。

### 运行数据

本地开发脚本会把默认 `/data/files` 调整为仓库内可写的本地目录。

Docker Compose 使用命名卷保存 PostgreSQL、Redis、对象存储和 DocReader 临时文件。

不要在未确认数据用途前删除 Docker volume、SQLite 数据库或本地文件存储目录。

---

## 5. 安装依赖

在仓库根目录：

```bash
make deps
```

该目标执行：

```bash
go mod download
```

前端：

```bash
cd frontend
npm ci
```

说明：

- CI 使用 `npm ci --no-audit --no-fund`。
- 开发脚本在 `node_modules` 不存在时使用 `npm install`。
- `package-lock.json` 已存在，存在 lockfile 时应优先使用与 CI 一致的安装方式。

DocReader：

```bash
cd docreader
uv sync
```

DocReader CI 的锁定安装方式：

```bash
uv sync \
  --project docreader \
  --locked \
  --no-dev \
  --python 3.10.18
```

CLI：

```bash
cd cli
make tidy
```

Docker 镜像依赖：

```bash
docker compose pull
```

---

## 6. 本地启动

### Docker 全栈启动

首次运行：

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

访问：

- Web UI：`http://localhost`
- 后端 API：`http://localhost:8080`

### 推荐开发模式

在三个终端中运行：

```bash
# 终端 1：启动基础设施
make dev-start
```

```bash
# 终端 2：启动 Go 后端
make dev-app
```

```bash
# 终端 3：启动前端
make dev-frontend
```

说明：

- `make dev-app` 检测到 `air` 时使用热重载。
- 未检测到 `air` 时执行 `go run ... ./cmd/server`。
- `make dev-frontend` 最终执行 `npm run dev`。
- 前端开发服务器默认端口为 `5173`。

### DocReader 单独启动

```bash
cd docreader
uv sync
uv run -m docreader.main
```

### Lite 模式

```bash
make build-lite
make run-lite
```

执行 `make run-lite` 前必须准备 `.env.lite`。当前仓库没有确认该文件已经生成。

---

## 7. 测试命令

### 根 Go 模块

完整项目包装命令：

```bash
make test
```

该命令会先运行 Docker entrypoint 测试，再运行：

```bash
go test -v ./...
```

只运行 Go 包测试：

```bash
go test -v ./...
```

修改单个包时优先运行定向测试：

```bash
go test ./path/to/changed/package -count=1
```

### 前端单元测试

```bash
cd frontend
npm test
```

### 前端类型检查

```bash
cd frontend
npm run type-check
```

### DocReader

```bash
cd docreader
uv run python -m unittest discover -s tests -v
```

### CLI

```bash
cd cli
make test
```

覆盖率命令：

```bash
cd cli
make test-coverage
```

### 测试注意事项

- 部分 Go 测试需要真实 PostgreSQL、Redis、Docker 或模型服务。
- 缺少对应环境变量时，部分集成测试会跳过，不应据此声称真实依赖已经验证。
- 修改认证、RBAC、迁移、Worker、SSE 或真实数据库查询时，应提供定向测试。
- 未实际执行测试时，不得声称测试通过。

TODO：

- 确认 `client/` SDK 的标准本地测试命令，并确认是否有独立 CI 测试工作流。
- 修复或移除当前无法执行的 `npm run test:e2e` 文档说明。

---

## 8. 格式化、Lint 和类型检查

### Go

```bash
make fmt
make lint
```

说明：

- `make fmt` 执行 `go fmt ./...`
- `make lint` 执行 `golangci-lint run`
- `golangci-lint` 需要单独安装
- CI 还会执行 `go vet`

只格式化本次修改的 Go 文件时，可使用：

```bash
gofmt -w path/to/changed/file.go
```

### 前端

```bash
cd frontend
npm run type-check
```

当前没有发现独立的前端 ESLint 或 Prettier npm script。

### CLI

```bash
cd cli
make lint
```

该目标执行 `go vet ./...`。

### DocReader

当前没有发现独立的 Python lint 或格式化命令。

CI 当前执行的检查是：

```bash
uv run python -m compileall -q docreader
```

语法编译检查不能替代 lint、类型检查或单元测试。

TODO：

- 如果项目准备引入 Python lint/formatter，应明确工具、配置和命令。
- 如果项目准备引入前端 lint/formatter，应增加 package script 并同步 CI。

---

## 9. 构建命令

| 目标 | 命令 |
|---|---|
| 普通后端二进制 | `make build` |
| 生产后端二进制 | `make build-prod` |
| Lite 单二进制 | `make build-lite` |
| 前端静态资源 | `cd frontend && npm run build` |
| CLI | `cd cli && make build` |
| 全部 Docker 镜像 | `make docker-build-all` |
| App 镜像 | `make docker-build-app` |
| DocReader 镜像 | `make docker-build-docreader` |
| 前端镜像 | `make docker-build-frontend` |

前端 CI 的检查顺序是：

```bash
npm test
npm run type-check
npm run build
```

生产 Go 构建需要 CGO。

---

## 10. CI

仓库存在完整 CI 配置，位于 `.github/workflows/`。

主要工作流：

- `app.yml`
  - 根 Go 模块格式检查
  - `go vet`
  - `go test`
  - `go build ./cmd/server`
- `frontend.yml`
  - `npm test`
  - `npm run type-check`
  - `npm run build`
  - 前端 Docker 镜像验证
- `docreader.yml`
  - `uv sync`
  - `compileall`
  - Python unittest
  - Go DocReader 客户端测试
- `cli.yml`
  - 三平台构建
  - `go test -race`
  - `go vet`
- `cli-e2e.yml`
  - 对真实 WeKnora 服务器执行可选 E2E
- `go-lint.yml`
  - 对根模块、CLI、Go SDK 执行增量 lint
- 其他工作流包括 anydoc、MCP Server、Docker、Helm、Lite 发布和 DSH 插件。

修改 CI 路径过滤或命令时，应检查根模块、嵌套 Go module 和前端/DocReader 是否仍被正确覆盖。

---

## 11. 禁止事项

### 禁止泄露或提交密钥

- 不得读取或输出 `.env` 中的真实密钥。
- 不得提交本地 `.env`、Token、私钥、证书、Cookie 或数据库密码。
- 不得把生产凭据写入测试代码或示例代码。

### 禁止手改生成文件

不得手工修改：

- `docs/docs.go`
- `docs/swagger.json`
- `docs/swagger.yaml`

Swagger 应通过以下命令更新：

```bash
make docs
```

### 禁止只修改一种数据库迁移

数据库迁移存在两条路径：

- `migrations/versioned/`
- `migrations/sqlite/`

修改 schema 时必须确认 PostgreSQL 和 SQLite 的行为，并同步 GORM 模型和相应迁移测试。

生产 schema 由 SQL 迁移驱动，不应依赖 GORM `AutoMigrate` 建表。

### 禁止绕过路由授权

- 不得直接挂载绕过 API Key 策略矩阵的业务路由。
- 新增 `/api/v1` 接口时，必须明确角色守卫、知识库访问守卫和 API Key capability。
- API Key 未显式声明的路由默认拒绝。
- 不要随意改动认证、RBAC 和 API Key 中间件的执行顺序。

### 禁止错误理解异步语义

文档上传接口成功不等于解析和索引完成。

新增或修改文档上传逻辑时，必须保留：

- 初始状态
- 任务入队
- Worker 处理
- 重试与失败状态
- 最终可检索状态

### 禁止把旧入口当作主入口

- 当前 Go 主服务入口是 `cmd/server/main.go`
- 当前内置 MCP Server 位于 `internal/mcpserver/`
- Python 目录 `mcp-server/` 已被文档标记为弃用
- 旧的 `docs/` 手写文档不再作为当前产品文档源

### 禁止未经确认的破坏性 Git 操作

不得使用：

```bash
git reset --hard
git checkout -- .
git clean -fd
```

除非用户明确要求，并已确认目标范围。

---

## 12. 提交前检查

开始前：

```bash
git branch --show-current
git status --short
```

检查空白错误和意外文件：

```bash
git diff --check
```

查看实际改动：

```bash
git diff
git diff --cached
```

### 修改 Go 根模块

```bash
gofmt -w path/to/changed/file.go
go test ./path/to/changed/package -count=1
go vet ./path/to/changed/package
```

### 修改前端

```bash
cd frontend
npm test
npm run type-check
npm run build
```

如只修改局部逻辑，可先运行相关测试，但涉及 TypeScript 或 Vue 类型时仍需运行 `npm run type-check`。

### 修改 DocReader

```bash
cd docreader
uv sync
uv run python -m unittest discover -s tests -v
```

### 修改 CLI

```bash
cd cli
make test
make lint
```

### 全仓维护者检查

```bash
make fmt
make lint
make test
```

注意：

- `make fmt` 会格式化 Go 代码，可能产生大量 diff。
- 建议只在工作区干净时运行全仓格式化，并在提交前检查 diff。
- 部分完整测试依赖基础设施或模型服务。

---

## 13. 提交信息

仓库 README 要求使用 Conventional Commits，例如：

```text
feat: ...
fix: ...
docs: ...
test: ...
refactor: ...
```

提交前确认：

- 提交只包含当前任务相关文件
- 没有临时调试文件
- 没有密钥或本地数据
- 测试结果与实际执行范围一致
- 没有把“未执行”“被跳过”写成“已通过”

---

## 14. 待确认事项

以下信息目前未从仓库中确认，不得自行假设：

- TODO：根目录引入 `AGENTS.md` 后，各子模块是否也需要独立 `AGENTS.md`。
- TODO：`.env.lite` 的标准初始化命令和推荐文档位置。
- TODO：前端 E2E 的正确脚本名、Playwright 依赖和 CI 接入方式。
- TODO：Python 代码的正式 lint、format 和 type-check 工具。
- TODO：前端正式 lint/format 工具及其命令。
- TODO：`client/` Go SDK 的标准本地测试命令和 CI 覆盖方式。
- TODO：桌面端本地开发启动命令和桌面安装包完整发布命令。
