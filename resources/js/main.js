"use strict";

const REPO_OWNER = "omandotkom";
const REPO_NAME = "OmanSwissArmy";
const APP_DIR_NAME = "oman-swiss-army-tool";
const DEFAULT_START_CMD = "cmd /c start.bat";
const DEFAULT_APP_PORT = 1998;
const CONFIG_FILENAME = "runner-config.json";
const OC_TOOLS_URL = "https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-windows.zip";
const NODE_URL = "https://nodejs.org/dist/v20.18.1/win-x64/node.exe";

const state = {
// ... (rest of state)
    config: null,
    latest: null,
    paths: null,
    busy: false,
    currentPid: null,
    isInstalled: false,
    isRunning: false,
    // Stuck Monitor State
    lastProgressTime: 0,
    monitorInterval: null,
    currentPercent: -1
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
    stuckLabel: document.getElementById("stuckLabel"),
    log: document.getElementById("log"),
    connectionStatus: document.getElementById("connectionStatus"),
    launcherVersion: document.getElementById("launcherVersion"),
    checkBtn: document.getElementById("checkBtn"),
    updateBtn: document.getElementById("updateBtn"),
    startBtn: document.getElementById("startBtn"),
    stopBtn: document.getElementById("stopBtn"),
    clearLogBtn: document.getElementById("clearLogBtn")
};

function startStuckMonitor() {
    stopStuckMonitor(); // Ensure no duplicates
    state.lastProgressTime = Date.now();
    state.monitorInterval = setInterval(() => {
        const now = Date.now();
        // If > 5 seconds (5000ms) since last change
        if (now - state.lastProgressTime > 5000) {
            if (ui.stuckLabel.style.display === "none") {
                ui.stuckLabel.style.display = "inline-block";
            }
        }
    }, 1000); // Check every second
}

function stopStuckMonitor() {
    if (state.monitorInterval) {
        clearInterval(state.monitorInterval);
        state.monitorInterval = null;
    }
    ui.stuckLabel.style.display = "none";
}

function updateButtonState() {
    // Strict Button Logic
    const hasUpdate = state.latest && state.latest.tag !== state.config.localVersion;
    const canUpdate = !state.isInstalled || hasUpdate;
    
    ui.updateBtn.disabled = state.busy || !canUpdate;
    
    // Start enabled if: Not Busy AND Installed AND Not Running
    ui.startBtn.disabled = state.busy || !state.isInstalled || state.isRunning;
    
    // Stop enabled if: Not Busy AND Running
    ui.stopBtn.disabled = state.busy || !state.isRunning;
    
    ui.checkBtn.disabled = state.busy;
}

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

    // Stuck Monitor Logic:
    // If percent actually changed, reset the timer and hide label
    if (Math.round(safeValue) !== state.currentPercent) {
        state.currentPercent = Math.round(safeValue);
        state.lastProgressTime = Date.now();
        ui.stuckLabel.style.display = "none";
    }
}

function setBusy(isBusy) {
    state.busy = isBusy;
    updateButtonState();
}

function timestamp(full = false) {
    const now = new Date();
    if (full) {
        // Returns YYYY-MM-DD HH:MM:SS
        const iso = now.toISOString();
        return iso.replace("T", " ").split(".")[0];
    }
    return now.toLocaleTimeString("en-GB", { hour12: false });
}

function log(message, tone, showInUI = true) {
    // 1. Update UI (Sync)
    if (showInUI) {
        const line = document.createElement("div");
        line.className = `log-line${tone ? " " + tone : ""}`;
        line.textContent = `[${timestamp()}] ${message}`;
        ui.log.appendChild(line);
        ui.log.scrollTop = ui.log.scrollHeight;
    }

    // 2. Append to File (Async - Fire & Forget)
    // We use NL_PATH directly to ensure it sits next to the executable
    const logEntry = `[${timestamp(true)}] [${tone || "INFO"}] ${message}\n`;
    
    // Use a self-executing async function to handle the promise
    (async () => {
        const writeLog = async (retry = false) => {
            try {
                if (typeof Neutralino !== 'undefined') {
                    const logPath = await Neutralino.filesystem.getJoinedPath(NL_PATH, "runner.log");
                    await Neutralino.filesystem.appendFile(logPath, logEntry);
                }
            } catch (err) {
                if (!retry) {
                    // Simple retry logic: wait 100ms and try once more
                    setTimeout(() => writeLog(true), 100);
                } else {
                    console.error("Failed to write to log file after retry:", err);
                }
            }
        };
        await writeLog();
    })();
}

async function checkPortActive(port) {
    try {
        const command = `powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue) { 'true' } else { 'false' }"`;
        const result = await Neutralino.os.execCommand(command);
        return result.stdOut && result.stdOut.trim() === 'true';
    } catch (err) {
        return false;
    }
}

async function ensureSingleInstance() {
    const lockPath = await Neutralino.filesystem.getJoinedPath(NL_PATH, "instance.lock");
    if (await pathExists(lockPath)) {
        try {
            const pid = await Neutralino.filesystem.readFile(lockPath);
            // Check if process running
            const cmd = `tasklist /FI "PID eq ${pid}" /NH`;
            const res = await Neutralino.os.execCommand(cmd);
            // If output contains the PID, it is likely running.
            // Note: tasklist output format varies, but usually contains PID if found.
            if (res.stdOut.includes(pid)) {
                await Neutralino.os.showMessageBox("Already Running", "Another instance of the launcher is already running.", "OK", "ERROR");
                await Neutralino.app.exit();
                return false;
            }
        } catch (err) {
            // Lock file might be corrupt or unreadable, ignore and overwrite
        }
    }
    await Neutralino.filesystem.writeFile(lockPath, NL_PID.toString());
    return true;
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
            ui.updateBtn.textContent = "Up to date";
            if (!silent) {
                log("Already on the latest version.");
            }
        }
        
        // Refresh button state (Enable/Disable based on new latest info)
        setBusy(state.busy);
        
        return release;
    } catch (err) {
        state.latest = null;
        ui.connectionStatus.textContent = "GitHub: offline";
        setUpdateBadge("Offline");
        setStatus("Offline", "warn", "Update check failed.");
        log(`Update check failed: ${err.message}`, "error");
        
        // Refresh button state even on error
        setBusy(state.busy);
        
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
    return new Promise(async (resolve, reject) => {
        let processId = null;
        // Fix: Extract script to temp file because PowerShell cannot run scripts from inside resources.neu
        let tempScriptPath = null;

        try {
            // Use fetch to get the file from the resource bundle (served by Neutralino)
            // instead of filesystem.readFile which looks for physical files.
            const response = await fetch("../downloader.ps1");
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const rawScript = await response.text();
            
            tempScriptPath = await Neutralino.filesystem.getJoinedPath(NL_PATH, "temp_downloader_" + Date.now() + ".ps1");
            await Neutralino.filesystem.writeFile(tempScriptPath, rawScript);
        } catch (err) {
            return reject(new Error(`Failed to extract downloader script: ${err.message}`));
        }
        
        // Convert paths to Windows format for PowerShell
        const winScriptPath = tempScriptPath.replace(/\//g, "\\");
        const winDestPath = destination.replace(/\//g, "\\");

        const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${winScriptPath}" -Url "${url}" -Dest "${winDestPath}"`;
        
        log(`Starting native download via PowerShell...`, "INFO", false);

        // Cleanup helper
        const cleanup = async () => {
            if (tempScriptPath) {
                try {
                    await Neutralino.filesystem.remove(tempScriptPath);
                } catch (e) {
                    console.error("Failed to delete temp script:", e);
                }
            }
        };

        // Event Handler for Process Output
        const onProcessEvent = (event) => {
            const data = event.detail;
            if (data.id != processId) return;

            if (data.action == 'stdOut') {
                const lines = data.data.split('\n');
                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (cleanLine.startsWith("PROGRESS:")) {
                        const percent = parseInt(cleanLine.split(':')[1]);
                        setProgress(percent, `Downloading package...`);
                    } else if (cleanLine === "DONE") {
                        // Success handled in exit, but good to know
                    } else if (cleanLine.startsWith("ERROR:")) {
                        // Capture error from script
                        cleanup();
                        reject(new Error(cleanLine.substring(6)));
                    }
                }
            } else if (data.action == 'exit') {
                Neutralino.events.off('spawnedProcess', onProcessEvent);
                cleanup();
                if (data.data == 0) {
                    resolve();
                } else {
                    reject(new Error(`Downloader exited with code ${data.data}`));
                }
            }
        };

        try {
            await Neutralino.events.on('spawnedProcess', onProcessEvent);
            const process = await Neutralino.os.spawnProcess(command);
            processId = process.id;
        } catch (err) {
            Neutralino.events.off('spawnedProcess', onProcessEvent);
            cleanup();
            reject(new Error(`Failed to spawn downloader: ${err.message}`));
        }
    });
}

async function removeDirectory(path) {
    if (!(await pathExists(path))) {
        return;
    }
    await Neutralino.os.execCommand(`cmd /c rmdir /s /q ${quotePath(path)}`);
}

async function extractZip(zipPath, destination) {
    try {
        // 1. Read ZIP file into memory
        const fileData = await Neutralino.filesystem.readBinaryFile(zipPath);
        
        // 2. Load Zip
        const zip = await JSZip.loadAsync(fileData);
        
        // 3. Prepare for extraction loop
        const entries = Object.keys(zip.files);
        const totalItems = entries.length;
        let processedItems = 0;

        for (const rawFilename of entries) {
            // Debug logging to find stuck file
            log(`Unzipping: ${rawFilename}`, "INFO", false); 

            const file = zip.files[rawFilename];
            
            // Normalize separators to Windows style backslash for local paths
            // But keep track if it ended with a slash for directory detection
            const isExplicitDirectory = file.dir || rawFilename.endsWith("/") || rawFilename.endsWith("\\");
            const safeFilename = rawFilename.replace(/\//g, "\\");
            const fullPath = await Neutralino.filesystem.getJoinedPath(destination, safeFilename);
            
            try {
                if (isExplicitDirectory) {
                    await ensureDirectory(fullPath);
                } else {
                    // It's a file (or a mislabeled directory entry)
                    
                    // 1. Ensure parent directory exists
                    // We use string manipulation because we are constructing the path structure
                    const lastSlash = safeFilename.lastIndexOf("\\");
                    if (lastSlash !== -1) {
                        const parentRel = safeFilename.substring(0, lastSlash);
                        const parentAbs = await Neutralino.filesystem.getJoinedPath(destination, parentRel);
                        await ensureDirectory(parentAbs);
                    }

                    // 2. Check for conflict: If a directory with this name ALREADY exists, skip writing.
                    if (await pathExists(fullPath)) {
                         const stats = await Neutralino.filesystem.getStats(fullPath);
                         if (stats.isDirectory) {
                             processedItems++;
                             continue; 
                         }
                    }

                    // 3. Write content
                    const content = await file.async("uint8array");
                    await Neutralino.filesystem.writeBinaryFile(fullPath, content.buffer);

                    // Hack: If .exe, wait a bit to let Antivirus breathe
                    if (safeFilename.endsWith(".exe")) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            } catch (innerErr) {
                log(`Failed to extract entry: ${rawFilename} - ${innerErr.message}`, "warn");
                // Don't stop the whole process, try next file? 
                // Or maybe critical. Let's log and continue for now to see if it finishes.
            }

            // Update Progress
            processedItems++;
            const percent = (processedItems / totalItems) * 100;
            // Show filename in UI (truncate if too long to avoid layout break)
            let displayNames = rawFilename;
            if (displayNames.length > 50) displayNames = "..." + displayNames.substring(displayNames.length - 50);
            
            setProgress(percent, `Extracting: ${displayNames}`);
        }

    } catch (err) {
        throw new Error(`Extraction failed: ${err.message}`);
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
    // Menggunakan node langsung sesuai instruksi user, dengan PORT 1998 wajib.
    // Kita gunakan cmd /c untuk memastikan environment variable PORT terset dengan benar sebelum node jalan.
    const port = config.appPort || 1998;
    
    // Cek apakah ada local node binary
    const binDir = await Neutralino.filesystem.getJoinedPath(state.paths.dataDir, "bin");
    const localNodePath = await Neutralino.filesystem.getJoinedPath(binDir, "node.exe");
    
    let nodeCmd = "node"; // Default global
    if (await pathExists(localNodePath)) {
        nodeCmd = quotePath(localNodePath);
        log("Using local Node.js runtime.", "info", false);
    } else {
        log("Local Node.js not found, using global.", "warn", false);
    }

    return `cmd /c "set PORT=${port} && ${nodeCmd} server.js"`;
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
        log("Application started (Direct Node).");
        
        state.isRunning = true;
        updateButtonState();

        // Buka browser manual karena kita bypass start.bat
        const port = state.config.appPort || 1998;
        log(`Opening browser at http://localhost:${port}...`);
        setTimeout(() => {
            Neutralino.os.open(`http://localhost:${port}`);
        }, 3000);

    } catch (err) {
        setRuntimeBadge("Start failed", "attn");
        log(`Start failed: ${err.message}`, "error");
        state.isRunning = false;
        updateButtonState();
    }
}

async function stopApp() {
    if (state.currentPid) {
        await Neutralino.os.execCommand(`taskkill /T /F /PID ${state.currentPid}`);
        state.currentPid = null;
        ui.appPid.textContent = "-";
        log("Stopped spawned process.");
    }

    // Safely resolve port even if config is not fully loaded
    const port = (state.config && state.config.appPort) ? state.config.appPort : DEFAULT_APP_PORT;
    const command = `powershell -NoProfile -Command "$pid = (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if ($pid) { Stop-Process -Id $pid -Force; 'stopped'; } else { 'notfound'; }"`;
    const result = await Neutralino.os.execCommand(command);
    if (result.stdOut && result.stdOut.includes("stopped")) {
        log(`Stopped process on port ${port}.`);
    } else if (result.stdOut && result.stdOut.includes("notfound")) {
        log(`No process found on port ${port}.`);
    }

    if (state.config && state.config.allowNodeKill) {
        await Neutralino.os.execCommand("taskkill /F /IM node.exe");
        log("Forced stop for node.exe.", "warn");
    }

    ui.appPid.textContent = "-";
    setRuntimeBadge("Stopped", "badge-neutral");
    
    state.isRunning = false;
    updateButtonState();
}

async function extractZipNative(zipPath, destination) {
    // Native extraction using PowerShell to handle large files (avoid OOM)
    // Progress is indeterminate (user just waits)
    try {
        // Ensure destination exists
        await ensureDirectory(destination);

        const winZipPath = zipPath.replace(/\//g, "\\");
        const winDestPath = destination.replace(/\//g, "\\");
        
        const command = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${winZipPath}' -DestinationPath '${winDestPath}' -Force"`;
        
        // This is a blocking call (await) until done
        const result = await Neutralino.os.execCommand(command);
        
        if (result.exitCode !== 0) {
            throw new Error(`Native unzip failed: ${result.stdErr}`);
        }
    } catch (err) {
        throw new Error(`Native extraction failed: ${err.message}`);
    }
}

async function runUpdate(force) {
    if (state.busy) {
        return;
    }

    setBusy(true);
    setStatus("Updating", "busy", "Preparing update pipeline.");
    setProgress(0, "Initializing...");
    startStuckMonitor(); // Start watching for stalls

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

        // --- PREPARE PATHS ---
        // We need separate paths for App Zip and OC Zip
        const appZipPath = state.paths.zipPath;
        const ocZipPath = await Neutralino.filesystem.getJoinedPath(state.paths.dataDir, "oc_tools.zip");
        const ocStagingDir = await Neutralino.filesystem.getJoinedPath(state.paths.dataDir, "oc_staging");
        
        // Target location for oc.exe and node.exe
        const binDir = await Neutralino.filesystem.getJoinedPath(state.config.installDir, "bin");
        // We actually store tools in the runner's bin/ folder, not the app's bin/ folder to persist them across updates?
        // Wait, looking at lines below: "const binDir = ... state.config.installDir, 'bin'".
        // If we put node.exe inside installDir, it gets deleted when we do removeDirectory(state.config.installDir).
        // WE MUST STORE NODE.EXE OUTSIDE THE INSTALL DIR (e.g. in runner's root/bin).
        
        const runnerBinDir = await Neutralino.filesystem.getJoinedPath(state.paths.dataDir, "bin");
        await ensureDirectory(runnerBinDir);

        const nodeExePath = await Neutralino.filesystem.getJoinedPath(runnerBinDir, "node.exe");
        const needNode = !(await pathExists(nodeExePath));

        const ocExePath = await Neutralino.filesystem.getJoinedPath(runnerBinDir, "oc.exe");
        const needOc = !(await pathExists(ocExePath));

        // --- STAGE 0: DOWNLOAD NODE.JS (0-100%) ---
        if (needNode) {
            log("Node.js runtime missing. Downloading...");
            log(`Node URL: ${NODE_URL}`, "INFO", false);
            setProgress(0, "Downloading Node.js Runtime...");
            await downloadFile(NODE_URL, nodeExePath);
            setProgress(100, "Node.js ready.");
        }

        // --- STAGE 1: DOWNLOAD APP (0-100%) ---
        const dlLabel = `Downloading App (${release.tag})`;
        log(dlLabel + "...");
        log(`App URL: ${release.url}`, "INFO", false);
        setProgress(0, "Downloading App Update...");
        
        await downloadFile(release.url, appZipPath);
        
        // --- STAGE 2: DOWNLOAD OC TOOLS (0-100%) [Optional] ---
        // Note: oc.exe is also stored in runnerBinDir now to persist it
        if (needOc) {
            log("OC binary missing. Downloading tools...");
            log(`OC URL: ${OC_TOOLS_URL}`, "INFO", false);
            setProgress(0, "Downloading OC Tools...");
            await downloadFile(OC_TOOLS_URL, ocZipPath);
        }

        // --- TRANSITION ---
        log("Downloads complete. Preparing system...");
        setProgress(0, "Stopping services...");
        await stopApp();
        
        log("Cleaning install directory.");
        
        // We no longer need to backup OC from installDir, because we store it in runnerBinDir
        // But for backward compatibility, if oc.exe exists in installDir/bin, we might want to move it out?
        // For now, let's just stick to the new plan: tools live in runner's bin.
        
        await removeDirectory(state.config.installDir);
        await removeDirectory(state.paths.stagingDir);
        await ensureDirectory(state.paths.stagingDir);

        // --- STAGE 3: EXTRACT APP (0-100%) ---
        // Use JSZip for detailed progress on app files
        log("Extracting App package...");
        setProgress(0, "Extracting App...");
        await extractZip(appZipPath, state.paths.stagingDir);

        // --- STAGE 4: EXTRACT OC TOOLS (Indeterminate) [If downloaded] ---
        if (needOc && (await pathExists(ocZipPath))) {
            log("Extracting OC Tools...");
            setProgress(100, "Extracting OC Tools..."); 
            
            await removeDirectory(ocStagingDir);
            await ensureDirectory(ocStagingDir);
            
            // Use NATIVE extraction for large file safety
            await extractZipNative(ocZipPath, ocStagingDir);
            
            // Move oc.exe to runnerBinDir
            const possibleOc = await Neutralino.filesystem.getJoinedPath(ocStagingDir, "oc.exe");
            if (await pathExists(possibleOc)) {
                 await Neutralino.filesystem.move(possibleOc, ocExePath);
                 log("Installed OC binary.");
            } else {
                log("Warning: oc.exe not found in downloaded zip!", "warn");
            }
            await removeDirectory(ocStagingDir);
        }

        // --- DEPLOY APP ---
        const extractedRoot = await selectExtractedRoot(state.paths.stagingDir);
        log("Deploying App files...");
        await Neutralino.filesystem.move(extractedRoot, state.config.installDir);

        // --- CLEANUP ---
        await removeDirectory(state.paths.stagingDir);
        if (await pathExists(state.paths.zipPath)) await Neutralino.filesystem.remove(state.paths.zipPath);
        if (await pathExists(ocZipPath)) await Neutralino.filesystem.remove(ocZipPath);

        state.config.localVersion = release.tag;
        await saveConfig(state.paths, state.config);
        syncConfigUI(state.config);
        setUpdateBadge("Up to date", "success");
        setProgress(100, "Update complete");
        setStatus("Updated", "ok", "Launcher is ready.");
        log(`Update complete: ${release.tag}`);

        state.isInstalled = true;
        ui.updateBtn.textContent = "Up to date";
        ui.startBtn.disabled = false;
        
        await startApp();
    } catch (err) {
        // Cleanup partial/corrupt zip file on error
        try {
            if (await pathExists(state.paths.zipPath)) {
                await Neutralino.filesystem.remove(state.paths.zipPath);
                log("Cleaned up partial download.", "warn");
            }
        } catch (cleanupErr) {
            console.error("Cleanup failed:", cleanupErr);
        }

        setStatus("Update failed", "warn", "Check log for details.");
        setProgress(0, "Standby");
        log(`Update failed: ${err.message}`, "error");

        await Neutralino.os.showMessageBox(
            "Update Error",
            `Unable to complete the update.\n\nReason:\n${err.message}\n\nPlease check your internet connection and try again.`,
            "OK",
            "ERROR"
        );
    } finally {
        stopStuckMonitor(); // Cleanup monitor
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

    // 1. Single Instance Check
    const canRun = await ensureSingleInstance();
    if (!canRun) return; // Exit initiated inside function

    Neutralino.events.on("windowClose", async () => {
        // Ensure app process is killed on exit
        await stopApp();

        // Cleanup leftover files on exit
        if (state.paths) {
            try {
                if (await pathExists(state.paths.zipPath)) {
                    await Neutralino.filesystem.remove(state.paths.zipPath);
                }
                if (await pathExists(state.paths.stagingDir)) {
                    await removeDirectory(state.paths.stagingDir);
                }
                // Remove Lock File
                const lockPath = await Neutralino.filesystem.getJoinedPath(NL_PATH, "instance.lock");
                if (await pathExists(lockPath)) {
                    await Neutralino.filesystem.remove(lockPath);
                }
            } catch (err) {
                console.error("Exit cleanup failed:", err);
            }
        }
        Neutralino.app.exit();
    });

    ui.launcherVersion.textContent = NL_APPVERSION;
    state.paths = await resolvePaths();
    await ensureDirectory(state.paths.dataDir);

    // Rotate Log: If runner.log > 5MB, delete it.
    try {
        const logPath = await Neutralino.filesystem.getJoinedPath(NL_PATH, "runner.log");
        if (await pathExists(logPath)) {
            const stats = await Neutralino.filesystem.getStats(logPath);
            if (stats.size > 5 * 1024 * 1024) { // 5MB
                await Neutralino.filesystem.remove(logPath);
                // Log rotation event (will create new file)
                // log("Log rotated due to size limit.", "info", false); 
                // Can't log yet as ui/log might not handle file creation race if we just deleted it? 
                // Actually log() appends, so it will just create new.
            }
        }
    } catch (err) {
        console.error("Log rotation check failed:", err);
    }

    state.config = await loadConfig(state.paths);
    syncConfigUI(state.config);
    setProgress(0, "Standby");
    
    await checkInstallStatus();
    
    // Check if port is ALREADY in use (External run)
    const port = state.config.appPort || DEFAULT_APP_PORT;
    if (await checkPortActive(port)) {
        state.isRunning = true;
        setRuntimeBadge("Running (Found)", "success");
        log(`Detected active process on port ${port}. Attached control.`, "info");
        // We don't have the PID if it wasn't started by us, so we can't kill by PID, only by Port.
        // But stopApp handles 'kill by port' too.
    }
    updateButtonState();

    bindEvents();
    log("Launcher ready.");
    await checkForUpdates(true);

    // Auto-check worker (every 1 hour)
    setInterval(async () => {
        if (!state.busy) {
            try {
                // Check silently
                const release = await checkForUpdates(true);
                
                // If update is available, trigger it automatically
                if (release && release.tag && release.tag !== state.config.localVersion) {
                    log(`Auto-update detected new version: ${release.tag}. Starting update...`, "info");
                    // We use 'true' to force it, though runUpdate checks version too.
                    await runUpdate(true);
                }
            } catch (err) {
                console.error("Auto-update worker failed:", err);
            }
        }
    }, 60 * 60 * 1000);
}

init();
