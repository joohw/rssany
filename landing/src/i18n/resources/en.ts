const en = {
  header: {
    home: "Home",
    features: "Features",
    pipeline: "Pipeline",
    blog: "Blog",
    skill: "Skill",
    docs: "Docs",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "Curate dedicated information sources",
    subtitle:
      "Self-hosted pipeline for content production and news workflows: ingest web, RSS, and email, parse with plugins, store in SQLite, enrich on demand, then publish RSS, JSON API, and MCP for editorial and distribution tools.",
    quickStart: "Quick start",
    quickStartHint: "First run creates ~/.rssany/ with sources.json and config.json",
    useCaseAlt: "RssAny web UI to curate sources, browse items, and feed content pipelines",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    pipelineTitle: "Fixed pipeline per item",
    pipelineSubtitle: "After upsert, each item runs tagging, translation, and more — toggled in config.json.",
    featuresTitle: "Built for content and news pipelines",
    featuresSubtitle: "From curated sources through fetch, parse, enrich, and publish — one stack for intelligence gathering and distribution.",
    features: {
      sources: {
        title: "Curated sources",
        description: "Configure web lists, RSS feeds, and IMAP mail in sources.json; the scheduler keeps your news intake on refresh intervals.",
      },
      plugins: {
        title: "Pluggable sources",
        description: "Many built-in Site plugins; override or extend under ~/.rssany/plugins with .rssany.js/.ts files.",
      },
      pipeline: {
        title: "Fixed pipeline",
        description: "Tagging, translation, and quality filters live in app/pipeline/, enabled via pipeline.steps in config.",
      },
      llm: {
        title: "LLM-assisted",
        description: "Parsing, extraction, tags, and translation can use an OpenAI-compatible API with rules-first fallbacks.",
      },
      output: {
        title: "Feed your pipeline",
        description: "Generate RSS/Atom/JSON feeds on demand, expose /api/* JSON and MCP for editorial tools, agents, and downstream systems.",
      },
      selfhost: {
        title: "Self-hosted & open source",
        description: "Node.js + SQLite under ~/.rssany/, MIT licensed. Install via npm globally or deploy with Docker.",
      },
    },
    installNpm: "Install via npm",
    viewDocs: "Read docs",
    ctaTitle: "Start curating your sources",
    ctaSubtitle: "Install in one command, run locally, and own your news and content pipeline.",
    ctaGithub: "View on GitHub",
    ctaNpm: "npm package",
    pipelineItems: {
      fetch: {
        title: "fetchItems",
        description: "Scheduler triggers source plugins for list fetch, body extraction, and site login when needed.",
      },
      upsert: {
        title: "upsertItems",
        description: "Dedupe by guid into SQLite with configurable cache windows and refresh policies.",
      },
      process: {
        title: "pipeline",
        description: "Per-item chain: tagging, translation, etc., then content and cache updates.",
      },
      deliver: {
        title: "Optional deliver",
        description: "When deliver.url is set, POST { sourceRef, items } JSON after pipeline completes.",
      },
    },
    footerTagline: "Curate dedicated sources · content & news pipelines",
    footerCopyright: "© 2026 rssany",
  },
  blog: {
    indexTitle: "Blog",
    indexSubtitle: "Feed curation, plugin parsing, pipeline enrichment, and RSS / JSON API / MCP publishing.",
    empty: "No posts yet.",
    backToBlog: "← Back to blog",
    viewPipeline: "Explore pipeline →",
  },
} as const;

export default en;
