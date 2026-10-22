import { afterEach, it, expect, describe } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createSdkFixture, writeFile } from "./fixtures.js";
import { getBuildOptions } from "../src/discovery/build.js";
import { getOpenOCDConfig } from "../src/discovery/openocd.js";
import { readBoard, readApp } from "../src/discovery/metadata.js";
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
describe("build-option discovery", () => {
  it("converts external SDK metadata field names on load", () => {
    const sdkFixture = make();
    sdkFixture.writeBoard(
      "hpm6750evkmini",
      "board: {excluded_samples: [foo], on-board-ram: {type: sdram}, on-board-flash: {type: qspi}, openocd-probe: cmsis_dap}",
    );
    const board = readBoard(path.join(sdkFixture.sdkDirectory, "boards", "hpm6750evkmini"));
    expect(board).toMatchObject({
      excludedSamples: ["foo"],
      onBoardRam: { type: "sdram" },
      onBoardFlash: { type: "qspi" },
      openocdProbe: "cmsis_dap",
    });
    expect(board).not.toHaveProperty("excluded_samples");
    writeFile(path.join(sdkFixture.applicationDirectory, "app.yaml"), "excluded_targets: [debug]");
    expect(readApp(sdkFixture.applicationDirectory)).toEqual({
      dependency: undefined,
      excludedTargets: ["ram_debug"],
    });
  });
  it("discovers defaults and preserves board sorting", () => {
    const sdkFixture = make();
    sdkFixture.writeBoard("aaa", "board: {soc: HPM6750}");
    const out = getBuildOptions(sdkFixture.configuration, "hello_world");
    expect(out.boards?.map((boardOption) => boardOption.name)).toEqual(["aaa", "hpm6750evkmini"]);
    const names = out.boards![1].buildTypes.map((buildType) => buildType.hpmBuildType);
    expect(names).toContain("flash_sdram_xip");
    expect(names).toContain("sec_core_img");
    expect(names).not.toContain("flash_xip_hybrid");
  });
  it("ignores incomplete and malformed board definitions", () => {
    const sdkFixture = make();
    writeFile(path.join(sdkFixture.sdkDirectory, "boards", "incomplete", "CMakeLists.txt"));
    sdkFixture.writeBoard("bad", "[");
    expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toHaveLength(1);
  });
  it.each(["board_led", "board_missing || board_led", "HPM6750", "hpm6750"])(
    "matches dependency %s",
    (dep) => {
      const sdkFixture = make();
      writeFile(path.join(sdkFixture.applicationDirectory, "app.yaml"), `dependency: ['${dep}']`);
      expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toHaveLength(1);
    },
  );
  it.each(["board_missing", "board_led || nonexistent", "nonexistent", "ip_feature_missing"])(
    "rejects dependency %s",
    (dep) => {
      const sdkFixture = make();
      const expr = dep === "board_led || nonexistent" ? "nonexistent || board_missing" : dep;
      writeFile(path.join(sdkFixture.applicationDirectory, "app.yaml"), `dependency: ['${expr}']`);
      expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toBeNull();
    },
  );
  it("matches SoC modules and IP macros", () => {
    const sdkFixture = make();
    const soc = path.join(sdkFixture.sdkDirectory, "soc", "hpm6700", "HPM6750");
    writeFile(
      path.join(soc, "hpm_soc_ip_feature.h"),
      "#define HPM_IP_FEATURE_FOO 1\n#define HPM_IP_FEATURE_BAR 0",
    );
    writeFile(
      path.join(soc, "soc_modules.list"),
      "HPMSOC_HAS_HPMSDK_ADC=y\nHPMSOC_HAS_HPMSDK_OTHER=n",
    );
    writeFile(
      path.join(sdkFixture.applicationDirectory, "app.yaml"),
      "dependency: [adc, ip_feature_foo]",
    );
    expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toHaveLength(1);
  });
  it("matches uppercase SoC capabilities in build filters", () => {
    const sdkFixture = make();
    sdkFixture.writeBoard("hpm6750evkmini", "board: {soc: HPM6750, feature: [board_led]}");
    const soc = path.join(sdkFixture.sdkDirectory, "soc", "hpm6700", "HPM6750");
    writeFile(path.join(soc, "hpm_soc_ip_feature.h"), "#define HPM_IP_FEATURE_FOO 1");
    writeFile(path.join(soc, "soc_modules.list"), "HPMSOC_HAS_HPMSDK_MULTICORE=y");
    const env = path.join(sdkFixture.rootDirectory, "env");
    writeFile(
      path.join(env, "cmd_params.yaml"),
      `hpm-build-type:
  sec_core_img: {feature: [multicore]}
  ip_image: {feature: [foo]}
  prefixed_ip_image: {feature: [ip_feature_foo]}
cmake-build-type: [debug]
`,
    );
    sdkFixture.configuration.sdkEnv = env;
    expect(
      getBuildOptions(sdkFixture.configuration, "hello_world").boards![0].buildTypes.map(
        (buildType) => buildType.hpmBuildType,
      ),
    ).toEqual(["sec_core_img", "ip_image", "prefixed_ip_image"]);
  });
  it.each(["samples/hello", "samples/hello_world"])(
    "matches board excluded prefix %s",
    (prefix) => {
      const sdkFixture = make();
      sdkFixture.writeBoard("hpm6750evkmini", `board:\n  excluded_samples: ['${prefix}']`);
      expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toBeNull();
    },
  );
  it.each([
    ["debug", "ram_debug"],
    ["release", "ram_release"],
    ["flash_xip", "flash_xip_debug"],
    ["flash_xip_release", "flash_xip_release"],
  ])("expands excluded target %s", (input, excluded) => {
    const sdkFixture = make();
    writeFile(
      path.join(sdkFixture.applicationDirectory, "app.yaml"),
      `excluded_targets: [${input}]`,
    );
    const out = getBuildOptions(sdkFixture.configuration, "hello_world");
    const [_hpmBuildType, ..._cmakeTypes] = excluded.split("_");
    const type = excluded.startsWith("ram_") ? "ram" : "flash_xip";
    const cmake = excluded.endsWith("release") ? "release" : "debug";
    expect(
      out.boards![0].buildTypes.find((buildType) => buildType.hpmBuildType === type)
        ?.cmakeBuildTypes,
    ).not.toContain(cmake);
  });
  it("reads custom SDK Env build filters and ignores unknown filter keys", () => {
    const sdkFixture = make();
    const env = path.join(sdkFixture.rootDirectory, "env");
    writeFile(
      path.join(env, "cmd_params.yaml"),
      `hpm-build-type:\n  custom: {on-board-ram: [SRAM, sdram], unknown: ignored}\n  blocked: {on-board-flash: qspi}\n  empty: null\n  ignored: {on-board-ram: '~'}\ncmake-build-type: [debug]\n`,
    );
    sdkFixture.configuration.sdkEnv = env;
    expect(
      getBuildOptions(sdkFixture.configuration, "hello_world").boards![0].buildTypes.map(
        (buildType) => buildType.hpmBuildType,
      ),
    ).toEqual(["custom", "empty", "ignored"]);
  });
  it("falls back on missing or invalid build-type YAML", () => {
    const sdkFixture = make();
    sdkFixture.configuration.sdkEnv = sdkFixture.rootDirectory;
    expect(
      getBuildOptions(sdkFixture.configuration, "hello_world").boards![0].buildTypes[0]
        .hpmBuildType,
    ).toBe("ram");
    writeFile(path.join(sdkFixture.rootDirectory, "cmd_params.yaml"), "[");
    expect(getBuildOptions(sdkFixture.configuration, "hello_world").boards).toHaveLength(1);
  });
  it("requires configured SDK and a source that exists", () => {
    const sdkFixture = make();
    sdkFixture.configuration.hpmSdk = "";
    expect(() => getBuildOptions(sdkFixture.configuration)).toThrow("not configured");
    sdkFixture.configuration.hpmSdk = sdkFixture.sdkDirectory;
    expect(() => getBuildOptions(sdkFixture.configuration)).toThrow("required");
    expect(() => getBuildOptions(sdkFixture.configuration, "missing")).toThrow("not found");
    const containerDirectory = path.join(sdkFixture.sdkDirectory, "samples", "container");
    fs.mkdirSync(containerDirectory);
    expect(() => getBuildOptions(sdkFixture.configuration, "container")).toThrow("CMakeLists.txt");
  });
  it("accepts app directories and preserves appDir priority in MCP core", () => {
    const sdkFixture = make();
    expect(
      getBuildOptions(sdkFixture.configuration, "missing", sdkFixture.applicationDirectory).appDir,
    ).toBe(sdkFixture.applicationDirectory);
  });
  it("resolves a multicore container and applies its linked project's dependencies", () => {
    const sdkFixture = make();
    sdkFixture.writeBoard("hpm6750evkmini", "board: {soc: HPM6750, feature: [board_led]}");
    const soc = path.join(sdkFixture.sdkDirectory, "soc", "hpm6700", "HPM6750");
    writeFile(path.join(soc, "soc_modules.list"), "HPMSOC_HAS_HPMSDK_MULTICORE=y");
    const container = path.join(sdkFixture.sdkDirectory, "samples", "multicore", "demo");
    const core0 = path.join(container, "core0");
    const core1 = path.join(container, "core1");
    writeFile(path.join(core0, "CMakeLists.txt"));
    writeFile(
      path.join(core0, "app.yaml"),
      "linked_project: {project_name: multicore/demo/core1, project_path: ../core1, build_type: sec_core_img}",
    );
    writeFile(path.join(core1, "CMakeLists.txt"));
    writeFile(path.join(core1, "app.yaml"), "dependency: [multicore]");
    const output = getBuildOptions(sdkFixture.configuration, "multicore/demo");
    expect(output.appDir).toBe(core0);
    expect(output.boards).toHaveLength(1);
    expect(output.boards![0].buildTypes.map((buildType) => buildType.hpmBuildType)).toContain(
      "sec_core_img",
    );
  });
});
describe("OpenOCD discovery priorities", () => {
  it("lists configs, selects exact board and single-core defaults", () => {
    const sdkFixture = make();
    const out = getOpenOCDConfig(sdkFixture.configuration, "hpm6750evkmini");
    expect(out.default).toEqual({
      probe: "ft2232",
      soc: "hpm6750-single-core",
      board: "hpm6750evkmini",
    });
    expect(out.socs?.map((option) => option.name)).toEqual([
      "hpm6750-dual-core",
      "hpm6750-single-core",
    ]);
  });
  it("uses YAML probe and multicore app dependency", () => {
    const sdkFixture = make();
    sdkFixture.writeBoard("hpm6750evkmini", "board: {soc: HPM6750, openocd-probe: cmsis_dap}");
    writeFile(path.join(sdkFixture.applicationDirectory, "app.yaml"), "dependency: [multicore]");
    expect(
      getOpenOCDConfig(sdkFixture.configuration, "hpm6750evkmini", "hello_world").default,
    ).toEqual({
      probe: "cmsis_dap",
      soc: "hpm6750-dual-core",
      board: "hpm6750evkmini",
    });
  });
  it("accepts custom board and app paths", () => {
    const sdkFixture = make();
    const dir = path.join(sdkFixture.rootDirectory, "custom");
    writeFile(path.join(dir, "custom.yaml"), "board: {soc: HPM6750}");
    writeFile(path.join(sdkFixture.applicationDirectory, "app.yaml"), "dependency: [multicore]");
    sdkFixture.writeOpenOCDConfig("boards", "hpm6750evk2");
    expect(
      getOpenOCDConfig(sdkFixture.configuration, dir, sdkFixture.applicationDirectory).default,
    ).toEqual({
      probe: "ft2232",
      soc: "hpm6750-dual-core",
      board: "hpm6750evk2",
    });
  });
  it("falls back to name prefix and single-core preference", () => {
    const sdkFixture = make();
    sdkFixture.writeOpenOCDConfig("soc", "hpm6750-csr");
    expect(getOpenOCDConfig(sdkFixture.configuration, "hpm67unknown").default.soc).toBe(
      "hpm6750-single-core",
    );
  });
  it("returns empty defaults without matches and null empty lists", () => {
    const sdkFixture = make();
    expect(getOpenOCDConfig(sdkFixture.configuration, "unknown").default.soc).toBe("");
    fs.rmSync(path.join(sdkFixture.sdkDirectory, "boards", "openocd", "soc"), {
      recursive: true,
    });
    expect(getOpenOCDConfig(sdkFixture.configuration, "hpm6750evkmini").socs).toBeNull();
  });
  it("rejects missing OpenOCD directory", () => {
    const sdkFixture = make();
    fs.rmSync(path.join(sdkFixture.sdkDirectory, "boards", "openocd"), { recursive: true });
    expect(() => getOpenOCDConfig(sdkFixture.configuration, "board")).toThrow("not found");
  });
});
