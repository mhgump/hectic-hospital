# Setup Troubleshooting

Problems running `./setup.sh` (macOS) or `.\setup.ps1` (Windows)? Find your error below.

Both scripts are safe to re-run at any time — they skip steps that are already done.
Both scripts write logs to `setup.log` in the project root.

If setup fails but `npm install` + `npm run dev` works, you can keep developing and fix setup later.

---

## What the Setup Scripts Actually Do

This section is the setup contract for humans and agents. If you change `setup.sh`, `setup.ps1`, or `scripts/setup-post.mjs`, update this section too.

### Shared flags

Both `./setup.sh` and `.\setup.ps1` support:

- `--network-check=auto` (default): warn and continue if the npm registry precheck fails
- `--network-check=strict`: fail immediately if the precheck fails
- `--skip-network-check`, `--no-network-check`, or `--network-check=off`: skip the precheck
- `--verify`: forward to `scripts/setup-post.mjs` and run `npm run build` after `npm ci`

Both scripts also write logs to `setup.log` in the project root and are safe to re-run.

### macOS setup flow (`./setup.sh`)

The macOS script does these steps in order:

1. Verifies the project folder is writable and that `setup.log` can be created or appended to
2. Starts logging to `setup.log`
3. Runs the optional npm registry network precheck
4. Fails early if a custom npm prefix is set via `NPM_CONFIG_PREFIX`, `npm_config_prefix`, or `~/.npmrc`
5. Checks for Xcode Command Line Tools and asks macOS to open the installer if missing
6. Checks for Homebrew, and if missing, downloads and runs the official Homebrew installer
7. Loads `brew shellenv` so Homebrew is immediately available in the current shell
8. Installs `nvm` with Homebrew if needed
9. Ensures `~/.nvm` exists and is writable, and also checks `~/.npm` if that directory already exists
10. Sources `nvm.sh`
11. Appends a managed nvm init block to the current shell profile:
    - zsh: `~/.zshrc`
    - bash: `~/.bashrc` and `~/.bash_profile`
    - other shells: `~/.profile`
12. Runs `nvm install` and `nvm use` from `.nvmrc`
13. Verifies the active Node major version matches `.nvmrc`
14. Verifies `node` resolves from inside `~/.nvm`, not from some older global install
15. Runs `node scripts/setup-post.mjs`

### Windows setup flow (`.\setup.ps1`)

The Windows script does these steps in order:

1. Starts transcript logging to `setup.log`
2. Runs the optional npm registry network precheck
3. Requires `winget`
4. Reads the required Node major version from `package.json -> engines.node`
5. Installs Git with `winget` if missing
6. Installs Node.js LTS with `winget` if missing
7. Refreshes PATH in the current PowerShell session
8. If Node is installed but not visible in the current shell, stops and asks for a fresh PowerShell window
9. If Node is too old, upgrades Node.js LTS with `winget`
10. Re-checks the active Node version against `engines.node`
11. Runs `node scripts/setup-post.mjs`

### Shared post-setup flow (`scripts/setup-post.mjs`)

Both setup scripts finish by running the shared post-setup script, which:

1. Validates that the current Node version satisfies `package.json -> engines.node`
2. Prints the active Node and npm versions
3. Requires `package-lock.json` to exist
4. Warns if `package.json` is newer than `package-lock.json`
5. Runs `npm ci`
6. If `--verify` was passed, runs `npm run build`
7. Prints the success message and the `npm run dev` next step

### If an agent is asked to "set this up for me"

Use the real scripts first instead of recreating setup manually:

1. Detect the OS
2. Run `./setup.sh` on macOS or `.\setup.ps1` on Windows
3. Only fall back to manual recovery after the script fails
4. When the script fails, read `documentation/setup-troubleshooting.md` and inspect `setup.log`
5. Do not invent alternate setup flows if the existing script already handles that step

---

## General (Both Platforms)

### "No internet connection detected"

The setup scripts run a network precheck in `auto` mode by default.

- `--network-check=auto` (default): warn and continue if precheck fails
- `--network-check=strict`: fail immediately if precheck fails
- `--skip-network-check` or `--network-check=off`: skip precheck

If connectivity is a known constraint (proxy, private registry), try:

```bash
./setup.sh --skip-network-check
.\setup.ps1 --skip-network-check
```

If setup still fails later, follow these checks:

1. Check your Wi-Fi / ethernet connection
2. If behind a corporate proxy, configure it first:
   ```bash
   export HTTPS_PROXY=http://proxy.example.com:8080
   export HTTP_PROXY=http://proxy.example.com:8080
   ```
3. If on a VPN, try disconnecting temporarily and re-running setup
4. Try opening https://registry.npmjs.org/ in your browser — if that works but setup doesn't, your terminal may need proxy config

### "npm ci failed"

The post-setup step uses `npm ci` (clean install from lockfile). Common causes:

| Symptom | Fix |
|---------|-----|
| Lockfile out of sync with package.json | Run `npm install` to regenerate, then re-run setup |
| Network timeout / ECONNRESET | Check internet, retry. Behind a proxy? See proxy section above |
| Permission denied (EACCES) | macOS: `sudo chown -R $(whoami) node_modules` then re-run |
| Corrupted npm cache | `npm cache clean --force` then re-run setup |
| `node_modules` in a weird state | Delete `node_modules` folder, then re-run setup |

### "Node XX+ is required. Found vYY"

Your Node.js is too old. The required minimum is in `package.json` under `engines.node`.

- **macOS:** Re-run `./setup.sh` — it will install the correct version via nvm
- **Windows:** Re-run `.\setup.ps1` — it will attempt to upgrade via winget
- **Manual:** Download the correct version from https://nodejs.org

---

## macOS-Specific

### Setup cannot write to the project folder

If the repo is inside `Documents`, `Desktop`, or `Downloads`, macOS may block Terminal or iTerm from writing there.

Fix:
1. Open **System Settings → Privacy & Security → Files and Folders**
2. Allow your terminal app (`Terminal` or `iTerm`) access to that folder
3. If it still fails, grant **Full Disk Access** to the terminal app
4. Close and reopen the terminal
5. Re-run `./setup.sh`

If setup fails before doing anything useful, also check whether `setup.log` itself is writable in the project root.

### "Xcode Command Line Tools are required"

A system dialog should pop up. Click **Install**, wait for it to finish (can take 5-10 minutes), then re-run `./setup.sh`.

If the dialog doesn't appear or you dismissed it:
```bash
xcode-select --install
```

If your Mac is company-managed and install permission is blocked, ask IT/admin to install **Xcode Command Line Tools** for you.

If that says "already installed" but setup still complains:
```bash
sudo xcode-select --reset
```

### Homebrew install asks for password

This is normal. macOS needs your password to install Homebrew system-wide (especially on Intel Macs). Type your macOS login password and press Enter. The cursor won't move — that's normal.

### "Homebrew installation failed"

1. Check internet connectivity
2. Try installing Homebrew manually:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Then re-run `./setup.sh`

If your Mac is company-managed and Homebrew install is blocked, ask IT/admin for Homebrew access or a preinstalled Homebrew setup.

### "brew install nvm" fails

If `brew --version` works, you do **not** need to reinstall Homebrew.

Homebrew formulae might be stale. The script will try `brew update` automatically. If that also fails:

```bash
brew update
brew install nvm
```

If brew itself is broken:
```bash
brew doctor
```

On managed Macs, Homebrew may exist but formula installs can still be blocked by policy. In that case, ask IT/admin to allow Homebrew formula installs.

### "nvm.sh not found after install"

Try reinstalling nvm:
```bash
brew reinstall nvm
```

Then re-run `./setup.sh`.

### Shell profile could not be created or updated

The macOS script writes an nvm init block to your shell profile so future terminals can find `nvm`.

Check:
1. Your shell profile is writable:
   - zsh: `~/.zshrc`
   - bash: `~/.bashrc` and `~/.bash_profile`
   - other shells: `~/.profile`
2. If ownership looks wrong, fix it:
   ```bash
   sudo chown $(whoami) ~/.zshrc ~/.bash_profile ~/.bashrc 2>/dev/null || true
   ```
3. Open a new terminal and re-run `./setup.sh`

### "nvm install" fails (Node download fails)

1. Check internet connectivity
2. Check if the `.nvmrc` file exists and contains a valid Node version number
3. Try manually:
   ```bash
   source $(brew --prefix nvm)/nvm.sh
   nvm install 22
   ```

If you see permission errors, also run:
```bash
sudo chown -R $(whoami) ~/.nvm ~/.npm
mkdir -p ~/.nvm
```

### Node.js is still not available after nvm install

This means the script installed nvm, but the current shell still cannot resolve `node`.

Run:
```bash
export NVM_DIR="$HOME/.nvm"
. "$(brew --prefix nvm)/nvm.sh"
nvm install
nvm use
hash -r
which node
node --version
npm --version
```

If `node` still cannot be found, remove old or conflicting Node PATH exports from `~/.zshrc` / `~/.bash_profile`, open a new terminal, and re-run `./setup.sh`.

### nvm not found in new terminal after setup

The setup script adds nvm initialization to your shell profile. If `nvm` isn't found in a new terminal:

1. Check which shell you're using: `echo $SHELL`
2. Look for the nvm block in the correct file:
   - zsh: `~/.zshrc`
   - bash: `~/.bashrc` or `~/.bash_profile`
3. If missing, re-run `./setup.sh` — it will add it

### The script says Node installed, but `node --version` is still wrong

This usually means another Node installation or PATH setting is overriding the nvm version.

Try:
```bash
export NVM_DIR="$HOME/.nvm"
. "$(brew --prefix nvm)/nvm.sh"
nvm install
nvm use
hash -r
which node
node --version
npm --version
```

If `which node` does **not** point inside `~/.nvm`, remove old Node.js PATH exports from `~/.zshrc` / `~/.bash_profile`, open a new terminal, and re-run `./setup.sh`.

### Custom npm prefix conflicts with nvm

If you previously customized npm's global install location, nvm can fail or activate the wrong Node version.

Check and fix:
```bash
unset NPM_CONFIG_PREFIX npm_config_prefix
npm config delete prefix
```

Then open `~/.npmrc` and remove any line starting with:
```bash
prefix=
```

Open a new terminal and re-run `./setup.sh`.

### `FORWARD_ARGS[@]: unbound variable` during setup

This can happen on macOS with Bash 3 + `set -u` if a script expands an empty array.

- Pull the latest repo changes and re-run `./setup.sh`
- If it still appears, share the latest `setup.log` so we can check which script revision ran

### Permission errors during npm install

```bash
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) node_modules
```

Then re-run `./setup.sh`.

---

## Windows-Specific

### PowerShell won't run the script (ExecutionPolicy)

Fresh Windows machines block `.ps1` scripts. Fix:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then re-run `.\setup.ps1`.

Alternatively, bypass for a single run:
```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

### "winget is missing"

`winget` (Windows Package Manager) comes with "App Installer" from the Microsoft Store.

1. Open **Microsoft Store**
2. Search for **App Installer**
3. Click **Get** or **Update**
4. Close and reopen PowerShell
5. Verify: `winget --version`
6. Re-run `.\setup.ps1`

If you're on Windows 10 LTSC or a version without the Store:
- Download the latest `.msixbundle` from https://github.com/microsoft/winget-cli/releases

### "Installation failed. Try running as Administrator"

Some winget installs need admin privileges (especially Git and Node.js system-wide installs).

```powershell
# Right-click PowerShell → "Run as Administrator"
.\setup.ps1
```

### "Node.js was installed, but is not visible in this shell"

Windows doesn't refresh PATH in running terminals after installs. Fix:

1. Close the current PowerShell window
2. Open a new one
3. Re-run `.\setup.ps1`

### winget commands are slow or fail with "source" errors

```powershell
winget source reset --force
```

Then re-run `.\setup.ps1`.

### Node.js version too old after winget upgrade

If winget's Node.js LTS package is older than required:

1. Uninstall the current version: `winget uninstall --id OpenJS.NodeJS.LTS -e`
2. Download the required version from https://nodejs.org
3. Install it manually
4. Open a new PowerShell and re-run `.\setup.ps1`

---

## After Setup

### "npm run dev" doesn't start

1. Make sure setup completed successfully (you should see "Setup complete")
2. Try `npm install` manually if `npm ci` had issues
3. Check `node --version` matches the required version

### Port 5173 already in use

Another dev server is running. Either stop it or use a different port:
```bash
npm run dev -- --port 5174
```

### Changes aren't showing in the browser

Try a hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows).

---

## Nuclear Options (Start Over)

If nothing works, reset everything and try again:

### macOS
```bash
rm -rf node_modules
rm -rf dist
./setup.sh
```

### Windows
```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
.\setup.ps1
```

### Full Node.js reset (macOS with nvm)
```bash
nvm deactivate
nvm uninstall $(cat .nvmrc)
rm -rf node_modules
./setup.sh
```
