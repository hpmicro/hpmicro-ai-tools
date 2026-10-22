import { isAbsolute } from "node:path";
import { z as zod } from "zod";

/** Management tools without input parameters. */
export const emptyInputSchema = zod.object({});

/** Installed CMD path; compatibility validation happens before persistence. */
export const cmdSetSchema = zod.object({
  path: zod
    .string()
    .describe(
      "Absolute path to hpm_manufacturing_cmd.exe on Windows or hpm_manufacturing_cmd on Linux",
    ),
});

const transportSchema = zod.enum(["serial", "hid"]).describe("Device transport");
const vendorIdSchema = zod
  .number()
  .int()
  .min(0)
  .max(65535)
  .optional()
  .describe("USB vendor ID; defaults to 13495 (0x34B7)");
const productIdSchema = zod
  .number()
  .int()
  .min(0)
  .max(65535)
  .optional()
  .describe("USB product ID; zero matches any PID");

/** OS discovery filters; serial discovery ignores USB vendor and product IDs. */
export const deviceDiscoverSchema = zod.object({
  transport: transportSchema,
  vid: vendorIdSchema,
  pid: productIdSchema,
});

/** Connection settings used to probe and register a process-local ROM target. */
export const targetCreateSchema = zod.object({
  transport: transportSchema,
  vid: vendorIdSchema,
  pid: productIdSchema,
  port: zod.string().min(1).optional().describe("Serial port; omitted requires exactly one device"),
  baudRate: zod
    .number()
    .int()
    .min(0)
    .max(0xffffffff)
    .optional()
    .describe("Serial baud rate; zero defaults to 115200"),
  path: zod
    .string()
    .min(1)
    .optional()
    .describe("HID interface path; omitted requires exactly one accessible device"),
  timeoutMs: zod
    .number()
    .int()
    .min(1000)
    .max(1800000)
    .optional()
    .describe("Probe timeout; defaults to 10000 ms"),
});

/** Registered target selected for deletion. */
export const targetDeleteSchema = zod.object({
  targetId: zod.string().min(1).describe("Registered target ID"),
});

/** Unsigned 32-bit value accepted in decimal or hexadecimal form. */
const unsignedNumberSchema = zod
  .string()
  .regex(/^(?:0[xX][0-9a-fA-F]+|[0-9]+)$/)
  .refine((value) => Number(value) <= 0xffffffff, "Must be a 32-bit unsigned number");
/** CMD memory selectors: ILM, DLM, XPI0/1 NOR, OTP, and SDXC0/1. */
const allMemoryIds = [0, 1, 0x10000, 0x10001, 0x20000, 0x30000, 0x30001];
/** Human-readable names retained in the MCP input schema for each allowed selector. */
const memoryNames: Record<number, string> = {
  0: "ILM",
  1: "DLM",
  0x10000: "XPI0 NOR",
  0x10001: "XPI1 NOR",
  0x20000: "OTP",
  0x30000: "SDXC0",
  0x30001: "SDXC1",
};
/** Restricts decimal/hexadecimal selectors to the memories supported by an operation. */
const memoryIdSchema = (ids: number[]) =>
  unsignedNumberSchema
    .refine((value) => ids.includes(Number(value)), "Unsupported memory ID")
    .describe(
      `Memory ID as a decimal or hexadecimal string: ${ids
        .map((id) => `0x${id.toString(16)} (${memoryNames[id]})`)
        .join(", ")}`,
    );
/** Process-local target and optional CMD deadline shared by every ROM request. */
const baseROMShape = {
  /** Returned by device.create; targets must be recreated after the MCP process restarts. */
  targetId: zod
    .string()
    .min(1)
    .describe("Target ID returned by device.create; valid only in this MCP process"),
  /** 1000-1800000 ms; defaults: erase_chip 1800000, erase/write/file-read/load 600000, others 30000. */
  timeoutMs: zod
    .number()
    .int()
    .min(1000)
    .max(1800000)
    .optional()
    .describe(
      "CMD timeout, 1000-1800000 ms; defaults: erase_chip 1800000; erase/write/read_memory_to_file/load 600000; other operations 30000",
    ),
};
/** Transfer address; CMD interprets this as a sector index for eMMC on SDXC. */
const address = unsignedNumberSchema.describe(
  "32-bit decimal or hexadecimal string: memory address, or sector index for eMMC on SDXC0/SDXC1",
);
/** Wrapper requires absolute paths; CMD's internal ROM parser cannot safely accept whitespace. */
const path = zod
  .string()
  .min(1)
  .refine((value) => {
    // CMD splits ROM text internally; reject whitespace and control bytes before invocation.
    // eslint-disable-next-line no-control-regex
    return isAbsolute(value) && !/[\s\x00-\x1f\x7f]/u.test(value);
  }, "File path must be absolute and contain no whitespace or control characters")
  .describe("Absolute file path without whitespace or control characters");
/** Each hexadecimal word contributes four bytes; buildROM adds omitted double brackets. */
const data = zod
  .string()
  .regex(/^(?:\[\[)?0[xX][0-9a-fA-F]{1,8}(?:,0[xX][0-9a-fA-F]{1,8})*(?:\]\])?$/)
  .refine((value) => value.startsWith("[[") === value.endsWith("]]"), "Brackets must be paired")
  .describe(
    "Comma-separated hexadecimal words, four bytes per word; optional paired [[...]] brackets; no whitespace, e.g. [[0xfcf90001,0x05,0x0,0x0]]",
  );
/** Byte count, including when an eMMC transfer starts at a sector index. */
const length = zod.number().int().min(1).max(0xffffffff).describe("Positive byte length");
/** All readable/writable memory selectors and their transfer address. */
const memoryAddressShape = {
  /** Select ILM, DLM, XPI0/1 NOR, OTP, or SDXC0/1 using a decimal/hex string. */
  memoryId: memoryIdSchema(allMemoryIds),
  /** Memory address, or eMMC sector index for transfers through SDXC. */
  address,
};
/** Checksum verification supports all transfer memories except OTP. */
const checksumMemoryShape = {
  ...memoryAddressShape,
  /** OTP is not supported by verify-checksum. */
  memoryId: memoryIdSchema(allMemoryIds.filter((id) => id !== 0x20000)),
};
/** Erase operations are limited to XPI0 NOR and XPI1 NOR. */
const norMemoryShape = {
  ...memoryAddressShape,
  /** Only external XPI NOR devices support erase-region and erase-chip. */
  memoryId: memoryIdSchema([0x10000, 0x10001]),
};

/**
 * ROM inputs aligned with hpm_manufacturing_tool's build/debug/console_instruction.
 * Shared shapes document inherited target, timeout, memory, and address fields.
 * File/array variants expose the same CMD command as separate MCP tools.
 * Image creation and production package export are separate CMD modes, outside this ROM group.
 */
export const romSchemas = {
  /** query-rte <id> [<param>]: query ROM features, memory properties, or supported commands. */
  query_rte: zod.object({
    ...baseROMShape,
    /** 0: ROM features; 4: selected memory properties; 5: supported command list. */
    rteId: zod
      .union([zod.literal(0), zod.literal(4), zod.literal(5)])
      .describe("0: ROM features; 4: memory properties; 5: command list"),
    /** Required for rteId=4 and forbidden otherwise; buildROM enforces this dependency. */
    argument: memoryIdSchema(allMemoryIds)
      .optional()
      .describe(
        "Required only for rteId=4; forbidden for 0/5. Decimal/hex string: 0 ILM, 1 DLM, 0x10000 XPI0 NOR, 0x10001 XPI1 NOR, 0x20000 OTP, 0x30000 SDXC0, 0x30001 SDXC1",
      ),
  }),
  /**
   * config-rte <peripheral-mask> <baud-rate>: existing runtime serial configuration tool.
   * Not listed in the reference console_instruction; mask bit meanings are not documented there.
   */
  config_rte: zod.object({
    ...baseROMShape,
    /** Unsigned 32-bit decimal/hex string; supported peripheral bits depend on the ROM/CMD. */
    peripheralMask: unsignedNumberSchema.describe("Serial peripheral mask"),
    /** Requested serial baud rate, 1-4294967295; distinct from target connection settings. */
    baudRate: zod.number().int().min(1).max(0xffffffff).describe("Serial baud rate"),
  }),
  /**
   * config-memory <memory-id> <config-address>: configure external NOR or SDXC memory.
   * Write the configuration data into device memory before passing its address here.
   */
  config_memory: zod.object({
    ...baseROMShape,
    ...memoryAddressShape,
    /** External memories only: XPI0/1 NOR or SDXC0/1. */
    memoryId: memoryIdSchema([0x10000, 0x10001, 0x30000, 0x30001]),
    /** Address of configuration data in device memory, rather than the transfer destination. */
    address: unsignedNumberSchema.describe(
      "32-bit decimal or hexadecimal string: address of memory configuration data already written into device memory; not a transfer destination or sector index",
    ),
  }),
  /** read-memory without a file: read data into CMD output; wrapper caps requests at 65536 bytes. */
  read_memory: zod.object({
    ...baseROMShape,
    ...memoryAddressShape,
    /** Positive byte count; the 64 KiB cap is a wrapper constraint, not a documented ROM limit. */
    length: length.max(65536).describe("Byte count, 1-65536; wrapper limit for inline CMD output"),
  }),
  /** read-memory with a file: read bytes from the device into a local output file. */
  read_memory_to_file: zod.object({
    ...baseROMShape,
    ...memoryAddressShape,
    /** Positive byte count, 1-4294967295. */
    length,
    /** Output file; parent directory must exist. Existing files require overwrite=true. */
    filePath: path.describe(
      "Absolute output file path without whitespace/control characters; parent directory must exist",
    ),
    /** Wrapper-only permission flag; not passed as a ROM command argument. */
    overwrite: zod
      .boolean()
      .optional()
      .describe("Allow overwriting an existing output file; defaults to false"),
  }),
  /** write-memory with an array: write four-byte hex words; can also program OTP. */
  write_memory: zod.object({ ...baseROMShape, ...memoryAddressShape, data }),
  /** write-memory with a file: write an existing local regular file into the selected memory. */
  write_memory_from_file: zod.object({
    ...baseROMShape,
    ...memoryAddressShape,
    /** Existing input file; the file's contents supply the data and transfer length. */
    filePath: path.describe(
      "Absolute existing input file path without whitespace/control characters",
    ),
  }),
  /** verify-checksum with an array: verify device data against four-byte hex words; excludes OTP. */
  verify_checksum: zod.object({ ...baseROMShape, ...checksumMemoryShape, data }),
  /** verify-checksum with a file: verify device data against an existing local file; excludes OTP. */
  verify_checksum_from_file: zod.object({
    ...baseROMShape,
    ...checksumMemoryShape,
    /** Existing regular file containing the expected data. */
    filePath: path.describe(
      "Absolute existing reference file path without whitespace/control characters",
    ),
  }),
  /** erase-region <memory-id> <address> <byte-count>: erase a region of XPI0/1 NOR. */
  erase_region: zod.object({ ...baseROMShape, ...norMemoryShape, length }),
  /** erase-chip <memory-id>: erase the entire selected XPI0/1 NOR device. */
  erase_chip: zod.object({ ...baseROMShape, memoryId: norMemoryShape.memoryId }),
  /** load-image <image-path>: load an image into a connected device supporting serial boot. */
  load_image: zod.object({
    ...baseROMShape,
    /** Existing image file; this command loads an image rather than creating one. */
    filePath: path.describe(
      "Absolute existing image path without whitespace/control characters; device must support serial boot",
    ),
  }),
  /**
   * load-blfw <soc-series> <isSigned>: CMD wrapper around load-image for bootloader firmware.
   * Device resets automatically on success. Combining load-blfw and load-image for bootloader
   * firmware in the same operation may fail according to console_instruction.
   */
  load_bootloader_firmware: zod.object({
    ...baseROMShape,
    /** CMD-supported series token, e.g. HPM6700, HPM6400, HPM5300, HPM6200, or HPM6300. */
    series: zod
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .describe(
        "SoC series supported by installed CMD, e.g. HPM6700, HPM6400, HPM5300, HPM6200, HPM6300; device automatically resets after loading",
      ),
    /** Maps false to isSigned=0 (unsigned) and true to isSigned=1 (signed). */
    signed: zod.boolean().describe("false: unsigned firmware (0); true: signed firmware (1)"),
  }),
  /** reset <reset-type>: reset the connected device using the selected reset mode. */
  reset: zod.object({
    ...baseROMShape,
    /** 0: default reset; 1: hot reset; 2: cold reset. */
    resetType: zod.number().int().min(0).max(2).describe("0: default; 1: hot; 2: cold reset"),
  }),
};
