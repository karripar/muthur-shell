import { invoke, isTauri, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AiEvent, Bootstrap, Settings } from "./types";
import { defaults } from "./types";
export const desktop = isTauri();
export const backend = {
  async bootstrap(): Promise<Bootstrap> {
    if (!desktop)
      return {
        settings: { ...defaults },
        history: [],
        roots: [],
        credential_configured: false,
      };
    return invoke("bootstrap");
  },
  call<T = unknown>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    if (!desktop)
      return Promise.reject(
        new Error(
          "DESKTOP BACKEND OFFLINE. Launch with npm run desktop. Browser preview has no host or AI access.",
        ),
      );
    return invoke<T>(command, args);
  },
  async save(settings: Settings) {
    if (desktop) await invoke("save_settings", { settings });
  },
  async query(prompt: string, onEvent: (e: AiEvent) => void) {
    const channel = new Channel<AiEvent>();
    channel.onmessage = onEvent;
    await this.call("query", { prompt, channel });
  },
  async fullscreen() {
    if (desktop) {
      const w = getCurrentWindow();
      await w.setFullscreen(!(await w.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  },
};
