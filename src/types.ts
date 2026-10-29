export type Mode = "operator" | "nostromo";
export interface Settings {
  mode: Mode;
  phosphor: "green" | "amber";
  effects: boolean;
  sound: boolean;
  speed: number;
  ratio: boolean;
  model: string;
  context_turns: number;
  ai_tools: boolean;
}
export const defaults: Settings = {
  mode: "operator",
  phosphor: "green",
  effects: true,
  sound: false,
  speed: 8,
  ratio: false,
  model: "gpt-4.1-mini",
  context_turns: 8,
  ai_tools: false,
};
export interface Bootstrap {
  settings: Settings;
  history: string[];
  roots: string[];
  credential_configured: boolean;
}
export interface AiEvent {
  kind: "delta" | "tool" | "done";
  text: string;
}
