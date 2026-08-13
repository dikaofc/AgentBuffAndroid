import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigManager, absorbLegacyConfig, defaultConfig } from "../src/index";

let dir: string;
let home: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "dikabuff-config-"));
  home = path.join(dir, "home");
  mkdirSync(home, { recursive: true });
});

describe("ConfigManager", () => {
  it("creates default config and persists changes", () => {
    const cm = new ConfigManager(home);
    cm.setByPath("theme", "catppuccin");
    cm.setByPath("temperature", "0.7");
    cm.setByPath("permissions.tools.edit_file", '"ask"');
    cm.setByPath("plugins", '["my-plugin"]');
    const cm2 = new ConfigManager(home);
    expect(cm2.get().theme).toBe("catppuccin");
    expect(cm2.get().temperature).toBe(0.7);
    expect(cm2.get().permissions.tools.edit_file).toBe("ask");
    expect(cm2.get().plugins).toContain("my-plugin");
    expect(existsSync(path.join(home, "config.json"))).toBe(true);
  });

  it("absorbs legacy provider config", () => {
    const legacy = path.join(dir, "config.json");
    writeFileSync(legacy, JSON.stringify({
      providers: {
        ollama: {
          baseUrl: "http://localhost:7777/v1",
          apiKey: "sk-test",
          models: [{ id: "oc/deepseek-v4-flash-free" }],
        },
      },
    }));
    const config = defaultConfig("test");
    const { changed, notes } = absorbLegacyConfig(legacy, config);
    expect(changed).toBe(true);
    expect(config.baseUrl).toBe("http://localhost:7777/v1");
    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("oc/deepseek-v4-flash-free");
    expect(notes.length).toBeGreaterThan(0);
  });

  it("mask secrets when listing", () => {
    const cm = new ConfigManager(home);
    cm.setByPath("apiKey", "sk-super-secret");
    const listed = cm.list() as Record<string, unknown>;
    expect(JSON.stringify(listed)).not.toContain("sk-super-secret");
  });
});