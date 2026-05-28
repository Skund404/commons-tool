import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Playwright drives the production single-binary build of `commons` over HTTP.
// The binary embeds the React bundle, so we don't run Vite during e2e — we
// exercise the same path Pascal will hit at runtime.
//
// Requirements before `npx playwright test`:
//   1. Frontend bundle built and copied into cmd/commons/frontend_dist/
//   2. Go binary built at dist/commons.exe
// The README's "make build" target does both.

const REPO_ROOT = path.resolve(__dirname, "..");
// Pick the right binary for the host. Cross-compiled artifacts share
// `dist/`; the host-native one drops without an OS suffix on POSIX and
// with `.exe` on Windows.
const COMMONS_BIN = path.join(
  REPO_ROOT,
  "dist",
  process.platform === "win32" ? "commons.exe" : "commons",
);

// Mock corpus lookup, in order of preference:
//   1. $COMMONS_MOCK_PATH (CI sets this)
//   2. <repo>/.cache/proto-commons (what `make fetch-mock` creates)
//   3. ../../Rillmark/_Proto-Commons/mock (Pascal's vault path)
function resolveMockCorpus(): string {
  const fromEnv = process.env.COMMONS_MOCK_PATH;
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(REPO_ROOT, ".cache", "proto-commons"),
    path.resolve(REPO_ROOT, "..", "..", "Rillmark", "_Proto-Commons", "mock"),
  ];
  for (const c of candidates) {
    try {
      // Cheap existence check without an extra fs import — readdirSync is
      // fine at config load time.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").statSync(c);
      return c;
    } catch {
      // try the next one
    }
  }
  // No corpus found: return the first candidate so the error surfaces at
  // run time with the right path in the message.
  return candidates[0];
}
const MOCK_CORPUS = resolveMockCorpus();

// Use 8439 to avoid colliding with the default dev port or any leftover
// instance the user may have running.
const PORT = 8439;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // single server, single user — serialize.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `"${COMMONS_BIN}" --port=${PORT} --no-browser --mock "${MOCK_CORPUS}"`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
