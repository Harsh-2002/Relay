import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JsonStore, setDataDir, getDataDir } from "../../../src/utils/store.js";
import { getUploadDir } from "../../../src/utils/media.js";

describe("data dir resolution", () => {
  const originalDataDir = getDataDir();
  let dirA: string;
  let dirB: string;

  beforeEach(() => {
    dirA = mkdtempSync(join(tmpdir(), "relay-datadir-a-"));
    dirB = mkdtempSync(join(tmpdir(), "relay-datadir-b-"));
  });

  afterEach(() => {
    setDataDir(originalDataDir);
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });

  it("JsonStore resolves filePath lazily — late setDataDir is honoured", () => {
    // Simulate the real boot sequence: modules construct stores BEFORE
    // setDataDir runs. This is the exact scenario that pinned prod data to
    // the wrong folder in production until v2.5.8.
    const store = new JsonStore<{ n: number }>("regression.json", { n: 0 });

    setDataDir(dirA);
    store.save({ n: 1 });
    const fileA = join(dirA, "regression.json");
    expect(existsSync(fileA)).toBe(true);
    expect(JSON.parse(readFileSync(fileA, "utf-8"))).toEqual({ n: 1 });

    // Switch data dir — the SAME store instance must now target dirB.
    setDataDir(dirB);
    store.save({ n: 2 });
    const fileB = join(dirB, "regression.json");
    expect(existsSync(fileB)).toBe(true);
    expect(JSON.parse(readFileSync(fileB, "utf-8"))).toEqual({ n: 2 });

    // And dirA must be untouched since the switch.
    expect(JSON.parse(readFileSync(fileA, "utf-8"))).toEqual({ n: 1 });
  });

  it("JsonStore.load follows setDataDir too", () => {
    const store = new JsonStore<{ label: string }>("regression.json", { label: "default" });

    setDataDir(dirA);
    store.save({ label: "A" });

    setDataDir(dirB);
    store.save({ label: "B" });

    // Swap back — load must read from dirA now.
    setDataDir(dirA);
    expect(store.load()).toEqual({ label: "A" });

    setDataDir(dirB);
    expect(store.load()).toEqual({ label: "B" });
  });

  it("getUploadDir follows setDataDir", () => {
    setDataDir(dirA);
    expect(getUploadDir()).toBe(join(dirA, "uploads"));

    setDataDir(dirB);
    expect(getUploadDir()).toBe(join(dirB, "uploads"));
  });
});
