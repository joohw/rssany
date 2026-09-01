# Item Pipelines

Use a pipeline to transform or filter normalized feed items after they are fetched and written to SQLite. Each configured step receives one `FeedItem` at a time, in arrangement order. Returning `null` removes that newly fetched item; returning an item passes it to the next step.

## User pipeline contract

User pipelines are flat ESM files under the user directory at `pipelines/*.rssany.js`. A file must default-export one definition:

```js
export default {
  id: "remove-empty",
  name: "Remove empty items",
  description: "Discard items without a title or body",

  async process(item, context) {
    if (!item.title?.trim() && !item.content?.trim()) return null;
    return item;
  },
};
```

- `id`: starts with a letter or underscore, contains only letters, digits, `_`, and `-`, and is at most 64 characters. It must match the upload request id.
- `name`: user-facing name shown in the Web UI.
- `description`: optional user-facing summary.
- `process(item, context)`: synchronous or asynchronous; return a `FeedItem` or `null`.
- `context.sourceUrl`: current source identifier.
- `context.llm`: configured `chatJson` and `chatText` helpers when available.
- `context.db.getSystemTags()`: reads configured system tags.

Preserve `guid`, `link`, and `sourceRef` unless the requested transformation explicitly requires otherwise; they participate in persistence, identity, and deduplication. If a step throws, RssAny logs the failure and keeps the item as it entered that step.

Use `item.extra` for structured extension data that must survive later pipeline steps, database reads, the JSON API, backups, and delivery. Give each pipeline its own namespace (for example, `item.extra.myPipeline`) and merge the existing object instead of replacing all of `extra`. Also write frequently queried flat signals to `item.tags`.

## Management API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pipelines` | List built-in and user pipeline metadata |
| POST | `/api/pipelines/validate` | Validate `{ id, content }` without saving |
| POST | `/api/pipelines` | Upload `{ id, content }` |
| GET | `/api/pipelines/:id` | Read user pipeline source |
| PUT | `/api/pipelines/:id` | Replace source with `{ content }` |
| DELETE | `/api/pipelines/:id` | Delete a user pipeline and remove it from the arrangement |
| GET | `/api/pipeline` | Read available pipelines and the current arrangement |
| PUT | `/api/pipeline` | Save `{ steps: [{ id }] }` in execution order |
| POST | `/api/pipeline/run` | Queue a pipeline rerun for existing items and return a `taskId` |

Uploading, validating, reading source, updating, deleting, and rerunning can expose or execute arbitrary local Node.js code. These endpoints accept only loopback connections; browser requests with an `Origin` must also come from a loopback origin. Listing and arrangement remain available to the local Web UI.

## Rerun existing items

Ordinary pulls run the configured pipeline only for rows inserted by that pull. A forced pull does not reprocess rows already present in SQLite. Use `POST /api/pipeline/run` to backfill or recompute existing items.

Select exactly one scope:

- `itemIds`: an array of item guids.
- `sourceRef`: a source identifier, optionally with ISO `since` / `until` and `limit` (default 100, maximum 500).

Optionally pass `stepIds` to run only those steps in the given order. Omitting it uses the current arrangement. The endpoint returns `202` with a `taskId`; poll `GET /api/tasks/:id`. The final task result reports `selected`, `processed`, `updated`, `dropped`, `missing`, and `stepIds`. A step that returns `null` still deletes the selected item, so inspect filtering steps before rerunning them.

```json
{
  "sourceRef": "https://example.com/feed",
  "since": "2026-08-01T00:00:00Z",
  "limit": 100,
  "stepIds": ["aiTechblogPrefilter"]
}
```

## Safe update workflow

1. Read the current source before changing an existing user pipeline.
2. Call `POST /api/pipelines/validate` with the proposed id and complete source.
3. Upload with `POST /api/pipelines` or update with `PUT /api/pipelines/:id`.
4. Read `GET /api/pipeline`, add the id once at the intended position, and save the complete ordered `steps` array.
5. Pull a test source and inspect logs and resulting items.

Writes use a temporary file and atomic replacement. Invalid imports, invalid exports, and id mismatches return `422`; an existing file is restored after a failed update. Do not delete a pipeline without explicit user authorization.
