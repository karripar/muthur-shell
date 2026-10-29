import { Terminal } from "@xterm/xterm";
import { completion, safeText } from "./commands/parser";
import { TerminalAudio } from "./audio";
import type { Settings } from "./types";
import { backend } from "./backend";

export class ConsoleTerminal {
  readonly term: Terminal;
  readonly audio = new TerminalAudio();
  private observer: ResizeObserver;
  private line = "";
  private cursor = 0;
  private history: string[] = [];
  private index = 0;
  private draft = "";
  private busy = true;
  private disposed = false;
  private cancelled = false;
  private pending: Promise<void> = Promise.resolve();
  private settings: Settings;
  constructor(
    element: HTMLElement,
    settings: Settings,
    private execute: (line: string) => Promise<void>,
    private cancel: () => void,
  ) {
    this.settings = settings;
    this.term = new Terminal({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 16,
      lineHeight: 1.45,
      letterSpacing: 1.1,
      cursorStyle: "block",
      cursorBlink: true,
      scrollback: 4000,
      allowProposedApi: false,
      allowTransparency: false,
      convertEol: true,
      screenReaderMode: true,
      theme: {
        background: "#030603",
        foreground: "#a5d78c",
        cursor: "#b7e69f",
        selectionBackground: "#34502c",
        black: "#030603",
        green: "#a5d78c",
        brightGreen: "#d3f8bc",
      },
    });
    this.term.open(element);
    const fit = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = '16px "Courier New"';
      const width = context.measureText("W").width + 1.1;
      this.term.resize(
        Math.max(20, Math.floor((element.clientWidth - 16) / width)),
        Math.max(3, Math.floor(element.clientHeight / (16 * 1.45))),
      );
    };
    fit();
    this.observer = new ResizeObserver(fit);
    this.observer.observe(element);
    this.term.onData((data) => this.input(data));
    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.key === "F11") {
        e.preventDefault();
        void backend.fullscreen().catch(() => {});
        return false;
      }
      if (
        e.type === "keydown" &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "c" &&
        this.term.hasSelection()
      ) {
        void navigator.clipboard?.writeText(this.term.getSelection()).catch(() => {});
        return false;
      }
      return true;
    });
    this.update(settings);
  }
  update(settings: Settings) {
    this.settings = settings;
    const amber = settings.phosphor === "amber";
    this.term.options.theme = {
      background: "#030603",
      foreground: amber ? "#e6bc78" : "#a5d78c",
      cursor: amber ? "#ffda9b" : "#c3eaaa",
      selectionBackground: amber ? "#544126" : "#34502c",
    };
  }
  setHistory(history: string[]) {
    this.history = history;
    this.index = history.length;
  }
  getHistory() {
    return [...this.history];
  }
  clear() {
    this.term.clear();
  }
  focus() {
    this.term.focus();
  }
  write(text: string, animated = true) {
    const clean = safeText(text).replace(/\n/g, "\r\n");
    this.pending = this.pending.then(async () => {
      if (this.disposed) return;
      const speed = animated ? this.settings.speed : 0;
      if (!speed || this.cancelled) {
        this.term.write(clean);
        return;
      }
      // A bounded batch preserves character reveal without one timer per glyph.
      const chars = Array.from(clean);
      const batch = Math.max(1, Math.ceil(chars.length / 500));
      for (let i = 0; i < chars.length; i += batch) {
        if (this.disposed) return;
        if (this.cancelled) {
          this.term.write(chars.slice(i).join(""));
          return;
        }
        this.term.write(chars.slice(i, i + batch).join(""));
        await new Promise((r) => setTimeout(r, speed));
      }
    });
    return this.pending;
  }
  async ready() {
    await this.pending;
    if (this.disposed) return;
    this.busy = false;
    this.cancelled = false;
    this.line = "";
    this.cursor = 0;
    this.index = this.history.length;
    this.term.write("\r\n\x1b[1m>\x1b[0m ");
    this.focus();
  }
  async submit(line: string) {
    if (this.busy || !line.trim()) return;
    this.line = line;
    this.cursor = Array.from(line).length;
    this.redraw();
    await this.enter();
  }
  private redraw() {
    // Horizontally scroll the edit buffer so pasted code and long paths never
    // overwrite earlier output. The complete input is retained for execution.
    const chars = Array.from(this.line),
      width = Math.max(10, this.term.cols - 4);
    const start = Math.max(0, this.cursor - width + 1),
      visible = chars.slice(start, start + width).join("");
    this.term.write(
      "\r\x1b[2K\x1b[1m" + (start ? "<" : ">") + "\x1b[0m " + visible,
    );
    const back = Math.max(
      0,
      Math.min(chars.length - start, width) - (this.cursor - start),
    );
    if (back) this.term.write(`\x1b[${back}D`);
  }
  private async enter() {
    const line = this.line.trim();
    this.term.write("\r\n");
    if (!line) {
      this.term.write("> ");
      return;
    }
    this.busy = true;
    this.cancelled = false;
    this.audio.tick(this.settings.sound, true);
    if (!/^KEY\s/i.test(line)) this.history.push(line);
    this.history = this.history.slice(-500);
    this.index = this.history.length;
    try {
      await this.execute(line);
    } catch (error) {
      await this.write(
        `\nUNABLE TO COMPLY\n${String(error instanceof Error ? error.message : error)}\n`,
        false,
      );
    }
    await this.ready();
  }
  private input(data: string) {
    if (data === "\x03") {
      if (this.busy) {
        this.cancelled = true;
        this.cancel();
      } else {
        this.line = "";
        this.cursor = 0;
        this.term.write("^C\r\n> ");
      }
      return;
    }
    if (this.busy) return;
    const chars = Array.from(this.line);
    switch (data) {
      case "\r":
        void this.enter();
        return;
      case "\x7f":
        if (this.cursor) {
          chars.splice(--this.cursor, 1);
        }
        break;
      case "\x1b[3~":
        chars.splice(this.cursor, 1);
        break;
      case "\x1b[D":
        this.cursor = Math.max(0, this.cursor - 1);
        this.redraw();
        return;
      case "\x1b[C":
        this.cursor = Math.min(chars.length, this.cursor + 1);
        this.redraw();
        return;
      case "\x01":
      case "\x1b[H":
      case "\x1bOH":
        this.cursor = 0;
        this.redraw();
        return;
      case "\x05":
      case "\x1b[F":
      case "\x1bOF":
        this.cursor = chars.length;
        this.redraw();
        return;
      case "\x15":
        this.line = "";
        this.cursor = 0;
        this.redraw();
        return;
      case "\x1b[A":
      case "\x1b[B": {
        if (this.index === this.history.length) this.draft = this.line;
        this.index = Math.max(
          0,
          Math.min(
            this.history.length,
            this.index + (data === "\x1b[A" ? -1 : 1),
          ),
        );
        this.line =
          this.index === this.history.length
            ? this.draft
            : this.history[this.index];
        this.cursor = Array.from(this.line).length;
        this.redraw();
        return;
      }
      case "\t": {
        if (this.line.includes(" ")) return;
        const matches = completion(this.line);
        if (matches.length === 1) {
          this.line = matches[0] + " ";
          this.cursor = this.line.length;
        } else if (matches.length) {
          this.term.write("\r\n" + matches.join("  ") + "\r\n");
        }
        this.redraw();
        return;
      }
      default: {
        if (data.includes("\x1b")) return;
        const text = safeText(data).replace(/[\r\n\t]/g, " ");
        const available = Math.max(0, 8192 - chars.length);
        const insert = Array.from(text).slice(0, available);
        chars.splice(this.cursor, 0, ...insert);
        this.cursor += insert.length;
        this.audio.tick(this.settings.sound);
      }
    }
    this.line = chars.join("");
    this.redraw();
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.audio.dispose();
    this.term.dispose();
  }
}
