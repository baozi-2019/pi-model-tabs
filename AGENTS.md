# pi-model-tabs 工程协作规则

> 本文件为工程级规则，优先于 `~/.pi/agent/AGENTS.md` 全局规则；本文件未覆盖事项遵循全局规则。

## 1. 工程简介

pi 模型选择器扩展：将可用模型按 provider 分组为标签页，配合搜索框快速切换模型。会话中输入 `/models` 或按 `Ctrl+L` 打开。

## 2. 工程事实

| 项 | 值 |
| ---- | ---- |
| 语言 | TypeScript（ESM） |
| 扩展入口 | `extensions/model-tabs.ts` 的 `export default function (pi)` |
| pi 包声明 | `package.json` 的 `pi.extensions = ["./extensions"]` |
| 运行时依赖 | 无第三方依赖；`@earendil-works/pi-*` 为 pi 内置包，以 `peerDependencies: "*"` 声明 |
| git 默认分支 | `dev`（跟踪 `origin/dev`） |
| git 远程 | `git@github.com:baozi-2019/pi-model-tabs.git` |
| 发布/安装 | `pi install git:github.com/baozi-2019/pi-model-tabs[@ref]` |

## 3. 开发约定

- 单文件扩展，全部逻辑在 `extensions/model-tabs.ts`；新增功能优先在文件内扩展，确需拆分再建文件并同步 `pi.extensions`。
- 禁止引入第三方运行时依赖；确需引入时在交付说明中说明理由。
- 修改交互行为时，必须同步更新 README 的「使用说明」按键表与「实现要点」。
- 快捷键一律经 `KeybindingsManager` 解析（`keybindings.matches` / `matchesKey`），不硬编码终端转义序列。
- `Ctrl+L` 依赖用户在 `~/.pi/agent/keybindings.json` 解绑内置 `app.model.select`，改动相关键位时需在 README 保持该前置说明。
- 禁止选用终端控制字符等价键位：`Ctrl+M` = 回车（CR）、`Ctrl+I` = Tab、`Ctrl+H` = Backspace、`Ctrl+J` = 换行，注册后会劫持对应正常按键（v1.1 曾用 `Ctrl+M` 导致回车发送消息被劫持，已回退）。

## 4. 验证方式

- 本工程无构建脚本与测试套件；验证方式为本地安装后加载：
  `pi install /home/baozi/study/pi-extensions/pi-model-tabs`，在 pi 中启用扩展，用 `/models` 与 `Ctrl+L` 走查 README「使用说明」全部按键。
- 改动类型敏感（快捷键、settings.json 读写）时，除走查外还需确认 `~/.pi/agent/settings.json` 的 `defaultProvider` / `defaultModel` 按预期读写。
- 无法走查验证时，在交付说明中明确写出。

## 5. Git 约定

- 功能开发在 `dev` 分支直接提交；提交信息前缀：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`，使用简体中文描述。
- 遵循全局规则第 2 节：未获明确授权不执行 `git push`，不改写历史。

### 版本与 tag

- tag 格式：`v<major>.<minor>`（如 `v1.0`、`v1.1`），打在 `dev` 分支当前提交上，使用 annotated tag（中文说明）。
- 用户说「打 tag」而未指定版本时，自动读取最新 tag 递增 **0.1**（如 `v1.0` → `v1.1`）；用户直接指定版本（如「打个 tag 2.0」）时按指定值打。
- 递增前确认现有 tag 均符合 `v<major>.<minor>` 格式；无法解析最新 tag 时向用户确认，不臆测。
- 打 tag 后在交付说明中报告新旧版本号；未获明确授权仅打本地 tag，不推送。

## 6. Obsidian 文档同步

- `obsidian-project: pi-model-tabs`（对应 vault 内 `Projects/pi-model-tabs/`）。
- 自动笔记保持全局默认开启；文档结构、增量更新、vault 提交推送规则遵循全局规则第 3 节。

## 7. 安全红线

遵循全局规则第 2 节；补充：禁止在扩展代码或文档中硬编码任何 provider 的 API key、baseURL 凭据。
