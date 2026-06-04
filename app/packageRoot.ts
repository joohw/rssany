// 解析 npm 包根或仓库根（含 app/plugins/、app/statics/、app/webui/build/）；开发时来自 app/，打包后为 dist/ 的上一级

import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const base = basename(__dir);

export const PACKAGE_ROOT =
  base === "app" || base === "dist" ? join(__dir, "..") : __dir;
