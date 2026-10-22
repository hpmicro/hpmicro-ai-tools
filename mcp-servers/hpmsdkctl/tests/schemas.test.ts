import { expect, it } from "vitest";
import {
  buildOptionsOutputSchema,
  openOCDConfigOutputSchema,
  configDoctorOutputSchema,
  configListOutputSchema,
} from "../src/mcp/schemas.js";

it("preserves nullable build capability fields and required application paths", () => {
  expect(
    buildOptionsOutputSchema.safeParse({ ok: true, app_dir: "app", boards: null }).success,
  ).toBe(true);
  expect(
    buildOptionsOutputSchema.safeParse({
      ok: true,
      app_dir: "app",
      boards: [
        { name: "board", build_types: null },
        { name: "other", build_types: [{ hpm_build_type: "ram", cmake_build_types: null }] },
      ],
    }).success,
  ).toBe(true);
  expect(buildOptionsOutputSchema.safeParse({ ok: true, boards: null }).success).toBe(false);
  expect(
    buildOptionsOutputSchema.safeParse({ ok: true, app_dir: "app", boards: [{ name: "board" }] })
      .success,
  ).toBe(false);
});

it("preserves optional OpenOCD defaults without making them nullable", () => {
  const result = { ok: true, board_name: "board", probes: null, socs: null, boards: null };
  expect(openOCDConfigOutputSchema.safeParse(result).success).toBe(true);
  expect(openOCDConfigOutputSchema.safeParse({ ...result, default: null }).success).toBe(false);
  expect(
    openOCDConfigOutputSchema.safeParse({ ...result, default: { probe: "", soc: "", board: "" } })
      .success,
  ).toBe(true);
});

it("preserves optional diagnostic messages and unconstrained status strings", () => {
  expect(configDoctorOutputSchema.safeParse({ ok: false, checks: null }).success).toBe(true);
  expect(
    configDoctorOutputSchema.safeParse({
      ok: true,
      checks: [{ name: "setting", status: "custom-status" }],
    }).success,
  ).toBe(true);
  expect(configDoctorOutputSchema.safeParse({ ok: true, checks: [] }).success).toBe(true);
  expect(configDoctorOutputSchema.safeParse({ ok: true }).success).toBe(false);
});

it("preserves serialized configuration fields and optional executable paths", () => {
  const configuration = {
    hpm_sdk: "sdk",
    tools: { cmake: "cmake", ninja: "ninja", python: "python" },
    env: {},
  };
  expect(configListOutputSchema.safeParse({ ok: true, config: configuration }).success).toBe(true);
  expect(configListOutputSchema.safeParse({ ok: false, config: null }).success).toBe(true);
  expect(
    configListOutputSchema.safeParse({ ok: true, config: { ...configuration, hpm_sdk: 1 } })
      .success,
  ).toBe(false);
});
