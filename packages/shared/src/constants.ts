export const PRODUCT_NAME = "DikaBuff";
export const PRODUCT_TAGLINE = "AI Coding Intelligence";
export const CLI_NAME = "dikabuff";
export const VERSION = "0.5.0";
export const CONFIG_DIR = ".dikabuff";
export const DEFAULT_HOST = "localhost";
/** OpenAI-compatible chat completions path appended to baseUrl. */
export const CHAT_COMPLETIONS_PATH = "/chat/completions";

export const MAX_AGENT_TURNS = 8;
export const MAX_CONTEXT_MESSAGES = 60;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 4096;

/** Tool categories, ordered for UI display. */
export const TOOL_CATEGORIES = ["filesystem", "terminal", "development", "analysis"] as const;

export const BANNER = String.raw`
  ____  _ _   _       _   __    __
 |  _ \(_) | | | __ _| |__\ \  / /
 | | | | | | | |/ _  | '_ \\ \/ /
 | |_| | | |_| | (_| | |_) \  /
 |____/|_|\___/ \__,_|_.__/ /_/
`;