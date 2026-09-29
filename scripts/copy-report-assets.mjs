import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const folder of ["fonts", "assets"]) {
  const from = join(root, "src", "reports", "trafficDeath", folder);
  const to = join(root, "dist", "reports", "trafficDeath", folder);
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}
