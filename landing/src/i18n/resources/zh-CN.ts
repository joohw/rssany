const zhCN = {
  header: {
    home: "首页",
    features: "特性",
    pipeline: "管线",
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
    title: "把任何信息变成 RSS 订阅",
    subtitle:
      "自托管订阅管线：网页列表、RSS/Atom、邮件等信源定时抓取，插件解析后统一入库，再输出 RSS XML、JSON API，并可选 MCP。",
    quickStart: "快速开始",
    quickStartHint: "首次运行会在 ~/.rssany/ 生成 sources.json 与 config.json",
    useCaseAlt: "RssAny Web 界面：管理信源、浏览条目与 RSS 输出",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    pipelineTitle: "固定 pipeline，按需加工每条",
    pipelineSubtitle: "入库后对每条条目依次执行打标签、翻译等步骤，由 config.json 开关控制。",
    featuresTitle: "为什么用 RssAny",
    featuresSubtitle: "一套自托管方案，覆盖抓取、解析、去重、加工与对外输出。",
    features: {
      sources: {
        title: "统一订阅",
        description: "在 sources.json 配置网站列表、标准 RSS、IMAP 邮件等，调度器按 refresh 策略拉取。",
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
        title: "多种消费方式",
        description: "按需生成 RSS/Atom/JSON Feed，提供 /api/* JSON API，并可选 MCP 工具供 Agent 查询。",
      },
      selfhost: {
        title: "自托管开源",
        description: "Node.js + SQLite，数据在 ~/.rssany/，MIT 许可。npm 全局安装或 Docker 部署均可。",
      },
    },
    installNpm: "npm 安装",
    viewDocs: "阅读文档",
    ctaTitle: "马上开始订阅",
    ctaSubtitle: "一行命令安装，本地运行，数据完全在你手里。",
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
    footerTagline: "自托管订阅管线 · 把任何信息变成 RSS",
    footerCopyright: "© 2026 rssany",
  },
} as const;

export default zhCN;
