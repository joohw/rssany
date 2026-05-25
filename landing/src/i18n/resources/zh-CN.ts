const zhCN = {
  header: {
    home: "首页",
    features: "特性",
    pipeline: "管线",
    blog: "博客",
    docs: "文档",
    backHome: "返回首页",
    github: "GitHub",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "定制专属信息源",
    subtitle:
      "面向内容生产与资讯管线的自托管订阅系统：接入网页、RSS、邮件等信源，定时抓取与插件解析后统一入库，按需加工并输出 RSS、JSON API 与 MCP，喂给创作与分发流程。",
    quickStart: "快速开始",
    quickStartHint: "首次运行会在 ~/.rssany/ 生成 sources.json 与 config.json",
    useCaseAlt: "RssAny Web 界面：定制信源、浏览资讯条目并输出到内容管线",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    pipelineTitle: "固定 pipeline，按需加工每条",
    pipelineSubtitle: "入库后对每条条目依次执行打标签、翻译等步骤，由 config.json 开关控制。",
    featuresTitle: "为内容生产而生的订阅管线",
    featuresSubtitle: "从信源定制、抓取解析到入库加工与对外输出，一条链路服务资讯采集与内容分发。",
    features: {
      sources: {
        title: "定制信源",
        description: "在 sources.json 按需配置网站列表、标准 RSS、IMAP 邮件等，调度器按 refresh 策略持续拉取资讯。",
      },
      plugins: {
        title: "可插拔信源",
        description: "内置大量 Site 插件，用户可在 ~/.rssany/plugins 覆盖同名内置或扩展新站点。",
      },
      pipeline: {
        title: "固定 pipeline",
        description: "打标签、翻译、质量过滤等在 app/pipeline/ 中实现，由 config.json 的 steps 开关。",
      },
      llm: {
        title: "LLM 辅助",
        description: "解析、正文提取、标签与翻译可按配置走 OpenAI 兼容接口，规则优先、LLM 兜底。",
      },
      output: {
        title: "接入内容管线",
        description: "按需生成 RSS/Atom/JSON Feed，提供 /api/* JSON API 与 MCP，供创作工具、Agent 与下游分发系统消费。",
      },
      selfhost: {
        title: "自托管开源",
        description: "Node.js + SQLite，数据在 ~/.rssany/，MIT 许可。npm 全局安装或 Docker 部署均可。",
      },
    },
    installNpm: "npm 安装",
    viewDocs: "阅读文档",
    ctaTitle: "开始定制你的信息源",
    ctaSubtitle: "一行命令安装，本地运行，把资讯管线握在自己手里。",
    ctaGithub: "GitHub 源码",
    ctaNpm: "npm 包",
    pipelineItems: {
      fetch: {
        title: "抓取 fetchItems",
        description: "调度器触发信源插件，完成列表抓取、正文提取与必要站点登录。",
      },
      upsert: {
        title: "入库 upsertItems",
        description: "按 guid 等去重写入 SQLite，缓存窗口与 refresh 策略可配。",
      },
      process: {
        title: "pipeline 加工",
        description: "每条条目跑固定链：打标签、翻译等，完成后更新内容与缓存。",
      },
      deliver: {
        title: "可选投递",
        description: "config.json 中 deliver.url 非空时，向该 URL POST { sourceRef, items } JSON。",
      },
    },
    footerTagline: "定制专属信息源 · 内容生产与资讯管线",
    footerCopyright: "© 2026 rssany",
  },
  blog: {
    indexTitle: "博客",
    indexSubtitle: "信息源定制、插件解析、pipeline 加工与 RSS / JSON API / MCP 输出实践。",
    empty: "暂无文章。",
    backToBlog: "← 返回博客",
    viewPipeline: "了解管线 →",
  },
} as const;

export default zhCN;
