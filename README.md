# Inkwell

An AI-powered word processor with local and cloud AI inference, built with Tauri (desktop), Next.js, and Rust.

---

## Prerequisites

Install the following before getting started:

| Tool | Install |
|------|---------|
| **Node.js** v20+ | https://nodejs.org |
| **pnpm** v9+ | `npm install -g pnpm` |
| **Rust** (stable) | https://rustup.rs |
| **Tauri prerequisites** | See platform notes below |

### Windows
- Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++")
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (included with Windows 11; Windows 10 users may need to install it separately)

### macOS
- Install Xcode Command Line Tools: `xcode-select --install`

### Linux
- Install: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

---

## Quick Start

**1. Install dependencies**
```bash
pnpm install
```

**2. Launch the desktop app (development mode)**
```bash
pnpm --filter @inkwell/desktop run dev
```

This starts the Next.js frontend on port 3004 and opens the Inkwell desktop window automatically.

---

## Build a Desktop Installer

To produce a native installer (`.exe` on Windows, `.dmg` on macOS, `.deb`/`.AppImage` on Linux):

```bash
pnpm --filter @inkwell/desktop run build
```

The installer is output to `apps/desktop/src-tauri/target/release/bundle/`.

---

## Windows Compatibility

✅ All core features work on Windows:
- Rich text editing
- Cloud AI operations (Claude API — requires an Anthropic API key)
- Document management, export, and collaboration

⚠️ **Voice input is not available on Windows.** The local speech-to-text engine (`whisper-rs`) does not currently support Windows. All other features work as expected.

---

## Setting Up Cloud AI

On first launch, Inkwell will prompt you for an Anthropic API key. You can get one at https://console.anthropic.com. The key is stored securely in your system keychain.

---

## Running Tests

```bash
pnpm test
```
