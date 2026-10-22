import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runner, LogBuffer } from "../src/command/runner.js";
import { buildArgs } from "../src/command/arguments.js";
import { Store } from "../src/config/config-store.js";
import { defaultPath } from "../src/config/config-path.js";
import { buildROM } from "../src/operations/rom.js";
import { romSchemas } from "../src/mcp/schemas.js";
import { Service } from "../src/hpm-mfg-service.js";
import { createServer } from "../src/mcp/server.js";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

const dirs: string[] = [];

async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "hpmmfgctl-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
describe("Go migration contracts", () => {
  it("preserves config and replaces existing files", async () => {
    const store = new Store(join(await temp(), "config.json"));
    expect(await store.load()).toEqual({});
    await store.save({ mfgCmdPath: process.execPath });
    expect(await store.load()).toEqual({ mfgCmdPath: process.execPath });
    await store.save({});
    expect(await store.load()).toEqual({});
  });
  it("uses hpmsdkctl-style environment overrides and per-user paths", () => {
    expect(defaultPath({ HPMMFGCTL_CONFIG: "D:/custom/mfg.json" }, "win32", "C:/Users/me")).toBe(
      "D:/custom/mfg.json",
    );
    expect(defaultPath({ APPDATA: "C:/Users/me/AppData/Roaming" }, "win32", "C:/Users/me")).toBe(
      join("C:/Users/me/AppData/Roaming", "hpmicro", "hpmmfgctl", "config.json"),
    );
    expect(defaultPath({ XDG_CONFIG_HOME: "/config" }, "linux", "/home/me")).toBe(
      join("/config", "hpmicro", "hpmmfgctl", "config.json"),
    );
    expect(defaultPath({}, "darwin", "/Users/me")).toBe(
      join("/Users/me", "Library", "Application Support", "hpmicro", "hpmmfgctl", "config.json"),
    );
  });
  it("builds transport arguments without shell quoting", () => {
    expect(buildArgs({ transport: "serial", port: "COM11" }, 10000, "query-rte 0")).toEqual([
      "-p",
      "COM11,115200",
      "-t",
      "10000",
      "-r",
      "query-rte 0",
    ]);
    expect(buildArgs({ transport: "hid", path: "device path" }, 10000, "reset 0")[1]).toBe(
      "device path",
    );
    expect(() => buildArgs({ transport: "serial" }, 0, "reset 0")).toThrow();
  });
  it("validates command selectors and word arrays", async () => {
    const base = { targetId: "target-1" };
    expect((await buildROM("query_rte", { ...base, rteId: 4, argument: "65536" })).command).toBe(
      "query-rte 4 0x10000",
    );
    await expect(buildROM("query_rte", { ...base, rteId: 0, argument: "0" })).rejects.toThrow();
    await expect(buildROM("query_rte", { ...base, rteId: 4 })).rejects.toThrow();
    expect(
      (
        await buildROM("write_memory", {
          ...base,
          memoryId: "0",
          address: "16",
          data: "0x123,0Xffffffff",
        })
      ).command,
    ).toBe("write-memory 0x0 0x10 [[0x123,0Xffffffff]]");
    for (const data of ["[[0x1", "0x1]]", "0x100000000", "0x1, 0x2"]) {
      await expect(
        buildROM("write_memory", {
          ...base,
          memoryId: "0",
          address: "0",
          data,
        }),
      ).rejects.toThrow();
    }
    await expect(buildROM("erase_chip", { ...base, memoryId: "0x20000" })).rejects.toThrow();
    await expect(
      buildROM("read_memory", {
        ...base,
        memoryId: "0",
        address: "0",
        length: 65537,
      }),
    ).rejects.toThrow();
    await expect(buildROM("reset", { ...base, resetType: 3 })).rejects.toThrow();
  });
  it.each([
    ["config_rte", { peripheralMask: "1", baudRate: 115200 }, "config-rte 0x1 115200"],
    ["config_memory", { memoryId: "0x10000", address: "16" }, "config-memory 0x10000 0x10"],
    ["read_memory", { memoryId: "0", address: "16", length: 4 }, "read-memory 0x0 0x10 4"],
    [
      "verify_checksum",
      { memoryId: "1", address: "0", data: "[[0x1]]" },
      "verify-checksum 0x1 0x0 [[0x1]]",
    ],
    [
      "erase_region",
      { memoryId: "65536", address: "0", length: 4096 },
      "erase-region 0x10000 0x0 4096",
    ],
    ["erase_chip", { memoryId: "65537" }, "erase-chip 0x10001"],
    ["load_bootloader_firmware", { series: "HPM5300", signed: true }, "load-blfw HPM5300 1"],
    ["reset", { resetType: 2 }, "reset 2"],
  ] as const)("maps %s to the existing CMD syntax", async (name, input, expected) => {
    expect((await buildROM(name, { targetId: "target-1", ...input })).command).toBe(expected);
  });
  it("maps file variants without changing paths", async () => {
    const filePath = join(await temp(), "image.bin");
    await writeFile(filePath, "data");
    for (const name of ["write_memory_from_file", "verify_checksum_from_file"] as const) {
      const operation = name.startsWith("write") ? "write-memory" : "verify-checksum";
      expect(
        (
          await buildROM(name, {
            targetId: "target-1",
            memoryId: "0",
            address: "0",
            filePath,
          })
        ).command,
      ).toBe(`${operation} 0x0 0x0 ${filePath}`);
    }
    expect((await buildROM("load_image", { targetId: "target-1", filePath })).command).toBe(
      `load-image ${filePath}`,
    );
  });
  it("does not overwrite outputs without explicit permission", async () => {
    const filePath = join(await temp(), "read.bin");
    await writeFile(filePath, "original");
    const input = {
      targetId: "target-1",
      memoryId: "0",
      address: "0",
      length: 1,
      filePath,
    };
    await expect(buildROM("read_memory_to_file", input)).rejects.toThrow("already exists");
    expect(
      (await buildROM("read_memory_to_file", { ...input, overwrite: true })).command,
    ).toContain(filePath);
    await expect(
      buildROM("load_image", {
        targetId: "target-1",
        filePath: join(await temp(), "a b"),
      }),
    ).rejects.toThrow();
  });
  it("bounds logs and preserves both ends", () => {
    const log = new LogBuffer(128);
    log.write(Buffer.from("start" + "x".repeat(300) + "end"));
    expect(log.bytes().length).toBeLessThanOrEqual(128);
    expect(log.bytes().toString()).toMatch(
      /^start.*\n\[output truncated; middle omitted\]\n.*end$/s,
    );
  });
  it("handles failed processes, timeout, and queued cancellation", async () => {
    const runner = new Runner();
    expect((await runner.run(process.execPath, ["-e", "process.exit(2)"], 5000)).exitCode).toBe(2);
    expect((await runner.run(join(await temp(), "missing.exe"), [], 1000)).success).toBe(false);
    const first = runner.run(process.execPath, ["-e", "setTimeout(()=>{},5000)"], 200);
    const controller = new AbortController();
    const queued = runner.run(process.execPath, ["-e", "process.exit(0)"], 5000, controller.signal);
    controller.abort(new Error("cancelled while queued"));
    await expect(queued).rejects.toThrow("cancelled while queued");
    expect((await first).timedOut).toBe(true);
    expect((await runner.run(process.execPath, ["-e", "console.log('ok')"], 5000)).success).toBe(
      true,
    );
  });
  it("probes before storing targets and propagates probe failures", async () => {
    const runner = new Runner();
    let success = false;
    runner.run = async (_path, args) => {
      expect(args.at(-1)).toBe("query-rte 0");
      return {
        success,
        exitCode: success ? 0 : 1,
        timedOut: false,
        durationMs: 0,
        log: "probe",
      };
    };
    const store = new Store(join(await temp(), "config.json"));
    await store.save({ mfgCmdPath: process.execPath });
    const service = new Service(store, runner, {
      listSerial: async () => [],
      listHID: async () => [],
    });
    service.validate = async () => ({ compatible: true });
    expect(await service.create({ transport: "serial", port: "COM11" })).toMatchObject({
      success: false,
    });
    expect(service.list()).toEqual({ targets: [] });
    success = true;
    expect(await service.create({ transport: "serial", port: "COM11" })).toMatchObject({
      target: { targetId: "target-1" },
    });
    await expect(service.rom("reset", { targetId: "missing", resetType: 0 })).rejects.toThrow(
      "unknown targetId",
    );
  });
  it("refreshes validation, invalidates stale success, and retries failures", async () => {
    const path = join(
      await temp(),
      `hpm_manufacturing_cmd${process.platform === "win32" ? ".exe" : ""}`,
    );
    await writeFile(path, "fake", { mode: 0o700 });
    const runner = new Runner();
    let calls = 0;
    let working = true;
    runner.run = async (_path, args) => {
      calls++;
      const exitCode = !working || !args.length ? 1 : 0;
      return {
        success: exitCode === 0,
        exitCode,
        timedOut: false,
        durationMs: 0,
        log: args[0] === "--help" ? "-p -u -r -t -f" : "version",
      };
    };
    const service = new Service(new Store(join(await temp(), "config.json")), runner);
    expect((await service.validate(path)).compatible).toBe(true);
    await service.validate(path);
    expect(calls).toBe(3);
    working = false;
    expect((await service.validate(path, undefined, true)).compatible).toBe(false);
    expect((await service.validate(path)).compatible).toBe(false);
    expect(calls).toBe(5);
    working = true;
    expect((await service.validate(path)).compatible).toBe(true);
    await writeFile(path, "updated fake executable", { mode: 0o700 });
    await service.validate(path);
    expect(calls).toBe(11);
  });
  it("exposes all 22 tools and structured errors over MCP", async () => {
    const server = createServer(new Service(new Store(join(await temp(), "config.json"))));
    const client = new Client({ name: "test", version: "1" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(22);
      expect(tools.filter((tool) => tool.name.startsWith("rom."))).toHaveLength(
        Object.keys(romSchemas).length,
      );
      expect(
        tools.find((tool) => tool.name === "rom.read_memory_to_file")?.annotations,
      ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
      expect(await client.callTool({ name: "mfg.get", arguments: {} })).toMatchObject({
        structuredContent: {},
      });
      expect(
        await client.callTool({
          name: "rom.reset",
          arguments: { targetId: "missing", resetType: 0 },
        }),
      ).toMatchObject({
        isError: true,
        structuredContent: { error: "unknown targetId" },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
