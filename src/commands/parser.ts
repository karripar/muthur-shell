export const commands = [
  "HELP",
  "STATUS",
  "DIAGNOSTICS",
  "SYSTEM",
  "PROCESSES",
  "NETWORK",
  "DISKS",
  "DOCKER",
  "FILES",
  "READ",
  "QUERY",
  "HISTORY",
  "CLEAR",
  "SETTINGS",
  "MODE",
  "DIRECTIVE",
  "CREW",
  "NAVIGATION",
  "KEY",
  "FORGET",
  "FULLSCREEN",
];
const aliases: Record<string, string> = {
  "?": "HELP",
  CLS: "CLEAR",
  LS: "FILES",
  CAT: "READ",
  PS: "PROCESSES",
  ASK: "QUERY",
  CONFIG: "SETTINGS",
  SYS: "SYSTEM",
  DIAG: "DIAGNOSTICS",
};
export function parse(line: string) {
  const match = line.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const name = match?.[1].toUpperCase() ?? "";
  return { name: aliases[name] ?? name, args: match?.[2]?.trim() ?? "" };
}
export function pathArgument(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    return value.slice(1, -1);
  return value;
}
// Strip terminal control injection, including CSI/OSC payloads, then reject all remaining controls.
export function safeText(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
export function completion(prefix: string): string[] {
  return commands.filter((c) => c.startsWith(prefix.toUpperCase()));
}
