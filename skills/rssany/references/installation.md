# Install RssAny, the Skill, and MCP

Use the Skill ZIP to give an agent RssAny operating knowledge. Add MCP when the agent also needs live tools for querying items, inspecting sources, or managing user plugins.

## Official project links

- Website: `https://rssany.com`
- GitHub: `https://github.com/joohw/rssany`
- npm: `https://www.npmjs.com/package/rssany`
- Issues: `https://github.com/joohw/rssany/issues`

## Install RssAny

Use Node.js 20 through 23; prefer the current Node.js 22 LTS release for a new installation. Install Node with its official installer, nvm, or fnm, then verify `node --version` and `npm --version` before installing RssAny.

Install the published CLI globally, start the managed service, and verify it:

```text
npm install -g rssany
rssany start
rssany status
```

The default Web UI is `http://127.0.0.1:18473/`. Use `rssany stop` to stop the managed service and `rssany update` to install a newer published version.

### macOS or Linux permissions

Prefer nvm, fnm, or a user-owned npm prefix so global packages do not require administrator privileges:

```bash
npm config set prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
npm install -g rssany
```

On the default macOS zsh, persist `export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc`. For bash, use `~/.bash_profile` instead. Do not change ownership or permissions for the whole npm installation tree.

If a system-level npm installation still reports `EACCES` and the user explicitly accepts an administrator install, use `sudo`, then make the RssAny data directory writable by the current user:

```bash
sudo npm install -g rssany
rssany_npm_prefix="$(npm prefix -g)"
sudo mkdir -p "$rssany_npm_prefix/var/rssany"
sudo chown -R "$(id -u):$(id -g)" "$rssany_npm_prefix/var/rssany"
rssany start
```

Use `sudo npm install -g` only for a trusted package. Do not run the RssAny service itself with `sudo`.

### Install from source

```text
git clone https://github.com/joohw/rssany.git
cd rssany
npm install
npm --prefix app/webui-react install
npm run build:all
npm start
```

Use source installation for development or contribution. Prefer the global npm package for normal operation.

## Prerequisite

Start RssAny and verify:

```bash
rssany status
curl -fsS http://127.0.0.1:18473/api/server-info
```

Use another base URL only when the service is intentionally hosted elsewhere.

## Download and inspect the Skill ZIP

- Metadata and core instructions: `GET /api/skill`
- Complete archive: `GET /api/skill.zip`
- Browser UI: `/skill`

The archive contains one top-level `rssany/` directory. Keep that directory intact; `rssany/SKILL.md` must exist after extraction.

### Install for Codex on Windows

Install for the current user:

```powershell
$profileDir = [Environment]::GetFolderPath('UserProfile')
$skillsDir = Join-Path $profileDir '.agents\skills'
$archivePath = Join-Path $env:TEMP 'rssany-skill.zip'
New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
curl.exe -fL 'http://127.0.0.1:18473/api/skill.zip' -o $archivePath
Expand-Archive -LiteralPath $archivePath -DestinationPath $skillsDir -Force
Test-Path -LiteralPath (Join-Path $skillsDir 'rssany\SKILL.md')
```

For repository-only use, extract `rssany/` under `<repo>/.agents/skills/` instead. Do not flatten the archive into the `skills` directory.

Codex detects Skill changes automatically. If `$rssany` or `/skills` does not show it, restart the ChatGPT desktop app, Codex CLI, or IDE extension.

### Install for another Agent

1. Find the client's Agent Skills directory.
2. Download `/api/skill.zip` as binary data.
3. Extract it without removing the top-level `rssany/` directory.
4. Verify `rssany/SKILL.md`, `rssany/agents/openai.yaml`, and `rssany/references/` exist.
5. Restart or reload the client if it does not watch Skill directories.

## Connect Codex to RssAny MCP

RssAny supports Streamable HTTP at `http://127.0.0.1:18473/mcp`.

### Codex CLI

```text
codex mcp add rssany --url http://127.0.0.1:18473/mcp
codex mcp list
```

Restart an already-open Codex client after adding the server. In the Codex TUI or ChatGPT desktop composer, use `/mcp` to verify that `rssany` and its tools are connected.

### ChatGPT desktop app or Codex IDE extension

1. Open Settings (or the IDE gear menu) and select **MCP servers**.
2. Add a server named `rssany`.
3. Choose **Streamable HTTP**.
4. Enter `http://127.0.0.1:18473/mcp`.
5. Save and restart the app or extension.
6. Open `/mcp` and confirm the server exposes `list_sources`, `query_items`, and the other RssAny tools.

### Codex `config.toml`

Add this to the user `~/.codex/config.toml` or a trusted project's `.codex/config.toml`:

```toml
[mcp_servers.rssany]
url = "http://127.0.0.1:18473/mcp"
enabled = true
default_tools_approval_mode = "writes"
```

The `writes` approval mode keeps read tools convenient while prompting for mutation tools. Restart Codex after editing the file.

### Other MCP clients

- Prefer Streamable HTTP URL: `http://127.0.0.1:18473/mcp`.
- For clients that explicitly support only legacy SSE, use `http://127.0.0.1:18473/mcp/sse`.
- Do not configure `/mcp/messages` directly; legacy clients learn that session-specific URL from the SSE `endpoint` event.

## Verify and troubleshoot

1. Confirm `GET /api/server-info` succeeds.
2. Confirm `GET /mcp` reports the local server and both transport endpoints.
3. Ensure the MCP client runs on the same machine. RssAny rejects non-loopback MCP requests by default.
4. Confirm the client uses `/mcp`, not `/mcp/sse`, for Streamable HTTP.
5. Restart the client after changing its MCP configuration.
6. Use `codex mcp list` or the client's MCP server panel to inspect connection errors.

Set `RSSANY_MCP_ALLOW_REMOTE=1` only when the user explicitly authorizes remote mutation-capable MCP access and the network is otherwise protected.
