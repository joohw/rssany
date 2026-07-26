# RssAny WebUI Design Guide

本文档定义 WebUI 的视觉与组件约定。新增页面和重构应优先遵循此文档，并以现有产品界面的一致性为第一目标。

## 设计方向

RssAny 使用紧凑、克制的桌面工具风格：

- 浅色中性背景，白色卡片，低对比度边框。
- 蓝紫色作为唯一主要操作色。
- 信息密度适中，避免营销页式大标题、超大留白和装饰性渐变。
- 状态表达优先使用文字、图标和轻量颜色，不使用强烈阴影。
- 管理页最大内容宽度通常为 `42rem`。

## 技术基线

- 框架：React 19 + Vite。
- 样式：Tailwind CSS 4 + `app.css` 中的 CSS token。
- 通用组件：shadcn/ui，源码位于 `app/webui-react/src/components/ui/`。
- 无障碍基础组件：Radix UI，由 shadcn/ui 组件内部封装。
- 图标：Lucide React，常规尺寸 `14px`、`16px` 或 `18px`。

业务页面不应直接使用 Radix primitive，也不应重复手写 Button、Switch、Card、Label 等基础控件。缺少组件时，先添加到 `app/webui-react/src/components/ui/`，再在业务页面使用。

## 颜色

语义颜色统一来自 `src/app.css`：

| 语义 | Token |
| --- | --- |
| 页面背景 | `--background` / `bg-background` |
| 正文 | `--foreground` / `text-foreground` |
| 卡片 | `--card` / `bg-card` |
| 主操作 | `--primary` / `bg-primary` |
| 次级区域 | `--muted` / `bg-muted` |
| 边框 | `--border` / `border-border` |
| 输入控件 | `--input` / `bg-input` |
| 焦点环 | `--ring` / `ring-ring` |
| 危险操作 | `--destructive` |

不要在业务组件中新增品牌色或直接写十六进制颜色。第三方品牌 Logo 是例外。

## 排版

- 页面正文：`0.875rem`。
- 辅助说明：`0.75rem`，使用 muted foreground。
- 分区标题：`0.8125rem`、`font-weight: 600`。
- 页面标题：`0.9375rem`、`font-weight: 600`。
- 文案行高通常为 `1.45–1.5`。
- 标题使用句式大小写；中文不添加无意义冒号。

## 页面结构

后台二级设置页采用统一结构：

1. `BackToParentRoute`
2. 一段简短的页面说明
3. 一个或多个带分区标题的配置区
4. 状态或帮助信息
5. 页面底部操作按钮

推荐外壳：

```tsx
<Page title="设置" description="页面说明" back="/admin">
  <section className="space-y-4">{/* sections */}</section>
</Page>
```

普通页面通过共享 `Page` 组件统一内容宽度与顶部间距；主从布局使用 `master-detail-layout`。

## 组件规范

### Button

- 使用 `$lib/components/ui/button`。
- 主要保存操作使用默认 variant。
- 次要操作使用 `outline` 或 `secondary`。
- 图标按钮必须有 `aria-label`。
- 异步操作期间禁用按钮，并用文案反馈状态。

### Switch

- 使用 `$lib/components/ui/switch`。
- 标准尺寸为 `44×24px`，滑块为 `20px`。
- 开启使用 primary，关闭使用 input，中间状态不使用额外颜色。
- Switch 必须有关联的 Label 或明确的 `aria-label`。
- 禁用依赖项时同时降低整行透明度，不能只让 Switch 变灰。
- 设置行点击范围应以 Label 为主，避免用整张 Card 触发状态变化。

### Card

- 使用 `$lib/components/ui/card`。
- 设置列表卡片通常不使用大阴影。
- 多个设置项放在同一 Card 时，以 `1px` border 分隔。
- Card 内边距由业务密度决定，默认设置行为 `0.625rem 0.875rem`。

### 表单反馈

- 保存成功或失败使用现有 toast。
- 加载态可使用简短文本；耗时明显时再使用 Spinner/Skeleton。
- 错误信息必须说明失败对象，不只显示“错误”。

## 间距与圆角

- 页面分区间距：`1.25rem`。
- 卡片内部横向间距：`0.75rem`。
- 常规控件间距：`0.5rem`。
- 默认圆角使用 `--radius-sm`，大型浮层使用 `--radius-md` 或 `--radius-lg`。
- 阴影仅用于浮层、Popover、Dialog 和需要层级分离的面板。

## 响应式与可访问性

- `600px` 以下内容宽度为 `100%`。
- 所有可交互控件必须可键盘访问，并提供清晰的 focus ring。
- 不依赖颜色作为唯一状态信号。
- 辅助文字保持可读对比度。
- 动画保持在 `150–200ms`，并仅用于状态转换。

## 提交前检查

- 使用了现有 shadcn 组件，而非重复手写基础控件。
- 没有新增无语义的硬编码颜色。
- 页面在桌面和窄屏下均无横向滚动。
- 键盘可以访问所有交互控件。
- loading、disabled、success、error 状态均明确。
- `npm --prefix app/webui-react run build` 和 `npm --prefix app/webui-react run lint` 通过。
