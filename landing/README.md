# RssAny Landing — Next.js App Router marketing site

## Development

```bash
cd landing
npm install
npm run dev
```

Default dev URL: `http://localhost:28473/zh-CN`.

Public site URL and GitHub links are defined in `src/lib/site.ts`.

## Build

```bash
npm run build
npm start
```

The static export is written to `out/`.

## Cloudflare Workers Static Assets

Production is defined by `wrangler.jsonc`: the Worker is named `rssany`, serves
the static export from `out/`, returns the generated `404.html` for missing
routes, and handles `rssany.com/*` through a Workers Route. The proxied apex DNS
record remains in place as an origin fallback and avoids a DNS propagation gap
during deployment.

For a manual deployment, authenticate once with `wrangler login`, then run:

```bash
npm run deploy
```

Continuous deployment uses Cloudflare Workers Builds with these settings:

- Git repository: `joohw/rssany`
- Root directory: `/landing`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Non-production branch builds: enabled

Landing deployment does not use GitHub Actions, Docker, SSH credentials, or
repository-level Cloudflare API secrets.

Redirects that used to live in `next.config.ts` are defined in
`public/_redirects` for Workers Static Assets.
