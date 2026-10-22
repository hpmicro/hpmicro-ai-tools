import { afterEach, it, expect, describe } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createSdkFixture, writeFile, fakeRunner } from "./fixtures.js";
import * as buildOperations from "../src/operations/build.js";
import * as debug from "../src/operations/debug.js";
import * as localization from "../src/operations/localization.js";
import { run } from "../src/runner.js";
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
const valid = {
  sample: "hello_world",
  board: "hpm6750evkmini",
  hpmBuildType: "flash_xip",
  cmakeBuildType: "debug",
};
describe("CMake/Ninja command parity", () => {
  it("generates exact CMake argument order and default build dir", async () => {
    const sdkFixture = make();
    const fake = fakeRunner();
    const out = await buildOperations.generate(sdkFixture.configuration, valid, {}, fake.runner);
    const build = path.join(sdkFixture.applicationDirectory, "hpm6750evkmini_flash_xip_debug");
    expect(fake.calls[0].toolArguments).toEqual([
      "-GNinja",
      "-DBOARD=hpm6750evkmini",
      "-DHPM_BUILD_TYPE=flash_xip",
      "-DCMAKE_BUILD_TYPE=debug",
      "-B",
      build,
      sdkFixture.applicationDirectory,
    ]);
    expect(out.buildDir).toBe(build);
    expect(out.ok).toBe(true);
    expect(fake.calls[0].executionOptions.env?.HPM_SDK_BASE).toBe(sdkFixture.sdkDirectory);
  });
  it("resolves a multicore container to its primary core", async () => {
    const sdkFixture = make();
    const container = path.join(sdkFixture.sdkDirectory, "samples", "multicore", "demo");
    const core0 = path.join(container, "core0");
    writeFile(
      path.join(core0, "CMakeLists.txt"),
      "find_package(hpm-sdk REQUIRED HINTS $ENV{HPM_SDK_BASE})",
    );
    writeFile(
      path.join(core0, "app.yaml"),
      "linked_project: {project_name: multicore/demo/core1, project_path: ../core1, build_type: sec_core_img}",
    );
    writeFile(path.join(container, "core1", "CMakeLists.txt"));
    const fake = fakeRunner();
    const output = await buildOperations.generate(
      sdkFixture.configuration,
      { ...valid, sample: "multicore/demo" },
      {},
      fake.runner,
    );
    expect(fake.calls[0].toolArguments.at(-1)).toBe(core0);
    expect(output.appDir).toBe(core0);
    expect(output.buildDir).toBe(path.join(core0, "hpm6750evkmini_flash_xip_debug"));
  });
  it.each([
    ["source", { sample: "" }, "sample or appDir"],
    ["both", { appDir: "app" }, "cannot be used together"],
    ["board", { board: "" }, "board or customBoard"],
    ["both boards", { customBoard: "custom" }, "cannot be used together"],
    ["hpm type", { hpmBuildType: "" }, "hpmBuildType"],
    ["cmake type", { cmakeBuildType: "" }, "cmakeBuildType"],
  ])("rejects %s", async (_description, change, error) => {
    const sdkFixture = make();
    await expect(
      buildOperations.generate(sdkFixture.configuration, { ...valid, ...change }),
    ).rejects.toThrow(error);
  });
  it("accepts app dir and explicit build dir with cleaning", async () => {
    const sdkFixture = make();
    const build = path.join(sdkFixture.rootDirectory, "build");
    writeFile(path.join(build, "stale"), "old");
    await buildOperations.generate(
      sdkFixture.configuration,
      {
        ...valid,
        sample: undefined,
        appDir: sdkFixture.applicationDirectory,
        buildDir: build,
        clean: true,
      },
      {},
      fakeRunner().runner,
    );
    expect(fs.existsSync(path.join(build, "stale"))).toBe(false);
    expect(fs.statSync(build).isDirectory()).toBe(true);
  });
  it("validates CMake tokens and SDK board", async () => {
    const sdkFixture = make();
    writeFile(path.join(sdkFixture.applicationDirectory, "CMakeLists.txt"), "find_package(other)");
    await expect(buildOperations.generate(sdkFixture.configuration, valid)).rejects.toThrow(
      "does not look",
    );
    writeFile(
      path.join(sdkFixture.applicationDirectory, "CMakeLists.txt"),
      "find_package hpm-sdk HPM_SDK_BASE",
    );
    await expect(
      buildOperations.generate(sdkFixture.configuration, { ...valid, board: "missing" }),
    ).rejects.toThrow("not valid");
  });
  it("accepts custom board with correct YAML and linker file", async () => {
    const sdkFixture = make();
    const custom = path.join(sdkFixture.rootDirectory, "custom");
    const fake = fakeRunner();
    writeFile(path.join(custom, "CMakeLists.txt"));
    writeFile(path.join(custom, "custom.yaml"), "board: {soc: HPM6750}");
    const linker = writeFile(path.join(sdkFixture.rootDirectory, "custom.ld"));
    await buildOperations.generate(
      sdkFixture.configuration,
      {
        sample: valid.sample,
        hpmBuildType: valid.hpmBuildType,
        cmakeBuildType: valid.cmakeBuildType,
        customBoard: custom,
        customGccLinkerFile: linker,
      },
      {},
      fake.runner,
    );
    expect(fake.calls[0].toolArguments).toContain("-DBOARD=custom");
    expect(fake.calls[0].toolArguments).toContain(
      "-DBOARD_SEARCH_PATH=" + sdkFixture.rootDirectory,
    );
    expect(fake.calls[0].toolArguments).toContain("-DCUSTOM_GCC_LINKER_FILE=" + linker);
  });
  it.each(["missing", "file", "noCMake", "noYaml", "noSoC", "badYaml"])(
    "rejects invalid custom board %s",
    async (mode) => {
      const sdkFixture = make();
      const custom = path.join(sdkFixture.rootDirectory, "custom");
      if (mode === "file") {
        writeFile(custom);
      } else if (mode !== "missing") {
        fs.mkdirSync(custom);
        if (mode !== "noCMake") {
          writeFile(path.join(custom, "CMakeLists.txt"));
        }
        if (!["noCMake", "noYaml"].includes(mode)) {
          writeFile(path.join(custom, "custom.yaml"), mode === "badYaml" ? "[" : "board: {}");
        }
      }
      await expect(
        buildOperations.generate(sdkFixture.configuration, {
          sample: valid.sample,
          hpmBuildType: valid.hpmBuildType,
          cmakeBuildType: valid.cmakeBuildType,
          customBoard: custom,
        }),
      ).rejects.toThrow();
    },
  );
  it.each(["absent", "directory"])("rejects linker %s", async (mode) => {
    const sdkFixture = make();
    await expect(
      buildOperations.generate(sdkFixture.configuration, {
        ...valid,
        customGccLinkerFile:
          mode === "directory"
            ? sdkFixture.rootDirectory
            : path.join(sdkFixture.rootDirectory, "missing"),
      }),
    ).rejects.toThrow();
  });
  it.each([0, 8])("compile/localize return exit status %s", async (code) => {
    const sdkFixture = make();
    const build = path.join(sdkFixture.rootDirectory, "build");
    const fake = fakeRunner(code);
    writeFile(path.join(build, "build.ninja"));
    const out = await buildOperations.compile(sdkFixture.configuration, build, {}, fake.runner);
    expect(out.ok).toBe(code === 0);
    expect(fake.calls[0].executionOptions.cwd).toBe(build);
    expect(fake.calls[0].toolArguments).toEqual([]);
    await localization.localize(sdkFixture.configuration, build, {}, fake.runner);
    expect(fake.calls[1].toolArguments).toEqual(["localize_sdk"]);
  });
  it.each(["compile", "localize"] as const)("requires build.ninja for %s", async (name) => {
    const sdkFixture = make();
    const operation = name === "compile" ? buildOperations.compile : localization.localize;
    await expect(operation(sdkFixture.configuration, "")).rejects.toThrow("required");
    await expect(operation(sdkFixture.configuration, sdkFixture.rootDirectory)).rejects.toThrow(
      "build.ninja",
    );
  });
  it("prevents double localization using CMake cache", async () => {
    const sdkFixture = make();
    const build = path.join(sdkFixture.rootDirectory, "build");
    writeFile(path.join(build, "build.ninja"));
    writeFile(
      path.join(build, "CMakeCache.txt"),
      "CMAKE_HOME_DIRECTORY:INTERNAL=" + sdkFixture.applicationDirectory,
    );
    writeFile(path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.localized.bak"));
    await expect(localization.localize(sdkFixture.configuration, build)).rejects.toThrow(
      "already localized",
    );
  });
  it("restores original CMakeLists and replaces old reference backup", () => {
    const sdkFixture = make();
    writeFile(path.join(sdkFixture.applicationDirectory, "CMakeLists.txt"), "localized");
    writeFile(
      path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.localized.bak"),
      "original",
    );
    writeFile(
      path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.unlocalized.bak"),
      "previous",
    );
    expect(localization.unlocalize(sdkFixture.applicationDirectory)).toEqual({
      localizedDir: sdkFixture.applicationDirectory,
      ok: true,
    });
    expect(
      fs.readFileSync(path.join(sdkFixture.applicationDirectory, "CMakeLists.txt"), "utf8"),
    ).toBe("original");
    expect(
      fs.readFileSync(
        path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.unlocalized.bak"),
        "utf8",
      ),
    ).toBe("localized");
    expect(
      fs.existsSync(path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.localized.bak")),
    ).toBe(false);
  });
  it.each(["", "missing"])("rejects unlocalize %s", (dir) => {
    expect(() => localization.unlocalize(dir)).toThrow();
  });
});
describe("OpenOCD command parity", () => {
  const input = {
    probe: "ft2232",
    soc: "hpm6750-single-core",
    board: "hpm6750evkmini",
    file: "firmware image.elf",
  };
  it("escapes Tcl substitutions while preserving literal backticks and braces", () => {
    expect(debug.quoteCommandString("[evil $x].elf")).toBe(String.raw`"\[evil \$x\].elf"`);
    expect(debug.quoteCommandString("`literal` {path};.elf")).toBe('"`literal` {path};.elf"');
    expect(debug.quoteCommandString('folder\\file"\n.elf')).toBe(
      String.raw`"folder\\file\"\n.elf"`,
    );
  });

  it.each(["0; exit", "[exit]", "$address", "0x", "-1", "1 2", "0\nexit"])(
    "rejects unsafe or invalid flash address %s before starting a tool",
    async (address) => {
      const sdkFixture = make();
      const fake = fakeRunner();
      await expect(
        debug.flash(sdkFixture.configuration, { ...input, address }, {}, fake.runner),
      ).rejects.toThrow("address must be");
      expect(fake.calls).toEqual([]);
    },
  );

  it.each(["0", "1234", "0x80000400", "0XABCDEF"])("accepts numeric address %s", (address) => {
    expect(debug.programCommand("firmware.elf", address)).toContain(`verify ${address};`);
  });

  it("requires an explicit address for BIN firmware before starting a tool", async () => {
    const sdkFixture = make();
    const fake = fakeRunner();
    await expect(
      debug.flash(sdkFixture.configuration, { ...input, file: "firmware.BIN" }, {}, fake.runner),
    ).rejects.toThrow("address is required for BIN firmware");
    expect(fake.calls).toEqual([]);
  });

  it("accepts BIN firmware with an explicit address", () => {
    expect(debug.programCommand("firmware.bin", "0x80000400")).toContain(
      'program "firmware.bin" verify 0x80000400;',
    );
  });

  it.each(["flash", "gdbserver"] as const)(
    "requires configured OpenOCD for %s",
    async (operation) => {
      const sdkFixture = make();
      sdkFixture.configuration.tools.openocd = "";
      const fake = fakeRunner();
      await expect(
        debug[operation](sdkFixture.configuration, input, {}, fake.runner),
      ).rejects.toThrow("openocd is required");
      expect(fake.calls).toEqual([]);
    },
  );
  it.each([undefined, "0x80000400"])(
    "flash address=%s is passed without a default",
    async (address) => {
      const sdkFixture = make();
      const fake = fakeRunner();
      await debug.flash(sdkFixture.configuration, { ...input, address }, {}, fake.runner);
      expect(fake.calls[0].toolArguments).toEqual([
        "-s",
        path.join(sdkFixture.sdkDirectory, "boards", "openocd"),
        "-f",
        path.join(sdkFixture.sdkDirectory, "boards", "openocd", "probes", "ft2232.cfg"),
        "-f",
        path.join(sdkFixture.sdkDirectory, "boards", "openocd", "soc", "hpm6750-single-core.cfg"),
        "-f",
        path.join(sdkFixture.sdkDirectory, "boards", "openocd", "boards", "hpm6750evkmini.cfg"),
        "-c",
        `program "firmware image.elf" verify${address ? " " + address : ""}; reset_soc; exit`,
      ]);
    },
  );
  it.each(["probe", "soc", "board", "file"])("requires flash %s", async (key) => {
    const sdkFixture = make();
    await expect(debug.flash(sdkFixture.configuration, { ...input, [key]: "" })).rejects.toThrow(
      key + " is required",
    );
  });
  it.each(["probe", "soc", "board"])("requires gdb %s", async (key) => {
    const sdkFixture = make();
    await expect(
      debug.gdbserver(sdkFixture.configuration, { ...input, [key]: "" }),
    ).rejects.toThrow(key + " is required");
  });
  it("accepts direct cfg paths unchanged and rejects missing config names", () => {
    const sdkFixture = make();
    expect(
      debug.openOCDArgs(sdkFixture.configuration, {
        probe: "custom.cfg",
        soc: "custom.cfg",
        board: "custom.cfg",
      }),
    ).toContain("custom.cfg");
    expect(() =>
      debug.openOCDArgs(sdkFixture.configuration, { ...input, probe: "missing" }),
    ).toThrow("not found");
  });
  it("GDB uses same base args and propagates signal and exit status", async () => {
    const sdkFixture = make();
    const fake = fakeRunner(7);
    const signal = new AbortController().signal;
    const out = await debug.gdbserver(sdkFixture.configuration, input, { signal }, fake.runner);
    expect(fake.calls[0].toolArguments).not.toContain("-c");
    expect(fake.calls[0].executionOptions.signal).toBe(signal);
    expect(out.ok).toBe(false);
  });
  it("quotes firmware spaces, quotes and non-ASCII without shell expansion", () => {
    expect(debug.programCommand('中文 image".elf')).toBe(
      'program "中文 image\\".elf" verify; reset_soc; exit',
    );
  });
});
describe("real Node subprocess runner", () => {
  it("retains the requested working directory in the result", async () => {
    const sdkFixture = make();
    const result = await run(process.execPath, ["-e", ""], { cwd: sdkFixture.rootDirectory });
    expect(result.workDir).toBe(sdkFixture.rootDirectory);
  });
  it("captures stdout/stderr and nonzero exits without rejecting", async () => {
    const result = await run(process.execPath, [
      "-e",
      'process.stdout.write("out");process.stderr.write("err");process.exitCode=7',
    ]);
    expect(result).toMatchObject({ exitCode: 7, stdout: "out", stderr: "err" });
  });
  it("does not treat metacharacters as shell code", async () => {
    const value = 'space " 中文 ; $HOME';
    const result = await run(process.execPath, [
      "-e",
      "process.stdout.write(process.argv[1])",
      value,
    ]);
    expect(result.stdout).toBe(value);
  });
  it("rejects process startup failure", async () => {
    await expect(run("nonexistent-hpmsdkctl-test-executable", [])).rejects.toThrow();
  });
  it("cancels long-running subprocess", async () => {
    const controller = new AbortController();
    const pending = run(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
