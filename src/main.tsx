import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConsoleTerminal } from "./terminal";
import { backend, desktop } from "./backend";
import { executeCommand } from "./commands/registry";
import { defaults } from "./types";
import type { Settings } from "./types";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

function App() {
  const mount = useRef<HTMLDivElement>(null),
    terminal = useRef<ConsoleTerminal | null>(null);
  const settingsRef = useRef<Settings>(defaults);
  const [settings, setSettings] = useState(defaults),
    [status, setStatus] = useState("INITIALIZING"),
    [credential, setCredential] = useState(false),
    [time, setTime] = useState(new Date());
  const [session] = useState(() =>
    Math.random().toString(16).slice(2, 6).toUpperCase(),
  );
  const update = async (next: Settings) => {
    await backend.save(next);
    settingsRef.current = next;
    setSettings(next);
    terminal.current?.update(next);
  };
  useEffect(() => {
    if (!mount.current) return;
    let alive = true;
    const term: ConsoleTerminal = new ConsoleTerminal(
      mount.current,
      defaults,
      async (line): Promise<void> =>
        executeCommand(line, {
          terminal: term,
          settings: () => settingsRef.current,
          update,
          status: setStatus,
          credential: setCredential,
        }),
      () => {
        void backend.call("cancel_query").catch(() => {});
      },
    );
    terminal.current = term;
    void (async () => {
      try {
        const boot = await backend.bootstrap();
        if (!alive) return;
        settingsRef.current = boot.settings;
        setSettings(boot.settings);
        term.update(boot.settings);
        term.setHistory(boot.history);
        setCredential(boot.credential_configured);
        await term.write(
          "WEYLAND-YUTANI CORPORATION\nNETWORK SYSTEMS DIVISION\n\n",
          false,
        );
        await term.write("MU/TH/UR 6000\nINTERFACE 2037\n\n");
        await term.write(
          "TERMINAL INITIALIZATION\n────────────────────────────────────────────\n",
          false,
        );
        await term.write(
          `DISPLAY INTERFACE ............ ONLINE\n${desktop ? "RUST HOST BRIDGE .............. ONLINE\nLOCAL RECORD STORE ........... SQLITE\n" : "HOST BRIDGE .................. OFFLINE\nBROWSER PREVIEW ............... DISPLAY ONLY\n"}EXTERNAL INTELLIGENCE ......... ${boot.credential_configured ? "CREDENTIAL CONFIGURED" : "KEY REQUIRED"}\nACCESS POLICY ................ READ-ONLY\n`,
        );
        await term.write(
          `\n${boot.settings.mode === "nostromo" ? "NOSTROMO ARCHIVE / SIMULATION" : "OPERATOR SESSION / LOCAL SYSTEM"}\n\n`,
          false,
        );
        await term.write(
          "INTERFACE READY FOR INQUIRY.\n\nENTER HELP FOR INSTRUCTION INDEX.\n",
          false,
        );
        setStatus("AWAITING INPUT");
        await term.ready();
      } catch (error) {
        await term.write(`\nINITIALIZATION FAILURE\n${String(error)}\n`, false);
        setStatus("STORAGE FAULT");
        await term.ready();
      }
    })();
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      term.dispose();
      terminal.current = null;
    };
  }, []);
  const submit = (command: string) => void terminal.current?.submit(command);
  return (
    <main
      className={`station ${settings.phosphor} ${settings.effects ? "effects" : ""} ${settings.ratio ? "ratio" : ""}`}
    >
      <header className="station-header">
        <div className="corporate">
          <span className="emblem" aria-hidden="true">
            W<span>Y</span>
          </span>
          <span>
            WEYLAND-YUTANI
            <span className="corporate-caption">BUILDING BETTER WORLDS</span>
          </span>
        </div>
        <div className="station-name">
          NETWORK SYSTEMS DIVISION<span>PERSONAL INTERFACE / 6000 SERIES</span>
        </div>
      </header>
      <section className="housing" aria-label="MU/TH/UR terminal">
        <div className="hardware-top">
          <span className="model-name">
            MU<span>/</span>TH<span>/</span>UR <b>6000</b>
          </span>
          <span className="unit">
            <i /> TERMINAL 01 <span className="serial">S/N 1809–24609</span>
          </span>
        </div>
        <div className="screen-surround">
          <div className="screen">
            <div className="screen-heading">
              <span>INTERFACE 2037</span>
              <span>
                {settings.mode === "operator"
                  ? "OPERATOR ACCESS"
                  : "NOSTROMO / SIMULATION"}
              </span>
              <span className="screen-time">
                {time.toISOString().slice(11, 19)} UTC
              </span>
            </div>
            <div
              className="terminal-mount"
              ref={mount}
              aria-label="Interactive command terminal"
            />
            <div className="screen-footer">
              <span>
                <i /> {status}
              </span>
              <span>
                SESSION {session} <span className="footer-divider">/</span>{" "}
                {desktop ? "LOCAL HOST" : "BROWSER PREVIEW"}
              </span>
            </div>
            <div className="scanlines" aria-hidden="true" />
            <div className="glass" aria-hidden="true" />
          </div>
        </div>
        <nav className="hardware-bottom" aria-label="Terminal shortcuts">
          <div className="keys">
            <button onClick={() => submit("HELP")}>
              <kbd>01</kbd> INDEX
            </button>
            <button onClick={() => submit("STATUS")}>
              <kbd>02</kbd> STATUS
            </button>
            <button
              onClick={() =>
                submit(
                  `MODE ${settings.mode === "operator" ? "NOSTROMO" : "OPERATOR"}`,
                )
              }
            >
              <kbd>03</kbd> MODE
            </button>
            <button onClick={() => submit("SETTINGS")}>
              <kbd>04</kbd> CONFIG
            </button>
          </div>
          <button
            className="expand"
            onClick={() => void backend.fullscreen().catch(() => {})}
            aria-label="Toggle fullscreen"
          >
            ⛶ <span>FULL SCREEN</span>
          </button>
        </nav>
      </section>
      <footer className="station-footer">
        <span>
          <i className="power" /> SYSTEM ONLINE <span className="sep">/</span>{" "}
          {credential
            ? "INTELLIGENCE LINK CONFIGURED"
            : "INTELLIGENCE LINK UNCONFIGURED"}
        </span>
        <span>
          AUTHORIZED PERSONNEL ONLY <span className="footer-mark">▥</span>
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
