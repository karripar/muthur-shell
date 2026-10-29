import { backend, desktop } from "../backend";
import type { ConsoleTerminal } from "../terminal";
import type { Settings } from "../types";
import { parse, pathArgument } from "./parser";
import { simulation } from "./simulation";

export interface CommandContext {
  terminal: ConsoleTerminal;
  settings: () => Settings;
  update: (s: Settings) => Promise<void>;
  status: (s: string) => void;
  credential: (configured: boolean) => void;
}
const help = `INTERFACE 2037 / COMMAND REFERENCE

HOST OPERATIONS
  STATUS          CPU, MEMORY AND SYSTEM UPTIME
  DIAGNOSTICS     READ-ONLY RESOURCE HEALTH CHECK
  SYSTEM          OPERATING SYSTEM AND HARDWARE
  PROCESSES       PROCESS INVENTORY       [PS]
  NETWORK         INTERFACES AND ADDRESSES
  DISKS           MOUNTED VOLUMES
  DOCKER          CONTAINER INVENTORY
  FILES [PATH]    APPROVED DIRECTORY LIST [LS]
  FILES GRANT     APPROVE VIA NATIVE DIRECTORY PICKER
  FILES REVOKE PATH   REMOVE AN APPROVAL
  READ PATH       INSPECT UTF-8 TEXT       [CAT]

INTELLIGENCE
  QUERY TEXT      OPENAI RESPONSES         [ASK]
  KEY SET         IMPORT KEY TO OS CREDENTIAL STORE
  KEY DELETE      REMOVE STORED KEY
  FORGET          CLEAR IN-MEMORY AI CONTEXT

INTERFACE
  MODE OPERATOR | NOSTROMO
  SETTINGS        DISPLAY CONFIGURATION   [CONFIG]
  SETTINGS NAME VALUE
  HISTORY [CLEAR] COMMAND LOG (LOCAL SQLITE)
  CLEAR           CLEAR DISPLAY           [CLS]
  FULLSCREEN      TOGGLE IMMERSIVE VIEW    [F11]

NOSTROMO ARCHIVE / SIMULATED
  CREW            PERSONNEL MANIFEST
  NAVIGATION      FLIGHT RECORDS
  DIRECTIVE [937] CLASSIFIED FICTIONAL ARCHIVE

TAB: COMPLETE   UP/DOWN: HISTORY   CTRL+C: CANCEL
SHIFT+PAGE UP: SCROLL   CTRL+U: ERASE INPUT
NO ARBITRARY SHELL EXECUTION IS AVAILABLE.`;

function format(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value))
    return value.length
      ? value
          .map(
            (v, i) =>
              `${pad}[${String(i + 1).padStart(2, "0")}]\n${format(v, depth + 1)}`,
          )
          .join("\n")
      : `${pad}(NONE)`;
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, v]) => {
        const label = key.replaceAll("_", " ").toUpperCase();
        if (v && typeof v === "object")
          return `${pad}${label}\n${format(v, depth + 1)}`;
        if (key === "text")
          return `${pad}FILE CONTENT / UNTRUSTED\n${String(v)}`;
        return `${pad}${label.padEnd(Math.max(16, 24 - depth * 2))} ${v ?? "UNAVAILABLE"}`;
      })
      .join("\n");
  return pad + String(value);
}
export async function executeCommand(line: string, ctx: CommandContext) {
  const { name, args } = parse(line),
    term = ctx.terminal;
  ctx.status("PROCESSING");
  try {
    if (desktop && !/^KEY\b/.test(name))
      await backend.call("record_history", { command: line });
    const write = (text: string) => term.write("\n" + text + "\n");
    const s = ctx.settings();
    if (s.mode === "nostromo") {
      const response = simulation(name, args);
      if (response) {
        await write(response);
        return;
      }
    }
    const host: Record<string, string> = {
      STATUS: "status",
      DIAGNOSTICS: "diagnostics",
      SYSTEM: "system",
      PROCESSES: "processes",
      NETWORK: "network",
      DISKS: "disks",
      DOCKER: "docker",
    };
    if (host[name]) {
      await write(
        "[ VERIFIED HOST / READ-ONLY ]\n\n" +
          format(
            await backend.call("run_tool", { name: host[name], args: {} }),
          ),
      );
      return;
    }
    switch (name) {
      case "HELP":
        await write(help);
        break;
      case "CLEAR":
        term.clear();
        break;
      case "MODE": {
        const mode = args.toLowerCase();
        if (mode !== "operator" && mode !== "nostromo")
          throw Error("USE: MODE OPERATOR | NOSTROMO");
        await backend.call("reset_conversation").catch((e) => {
          if (desktop) throw e;
        });
        await ctx.update({ ...s, mode });
        await write(
          mode === "nostromo"
            ? "NOSTROMO ARCHIVE CONNECTED.\nSIMULATION ACTIVE. SHIP RECORDS ARE FICTIONAL.\nHOST COMMANDS SYSTEM / PROCESSES / NETWORK REMAIN REAL."
            : "OPERATOR MODE ACTIVE.\nHOST TOOLS RETURN VERIFIED LOCAL DATA.",
        );
        break;
      }
      case "SETTINGS": {
        if (!args) {
          await write(
            format(s) +
              "\n\nSETTINGS NAME VALUE\nPHOSPHOR green|amber   EFFECTS on|off   SOUND on|off\nSPEED 0..30 (ms)   RATIO on|off   CONTEXT_TURNS 1..20\nMODEL <model-id>   AI_TOOLS on|off\nAI_TOOLS allows local data transfer after native confirmation.",
          );
          break;
        }
        const [key, ...rest] = args.split(/\s+/);
        const value = rest.join(" ");
        const k = key.toLowerCase();
        const next = { ...s };
        if (["effects", "sound", "ratio", "ai_tools"].includes(k)) {
          if (!["on", "off"].includes(value.toLowerCase()))
            throw Error("VALUE MUST BE on OR off");
          Object.assign(next, { [k]: value.toLowerCase() === "on" });
        } else if (k === "speed" || k === "context_turns") {
          const n = Number(value);
          if (
            !/^\d+$/.test(value) ||
            !Number.isInteger(n) ||
            (k === "speed" ? n < 0 || n > 30 : n < 1 || n > 20)
          )
            throw Error("VALUE OUTSIDE ALLOWED RANGE");
          Object.assign(next, { [k]: n });
        } else if (
          k === "phosphor" &&
          ["green", "amber"].includes(value.toLowerCase())
        )
          next.phosphor = value.toLowerCase() as "green" | "amber";
        else if (k === "model" && /^[a-zA-Z0-9._-]{1,100}$/.test(value))
          next.model = value;
        else throw Error("UNKNOWN SETTING OR INVALID VALUE. ENTER SETTINGS.");
        await ctx.update(next);
        await write("CONFIGURATION COMMITTED.");
        break;
      }
      case "FILES": {
        if (args.toUpperCase() === "GRANT") {
          await write("SELECT A DIRECTORY TO APPROVE FOR READ-ONLY ACCESS.");
          await write(
            "APPROVED ROOTS\n" + format(await backend.call("choose_directory")),
          );
        } else if (/^REVOKE\s/i.test(args)) {
          await backend.call("revoke_directory", {
            path: pathArgument(args.replace(/^REVOKE\s+/i, "")),
          });
          await write("DIRECTORY APPROVAL REVOKED.");
        } else
          await write(
            "[ VERIFIED HOST / APPROVED FILESYSTEM ]\n\n" +
              format(
                await backend.call("run_tool", {
                  name: "files",
                  args: { path: pathArgument(args) },
                }),
              ),
          );
        break;
      }
      case "READ":
        if (!args) throw Error('USE: READ "PATH TO FILE"');
        else
          await write(
            format(
              await backend.call("run_tool", {
                name: "read_file",
                args: { path: pathArgument(args) },
              }),
            ),
          );
        break;
      case "QUERY": {
        if (!args) throw Error("USE: QUERY <QUESTION>");
        await write(
          "MU/TH/UR / EXTERNAL INTELLIGENCE LINK\nMODEL OUTPUT IS UNVERIFIED UNTIL CORROBORATED.\n",
        );
        await backend.query(args, (event) => {
          if (event.kind === "delta") void term.write(event.text, false);
          else if (event.kind === "tool")
            void term.write(
              `\n[ READ-ONLY TOOL / ${event.text.toUpperCase()} ]\n`,
              false,
            );
        });
        await term.write("\n", false);
        break;
      }
      case "HISTORY":
        if (args.toUpperCase() === "CLEAR") {
          await backend.call("clear_history");
          term.setHistory([]);
          await write("LOCAL COMMAND HISTORY PURGED.");
        } else
          await write(
            term
              .getHistory()
              .map((c, i) => `${String(i + 1).padStart(4, "0")}  ${c}`)
              .join("\n") || "NO RECORDS.",
          );
        break;
      case "KEY": {
        if (args.toUpperCase() === "SET") {
          await write(
            "SELECT A UTF-8 FILE CONTAINING ONLY YOUR OPENAI API KEY.\nRUST IMPORTS DIRECTLY INTO THE OS CREDENTIAL STORE.\nTHE SOURCE FILE IS NOT DELETED. REMOVE IT AFTER IMPORT.",
          );
          const saved = await backend.call<boolean>("set_credential");
          if (saved) ctx.credential(true);
          await write(
            saved
              ? "CREDENTIAL SECURED. KEY NEVER RETURNED TO WEBVIEW."
              : "IMPORT CANCELLED.",
          );
        } else if (args.toUpperCase() === "DELETE") {
          await backend.call("delete_credential");
          ctx.credential(false);
          await write("OS CREDENTIAL REMOVED.");
        } else
          throw Error(
            "USE: KEY SET | KEY DELETE. NEVER TYPE YOUR KEY INTO THE TERMINAL.",
          );
        break;
      }
      case "FORGET":
        await backend.call("reset_conversation");
        await write("VOLATILE AI CONTEXT PURGED.");
        break;
      case "FULLSCREEN":
        await backend.fullscreen();
        break;
      case "CREW":
      case "NAVIGATION":
      case "DIRECTIVE":
        await write(
          "FICTIONAL ARCHIVE NOT MOUNTED.\nENTER MODE NOSTROMO TO ACCESS SIMULATED RECORDS.",
        );
        break;
      default:
        throw Error(
          `UNRECOGNIZED INSTRUCTION: ${name}\nENTER HELP FOR COMMAND REFERENCE.`,
        );
    }
  } finally {
    ctx.status("AWAITING INPUT");
  }
}
