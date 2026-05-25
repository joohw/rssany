# RssAny Landing — Next.js App Router marketing site.

## Development

```bash
cd landing
npm install
npm run dev
```

Default dev URL: `http://localhost:28473`.

## Environment Variables

Copy `.env.landing.example` to `.env.landing` at repo root for deploy runtime env.

```bash
cp ../.env.landing.example ../.env.landing
cp ../.env.landing.example .env.local
```

- `PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_URL`: public website URL for canonical/sitemap
- `NEXT_PUBLIC_GITHUB_URL`: GitHub repo link (optional, default https://github.com/joohw/rssany)

## Build & Run

```bash
npm run build
npm run start
```

## Deploy

See repo root `npm run deploy` and `.env.deploy.example`.
