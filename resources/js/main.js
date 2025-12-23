"use strict";

const REPO_OWNER = "omandotkom";
const REPO_NAME = "OmanSwissArmy";
const APP_DIR_NAME = "oman-swiss-army-tool";
const DEFAULT_START_CMD = "cmd /c npm run start";
const DEFAULT_APP_PORT = 1998;
const CONFIG_FILENAME = "runner-config.json";

const state = {
    config: null,
    latest: null,
    paths: null,
    busy: false,
    currentPid: null,
    isInstalled: false
};

const ui = {
    statusChip: document.getElementById("statusChip"),
    statusSub: document.getElementById("statusSub"),
    updateBadge: document.getElementById("updateBadge"),
    runtimeBadge: document.getElementById("runtimeBadge"),
    localVersion: document.getElementById("localVersion"),
    latestVersion: document.getElementById("latestVersion"),
    installPath: document.getElementById("installPath"),
    appPort: document.getElementById("appPort"),
    appPid: document.getElementById("appPid"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    progressPercent: document.getElementById("progressPercent"),
    log: document.getElementById("log"),
    connectionStatus: document.getElementById("connectionStatus"),
    launcherVersion: document.getElementById("launcherVersion"),
    checkBtn: document.getElementById("checkBtn"),
    updateBtn: document.getElementById("updateBtn"),
    startBtn: document.getElementById("startBtn"),
    stopBtn: document.getElementById("stopBtn"),
    clearLogBtn: document.getElementById("clearLogBtn")
};

function setStatus(text, tone, subText) {
    ui.statusChip.textContent = text;
    ui.statusChip.dataset.tone = tone || "idle";
    if (subText) {
        ui.statusSub.textContent = subText;
    }
}

function setUpdateBadge(text, tone) {
    ui.updateBadge.textContent = text;
    ui.updateBadge.classList.remove("success", "attn");
    if (tone) {
        ui.updateBadge.classList.add(tone);
    }
}

function setRuntimeBadge(text, tone) {
    ui.runtimeBadge.textContent = text;
    ui.runtimeBadge.classList.remove("success", "attn", "badge-neutral");
    ui.runtimeBadge.classList.add(tone || "badge-neutral");
}

function setProgress(value, text) {
    const safeValue = Math.max(0, Math.min(100, value));
    ui.progressBar.style.width = `${safeValue}%`;
    ui.progressPercent.textContent = `${Math.round(safeValue)}%`;
    if (text) {
        ui.progressText.textContent = text;
    }
}

function setBusy(isBusy) {
    state.busy = isBusy;
    ui.checkBtn.disabled = isBusy;
    ui.updateBtn.disabled = isBusy;
    ui.startBtn.disabled = isBusy || !state.isInstalled;
    ui.stopBtn.disabled = isBusy;
}

function timestamp() {
    const now = new Date();
    return now.toLocaleTimeString("en-GB", { hour12: false });
}

function log(message, tone) {
    const line = document.createElement("div");
    line.className = `log-line${tone ? " " + tone : ""}`;
    line.textContent = `[${timestamp()}] ${message}`;
    ui.log.appendChild(line);
    ui.log.scrollTop = ui.log.scrollHeight;
}

async function pathExists(path) {
    try {
        await Neutralino.filesystem.getStats(path);
        return true;
    } catch (err) {
        return false;
    }
}

async function ensureDirectory(path) {
    if (!(await pathExists(path))) {
        await Neutralino.filesystem.createDirectory(path);
    }
}

async function resolvePaths() {
    // Use NL_PATH to make it portable (relative to the executable)
    // NOTE: Requires write permissions in the running folder.
    const dataDir = NL_PATH; 
    const installDir = await Neutralino.filesystem.getJoinedPath(dataDir, APP_DIR_NAME);
    const configPath = await Neutralino.filesystem.getJoinedPath(dataDir, CONFIG_FILENAME);
    const zipPath = await Neutralino.filesystem.getJoinedPath(dataDir, "update.zip");
    const stagingDir = await Neutralino.filesystem.getJoinedPath(dataDir, "update_staging");

    return {
        dataDir,
        installDir,
        configPath,
        zipPath,
        stagingDir
    };
}

async function loadConfig(paths) {
    const defaultConfig = {
        localVersion: "v0.0.0",
        installDir: paths.installDir,
        startCommand: DEFAULT_START_CMD,
        appPort: DEFAULT_APP_PORT,
        allowNodeKill: false
    };

    if (await pathExists(paths.configPath)) {
        try {
            const raw = await Neutralino.filesystem.readFile(paths.configPath);
            const parsed = JSON.parse(raw);
            return { ...defaultConfig, ...parsed };
        } catch (err) {
            log("Config read failed, rebuilding defaults.", "warn");
        }
    }

    await Neutralino.filesystem.writeFile(paths.configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
}

async function saveConfig(paths, config) {
    await Neutralino.filesystem.writeFile(paths.configPath, JSON.stringify(config, null, 2));
}

function syncConfigUI(config) {
    ui.localVersion.textContent = config.localVersion || "v0.0.0";
    ui.installPath.textContent = config.installDir;
    ui.appPort.textContent = config.appPort || DEFAULT_APP_PORT;
}

async function fetchLatestRelease() {
    const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
        { headers: { Accept: "application/vnd.github+json" } }
    );

    if (!response.ok) {
        throw new Error(`GitHub response ${response.status}`);
    }

    const data = await response.json();
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const zipAsset = assets.find((asset) => asset.name && asset.name.toLowerCase().endsWith(".zip"));

    return {
        tag: data.tag_name || "unknown",
        url: zipAsset ? zipAsset.browser_download_url : null,
        name: zipAsset ? zipAsset.name : null
    };
}

async function checkForUpdates(silent) {
    setStatus("Checking", "busy", "Contacting GitHub");
    ui.connectionStatus.textContent = "GitHub: checking";
    try {
        const release = await fetchLatestRelease();
        state.latest = release;
        ui.latestVersion.textContent = release.tag;
        ui.connectionStatus.textContent = "GitHub: online";

        const updateAvailable = release.tag && release.tag !== state.config.localVersion;
        
        if (!state.isInstalled) {
             setUpdateBadge("Install Available", "attn");
             setStatus("Ready to Install", "ok", "App not found locally.");
             ui.updateBtn.textContent = "Install Now";
             if (!silent) log("Ready to install " + release.tag);
        } else if (updateAvailable) {
            setUpdateBadge("Update available", "attn");
            setStatus("Update Ready", "ok", "New release detected.");
            ui.updateBtn.textContent = "Update App";
            log(`Update available: ${release.tag}`, "warn");
        } else {
            setUpdateBadge("Up to date", "success");
            setStatus("Up to date", "ok", "No updates needed.");
            ui.updateBtn.textContent = "Force Update";
            if (!silent) {
                log("Already on the latest version.");
            }
        }
        return release;
    } catch (err) {
        state.latest = null;
        ui.connectionStatus.textContent = "GitHub: offline";
        setUpdateBadge("Offline");
        setStatus("Offline", "warn", "Update check failed.");
        log(`Update check failed: ${err.message}`, "error");
        return null;
    }
}

function quotePath(value) {
    return `"${value.replace(/"/g, '\\"')}"`;
}

function psQuote(value) {
    return `'${value.replace(/'/g, "''")}'`;
}

async function downloadFile(url, destination) {
    const startTime = Date.now();
    let receivedBytes = 0;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);

        const contentLength = +response.headers.get('Content-Length');
        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            receivedBytes += value.length;

            // Calculate Speed & Progress
            const now = Date.now();
            const elapsedSeconds = (now - startTime) / 1000;
            const speedMbps = (receivedBytes / 1024 / 1024) / elapsedSeconds;
            
            let speedText = speedMbps.toFixed(2) + " MB/s";
            if (speedMbps < 1) {
                speedText = (speedMbps * 1024).toFixed(0) + " KB/s";
            }

            let progressText = `Downloading: ${speedText}`;
            let percent = 0;

            if (contentLength && contentLength > 0) {
                percent = (receivedBytes / contentLength) * 100;
                const downloadedMB = (receivedBytes / 1024 / 1024).toFixed(1);
                const totalMB = (contentLength / 1024 / 1024).toFixed(1);
                progressText = `Downloading: ${downloadedMB}/${totalMB} MB (${speedText})`;
            }

            // Update UI (throttled slightly to prevent UI freeze, but every chunk is usually fine)
            setProgress(percent, progressText);
        }

        // Combine chunks into a single ArrayBuffer
        const combinedBuffer = new Uint8Array(receivedBytes);
        let position = 0;
        for (const chunk of chunks) {
            combinedBuffer.set(chunk, position);
            position += chunk.length;
        }

        // Write to file
        await Neutralino.filesystem.writeBinaryFile(destination, combinedBuffer.buffer);

    } catch (err) {
        throw new Error(`Download failed: ${err.message}`);
    }
}

async function removeDirectory(path) {
    if (!(await pathExists(path))) {
        return;
    }
    await Neutralino.os.execCommand(`cmd /c rmdir /s /q ${quotePath(path)}`);
}

async function extractZip(zipPath, destination) {
    const command = `powershell -NoProfile -Command "Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destination)} -Force"`;
    const result = await Neutralino.os.execCommand(command);
    if (result.exitCode !== 0) {
        throw new Error(result.stdErr || "Extraction failed.");
    }
}

async function selectExtractedRoot(stagingDir) {
    const entries = await Neutralino.filesystem.readDirectory(stagingDir);
    const directories = entries.filter((entry) => entry.type === "DIRECTORY");

    if (directories.length === 1 && entries.length === 1) {
        return directories[0].path;
    }

    return stagingDir;
}

async function resolveStartCommand(config) {
    if (config.startCommand && config.startCommand.trim().length > 0) {
        return config.startCommand;
    }

    const startBat = await Neutralino.filesystem.getJoinedPath(config.installDir, "start.bat");
    if (await pathExists(startBat)) {
        return "cmd /c start.bat";
    }

    return DEFAULT_START_CMD;
}

async function startApp() {
    if (!(await pathExists(state.config.installDir))) {
        setRuntimeBadge("Not installed", "attn");
        log("Install folder missing. Run update first.", "warn");
        return;
    }

    try {
        const command = await resolveStartCommand(state.config);
        const result = await Neutralino.os.spawnProcess(command, { cwd: state.config.installDir });
        state.currentPid = result.pid;
        ui.appPid.textContent = `${result.pid}`;
        setRuntimeBadge("Running", "success");
        log("Application started.");
    } catch (err) {
        setRuntimeBadge("Start failed", "attn");
        log(`Start failed: ${err.message}`, "error");
    }
}

async function stopApp() {
    if (state.currentPid) {
        await Neutralino.os.execCommand(`taskkill /T /F /PID ${state.currentPid}`);
        state.currentPid = null;
        ui.appPid.textContent = "-";
        log("Stopped spawned process.");
    }

    const port = state.config.appPort || DEFAULT_APP_PORT;
    const command = `powershell -NoProfile -Command "$pid = (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if ($pid) { Stop-Process -Id $pid -Force; 'stopped'; } else { 'notfound'; }"`;
    const result = await Neutralino.os.execCommand(command);
    if (result.stdOut && result.stdOut.includes("stopped")) {
        log(`Stopped process on port ${port}.`);
    } else if (result.stdOut && result.stdOut.includes("notfound")) {
        log(`No process found on port ${port}.`);
    }

    if (state.config.allowNodeKill) {
        await Neutralino.os.execCommand("taskkill /F /IM node.exe");
        log("Forced stop for node.exe.", "warn");
    }

    ui.appPid.textContent = "-";
    setRuntimeBadge("Stopped", "badge-neutral");
}

async function runUpdate(force) {
    if (state.busy) {
        return;
    }

    setBusy(true);
    setStatus("Updating", "busy", "Preparing update pipeline.");
    setProgress(8, "Preparing update");

    try {
        const release = state.latest || (await checkForUpdates(true));
        if (!release || !release.url) {
            throw new Error("Release asset not found.");
        }

        const updateAvailable = release.tag !== state.config.localVersion;
        if (!updateAvailable && !force) {
            log("No update needed. Use Force Update to reinstall.");
            setProgress(0, "Standby");
            setStatus("Up to date", "ok", "No updates needed.");
            return;
        }

        const dlLabel = `Downloading package -> OmanSwissArmyTool (${release.tag})`;
        log(dlLabel + "...");
        setProgress(22, dlLabel);
        
        await downloadFile(release.url, state.paths.zipPath);
        setProgress(45, "Stopping current app");
        await stopApp();
        log("Cleaning install directory.");
        await removeDirectory(state.config.installDir);
        await removeDirectory(state.paths.stagingDir);
        await ensureDirectory(state.paths.stagingDir);
        setProgress(65, "Extracting package");
        await extractZip(state.paths.zipPath, state.paths.stagingDir);
        const extractedRoot = await selectExtractedRoot(state.paths.stagingDir);
        setProgress(78, "Deploying update");
        await Neutralino.filesystem.move(extractedRoot, state.config.installDir);
        await removeDirectory(state.paths.stagingDir);
        if (await pathExists(state.paths.zipPath)) {
            await Neutralino.filesystem.remove(state.paths.zipPath);
        }

        state.config.localVersion = release.tag;
        await saveConfig(state.paths, state.config);
        syncConfigUI(state.config);
        setUpdateBadge("Up to date", "success");
        setProgress(100, "Update complete");
        setStatus("Updated", "ok", "Launcher is ready.");
        log(`Update complete: ${release.tag}`);

        state.isInstalled = true;
        await startApp();
    } catch (err) {
        setStatus("Update failed", "warn", "Check log for details.");
        setProgress(0, "Standby");
        log(`Update failed: ${err.message}`, "error");
    } finally {
        setBusy(false);
    }
}

function bindEvents() {
    ui.checkBtn.addEventListener("click", () => checkForUpdates(false));
    ui.updateBtn.addEventListener("click", () => runUpdate(true));
    ui.startBtn.addEventListener("click", () => startApp());
    ui.stopBtn.addEventListener("click", () => stopApp());
    ui.clearLogBtn.addEventListener("click", () => {
        ui.log.innerHTML = "";
        log("Log cleared.");
    });
}

async function checkInstallStatus() {
    state.isInstalled = await pathExists(state.config.installDir);
    
    if (!state.isInstalled) {
        setRuntimeBadge("Not Downloaded", "attn");
        setStatus("Action Required", "warn", "Oman Swiss Army Tool not downloaded");
        ui.updateBtn.textContent = "Install Now";
    } else {
        if (ui.runtimeBadge.textContent === "Not Downloaded") {
            setRuntimeBadge("Stopped", "badge-neutral");
            setStatus("Ready", "idle", "Waiting for action.");
        }
        ui.updateBtn.textContent = "Force Update";
    }
    // Update button state
    setBusy(state.busy);
}

async function init() {
    Neutralino.init();
    Neutralino.events.on("windowClose", () => Neutralino.app.exit());

    ui.launcherVersion.textContent = NL_APPVERSION;
    state.paths = await resolvePaths();
    await ensureDirectory(state.paths.dataDir);
    state.config = await loadConfig(state.paths);
    syncConfigUI(state.config);
    setProgress(0, "Standby");
    
    await checkInstallStatus();
    
    bindEvents();
    log("Launcher ready.");
    await checkForUpdates(true);
}

init();
