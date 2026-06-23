<script lang="ts">
  import { PRODUCT_NAME } from '$lib/brand';
  import { onMount } from 'svelte';

  let baseUrl = 'http://127.0.0.1:18473';

  const skillText = () => String.raw`# RssAny Agent 能力增强说明

用途：当 Agent 需要获得持续信息输入、追踪订阅更新、补充任务上下文、整理外部链接或建立监控型工作流时，使用本说明。RssAny 负责把网页列表、RSS/Atom、邮件等信源转成统一条目库，并输出 JSON / RSS。Agent 的重点不是维护 RssAny，而是把这些条目转化为更可靠的观察、判断和行动。

能力目标
1. 持续感知：从订阅源读取最新条目，减少只依赖一次性搜索或过期记忆。
2. 上下文补给：在回答、写作、研究、复盘前，先读取相关 feed 作为近期背景。
3. 主题监控：围绕关键词、来源、标签或固定信源，持续观察是否出现新变化。
4. 证据保留：输出结论时保留标题、链接、来源、发布时间，方便用户追溯。
5. 协作交接：把 feed 条目整理成摘要、候选链接、待办、判断依据或下游 Agent 的上下文。
6. 信源扩展：当目标网站没有可用 feed 时，写信源插件，把网页列表转成 Agent 可消费的条目。

用 npm 包安装 RssAny
1. 需要 Node.js 20 到 23。
2. 全局安装：
   npm install -g rssany
3. 启动服务：
   rssany start
4. 默认访问地址：
   http://127.0.0.1:18473/
5. 停止服务：
   rssany stop
6. 更新到最新 npm 包：
   rssany update
7. 指定端口：
   PORT=18473 rssany start
8. 指定用户数据目录：
   RSSANY_USER_DIR=/path/to/rssany-data rssany start
9. 如果全局安装遇到 EACCES，优先把 npm 全局 prefix 改到用户目录，而不是直接使用 sudo：
   npm config set prefix "$HOME/.local"
   export PATH="$HOME/.local/bin:$PATH"
   npm install -g rssany

RssAny 如何使用
1. 打开 Web UI：${baseUrl}/
2. 添加订阅源：在首页添加 RSS、网页列表、插件支持的站点 URL 或邮箱类信源。
3. 查看条目：Web UI 会展示抓取入库后的统一条目。
4. 强制拉取某个信源：
   rssany crawl <sourceRef>
5. 读取 JSON feed：
   ${baseUrl}/api/feed?limit=50
6. 读取 RSS：
   ${baseUrl}/rss?limit=50
7. 管理插件：${baseUrl}/plugins
8. 后台设置：${baseUrl}/admin
9. 重置本地数据：
   rssany reset
   这个命令会重置本地数据，只有用户明确要求清空时才使用。
10. RssAny 的核心用途是把分散来源变成统一条目库；Agent 应把它当作信息入口、监控入口和可追溯上下文入口。

可用信息源
- 最新 JSON 条目：${baseUrl}/api/feed?limit=50
- 指定信源条目：${baseUrl}/api/feed?ref=<sourceRef>&limit=50
- RSS XML 输出：${baseUrl}/rss?limit=50
- 指定信源 RSS：${baseUrl}/rss?ref=<sourceRef>&limit=50
- 关键词筛选：${baseUrl}/rss?q=<关键词>&limit=50
- 标签筛选：${baseUrl}/rss?tags=<tag1>,<tag2>&limit=50

读取原则
1. 优先读取 JSON feed，因为它更适合 Agent 解析、过滤和重组。
2. 只需要标准订阅格式时读取 RSS XML。
3. 处理具体任务时，先取 20 到 50 条，避免一次塞入过多低价值上下文。
4. 需要聚焦某个来源时使用 ref；需要聚焦主题时使用 q 或 tags。
5. 条目链接是事实入口，摘要只是线索；关键判断应回到原文链接核对。
6. RSS XML 通常按请求生成，不要假设本机有静态 RSS 文件。

标准使用流程
1. 明确任务主题：先把用户问题转成关键词、来源范围或标签范围。
2. 读取近期条目：从 JSON feed 拉取最新内容，保留 title、link、summary、pubDate、sourceRef。
3. 过滤噪声：去掉重复、过旧、无关或只有标题党价值的条目。
4. 建立上下文：按主题、时间、来源或可信度分组。
5. 选择深读对象：只打开最相关的原文链接，避免把所有链接都当成等权证据。
6. 形成输出：给用户答案、摘要、行动建议、风险提醒或下一步观察清单。

增强研究能力
1. 在开始研究前读取相关 feed，确认近期是否已有重要更新。
2. 对每个结论至少保留一个可追溯链接。
3. 区分事实、推断和建议；feed 条目只能证明“某来源发布了什么”，不能自动证明内容完全正确。
4. 对时间敏感主题，优先按发布时间排序，并指出信息的新旧程度。
5. 如果多个来源给出相互冲突的信息，列出冲突点，而不是强行合并。

增强监控能力
1. 为用户关心的主题建立关键词或标签清单。
2. 定期读取对应 feed，比较这次与上次的新增条目。
3. 对新增条目做三层筛选：是否新、是否相关、是否需要行动。
4. 输出监控结果时优先给“发生了什么”“为什么重要”“建议做什么”。
5. 没有重要更新时直接说明，不要为了凑内容扩大解释。

增强写作与汇报能力
1. 先把条目按主题聚类，再写摘要，避免流水账。
2. 每组最多保留 3 到 5 个代表链接。
3. 摘要中写清楚来源和时间，不把 feed 内容伪装成 Agent 自己的常识。
4. 适合输出的形态包括：今日简报、竞品动态、技术趋势、风险清单、候选选题、行动项。
5. 如果用户要可交接内容，把结论、证据链接、未确认点分开写。

增强协作能力
1. 给另一个 Agent 交接时，提供任务目标、筛选条件、关键条目、已排除噪声和待核验链接。
2. 不要把整段 feed 原样塞给下游；先压缩成结构化上下文。
3. 保留 sourceRef，方便下游 Agent 继续追踪同一来源。
4. 对需要持续跟进的事项，给出下一次应检查的关键词、来源或标签。

新增信息覆盖
1. 如果用户觉得 Agent 缺少某类信息，先判断缺的是来源、关键词、标签还是更新频率。
2. 可以建议用户在 RssAny 中增加对应订阅源，或调整现有订阅的标签和名称。
3. 新来源加入后，Agent 应读取 feed 验证是否真的出现了可用条目。
4. 判断新增来源价值时看四点：更新频率、内容相关性、链接稳定性、摘要质量。
5. 不要把无关来源加入长期上下文；信息越多不等于能力越强。

扩展信源能力：写插件
1. 当目标信息只存在于网页列表、站点索引或非标准页面里，写插件就是增强 Agent 感知范围的一部分。
2. 插件的目标不是“写完整爬虫”，而是稳定产出可去重、可追溯、可订阅的条目。
3. 优先覆盖高价值来源：用户反复关注、更新稳定、条目链接清晰、内容能支撑决策的站点。
4. 插件应使用 ESM 命名导出，核心字段是 id、listUrlPattern、fetchItems。
5. fetchItems 返回数组；每条至少提供 guid、title、link 或 url、pubDate、summary 或 content。
6. guid 要稳定，优先使用详情页 URL；不要用每次都会变化的随机值。
7. 优先使用 RssAny 提供的上下文能力获取和解析页面，例如 ctx.fetchHtml、ctx.deps.parseHtml、ctx.extractItem。
8. 不要修改内置插件；新增或覆盖能力应放在用户插件目录，由同 id 覆盖实现替换。

最小插件形态
export const id = "example-site";
export const name = "Example Site";
export const listUrlPattern = "https://example.com/news";
export const refreshInterval = "1day";

export async function fetchItems(sourceId, ctx) {
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
    waitMs: 2000,
    purify: true,
  });
  const root = ctx.deps.parseHtml(html);
  const links = root.querySelectorAll("a.article");
  return links.map((a) => {
    const href = a.getAttribute("href") || "";
    const url = new URL(href, finalUrl).href;
    return {
      guid: url,
      title: a.text.trim(),
      link: url,
      url,
      pubDate: new Date(),
      summary: "",
    };
  });
}

插件能力验收
1. 能否匹配目标 sourceRef。
2. 能否返回非空条目数组。
3. 每条是否有稳定 guid 和可打开链接。
4. 再次读取同一来源时是否能去重，而不是重复制造新条目。
5. 在 JSON feed 或 RSS 输出里能否看到该来源的新条目。
6. 如果条目质量不足，优先修正选择器、标题、链接、发布时间和摘要，而不是扩大抓取范围。

质量检查
1. 是否读取了最新 feed，而不是只靠记忆回答。
2. 是否保留了关键条目的链接和发布时间。
3. 是否把相关条目和无关条目分开处理。
4. 是否说明了哪些内容已经核对、哪些只是待确认线索。
5. 是否把输出转成用户可行动的形式，而不是只复述标题。

边界
1. RssAny 是订阅与条目管线，不是替代 Agent 思考的研究产品。
2. feed 负责提供输入，Agent 负责判断、筛选、整合和表达。
3. 不要把没有来源链接的内容当成确定事实。
4. 不要为了“看起来更完整”引入与任务无关的条目。
5. 不要删除、重置或破坏 RssAny 的用户数据；能力增强应体现在更好的读取、过滤、追踪和交接上。`;

  $: currentSkillText = skillText();

  onMount(() => {
    if (window.location.origin) baseUrl = window.location.origin;
  });

</script>

<svelte:head>
  <title>Skill - {PRODUCT_NAME}</title>
</svelte:head>

<div class="feed-wrap">
  <div class="feed-col">
    <div class="skill-toolbar-block">
      <div class="admin-feed-header skill-header">
        <div class="admin-feed-header__left">
          <h2>Skill</h2>
          <p class="admin-feed-header__desc">给 Agent 使用的 RssAny 能力增强说明</p>
        </div>
      </div>
    </div>

    <div class="skill-body-scroll">
      <div class="body">
        <section class="skill-section">
          <pre class="skill-text">{currentSkillText}</pre>
        </section>
      </div>
    </div>
  </div>
</div>

<style>
  .feed-wrap {
    margin-top: calc(-1 * var(--main-padding-top));
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .feed-col {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }
  .skill-toolbar-block {
    flex-shrink: 0;
    padding-top: var(--main-padding-top);
    padding-bottom: 0;
  }
  .skill-header {
    min-height: 4.1rem;
  }
  .skill-body-scroll {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
  .body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 100%;
    padding: 0.95rem 0 1.425rem;
    box-sizing: border-box;
  }
  .skill-section {
    min-width: 0;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .skill-text {
    flex: 1 1 0;
    height: 0;
    margin: 0;
    padding: 1rem;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--color-input);
    border-radius: var(--radius-md);
    background: var(--color-muted);
    color: var(--color-foreground);
    font-size: 0.75rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
