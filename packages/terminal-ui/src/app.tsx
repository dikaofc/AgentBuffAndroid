import React from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { useTheme } from "./theme";
import { StatusBar } from "./components/StatusBar";
import { ChatPanel } from "./components/ChatPanel";
import { InputBox } from "./components/InputBox";
import { Sidebar } from "./components/Sidebar";
import { PermissionDialog } from "./components/PermissionDialog";
import { AskDialog } from "./components/AskDialog";
import { ActivityLine } from "./components/ActivityLine";
import { HelpPanel } from "./components/HelpPanel";
import { DiffViewer } from "./components/DiffViewer";
import { ModelSelector } from "./components/ModelSelector";
import { Welcome } from "./components/Welcome";
import type { AppViewState, RuntimeAdapter, SessionListEntry, StatusInfo } from "./types";
import { AGENT_MODES, PERMISSION_MODES } from "@dikabuff/shared";
import { THEME_IDS } from "@dikabuff/config";
import { ThemeProvider } from "./theme-provider";

// Memoized leaves: between stream deltas only the streaming message changes,
// so everything else bails out of re-rendering (no whole-tree repaint flicker).
const MemoStatusBar = React.memo(StatusBar);
const MemoInputBox = React.memo(InputBox);
const MemoWelcome = React.memo(Welcome);
const MemoSidebar = React.memo(Sidebar);
const MemoPermissionDialog = React.memo(PermissionDialog);
const MemoAskDialog = React.memo(AskDialog);
const MemoActivityLine = React.memo(ActivityLine);
const MemoHelpPanel = React.memo(HelpPanel);
const MemoDiffViewer = React.memo(DiffViewer);
const MemoModelSelector = React.memo(ModelSelector);

const EMPTY_STATE: AppViewState = {
  phase: "idle",
  messages: [],
  toolEvents: [],
  subagentTasks: [],
  tokenCount: 0,
  sidebarOpen: false,
  showStartScreen: true,
};

/**
 * AppShell — the whole Ink application. Renders from the RuntimeAdapter's
 * externally-stored state (UiStore) so the agent loop never blocks the UI.
 * Theme is owned here (from status.theme) so /theme hot-swaps the palette.
 */
export function AppShell({
  runtime,
  models,
  initialStatus,
}: {
  runtime: RuntimeAdapter;
  models: Array<{ id: string; label?: string }>;
  initialStatus: StatusInfo;
}): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // Finite guards: at boot process.stdout.columns can be NaN (Node/Termux quirk);
  // NaN ?? fallback is still NaN, which poisons every layout width/height below.
  const termCols = Number.isFinite(stdout.columns) ? stdout.columns : 80;
  const termRows = Number.isFinite(stdout.rows) ? stdout.rows : 30;
  const [state, setState] = React.useState<AppViewState>(EMPTY_STATE);
  const [status, setStatus] = React.useState<StatusInfo>(initialStatus);
  const [themeId, setThemeId] = React.useState(initialStatus.theme);
  const [input, setInput] = React.useState("");
  const [modelPicker, setModelPicker] = React.useState(false);
  const [diffText, setDiffText] = React.useState<{ title: string; content: string } | undefined>(undefined);
  const [sidebarData, setSidebarData] = React.useState<{ sessions: SessionListEntry[]; files: string[] }>({ sessions: [], files: [] });
  const [hint, setHint] = React.useState<string | undefined>();
  const [helpOpen, setHelpOpen] = React.useState(false);
  // Force a re-render whenever the terminal resizes (zoom in/out). Ink itself
  // re-renders on 'resize', but we also subscribe here so termCols/termRows
  // (computed from the live stdout getters) always propagate to the memoized
  // Header/StatusBar, keeping the layout responsive under load.
  const [, setTermTick] = React.useState(0);
  React.useEffect(() => {
    const onResize = (): void => setTermTick((t) => t + 1);
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const historyRef = React.useRef<string[]>([]);

  // Subscribe to the runtime store.
  React.useEffect(() => {
    const sync = (): void => {
      setState(runtime.getState());
      const next = runtime.getStatus();
      setStatus(next);
      if (next.theme && next.theme !== themeId) setThemeId(next.theme);
    };
    sync();
    return runtime.subscribe(sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // Elegant quit: exit 0 after flushing.
  const quit = React.useCallback((): void => {
    runtime.quit();
    exit();
  }, [runtime, exit]);

  React.useEffect(() => {
    if (state.sidebarOpen && sidebarData.sessions.length === 0) {
      void runtime.sessions().then((sessions) => {
        setSidebarData((d) => ({ ...d, sessions }));
      });
    }
  }, [state.sidebarOpen, sidebarData.sessions.length, runtime]);

  // Surface the diff produced by requestDiff (V key) as an overlay.
  React.useEffect(() => {
    if (state.diff) setDiffText(state.diff);
  }, [state.diff]);

  const busy = state.phase === "thinking" || state.phase === "streaming";
  const askOpen = !!state.ask;
  const dialogOpen = (state.phase === "awaiting-permission" && !!state.permission) || askOpen;
  const overlayOpen = dialogOpen || modelPicker || helpOpen;

  // Global keys (only when not in a modal).
  useInput((input, key) => {
    if (overlayOpen) return;
    if (key.ctrl && input.toLowerCase() === "q") return quit();
    if (key.ctrl && input.toLowerCase() === "m") return setModelPicker(true);
    if (key.escape) {
      if (diffText) return setDiffText(undefined);
      return runtime.toggleSidebar();
    }
    if (key.return && !key.shift && busy) return; // ignore submit while busy
  });

  const handleSubmit = React.useCallback(
    async (text: string): Promise<void> => {
      if (busy) return;
      historyRef.current.push(text);
      setHint(undefined);
      await runtime.submit(text);
    },
    [busy, runtime],
  );

  const handleCommand = React.useCallback(
    (cmd: string): void => {
      const [name, ...rest] = cmd.split(/\s+/);
      const setHintSafe = (h: string): void => setHint(h);
      switch (name) {
        case "/mode": {
          const mode = rest[0] as (typeof AGENT_MODES)[number] | undefined;
          if (mode && AGENT_MODES.includes(mode)) {
            void runtime.switchMode(mode).then(() => setHintSafe(`mode → ${mode}`));
          } else {
            setHintSafe(`usage: /mode ${AGENT_MODES.join("|")}`);
          }
          break;
        }
        case "/new":
          void runtime.newSession().then(() => {
            setInput("");
            setHintSafe("new session started");
          });
          break;
        case "/clear":
          void runtime.clearConversation().then(() => setHintSafe("conversation cleared (session kept)"));
          break;
        case "/compact":
          void runtime.compactConversation().then(() => setHintSafe("conversation compacted — context freed"));
          break;
        case "/resume": {
          const id = rest[0];
          if (id) void runtime.resumeSession(id);
          else setHintSafe("/resume <session-id> — see sidebar (Esc)");
          break;
        }
        case "/model":
          setModelPicker(true);
          break;
        case "/theme": {
          const theme = rest[0];
          if (theme && THEME_IDS.includes(theme as never)) {
            void runtime.setTheme(theme).then(() => setHintSafe(`theme → ${theme}`));
          } else {
            setHintSafe(`usage: /theme ${THEME_IDS.join("|")}`);
          }
          break;
        }
        case "/permissions": {
          const mode = rest[0];
          if (mode && PERMISSION_MODES.includes(mode as never)) {
            void runtime.setPermissionMode(mode).then(() => setHintSafe(`permission mode → ${mode}`));
          } else {
            setHintSafe(`usage: /permissions ${PERMISSION_MODES.join("|")}`);
          }
          break;
        }
        case "/cost":
          void runtime
            .getUsage()
            .then((u) =>
              setHintSafe(
                `tokens: ${u.totalTokens.toLocaleString()} (in ${u.inputTokens.toLocaleString()} / out ${u.outputTokens.toLocaleString()}) · cost: ${u.priced ? "$" + u.costUsd.toFixed(4) : "n/a (no pricing for this model)"}`,
              ),
            );
          break;
        case "/status":
          void runtime.getStatusInfo().then(setHintSafe);
          break;
        case "/memory":
          void runtime.getMemoryNotes().then((notes) => setHintSafe(notes || "no project memory notes yet"));
          break;
        case "/doctor":
          void runtime.getDoctorInfo().then(setHintSafe);
          break;
        case "/learn":
          void runtime.getLearnInfo().then((info) => setHintSafe(info.split("\n").join(" · ")));
          break;
        case "/review":
          setHintSafe("reviewing working tree…");
          void runtime.runReview();
          break;
        case "/help":
          setHelpOpen(true);
          setHintSafe("");
          break;
        case "/quit":
          quit();
          break;
        default:
          setHintSafe(`unknown command: ${cmd} — try /help`);
      }
      setInput("");
    },
    [runtime, quit],
  );

  const sidebarHandlers = React.useMemo(
    () => ({
      onResume: (id: string): void => {
        void runtime.resumeSession(id).then(() => {
          void runtime.sessions().then((sessions) => setSidebarData((d) => ({ ...d, sessions })));
        });
      },
      onClose: (): void => runtime.toggleSidebar(),
    }),
    [runtime],
  );

  const permissionHandlers = React.useMemo(
    () => ({
      onGrant: (): void => runtime.respondPermission(true),
      onDeny: (): void => runtime.respondPermission(false),
      onViewDiff: (): void => void runtime.requestDiff(),
    }),
    [runtime],
  );

  const modelHandlers = React.useMemo(
    () => ({
      onSelect: (id: string): void => {
        void runtime.setModel(id).then(() => setModelPicker(false));
      },
      onClose: (): void => setModelPicker(false),
    }),
    [runtime],
  );

  const closeDiff = React.useCallback((): void => setDiffText(undefined), []);

  return (
    <ThemeProvider themeId={themeId}>
      <Box flexDirection="column" width={termCols} height={termRows}>
        <Box flexGrow={1} flexDirection="row" overflowY="hidden">
          {state.sidebarOpen ? (
            <MemoSidebar data={sidebarData} onResume={sidebarHandlers.onResume} onClose={sidebarHandlers.onClose} />
          ) : null}
          <Box flexGrow={1} flexDirection="column">
            {state.showStartScreen && state.messages.length === 0 ? (
              <MemoWelcome status={status} />
            ) : (
              <ChatPanel messages={state.messages} toolEvents={state.toolEvents} subagentTasks={state.subagentTasks} error={state.error} />
            )}
            {state.ask ? (
              <MemoAskDialog
                ask={state.ask}
                onAnswer={(answer) => runtime.respondAsk(answer)}
                onReject={() => runtime.respondAsk(null)}
              />
            ) : null}
            {state.permission && !state.ask ? (
              <MemoPermissionDialog
                request={state.permission}
                onGrant={permissionHandlers.onGrant}
                onDeny={permissionHandlers.onDeny}
                onViewDiff={permissionHandlers.onViewDiff}
              />
            ) : null}
            {diffText ? <MemoDiffViewer title={diffText.title} content={diffText.content} onClose={closeDiff} /> : null}
          </Box>
        </Box>
        <MemoActivityLine activity={state.activity} />
        {helpOpen ? <MemoHelpPanel active={helpOpen} onClose={() => setHelpOpen(false)} /> : null}
        {modelPicker ? (
          <MemoModelSelector
            models={models}
            current={status.model}
            onSelect={modelHandlers.onSelect}
            active={modelPicker}
            onClose={modelHandlers.onClose}
          />
        ) : null}
        <MemoInputBox
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onCommand={handleCommand}
          history={historyRef.current}
          disabled={overlayOpen}
          pending={busy}
          hint={hint}
        />
        <MemoStatusBar status={status} phase={state.phase} columns={termCols} />
      </Box>
    </ThemeProvider>
  );
}
