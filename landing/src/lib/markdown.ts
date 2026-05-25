import { Marked, Renderer, type Tokens } from "marked";

const EXTERNAL_LINK_ICON = `<span class="md-external-link-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>`;

const baseRenderer = new Renderer();

const marked = new Marked({
  gfm: true,
  breaks: true,
});

marked.use({
  renderer: {
    link(this: Renderer, token: Tokens.Link) {
      const html = baseRenderer.link.call(this, token);
      const href = token.href.trim();
      if (!/^https?:\/\//i.test(href)) {
        return html;
      }
      const withNewTab = html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
      return withNewTab.replace("</a>", `${EXTERNAL_LINK_ICON}</a>`);
    },
  },
});

export async function renderMarkdown(markdown: string): Promise<string> {
  return marked.parse(markdown);
}
