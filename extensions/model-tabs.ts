/**
 * model-tabs: 带 provider 标签页分组的模型选择器
 *
 * 用法：在 pi 会话中输入 /models，或按 Ctrl+L
 *       （需配合 ~/.pi/agent/keybindings.json 解绑内置 app.model.select）
 * 交互：Tab / Shift+Tab 切换 provider 标签页，打字搜索，↑↓ 导航，
 *       Enter 切换模型，Ctrl+S 切换并保存为全局默认，Esc 取消。
 */
import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import {
  Container,
  Input,
  Key,
  Spacer,
  Text,
  TruncatedText,
  fuzzyFilter,
  matchesKey,
  type Focusable,
  type TUI,
} from "@earendil-works/pi-tui";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** 列表最多可见行数 */
const MAX_VISIBLE = 10;

interface SelectionResult {
  model: Model<any>;
  saveDefault: boolean;
}

interface SelectorOptions {
  models: Model<any>[];
  providers: string[];
  providerNames: Map<string, string>;
  current: { provider: string; id: string } | undefined;
  theme: Theme;
  keybindings: KeybindingsManager;
  tui: TUI;
  onSelect: (result: SelectionResult) => void;
  onCancel: () => void;
}

/**
 * 模型选择器组件：顶部 provider 标签页 + 搜索框 + 模型列表。
 * 容器内含 Input，需实现 Focusable 并把焦点传给 Input（IME 光标定位）。
 */
class ModelTabsSelector extends Container implements Focusable {
  private searchInput: Input;
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  private tabsBar: TruncatedText;
  private listContainer: Container;
  private detailContainer: Container;

  /** 标签页：索引 0 是 "All"，其余对应 providers[i-1] */
  private providers: string[];
  private providerNames: Map<string, string>;
  private tabIndex = 0;

  private allModels: Model<any>[];
  private filteredModels: Model<any>[] = [];
  private selectedIndex = 0;
  private current: { provider: string; id: string } | undefined;

  private theme: Theme;
  private keybindings: KeybindingsManager;
  private tui: TUI;
  private onSelectCallback: (result: SelectionResult) => void;
  private onCancelCallback: () => void;

  constructor(options: SelectorOptions) {
    super();
    this.theme = options.theme;
    this.keybindings = options.keybindings;
    this.tui = options.tui;
    this.onSelectCallback = options.onSelect;
    this.onCancelCallback = options.onCancel;
    this.current = options.current;
    this.providers = options.providers;
    this.providerNames = options.providerNames;

    // 排序：当前模型排最前，其余按 provider、id 排序
    const current = this.current;
    this.allModels = [...options.models].sort((a, b) => {
      const aCurrent = current && a.provider === current.provider && a.id === current.id ? 0 : 1;
      const bCurrent = current && b.provider === current.provider && b.id === current.id ? 0 : 1;
      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
      const byProvider = a.provider.localeCompare(b.provider);
      return byProvider !== 0 ? byProvider : a.id.localeCompare(b.id);
    });

    const { theme } = this;

    // 顶部边框
    this.addChild(new DynamicBorder());
    this.addChild(new Spacer(1));

    // 标题与按键提示
    this.addChild(
      new TruncatedText(
        theme.fg("accent", theme.bold("Select a model")) + theme.fg("muted", "  (type to search)"),
        0,
        0,
      ),
    );
    this.addChild(
      new TruncatedText(
        theme.fg(
          "dim",
          "Tab next provider · Shift+Tab previous · ↑↓ navigate · Enter select · Ctrl+S save default · Esc cancel",
        ),
        0,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    // provider 标签页栏
    this.tabsBar = new TruncatedText("", 0, 0);
    this.addChild(this.tabsBar);
    this.addChild(new Spacer(1));

    // 搜索输入框
    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      // 输入框内回车直接选中当前高亮项
      const selected = this.filteredModels[this.selectedIndex];
      if (selected) this.onSelectCallback({ model: selected, saveDefault: false });
    };
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));

    // 模型列表
    this.listContainer = new Container();
    this.addChild(this.listContainer);

    // 选中项详情（底部 dim 显示的 Model Name）
    this.detailContainer = new Container();
    this.addChild(this.detailContainer);
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder());

    this.applyTab(0, "");
  }

  /** 当前标签页范围内的模型 */
  private activeModels(): Model<any>[] {
    if (this.tabIndex === 0) return this.allModels;
    const provider = this.providers[this.tabIndex - 1];
    return this.allModels.filter((m) => m.provider === provider);
  }

  /** 生成标签页栏文本 */
  private renderTabsBar(): string {
    const { theme } = this;
    const labels = ["All", ...this.providers.map((p) => this.providerNames.get(p) ?? p)];
    return labels
      .map((label, i) => {
        const text = i === this.tabIndex ? `[ ${label} ]` : `  ${label}  `;
        return i === this.tabIndex ? theme.fg("accent", theme.bold(text)) : theme.fg("muted", text);
      })
      .join(theme.fg("dim", "·"));
  }

  /** 切换标签页：保留搜索词，光标定位到当前模型（若在范围内） */
  private applyTab(nextIndex: number, query: string): void {
    const count = 1 + this.providers.length;
    this.tabIndex = ((nextIndex % count) + count) % count;
    // TruncatedText 没有 setText，直接替换子组件
    const index = this.children.indexOf(this.tabsBar);
    if (index >= 0) {
      this.tabsBar = new TruncatedText(this.renderTabsBar(), 0, 0);
      this.children[index] = this.tabsBar;
    }
    const active = this.activeModels();
    const currentIndex = this.current
      ? active.findIndex((m) => m.provider === this.current!.provider && m.id === this.current!.id)
      : -1;
    this.selectedIndex = currentIndex >= 0 ? currentIndex : 0;
    this.filterModels(query);
  }

  /** 模糊过滤 + 渲染列表（仿内置选择器：provider 前缀优先） */
  private filterModels(query: string): void {
    const active = this.activeModels();
    if (query) {
      this.filteredModels = fuzzyFilter(active, query, (m) => {
        const name = m.name ? ` ${m.name}` : "";
        return `${m.provider} ${m.provider}/${m.id} ${m.provider} ${m.id}${name}`;
      });
    } else {
      this.filteredModels = active;
    }
    // 有过滤词时选中第一项（最佳匹配），否则保持在合理范围内
    this.selectedIndex = query
      ? 0
      : Math.min(this.selectedIndex, Math.max(0, this.filteredModels.length - 1));
    this.updateList();
  }

  private updateList(): void {
    const { theme } = this;
    this.listContainer.clear();
    this.detailContainer.clear();

    const total = this.filteredModels.length;
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE));
    const endIndex = Math.min(startIndex + MAX_VISIBLE, total);

    // 计算可见窗口内模型名列宽，对齐 provider 显示名列
    let maxNameWidth = 0;
    for (let i = startIndex; i < endIndex; i++) {
      const m = this.filteredModels[i];
      const label = m.name || m.id;
      if (label.length > maxNameWidth) maxNameWidth = label.length;
    }

    for (let i = startIndex; i < endIndex; i++) {
      const m = this.filteredModels[i];
      const isSelected = i === this.selectedIndex;
      const isCurrent = this.current !== undefined && m.provider === this.current.provider && m.id === this.current.id;
      const label = m.name || m.id;
      const providerName = this.providerNames.get(m.provider) ?? m.provider;

      const cursor = isSelected ? theme.fg("accent", "→ ") : "  ";
      const labelText = isSelected ? theme.fg("accent", label) : label;
      const padding = " ".repeat(Math.max(1, maxNameWidth - label.length + 2));
      const currentMarker = isCurrent ? theme.fg("accent", " ←current") : "";
      const line = `${cursor}${labelText}${padding}${theme.fg("muted", providerName)}${currentMarker}`;
      this.listContainer.addChild(new TruncatedText(line, 0, 0));
    }

    // 滚动信息
    if (startIndex > 0 || endIndex < total) {
      this.listContainer.addChild(new Text(theme.fg("muted", `  (${this.selectedIndex + 1}/${total})`), 0, 0));
    }

    if (total === 0) {
      this.listContainer.addChild(new Text(theme.fg("muted", "  No matching models"), 0, 0));
      return;
    }

    // 底部显示选中模型的完整名称
    const selected = this.filteredModels[this.selectedIndex];
    if (selected?.name) {
      this.detailContainer.addChild(new Spacer(1));
      this.detailContainer.addChild(
        new TruncatedText(theme.fg("muted", `  Model Name: ${selected.name}`), 0, 0),
      );
    }
  }

  handleInput(data: string): void {
    const kb = this.keybindings;
    const query = this.searchInput.getValue();

    // Tab：下一个 provider 标签页
    if (kb.matches(data, "tui.input.tab")) {
      this.applyTab(this.tabIndex + 1, query);
      this.tui.requestRender();
      return;
    }
    // Shift+Tab：上一个标签页
    if (matchesKey(data, Key.shift("tab"))) {
      this.applyTab(this.tabIndex - 1, query);
      this.tui.requestRender();
      return;
    }
    // ↑↓ 导航（到顶/到底循环）
    if (kb.matches(data, "tui.select.up")) {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === 0 ? this.filteredModels.length - 1 : this.selectedIndex - 1;
      this.updateList();
      this.tui.requestRender();
      return;
    }
    if (kb.matches(data, "tui.select.down")) {
      if (this.filteredModels.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === this.filteredModels.length - 1 ? 0 : this.selectedIndex + 1;
      this.updateList();
      this.tui.requestRender();
      return;
    }
    // Enter：切换模型（session 级）
    if (kb.matches(data, "tui.select.confirm")) {
      const selected = this.filteredModels[this.selectedIndex];
      if (selected) this.onSelectCallback({ model: selected, saveDefault: false });
      return;
    }
    // Ctrl+S：切换并保存为全局默认
    if (kb.matches(data, "app.models.save")) {
      const selected = this.filteredModels[this.selectedIndex];
      if (selected) this.onSelectCallback({ model: selected, saveDefault: true });
      return;
    }
    // Ctrl+C：搜索非空时先清空，为空时取消
    if (matchesKey(data, Key.ctrl("c"))) {
      if (query) {
        this.searchInput.setValue("");
        this.filterModels("");
        this.tui.requestRender();
      } else {
        this.onCancelCallback();
      }
      return;
    }
    // Esc / 其他取消键
    if (kb.matches(data, "tui.select.cancel")) {
      this.onCancelCallback();
      return;
    }
    // 其余按键交给搜索框
    this.searchInput.handleInput(data);
    this.filterModels(this.searchInput.getValue());
    this.tui.requestRender();
  }
}

/** 读改写 ~/.pi/agent/settings.json 的 defaultProvider/defaultModel，保留其他键 */
async function saveDefaultModel(provider: string, modelId: string): Promise<void> {
  const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>;
    }
  } catch {
    // 文件不存在或解析失败：从空对象开始
  }
  settings.defaultProvider = provider;
  settings.defaultModel = modelId;
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

/** 打开模型选择器对话框（/models 命令与 Ctrl+L 快捷键共用） */
async function openModelTabs(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const registry = ctx.modelRegistry;
  const models = registry.getAvailable();
  if (models.length === 0) {
    ctx.ui.notify("No available models. Use /login to add providers.", "warning");
    return;
  }

  // 按 provider 分组，生成标签页
  const providers = [...new Set(models.map((m) => m.provider))].sort((a, b) => a.localeCompare(b));
  const providerNames = new Map<string, string>(
    providers.map((p) => [p, registry.getProviderDisplayName(p) ?? p]),
  );
  const current = ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined;

  const result = await ctx.ui.custom<SelectionResult | null>((tui, theme, keybindings, done) => {
    return new ModelTabsSelector({
      models,
      providers,
      providerNames,
      current,
      theme,
      keybindings,
      tui,
      onSelect: (selection) => done(selection),
      onCancel: () => done(null),
    });
  });

  if (!result) return;

  // 切换模型（session 级）；无凭据时返回 false
  const success = await pi.setModel(result.model);
  if (!success) {
    ctx.ui.notify(`No API key configured for provider "${result.model.provider}"`, "error");
    return;
  }
  ctx.ui.notify(`Model: ${result.model.id}`, "info");

  if (result.saveDefault) {
    try {
      await saveDefaultModel(result.model.provider, result.model.id);
      ctx.ui.notify(`Saved as default: ${result.model.provider}/${result.model.id}`, "success");
    } catch (error) {
      ctx.ui.notify(
        `Failed to save default model: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("models", {
    description: "Select a model with provider tabs",
    handler: async (_args, ctx) => {
      await openModelTabs(pi, ctx);
    },
  });

  // 注册 Ctrl+L：需在 ~/.pi/agent/keybindings.json 中将内置 app.model.select 解绑，
  // 否则扩展快捷键会因与内置键位冲突被跳过。
  // 注意：不可用 Ctrl+M —— 终端中 Ctrl+M 与 Enter 同为 CR（\r），会劫持回车发送消息
  pi.registerShortcut("ctrl+l", {
    description: "Select a model with provider tabs",
    handler: async (ctx) => {
      await openModelTabs(pi, ctx);
    },
  });
}
