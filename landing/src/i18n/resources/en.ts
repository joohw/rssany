const en = {
  header: {
    home: "Home",
    features: "Features",
    pipeline: "Pipeline",
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
    title: "Turn any source into an RSS feed",
    subtitle:
      "Self-hosted pipeline: schedule fetches for web lists, RSS/Atom, and mail, parse with plugins, store in SQLite, then publish RSS XML, JSON API, and optional MCP.",
    quickStart: "Quick start",
    quickStartHint: "First run creates ~/.rssany/ with sources.json and config.json",
    useCaseAlt: "RssAny web UI for sources, items, and RSS output",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    pipelineTitle: "Fixed pipeline per item",
    pipelineSubtitle: "After upsert, each item runs tagging, translation, and more — toggled in config.json.",
    featuresTitle: "Why RssAny",
    featuresSubtitle: "One self-hosted stack from fetch and parse to dedupe, enrich, and publish.",
    features: {
      sources: {
        title: "Unified subscriptions",
        description: "Configure web lists, RSS feeds, and IMAP mail in sources.json; the scheduler pulls on refresh intervals.",
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
        title: "Many outputs",
        description: "Generate RSS/Atom/JSON feeds on demand, expose /api/* JSON, and optional MCP tools for agents.",
      },
      selfhost: {
        title: "Self-hosted & open source",
        description: "Node.js + SQLite under ~/.rssany/, MIT licensed. Install via npm globally or deploy with Docker.",
      },
    },
    installNpm: "Install via npm",
    viewDocs: "Read docs",
    ctaTitle: "Start subscribing today",
    ctaSubtitle: "Install in one command, run locally, keep full control of your data.",
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
    footerTagline: "Self-hosted subscription pipeline · RSS from any source",
    footerCopyright: "© 2026 rssany",
  },
} as const;

export default en;
