import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "ssh2";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return { env, raw: content };
}

function run(command, args, options = {}) {
  const { cwd, input, redactedArgs } = options;
  const printableArgs = redactedArgs || args;
  console.log(`> ${command} ${printableArgs.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "inherit", "inherit"],
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
    if (input != null) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function shEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseRegistryLoginHost(registry) {
  const host = String(registry || "").split("/")[0]?.trim();
  if (host) return host;
  return "docker.io";
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function isTruthy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function printHelp() {
  console.log(`Usage: npm run deploy:landing -- [options]

Options:
  --config <path>       Deploy config file (default: .env.deploy)
  --tag <tag>           Image tag (default: latest or DOCKER_IMAGE_TAG)
  --image <name>        Image name without registry (default: rssany-landing or DOCKER_IMAGE_NAME)
  --container <name>    Remote container name (default: rssany-landing)
  --host-port <port>    Remote exposed frontend port (default: 13124)
  --pull-base           Ask docker build to pull newer base images (FROM ...); default is local-only
  --no-image-update     Skip local build/login/push and remote pull
  --dry-run             Print commands only, do not execute
  --help                Show help
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSshError(error) {
  const message = String(error?.message || error || "");
  return /handshake|ECONNRESET|ETIMEDOUT|EPIPE|ENOTCONN|Socket closed|Connection lost|connect/i.test(message);
}

function buildSshConnectOptions({ sshHost, sshPort, sshUser, sshPassword }) {
  const connectOptions = {
    host: sshHost,
    port: sshPort,
    username: sshUser,
  };
  if (sshPassword) {
    connectOptions.password = sshPassword;
  }
  return connectOptions;
}

async function runRemoteWithStdinOnce({
  sshHost,
  sshPort,
  sshUser,
  sshPassword,
  remoteCommand,
  stdinContent,
}) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(`bash -lc ${shEscape(remoteCommand)}`, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        stream.on("close", (code) => {
          conn.end();
          if (code === 0) resolve();
          else reject(new Error(`remote command exited with code ${code ?? "unknown"}`));
        });
        stream.stderr.on("data", (chunk) => process.stderr.write(chunk));
        stream.on("data", (chunk) => process.stdout.write(chunk));

        if (stdinContent != null) {
          stream.write(stdinContent);
        }
        stream.end();
      });
    });
    conn.on("error", reject);
    conn.connect(buildSshConnectOptions({ sshHost, sshPort, sshUser, sshPassword }));
  });
}

async function runRemoteWithStdin(options) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runRemoteWithStdinOnce(options);
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableSshError(error)) {
        throw error;
      }
      const waitMs = attempt * 3000;
      console.warn(
        `SSH attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${waitMs / 1000}s...`,
      );
      await sleep(waitMs);
    }
  }
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const dryRun = hasFlag("--dry-run");
  const noImageUpdate = hasFlag("--no-image-update");
  const repoRoot = process.cwd();
  const configPath = path.resolve(repoRoot, getArgValue("--config") || ".env.deploy");
  const landingRoot = path.resolve(repoRoot, "landing");
  const dockerfilePath = path.resolve(landingRoot, "Dockerfile.frontend");

  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`dockerfile not found: ${dockerfilePath}`);
  }

  const { env: deployEnv } = parseEnvFile(configPath);

  const registry = deployEnv.DOCKER_REGISTRY || "";
  const dockerUsername = deployEnv.DOCKER_USERNAME || "";
  const dockerPassword = deployEnv.DOCKER_PASSWORD || "";
  const sshHost = deployEnv.SSH_HOST;
  const sshUser = deployEnv.SSH_USERNAME;
  const sshPassword = deployEnv.SSH_PASSWORD || "";
  const sshPort = Number(deployEnv.SSH_PORT || "22");

  if (!sshHost || !sshUser) {
    throw new Error("SSH_HOST and SSH_USERNAME are required in deploy config");
  }
  if (!dockerUsername || !dockerPassword) {
    throw new Error("DOCKER_USERNAME and DOCKER_PASSWORD are required in deploy config");
  }

  const imageName = getArgValue("--image") || deployEnv.DOCKER_IMAGE_NAME || "rssany-landing";
  const imageTag = getArgValue("--tag") || deployEnv.DOCKER_IMAGE_TAG || "latest";
  const containerName = getArgValue("--container") || deployEnv.REMOTE_CONTAINER_NAME || "rssany-landing";
  const frontendHostPort =
    getArgValue("--host-port") ||
    deployEnv.REMOTE_FRONTEND_PORT ||
    deployEnv.REMOTE_HOST_PORT ||
    "13124";
  const skipImageUpdate = noImageUpdate || isTruthy(deployEnv.DEPLOY_SKIP_IMAGE_UPDATE);
  const dockerPlatform = (deployEnv.DEPLOY_DOCKER_PLATFORM || "linux/amd64").trim();
  const pullBaseImages =
    hasFlag("--pull-base") || isTruthy(deployEnv.DEPLOY_DOCKER_PULL_BASE);

  const imageRef = registry ? `${registry}/${imageName}:${imageTag}` : `${imageName}:${imageTag}`;
  const registryLoginHost = parseRegistryLoginHost(registry);
  const dockerPasswordB64 = Buffer.from(dockerPassword, "utf8").toString("base64");
  const remoteRetryShellFunction = [
    "retry_shell() {",
    "  command=\"$1\"",
    "  attempt=1",
    "  while [ \"$attempt\" -le 5 ]; do",
    "    sh -c \"$command\" && return 0",
    "    code=$?",
    "    if [ \"$attempt\" -ge 5 ]; then return \"$code\"; fi",
    "    wait_seconds=$((attempt * 5))",
    "    echo \"remote command failed with $code; retrying in ${wait_seconds}s...\" >&2",
    "    sleep \"$wait_seconds\"",
    "    attempt=$((attempt + 1))",
    "  done",
    "}",
  ].join("\n");
  const remoteImagePrepare = skipImageUpdate
    ? "echo 'skip image update: use existing remote image'"
    : [
        remoteRetryShellFunction,
        `REG_PASS="$(printf %s ${shEscape(dockerPasswordB64)} | base64 -d)"`,
        "export REG_PASS",
        `retry_shell ${shEscape(`printf '%s' "$REG_PASS" | docker login ${shEscape(registryLoginHost)} -u ${shEscape(dockerUsername)} --password-stdin`)}`,
        "unset REG_PASS",
        `retry_shell ${shEscape(`docker pull ${shEscape(imageRef)}`)}`,
      ].join("\n");
  const remoteCommand = [
    "set -e",
    remoteImagePrepare,
    `(docker rm -f ${shEscape(containerName)} >/dev/null 2>&1 || true)`,
    `docker run -d --name ${shEscape(containerName)} --restart unless-stopped -p ${shEscape(`${frontendHostPort}:3000`)} ${shEscape(imageRef)}`,
  ].join(" && ");

  console.log("Deploy plan:");
  console.log("- mode: landing frontend-only");
  console.log(`- dockerfile: ${path.relative(repoRoot, dockerfilePath)}`);
  console.log(`- image: ${imageRef}`);
  console.log(`- remote: ${sshUser}@${sshHost}:${sshPort}`);
  console.log(`- container: ${containerName}`);
  console.log(`- ports: frontend ${frontendHostPort}->3000`);
  console.log(`- docker platform: ${dockerPlatform}`);
  console.log(`- image update: ${skipImageUpdate ? "disabled" : "enabled"}`);
  if (!skipImageUpdate) {
    console.log(`- docker build base images: ${pullBaseImages ? "pull from registry" : "local only (--pull=false)"}`);
  }
  if (dryRun) {
    console.log("\n[dry-run] skip execution");
    return;
  }

  if (!skipImageUpdate) {
    console.log("\n[1/6] Building local docker image...");
    const buildArgs = pullBaseImages
      ? ["build", "--platform", dockerPlatform, "--pull=true", "-f", dockerfilePath, "-t", imageRef, landingRoot]
      : ["build", "--platform", dockerPlatform, "--pull=false", "-f", dockerfilePath, "-t", imageRef, landingRoot];
    await run("docker", buildArgs, { cwd: repoRoot });

    console.log("\n[2/6] Logging in to registry...");
    const loginArgs = registry
      ? ["login", registry, "-u", dockerUsername, "--password-stdin"]
      : ["login", "-u", dockerUsername, "--password-stdin"];
    const redactedLoginArgs = registry
      ? ["login", registry, "-u", dockerUsername, "--password-stdin"]
      : ["login", "-u", dockerUsername, "--password-stdin"];
    await run("docker", loginArgs, {
      input: `${dockerPassword}\n`,
      redactedArgs: redactedLoginArgs,
    });

    console.log("\n[3/6] Pushing image...");
    await run("docker", ["push", imageRef]);
  } else {
    console.log("\n[1-3/6] Image update disabled; skip local build/login/push.");
  }

  console.log("\n[4-6/6] SSH to server, pull image, and run container...");
  await runRemoteWithStdin({
    sshHost,
    sshPort,
    sshUser,
    sshPassword,
    remoteCommand,
  });

  console.log("\nDeploy completed.");
}

main().catch((error) => {
  console.error(`Deploy failed: ${error.message}`);
  process.exit(1);
});
