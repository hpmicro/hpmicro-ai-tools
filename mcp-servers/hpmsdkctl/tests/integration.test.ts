import { it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempDirectory } from "./fixtures.js";
import { Config } from "../src/config/config.js";
import { generate, compile } from "../src/operations/build.js";
it.skipIf(!process.env.HPMSDKCTL_SDK_ENV)(
  "generates and compiles a copied real hello_world sample without modifying SDK",
  async () => {
    const root = createTempDirectory();
    try {
      const configuration = Config.fromInput({ sdkEnv: process.env.HPMSDKCTL_SDK_ENV! });
      configuration.validate();
      const app = path.join(root, "hello_world");
      fs.cpSync(path.join(configuration.hpmSdk, "samples", "hello_world"), app, {
        recursive: true,
      });
      const out = await generate(configuration, {
        appDir: app,
        board: process.env.HPMSDKCTL_TEST_BOARD || "hpm6750evkmini",
        hpmBuildType: "flash_xip",
        cmakeBuildType: "debug",
        buildDir: path.join(root, "build"),
      });
      expect(out.exitCode, out.stdout + "\n" + out.stderr).toBe(0);
      const result = await compile(configuration, out.buildDir!);
      expect(result.exitCode, result.stdout + "\n" + result.stderr).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  120000,
);
