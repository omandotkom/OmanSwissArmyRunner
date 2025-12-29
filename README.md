# Oman Swiss Army Tool Runner

A lightweight, robust, and native launcher & auto-updater for the **Oman Swiss Army Tool**.  
Built with [Neutralinojs](https://neutralino.js.org/), this runner serves as the "Commander" for the main Next.js application, handling installation, updates, dependency management, and AI model provisioning.

![Version](https://img.shields.io/badge/version-1.3.0-blue.svg) ![Platform](https://img.shields.io/badge/platform-Windows-blue)

## 🚀 Key Features

### 1. Intelligent Auto-Updater
- **GitHub Integration**: Automatically checks for the latest releases from the official repository every hour.
- **Smart Delta Updates**: Only downloads what is needed.
- **Safe Upgrade Process**:
    - **Staging Area**: Extracts updates to a temporary staging folder first.
    - **Atomic Swap**: Replaces the old version only after a successful extraction, preventing broken installs.
    - **Manual Start**: Gives you control to start the app when you are ready after an update.

### 2. High-Performance Downloader
- **Real-time Speed Meter**: Displays download speed (MB/s or KB/s) directly in the UI.
- **Native PowerShell Backend**: Utilizes a custom PowerShell script for stable, high-speed downloads that bypass typical browser or JS limitations.
- **Resumable & Robust**: Handles network hiccups gracefully.

### 3. AI Model Manager (v1.3.0+)
- **Dedicated Mirror**: Downloads heavy AI models (Qwen2.5-Coder, Xenova Embeddings) from a private high-speed R2 mirror (`model.bantupedia.id`), ensuring fast and reliable access.
- **Smart Backup & Restore**: When updating the main app, the runner **automatically backs up** your gigabytes of downloaded models and restores them after the update. No more re-downloading!
- **Integrity Check**: Verifies model existence and file size to prevent loading corrupt models.

### 4. Process & Dependency Management
- **Zero-Config Runtime**: Automatically downloads a standalone **Node.js** binary if none is found on your system.
- **OpenShift Tools**: Manages `oc.exe` dependencies for OpenShift related features.
- **Port Conflict Resolver**: Automatically detects if Port `1998` is in use. If it's a zombie process from a previous session, it can kill it to free the port.
- **Anti-Spam Controls**: UI buttons lock during critical operations (Stopping/Killing processes) to prevent race conditions.

---

## 🛠️ How it Works

1.  **Initialization**:
    - Checks for `node.exe` and `runner-config.json`.
    - Verifies if the main app is installed in `./oman-swiss-army-tool/`.
    - Checks GitHub for the latest release tag.

2.  **The Update Flow**:
    - **Download**: Fetches the Release ZIP and (optional) dependencies.
    - **Backup**: Moves `./public/models/` to a safe temp location.
    - **Clean**: Wipes the old app folder.
    - **Extract**: Unzips the new version.
    - **Restore**: Moves the AI models back into place.
    - **Finalize**: Updates the local version tag.

3.  **Execution**:
    - Spawns a child process: `cmd /c "set PORT=1998 && node server.js"`.
    - Opens your default web browser to `http://localhost:1998`.

---

## ⚙️ Configuration

The runner creates a `runner-config.json` file in the root directory. You generally don't need to touch this, but here is what it does:

```json
{
  "localVersion": "v1.3.0",          // Current installed version tag
  "installDir": ".../oman-swiss-army-tool", // Path to the main app
  "startCommand": "cmd /c start.bat", // Legacy command (overridden by internal logic now)
  "appPort": 1998,                   // Port to run the Next.js server on
  "allowNodeKill": false             // If true, allows "Taskkill /IM node.exe" (Aggressive)
}
```

---

## 💻 Development

### Prerequisites
- Node.js (v18+)
- Neutralinojs CLI (`npm install -g @neujs/neu`)

### Commands

```bash
# Install dependencies
npm install

# Run in development mode (Hot Reload)
neu run

# Build for Production (Generates dist/OmanRunner-win_x64.exe)
neu build
```

---

## 📝 Troubleshooting

**Q: The download is stuck?**  
A: The runner has a "Stuck Monitor". If progress doesn't change for 5 seconds, a warning label appears. Check your internet connection.

**Q: "App Missing" even after update?**  
A: This was a bug in versions < v1.3.0. Please force update or restart the runner.

**Q: My AI models are redownloading?**  
A: Ensure you didn't delete the `models_backup` folder manually during an update. The runner relies on this to restore them.

---

## License

MIT
