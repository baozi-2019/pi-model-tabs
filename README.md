# pi-model-tabs

pi 模型选择器扩展：将可用模型按 provider 分组为标签页，配合搜索框快速切换模型。

在 pi 会话中输入 `/models`，或按 `Ctrl+L` 打开选择器。

## 功能特性

- **Provider 标签页分组**：顶部标签栏展示 `All · provider A · provider B …`，Tab / Shift+Tab 循环切换
- **模糊搜索**：实时过滤当前标签页内的模型，匹配 provider、provider/id 前缀及模型显示名
- **当前模型置顶**：初始排序时当前使用的模型排在最前，切页时光标自动定位到当前模型
- **双模式切换**：
  - `Enter` — 仅当前会话切换模型
  - `Ctrl+S` — 切换并写入 `~/.pi/agent/settings.json`，保存为全局默认模型
- **对齐的列表渲染**：模型名按可见窗口内最大宽度对齐，provider 显示名列右对齐，底部显示选中模型的完整名称

## 安装

```bash
# 从 GitHub 安装（推荐）
pi install git:github.com/baozi-2019/pi-model-tabs

# 锁定分支 / 标签 / 提交
pi install git:github.com/baozi-2019/pi-model-tabs@dev

# 从本地路径安装（开发调试）
pi install /home/baozi/study/pi-extensions/pi-model-tabs

# 安装后在 pi 中启用扩展
pi config
```

默认写入用户级配置 `~/.pi/agent/settings.json`；如需仅当前项目启用，加 `-l` 写入 `.pi/settings.json`。

## 快捷键前置配置（必需）

扩展注册了 `Ctrl+L` 快捷键，与 pi 内置的 `app.model.select` 冲突，需要先解绑内置键位，否则扩展快捷键会被跳过。

编辑 `~/.pi/agent/keybindings.json`，将 `app.model.select` 从 `ctrl+l` 改绑或移除，例如：

```json
{
  "app.model.select": "ctrl+o"
}
```

## 使用说明

| 按键 | 作用 |
| ---- | ---- |
| `Tab` / `Shift+Tab` | 下一个 / 上一个 provider 标签页（循环） |
| 输入字符 | 搜索过滤（切换标签页时保留搜索词） |
| `↑` / `↓` | 移动高亮（到顶/到底循环） |
| `Enter` | 切换模型（仅当前会话） |
| `Ctrl+S` | 切换模型并保存为全局默认 |
| `Ctrl+C` | 搜索词非空时清空搜索词；为空时取消 |
| `Esc` | 取消 |

交互流程：

1. 打开选择器后，模型列表按「当前模型优先，其余按 provider、id 排序」排列
2. Tab 切到目标 provider 标签页，或直接输入关键字搜索（搜索范围限定在当前标签页）
3. Enter 切换或 Ctrl+S 切换并保存默认
4. 若所选 provider 未配置 API key，`pi.setModel` 返回失败，会话内会有 error 提示

## 目录结构

```text
pi-model-tabs/
├── package.json              # pi-package 声明：pi.extensions = ["./extensions"]
└── extensions/
    └── model-tabs.ts         # 扩展全部逻辑（约 430 行）
```

## 实现要点

- 入口 `export default function (pi)` 注册 `/models` 命令与 `ctrl+l` 快捷键，均调用 `openModelTabs`
- `openModelTabs` 从 `ctx.modelRegistry` 拉取模型列表，按 provider 分组生成标签页，通过 `ctx.ui.custom` 挂载自定义 TUI 组件
- `ModelTabsSelector` 继承 pi-tui 的 `Container` 并实现 `Focusable`，将焦点转发给内部 `Input`，保证 IME 光标定位正确
- 选择结果经回调传出后调用 `pi.setModel(result.model)` 切换；`saveDefault` 为 true 时由 `saveDefaultModel` 读取并改写 `settings.json` 的 `defaultProvider` / `defaultModel` 字段（文件不存在或解析失败时从空对象重建）
- 列表可见窗口固定 10 行（`MAX_VISIBLE`），高亮项尽量居中，超出范围时显示 `(n/total)` 滚动信息

## 依赖

运行时无第三方依赖；`@earendil-works/pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-tui` 为 pi 内置核心包，以 `peerDependencies: "*"` 声明，不随包分发。

## License

MIT
