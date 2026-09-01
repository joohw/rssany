const zhCN = {
  header: {
    home: "首页",
    features: "特性",
    pipeline: "管线",
    blog: "博客",
    skill: "Skill",
    docs: "文档",
    backHome: "返回首页",
    github: "GitHub",
    download: "下载",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "定制专属信息源",
    subtitle:
      "面向内容生产与资讯管线的自托管订阅系统：接入网页、RSS、邮件等信源，定时抓取与采集器解析后统一入库，按需加工并输出 RSS、JSON API 与 MCP，喂给创作与分发流程。",
    quickStart: "快速开始",
    quickStartHint: "首次运行会生成 ~/.rssany/config.json 并打开初始化页面",
    useCaseAlt: "RssAny Web 界面：定制信源、浏览资讯条目并输出到内容管线",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    pipelineTitle: "自定义加工管线",
    pipelineSubtitle: "为每条内容自动完成分类、打标签和翻译等处理，让信息更清晰、更易使用。",
    featuresTitle: "为内容生产而生的订阅管线",
    featuresSubtitle: "从信源接入、内容采集到智能整理与灵活输出，一条链路服务资讯获取与内容分发。",
    features: {
      sources: {
        title: "汇集多种信源",
        description: "统一订阅网站、RSS 和邮件中的内容，持续获取你关心的最新资讯。",
      },
      collectors: {
        title: "按需扩展来源",
        description: "常用站点开箱即用，也能根据需要接入更多网站和专属信息源。",
      },
      pipeline: {
        title: "灵活加工内容",
        description: "自动完成打标签、翻译和质量筛选，也可自由组合所需的处理步骤。",
      },
      llm: {
        title: "智能辅助处理",
        description: "智能理解页面、提取正文、生成标签并翻译，让复杂内容处理更省心。",
      },
      output: {
        title: "连接创作与分发",
        description: "将整理好的内容同步到阅读、创作和自动化工具，满足多种使用方式。",
      },
      selfhost: {
        title: "数据自主可控",
        description: "所有内容与设置都由你掌控，可运行在自己的设备或服务器上，使用更安心。",
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
        title: "爬虫",
        description: "自动从网页、订阅源和邮件等信源收集最新内容。",
      },
      upsert: {
        title: "存储",
        description: "自动保存并去除重复内容，方便持续查阅和订阅。",
      },
      process: {
        title: "加工",
        description: "按你的规则整理内容，完成分类、打标签和翻译等处理。",
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
    indexSubtitle: "信息源定制、采集器解析、pipeline 加工与 RSS / JSON API / MCP 输出实践。",
    empty: "暂无文章。",
    backToBlog: "← 返回博客",
    viewPipeline: "了解管线 →",
  },
} as const;

export default zhCN;
