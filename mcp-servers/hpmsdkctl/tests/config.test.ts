import { ConfigStore } from "../src/config/config-store.js";
import { afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as configModule from "../src/config/config.js";
import { createSdkFixture, writeFile, fakeRunner } from "./fixtures.js";
const roots: string[] = [];
const make = () => {
  const sdkFixture = createSdkFixture();
  roots.push(sdkFixture.rootDirectory);
  return sdkFixture;
};
afterEach(() => {
  for (const rootDirectory of roots.splice(0)) {
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});
describe("configuration parity", () => {
  it("maps persisted field names to camelCase configuration members and back", () => {
    const configuration = configModule.Config.fromJSON({
      hpm_sdk: "sdk",
      sdk_env: "sdk-env",
      tools: { cmake: "cmake", ninja: "ninja", python: "python" },
      env: {},
    });
    expect(configuration.hpmSdk).toBe("sdk");
    expect(configuration.sdkEnv).toBe("sdk-env");
    expect(configuration).not.toHaveProperty("hpm_sdk");
    expect(configuration).not.toHaveProperty("sdk_env");
    const serialized = configuration.toJSON();
    expect(serialized).toMatchObject({ hpm_sdk: "sdk", sdk_env: "sdk-env" });
    expect(serialized).not.toHaveProperty("hpmSdk");
    expect(serialized).not.toHaveProperty("sdkEnv");
    expect(configModule.Config.fromJSON(serialized)).toEqual(configuration);
  });

  it("keeps canonical configuration keys independent of internal member names", () => {
    const configuration = new configModule.Config({
      hpmSdk: "sdk",
      sdkEnv: "sdk-env",
      tools: { cmake: "", ninja: "", python: "" },
      env: {},
    });
    configuration.set("hpm_sdk", "replacement-sdk");
    expect(configuration.hpmSdk).toBe("replacement-sdk");
    expect(configuration.get("hpm_sdk")).toBe("replacement-sdk");
    configuration.unset("hpm_sdk");
    expect(configuration.hpmSdk).toBe("");
    expect(configuration.env.HPM_SDK_BASE).toBeUndefined();
  });

  it("accepts camelCase initialization fields while preserving persisted JSON keys", () => {
    const configuration = configModule.Config.fromInput({
      hpmSdk: "sdk",
      toolchain: "compiler",
      toolchainVariant: "custom",
    });
    expect(configuration.toJSON().hpm_sdk).toBe("sdk");
    expect(configuration.env.GNURISCV_TOOLCHAIN_PATH).toBe("compiler");
    expect(configuration.env.HPM_SDK_TOOLCHAIN_VARIANT).toBe("custom");
    expect(configuration.toJSON()).not.toHaveProperty("hpmSdk");
  });

  it("creates configuration instances through input and JSON factories", () => {
    const configuration = configModule.Config.fromInput({ hpmSdk: "sdk", ninja: "ninja" });
    expect(configuration).toBeInstanceOf(configModule.Config);
    const restored = configModule.Config.fromJSON(JSON.parse(JSON.stringify(configuration)));
    expect(restored).toBeInstanceOf(configModule.Config);
    expect(restored.get("tools.ninja")).toBe("ninja");
    expect(restored.toJSON()).toEqual(configuration.toJSON());
  });

  it("copies nested values without changing the caller's data", () => {
    const data = { hpmSdk: "sdk", tools: { cmake: "", ninja: "", python: "" }, env: {} };
    const configuration = new configModule.Config(data);
    configuration.set("tools.ninja", "ninja");
    configuration.normalize();
    expect(data.tools.ninja).toBe("");
    expect(data.env).toEqual({});
    expect(configuration.normalize()).toBe(configuration);
  });

  it("loads persisted files as configuration instances", () => {
    const sdkFixture = make();
    const store = new ConfigStore(path.join(sdkFixture.rootDirectory, "config.json"));
    store.save(sdkFixture.configuration);
    expect(store.load()).toBeInstanceOf(configModule.Config);
  });

  it("round-trips configuration JSON and writes newline", () => {
    const sdkFixture = make();
    const file = path.join(sdkFixture.rootDirectory, "config.json");
    new ConfigStore(file).save(sdkFixture.configuration);
    expect(new ConfigStore(file).load()).toEqual(sdkFixture.configuration);
    expect(fs.readFileSync(file, "utf8")).toMatch(/\n$/);
  });
  it("returns zero-valued config without creating a missing file or directory", () => {
    const sdkFixture = make();
    const file = path.join(sdkFixture.rootDirectory, "missing", "config.json");
    expect(new ConfigStore(file).load()).toEqual(configModule.newConfig());
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });
  it("defaults omitted fields and rejects corrupt JSON", () => {
    const sdkFixture = make();
    const configFilePath = writeFile(path.join(sdkFixture.rootDirectory, "c.json"), "{}");
    expect(new ConfigStore(configFilePath).load()).toEqual(configModule.newConfig());
    writeFile(configFilePath, "{");
    expect(() => new ConfigStore(configFilePath).load()).toThrow();
    writeFile(configFilePath, '{"hpm_sdk":2}');
    expect(() => new ConfigStore(configFilePath).load()).toThrow();
  });
  it.each(["hpm_sdk", "tools.cmake", "tools.ninja", "tools.python", "tools.openocd", "env.CUSTOM"])(
    "set/get/unset %s",
    (key) => {
      const configuration = configModule.newConfig();
      configuration.set(key, "value");
      expect(configuration.get(key)).toBe("value");
      configuration.unset(key);
      expect(configuration.get(key)).toBe("");
    },
  );
  it.each([
    ["cmake", "tools.cmake"],
    ["ninja", "tools.ninja"],
    ["python", "tools.python"],
    ["openocd", "tools.openocd"],
    ["toolchain", "env.GNURISCV_TOOLCHAIN_PATH"],
    ["toolchain_variant", "env.HPM_SDK_TOOLCHAIN_VARIANT"],
  ])("set/get/unset alias %s", (alias, key) => {
    const configuration = configModule.newConfig();
    configuration.set(alias, "x");
    expect(configuration.get(key)).toBe("x");
    expect(configuration.get(alias)).toBe("x");
    configuration.unset(alias);
    expect(configuration.get(key)).toBe("");
  });
  it.each(["unknown", "sdk_env", "env.", "toString", "constructor"])(
    "rejects unknown key %s",
    (key) => {
      expect(() => configModule.newConfig().get(key)).toThrow();
      expect(() => configModule.newConfig().set(key, "x")).toThrow();
      expect(() => configModule.newConfig().unset(key)).toThrow();
    },
  );
  it("synchronizes SDK BASE, but normalize does not overwrite explicit values", () => {
    const configuration = configModule.newConfig();
    configuration.set("hpm_sdk", "one");
    expect(configuration.env.HPM_SDK_BASE).toBe("one");
    configuration.env.HPM_SDK_BASE = "two";
    configuration.normalize();
    expect(configuration.env.HPM_SDK_BASE).toBe("two");
    configuration.unset("hpm_sdk");
    expect(configuration.env.HPM_SDK_BASE).toBeUndefined();
  });
  it("uses stable user config paths and env override", () => {
    expect(configModule.defaultPath({ HPMSDKCTL_CONFIG: "custom" }, "linux", "/home/user")).toBe(
      "custom",
    );
    expect(configModule.defaultPath({ APPDATA: "roam" }, "win32", "home")).toBe(
      path.join("roam", "hpmicro", "hpmsdkctl", "config.json"),
    );
    expect(configModule.defaultPath({ XDG_CONFIG_HOME: "xdg" }, "linux", "home")).toBe(
      path.join("xdg", "hpmicro", "hpmsdkctl", "config.json"),
    );
    expect(configModule.defaultPath({}, "darwin", "home")).toBe(
      path.join("home", "Library", "Application Support", "hpmicro", "hpmsdkctl", "config.json"),
    );
  });
  it("merges Path case-insensitively and prefixes all tools", () => {
    const sdkFixture = make();
    const createSdkEnvFixture = sdkFixture.configuration.environment({
      Path: "original",
      HPM_SDK_BASE: "wrong",
      CUSTOM: "yes",
    });
    expect(
      Object.keys(createSdkEnvFixture).filter(
        (environmentKey) => environmentKey.toLowerCase() === "path",
      ),
    ).toEqual(["PATH"]);
    expect(createSdkEnvFixture.PATH).toContain(
      path.join(sdkFixture.rootDirectory, "toolchain", "bin"),
    );
    expect(createSdkEnvFixture.PATH).toMatch(/original$/);
    expect(createSdkEnvFixture.HPM_SDK_BASE).toBe(sdkFixture.sdkDirectory);
    expect(createSdkEnvFixture.CUSTOM).toBe("yes");
  });
  it("uses toolchain directory when bin is missing", () => {
    const sdkFixture = make();
    fs.unlinkSync(
      path.join(
        sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
        "bin",
        "riscv32-unknown-elf-gcc" + (process.platform === "win32" ? ".exe" : ""),
      ),
    );
    fs.rmdirSync(path.join(sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH, "bin"));
    expect(sdkFixture.configuration.environment().PATH).toContain(
      sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
    );
  });
  it("doctor reports empty config, optional OpenOCD and SDK mismatch", () => {
    expect(
      configModule
        .newConfig()
        .doctor()
        .filter((check) => check.status === "error"),
    ).toHaveLength(6);
    const sdkFixture = make();
    expect(sdkFixture.configuration.doctor().every((check) => check.status === "ok")).toBe(true);
    sdkFixture.configuration.tools.openocd = "";
    expect(
      sdkFixture.configuration.doctor().find((check) => check.name === "openocd.exe")?.status,
    ).toBe("warn");
    sdkFixture.configuration.validate();
    sdkFixture.configuration.env.HPM_SDK_BASE = "bad";
    expect(() => sdkFixture.configuration.validate()).toThrow("does not match");
  });
  it.each(["tools.cmake", "tools.ninja", "tools.python", "tools.openocd"])(
    "validates version %s",
    async (key) => {
      const sdkFixture = make();
      const fake = fakeRunner(0, "version", "");
      await configModule.validateTool(key, sdkFixture.configuration.get(key), fake.runner);
      expect(fake.calls[0].toolArguments).toEqual(["--version"]);
    },
  );
  it.each(["tools.python", "tools.openocd"])("accepts stderr version %s", async (key) => {
    const sdkFixture = make();
    await configModule.validateTool(
      key,
      sdkFixture.configuration.get(key),
      fakeRunner(0, "", "version").runner,
    );
  });
  it("rejects empty version, nonzero exit and absent tool", async () => {
    const sdkFixture = make();
    await expect(
      configModule.validateTool(
        "tools.cmake",
        sdkFixture.configuration.tools.cmake,
        fakeRunner(0, "", "").runner,
      ),
    ).rejects.toThrow("no output");
    await expect(
      configModule.validateTool(
        "tools.ninja",
        sdkFixture.configuration.tools.ninja,
        fakeRunner(9).runner,
      ),
    ).rejects.toThrow("code 9");
    await expect(configModule.validateTool("tools.python", "nonexistent")).rejects.toThrow(
      "not found",
    );
  });
  it("validates SDK structure and target compiler", async () => {
    const sdkFixture = make();
    await configModule.validateTool("hpm_sdk", sdkFixture.sdkDirectory);
    await expect(configModule.validateTool("hpm_sdk", sdkFixture.rootDirectory)).rejects.toThrow(
      "cmake/",
    );
    const executablePath = writeFile(
      path.join(
        sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
        "bin",
        "riscv32-unknown-elf-gcc" + (process.platform === "win32" ? ".exe" : ""),
      ),
    );
    const fake = fakeRunner(0, "gcc", "");
    await configModule.validateTool(
      "env.GNURISCV_TOOLCHAIN_PATH",
      sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
      fake.runner,
    );
    expect(fake.calls[0].executablePath).toBe(executablePath);
  });
  it("ignores empty or custom env validator keys", async () => {
    await configModule.validateTool("tools.cmake", "");
    await configModule.validateTool("env.CUSTOM", "arbitrary");
  });
});
describe("SDK Env parity", () => {
  function createSdkEnvFixture(absolute = false) {
    const sdkFixture = make();
    const sdkEnvDirectory = path.join(sdkFixture.rootDirectory, "env");
    writeFile(
      path.join(sdkEnvDirectory, "cmd_params.yaml"),
      `path:\n  HPM_SDK_BASE: ${absolute ? JSON.stringify(sdkFixture.sdkDirectory) : "../sdk"}\n  CMAKE: ../tools\n  NINJA: ../tools\n  PYTHON3: ../tools\n  OPENOCD: ../tools\n  GNURISCV_TOOLCHAIN_PATH: ../toolchain\nenv:\n  HPM_SDK_BASE: null\n  GNURISCV_TOOLCHAIN_PATH: []\n  FIRST: ['', chosen, later]\n  EMPTY: ''\nenv-value:\n  EXTRA: literal\n`,
    );
    return { sdkFixture, dir: sdkEnvDirectory };
  }

  it.each([false, true])("imports paths absolute=%s", (absolute) => {
    const { sdkFixture: sdkFixture, dir: sdkEnvDirectory } = createSdkEnvFixture(absolute);
    const configuration = configModule.Config.fromInput({ sdkEnv: sdkEnvDirectory });
    expect(configuration.hpmSdk).toBe(sdkFixture.sdkDirectory);
    expect(configuration.tools.cmake).toBe(sdkFixture.configuration.tools.cmake);
    expect(configuration.sdkEnv).toBe(sdkEnvDirectory);
    expect(configuration.env.FIRST).toBe("chosen");
    expect(configuration.env.EXTRA).toBe("literal");
    expect(configuration.env.HPM_SDK_TOOLCHAIN_VARIANT).toBe("gcc");
    expect(configuration.env.GNURISCV_TOOLCHAIN_PATH).toBe("");
  });
  it("finds bin executables and falls back to root candidate", () => {
    const sdkFixture = make();
    const sdkEnvDirectory = path.join(sdkFixture.rootDirectory, "env");
    writeFile(path.join(sdkEnvDirectory, "bin", "cmake.exe"));
    writeFile(
      path.join(sdkEnvDirectory, "cmd_params.yaml"),
      "path:\n  HPM_SDK_BASE: ../sdk\n  CMAKE: .\n  NINJA: absent\n",
    );
    const configuration = configModule.Config.fromInput({ sdkEnv: sdkEnvDirectory });
    expect(configuration.tools.cmake).toBe(path.join(sdkEnvDirectory, "bin", "cmake.exe"));
    expect(configuration.tools.ninja).toBe(path.join(sdkEnvDirectory, "absent", "ninja.exe"));
  });
  it("rejects missing or malformed YAML and missing SDK BASE", () => {
    const sdkFixture = make();
    expect(() => configModule.Config.fromInput({ sdkEnv: sdkFixture.rootDirectory })).toThrow();
    writeFile(path.join(sdkFixture.rootDirectory, "cmd_params.yaml"), "path: {}");
    expect(() => configModule.Config.fromInput({ sdkEnv: sdkFixture.rootDirectory })).toThrow(
      "HPM_SDK_BASE",
    );
    writeFile(path.join(sdkFixture.rootDirectory, "cmd_params.yaml"), "[");
    expect(() => configModule.Config.fromInput({ sdkEnv: sdkFixture.rootDirectory })).toThrow();
  });
  it("keeps initialization modes mutually exclusive", () => {
    expect(() => configModule.Config.fromInput({ sdkEnv: "x", cmake: "y" })).toThrow(
      "mutually exclusive",
    );
    expect(() => configModule.Config.fromInput({})).toThrow("no configuration");
    expect(configModule.Config.fromInput({ hpmSdk: "sdk" }).env.HPM_SDK_TOOLCHAIN_VARIANT).toBe(
      "gcc",
    );
  });
});
