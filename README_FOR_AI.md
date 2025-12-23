# AI Implementation Guide: OmanSwissArmyToolRunner

**Target Audience:** AI Assistant (Gemini, ChatGPT, Claude) interacting with a User on a Windows Machine.
**Goal:** Create a lightweight Desktop Launcher & Auto-Updater for "Oman Swiss Army Tool".

## 1. Project Overview
The user wants a simple, lightweight Windows Desktop application (.exe) to act as a **Launcher and Updater** for their main Next.js Application ("Oman Swiss Army Tool").

**Key Requirements:**
1.  **Lightweight:** Must handle typical launcher tasks without the bloat of Electron (Use **Neutralinojs**).
2.  **Auto-Update:** 
    *   Check GitHub Releases for the latest version.
    *   If local version < remote version: Authentically update.
3.  **Update Logic:**
    *   Download ZIP from GitHub Release.
    *   Kill existing "Oman Swiss Army Tool" processes (checking port 3000 or process name).
    *   Delete old folder.
    *   Extract new ZIP.
    *   Restart the application.
4.  **Process Management:** Start/Stop the Next.js app/server.
5.  **Offline Capable:** If already downloaded, just run it.

## 2. Recommended Tech Stack
*   **Framework:** [Neutralinojs](https://neutralino.js.org/) (Zero dependency, uses Windows WebView2, tiny binaries ~2MB).
*   **Language:** JavaScript / HTML / CSS (Vanilla or simple setup).
*   **Backend Logic:** Neutralinojs OS API (exec, filesystem).

---

## 3. Implementation Steps (For the AI)

### Step 1: Initialize Project
Ask the user to run this in the empty `OmanSwissArmyToolRunner` directory:

```bash
# Install tool globally first (or use npx)
npm install -g @neujs/neu

# Init project (minimal template)
neu create . --template minimal

# (Alternative if npx works better in your env)
npx @neujs/neu create . --template minimal
```

### Step 2: Configure `neutralino.config.json`
Modify the config to enable necessary permissions. The launcher needs full OS access to kill processes and manage files.

```json
{
  "applicationId": "js.neutralino.omanswissarmyrunner",
  "version": "1.0.0",
  "defaultMode": "window",
  "port": 0,
  "documentRoot": "/resources/",
  "url": "/",
  "enableServer": true,
  "enableNativeAPI": true,
  "nativeBlockList": [],
  "modes": {
    "window": {
      "title": "Oman Swiss Army Launcher",
      "width": 600,
      "height": 400,
      "minWidth": 400,
      "minHeight": 300,
      "resizable": true
    }
  },
  "cli": {
    "binaryName": "OmanRunner",
    "resourcesPath": "/resources/",
    "extensionsPath": "/extensions/",
    "clientLibrary": "/resources/neutralino.js",
    "binaryVersion": "4.12.0",
    "clientVersion": "3.10.0"
  }
}
```

### Step 3: Implement The Logic (`resources/js/main.js`)

You need to implement the following core functions.

#### A. Constants
```javascript
const REPO_OWNER = "omandotkom";
const REPO_NAME = "OmanSwissArmy";
const APP_DIR_NAME = "oman-swiss-army-tool"; // The folder name after extraction
const EXECUTABLE_CMD = "npm run start"; // Or the path to start.bat
```

#### B. Check for Updates
Use `fetch` to call GitHub API: `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
Compare `tag_name` with a local config file (e.g., `runner-config.json`).

#### C. Download & Extract
Neutralino doesn't have a native unzip. You can use the OS built-in `tar` (Windows 10+ supports it) or Powershell.

**Powershell Unzip Command:**
```javascript
await Neutralino.os.execCommand(`powershell -command "Expand-Archive -Path 'update.zip' -DestinationPath './' -Force"`);
```

#### D. Start / Stop Application
*   **Start:** `Neutralino.os.spawnProcess('cmd /c start.bat')`
*   **Stop:** `Neutralino.os.execCommand('taskkill /F /IM node.exe')` (Be careful to only kill the child process if possible, or filter by command line).

### Step 4: Building the EXE
Run:
```bash
neu build
```
This will generate `dist/OmanRunner-win_x64.exe`.

---

## 4. Code Snippets Reference

### GitHub Checker Logic
```javascript
async function checkUpdate() {
    try {
        let response = await fetch(`https://api.github.com/repos/omandotkom/OmanSwissArmy/releases/latest`);
        let data = await response.json();
        let latestVersion = data.tag_name; // e.g., v1.2.1
        
        // Read local version
        let localVersion = localStorage.getItem('appVersion') || 'v0.0.0';
        
        if (latestVersion !== localVersion) {
            // Trigger Update Flow
            return { updateAvailable: true, downloadUrl: data.assets[0].browser_download_url, version: latestVersion };
        }
    } catch (err) {
        console.error("Update check failed", err);
    }
    return { updateAvailable: false };
}
```

### Downloader Logic (Using curl or native fetch + fs)
Ideally use `Neutralino.os.execCommand` with `curl` for reliability on Windows 10/11:
```javascript
async function downloadFile(url, dest) {
    let cmd = `curl -L -o "${dest}" "${url}"`;
    await Neutralino.os.execCommand(cmd);
}
```

## 5. UI Design (resources/index.html)
Keep it simple.
- **Status Div:** "Searching for updates..."
- **Progress Bar:** For download status.
- **Action Buttons:** [Start App] [Stop App] [Force Update]
- **Logs:** A text area showing "Unzipping...", "Killing process...", etc.

---

**End of Guide.**
Pass this file to your AI Assistant to start coding immediately.
