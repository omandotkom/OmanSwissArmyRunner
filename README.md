# Oman Swiss Army Tool Runner

A lightweight, native launcher and auto-updater for the **Oman Swiss Army Tool**. 
Built with [Neutralinojs](https://neutralino.js.org/), this runner ensures you always have the latest version of the toolkit and its dependencies (like OpenShift Client tools).

## Features

- **Auto-Update**: Automatically checks for updates from GitHub Releases every hour.
- **Auto-Install**: Downloads and installs the main application and required dependencies (`oc.exe`) if missing.
- **Process Management**: Manages the application lifecycle, including starting, stopping, and handling port conflicts (default port: 1998).
- **Self-Healing**: Automatically detects stuck updates or missing files and attempts to recover.
- **Native Performance**: Lightweight executable with minimal resource usage compared to Electron.

## How it Works

1. **Initialization**: Checks for existing installations and validates the configuration.
2. **Update Check**: Queries GitHub for the latest release tag.
3. **Download & Extract**: 
   - Downloads the application zip.
   - Downloads `oc_tools.zip` (OpenShift Client) if missing.
   - Safely extracts files to a staging area before swapping them into production.
4. **Execution**: Launches the Node.js server (`server.js`) on the configured port and opens the default browser.

## Configuration

Configuration is stored in `runner-config.json` (auto-generated on first run):

```json
{
  "localVersion": "v1.0.0",
  "installDir": "path/to/oman-swiss-army-tool",
  "startCommand": "cmd /c start.bat",
  "appPort": 1998,
  "allowNodeKill": false
}
```

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm start
   # or
   neu run
   ```

3. Build for release:
   ```bash
   npm run build
   # or
   neu build
   ```

## License

MIT