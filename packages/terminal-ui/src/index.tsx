import React from "react";
import { render, type Instance } from "ink";
import { AppShell } from "./app";
import type { RuntimeAdapter, StatusInfo } from "./types";

export interface DikabuffAppOptions {
  runtime: RuntimeAdapter;
  models: Array<{ id: string; label?: string }>;
  status: StatusInfo;
  onExit?: (code: number) => void;
}

/** Render the full DikaBuff terminal application (Ink). Theme lives in AppShell. */
export function launchApp(opts: DikabuffAppOptions): Instance {
  const instance = render(<AppShell runtime={opts.runtime} models={opts.models} initialStatus={opts.status} />, {
    exitOnCtrlC: false,
  });
  return instance;
}

export * from "./types";
export * from "./store";
export { AppShell } from "./app";
export { Markdown } from "./markdown/render";