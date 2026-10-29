# Verification record

Windows x64, Node 24.15.0, Rust 1.92.0. Local verification on 2026-10-29.

| Check | Result |
| --- | --- |
| TypeScript and Vite production build | Pass |
| Frontend tests | 3 passed |
| Rust backend tests | 7 passed |
| `cargo fmt --check` | Pass |
| Tauri release build with embedded frontend | Pass; Windows x64 executable generated |
| Production browser smoke test | Pass; no page errors |
| Cross-platform npm lock consistency (`npm ci --dry-run`) | Pass on Windows |
| MSI/NSIS installer generation | Blocked by network policy downloading platform packaging tools |
| Live OpenAI request / OS credential import | Not exercised; requires an operator credential and native interaction |
| macOS and Linux native builds | Not exercised locally; CI workflow provided |

Browser interaction checks covered boot, HELP, switching modes, keyboard autocomplete, Directive 937, 4:3 screen geometry, the 700×540 viewport, rejecting host operations without a desktop backend, and amber phosphor. The measured 4:3 screen ratio was 1.3339 (integer pixel rounding).

The executable was built with:

```sh
node node_modules/@tauri-apps/cli/tauri.js build --no-bundle -- --offline --locked
```

Tauri core 2.9.5, API 2.9.1, CLI 2.9.6 and the compatible runtime/codegen versions are pinned in the manifests/lockfiles. Dependency downloads were restricted during development; verification used local package caches. Local cache recovery scripts are excluded from the project and are not runtime dependencies.

The portable Windows ZIP includes the compiled application and documentation. It requires WebView2, uses the normal per-user application data directory, and has no API credential bundled. The portable artifact is not a signed installer. `npm run bundle` generates the standard Tauri installers on a build host with the required packaging tools available.
