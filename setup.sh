#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_POST_SCRIPT="$PROJECT_DIR/scripts/setup-post.mjs"
LOG_FILE="$PROJECT_DIR/setup.log"
NETWORK_CHECK_MODE="auto"
FORWARD_ARGS=()
BREW_INSTALL_SCRIPT=""
CURRENT_STEP="starting"

log() {
  printf "\n==> %s\n" "$1"
}

fail() {
  echo "ERROR: $1"
  exit 1
}

warn() {
  printf "⚠️  %s\n" "$1"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

set_step() {
  CURRENT_STEP="$1"
  log "$1"
}

fail_with_help() {
  local message="$1"
  local help_func="${2:-}"

  echo ""
  echo "ERROR: $message"
  if [[ -n "$help_func" ]] && declare -f "$help_func" >/dev/null 2>&1; then
    echo ""
    "$help_func"
  fi
  print_manual_run_help_if_possible
  exit 1
}

print_project_write_help() {
  cat <<EOF
Manual steps:
1. Make sure your terminal app can access this folder.
   macOS: System Settings -> Privacy & Security -> Files and Folders
2. If this repo is inside Documents, Desktop, or Downloads, allow Terminal or iTerm for that folder.
3. If that still fails, give Terminal or iTerm Full Disk Access, then restart the terminal.
4. Confirm you own the project folder:
   ls -ld "$PROJECT_DIR"
5. Re-run:
   ./setup.sh
EOF
}

print_xcode_help() {
  cat <<'EOF'
Manual steps:
1. Run:
   xcode-select --install
2. Finish the installer dialog. This can take 5-10 minutes and may require admin approval.
3. If your Mac is managed by IT and the install is blocked, ask IT/admin to install Xcode Command Line Tools.
4. If macOS says the tools are already installed but setup still fails, run:
   sudo xcode-select --reset
5. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_homebrew_help() {
  cat <<'EOF'
Manual steps:
1. Install Homebrew manually:
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
2. If prompted, enter your macOS password.
3. If the install is blocked on a managed Mac, ask IT/admin for Homebrew access.
4. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_nvm_install_help() {
  cat <<'EOF'
Manual steps:
1. Verify Homebrew works:
   brew --version
2. Try nvm install directly:
   brew update
   brew install nvm
3. If install still fails, inspect brew health:
   brew doctor
4. If this is a managed Mac, ask IT/admin to allow Homebrew formula installs.
5. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_npm_prefix_help() {
  cat <<'EOF'
Manual steps:
1. Remove any custom npm prefix from the current shell:
   unset NPM_CONFIG_PREFIX npm_config_prefix
2. If npm is already installed, also run:
   npm config delete prefix
3. Open ~/.npmrc and remove any line that starts with:
   prefix=
4. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_nvm_permissions_help() {
  cat <<'EOF'
Manual steps:
1. Make sure you own your nvm and npm folders:
   sudo chown -R $(whoami) ~/.nvm ~/.npm
2. Create the nvm folder if it does not exist:
   mkdir -p ~/.nvm
3. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_profile_write_help() {
  cat <<'EOF'
Manual steps:
1. Make sure your shell profile is writable:
   ~/.zshrc or ~/.bash_profile
2. If ownership is wrong, fix it:
   sudo chown $(whoami) ~/.zshrc ~/.bash_profile ~/.bashrc 2>/dev/null || true
3. Open a new terminal and re-run:
   ./setup.sh
EOF
}

print_node_path_help() {
  cat <<'EOF'
Manual steps:
1. In the same terminal, run:
   export NVM_DIR="$HOME/.nvm"
   . "$(brew --prefix nvm)/nvm.sh"
   nvm install
   nvm use
   hash -r
2. Verify:
   which node
   node --version
   npm --version
3. If node is not inside ~/.nvm, remove old Node.js PATH exports from ~/.zshrc or ~/.bash_profile, then open a new terminal.
4. If you have a custom npm prefix, remove it from ~/.npmrc.
5. Re-run:
   ./setup.sh
EOF
}

print_generic_help() {
  cat <<EOF
Manual checks:
1. Re-run in a fresh terminal:
   ./setup.sh
2. If the repo is inside Documents/Desktop/Downloads, check Terminal/iTerm folder permissions in macOS Privacy settings.
3. If npm/nvm permissions look wrong, run:
   sudo chown -R \$(whoami) ~/.npm ~/.nvm
4. If it still fails, share:
   $LOG_FILE
EOF
}

print_manual_run_help_if_possible() {
  local node_major=""

  if command_exists node && command_exists npm; then
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
    if [[ -n "$node_major" && "$node_major" -ge 22 ]]; then
      echo ""
      echo "You can continue without setup right now:"
      echo "1. node --version"
      echo "2. npm --version"
      echo "3. npm install"
      echo "4. npm run dev"
      return
    fi
  fi

  if command_exists node || command_exists npm; then
    echo ""
    echo "Detected partial Node.js/npm tooling in PATH."
    echo "If npm run dev works, you can continue manually with:"
    echo "  npm install"
    echo "  npm run dev"
  fi
}

handle_unexpected_error() {
  local exit_code="$1"
  local line="$2"

  trap - ERR
  echo ""
  echo "ERROR: Setup stopped unexpectedly while: $CURRENT_STEP"
  echo "Shell line: $line"
  echo "Log file: $LOG_FILE"
  echo ""

  case "$CURRENT_STEP" in
    *"Xcode Command Line Tools"*)
      print_xcode_help
      ;;
    *"Installing nvm"*)
      print_nvm_install_help
      ;;
    *"Homebrew"*)
      print_homebrew_help
      ;;
    *"Installing Node version"*|*"Verifying active Node.js"*)
      print_node_path_help
      ;;
    *)
      print_generic_help
      ;;
  esac

  print_manual_run_help_if_possible

  exit "$exit_code"
}

ensure_directory_writable() {
  local dir="$1"
  local label="$2"
  local help_func="$3"
  local probe="$dir/.gamejam-write-test.$$"

  if [[ ! -d "$dir" ]]; then
    fail_with_help "$label does not exist: $dir" "$help_func"
  fi

  if ! : > "$probe" 2>/dev/null; then
    fail_with_help "Cannot write to $label: $dir" "$help_func"
  fi

  rm -f "$probe"
}

ensure_file_appendable() {
  local file="$1"
  local label="$2"
  local help_func="$3"
  local parent_dir

  parent_dir="$(dirname "$file")"
  if [[ ! -d "$parent_dir" ]]; then
    fail_with_help "Missing directory for $label: $parent_dir" "$help_func"
  fi

  if ! touch "$file" 2>/dev/null; then
    fail_with_help "Cannot create or update $label: $file" "$help_func"
  fi
}

has_prefix_setting_in_file() {
  local file="$1"
  [[ -f "$file" ]] && grep -Eq '^[[:space:]]*prefix[[:space:]]*=' "$file"
}

check_project_permissions() {
  set_step "Checking project write permissions"
  ensure_directory_writable "$PROJECT_DIR" "project directory" "print_project_write_help"
  ensure_file_appendable "$LOG_FILE" "setup log file" "print_project_write_help"
}

cleanup_tmp_files() {
  if [[ -n "$BREW_INSTALL_SCRIPT" && -f "$BREW_INSTALL_SCRIPT" ]]; then
    rm -f "$BREW_INSTALL_SCRIPT"
  fi
}

parse_args() {
  local arg value
  for arg in "$@"; do
    case "$arg" in
      --skip-network-check|--no-network-check)
        NETWORK_CHECK_MODE="off"
        ;;
      --strict-network-check)
        NETWORK_CHECK_MODE="strict"
        ;;
      --network-check=*)
        value="${arg#--network-check=}"
        case "$value" in
          auto|strict|off)
            NETWORK_CHECK_MODE="$value"
            ;;
          *)
            fail "Invalid value for --network-check. Use auto, strict, or off."
            ;;
        esac
        ;;
      *)
        FORWARD_ARGS+=("$arg")
        ;;
    esac
  done
}

init_logging() {
  if command_exists tee; then
    exec > >(tee -a "$LOG_FILE") 2>&1
  else
    exec >> "$LOG_FILE" 2>&1
  fi

  log "Setup started"
  echo "Log file: $LOG_FILE"
}

run_network_check() {
  local registry="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"

  case "$NETWORK_CHECK_MODE" in
    off)
      log "Skipping network connectivity precheck (--network-check=off)"
      return
      ;;
    auto|strict)
      ;;
    *)
      fail "Unsupported network check mode: $NETWORK_CHECK_MODE"
      ;;
  esac

  log "Checking network connectivity"
  if curl -fsSL --max-time 8 "$registry" >/dev/null 2>&1; then
    return
  fi

  if [[ "$NETWORK_CHECK_MODE" == "strict" ]]; then
    fail "Could not reach $registry. Check internet/proxy settings, or run with --network-check=off."
  fi

  warn "Could not reach $registry during precheck. Continuing because --network-check=auto."
  warn "If setup later fails due to network, retry with internet/proxy configured."
}

check_npm_prefix_conflicts() {
  local has_conflict=0

  set_step "Checking npm prefix conflicts"

  if [[ -n "${NPM_CONFIG_PREFIX:-}" ]]; then
    echo "Detected NPM_CONFIG_PREFIX=$NPM_CONFIG_PREFIX"
    has_conflict=1
  fi

  if [[ -n "${npm_config_prefix:-}" ]]; then
    echo "Detected npm_config_prefix=$npm_config_prefix"
    has_conflict=1
  fi

  if has_prefix_setting_in_file "$HOME/.npmrc"; then
    echo "Detected prefix=... in $HOME/.npmrc"
    has_conflict=1
  fi

  if (( has_conflict > 0 )); then
    fail_with_help "A custom npm prefix conflicts with nvm-managed Node.js." "print_npm_prefix_help"
  fi
}

ensure_brew_shellenv() {
  if [[ -x "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

brew_quiet() {
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1 brew "$@"
}

ensure_profile_has_nvm_block() {
  local profile_file="$1"
  local marker_start="# >>> gamejam nvm >>>"
  local marker_end="# <<< gamejam nvm <<<"

  if [[ ! -f "$profile_file" ]]; then
    if ! touch "$profile_file" 2>/dev/null; then
      fail_with_help "Could not create shell profile: $profile_file" "print_profile_write_help"
    fi
  fi

  if grep -qF "$marker_start" "$profile_file"; then
    return
  fi

  if ! {
    echo ""
    echo "$marker_start"
    echo 'export NVM_DIR="$HOME/.nvm"'
    echo 'if command -v brew >/dev/null 2>&1; then'
    echo '  NVM_BREW_PREFIX="$(brew --prefix nvm 2>/dev/null || true)"'
    echo '  [ -s "${NVM_BREW_PREFIX}/nvm.sh" ] && . "${NVM_BREW_PREFIX}/nvm.sh"'
    echo 'fi'
    echo "$marker_end"
  } >> "$profile_file"; then
    fail_with_help "Could not update shell profile: $profile_file" "print_profile_write_help"
  fi
}

verify_active_node() {
  local expected_version expected_major actual_major node_path npm_path

  set_step "Verifying active Node.js"
  hash -r 2>/dev/null || true

  expected_version="$(tr -d '[:space:]' < "$PROJECT_DIR/.nvmrc")"
  expected_version="${expected_version#v}"
  expected_major="${expected_version%%.*}"
  node_path="$(command -v node || true)"
  npm_path="$(command -v npm || true)"

  if [[ -z "$node_path" ]]; then
    fail_with_help "Node.js is still not available after nvm install." "print_node_path_help"
  fi

  actual_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [[ -z "$actual_major" || "$actual_major" != "$expected_major" ]]; then
    echo "Expected Node major: $expected_major"
    echo "Current node path: $node_path"
    [[ -n "$npm_path" ]] && echo "Current npm path: $npm_path"
    if command_exists node; then
      echo "Current node version: $(node --version 2>/dev/null || echo unknown)"
    fi
    fail_with_help "The shell is not using the Node version from .nvmrc after nvm install." "print_node_path_help"
  fi

  case "$node_path" in
    "$NVM_DIR"/*)
      ;;
    *)
      echo "Current node path: $node_path"
      fail_with_help "Node.js resolved to a path outside $NVM_DIR after nvm use." "print_node_path_help"
      ;;
  esac
}

trap cleanup_tmp_files EXIT
trap 'handle_unexpected_error $? $LINENO' ERR
parse_args "$@"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS only."
  exit 1
fi

check_project_permissions
init_logging
run_network_check
check_npm_prefix_conflicts

set_step "Checking Xcode Command Line Tools"
if ! xcode-select -p >/dev/null 2>&1; then
  local_xcode_output="$(xcode-select --install 2>&1 || true)"
  echo "Xcode Command Line Tools are required."
  echo "Attempted to open the installer."
  if [[ -n "$local_xcode_output" ]]; then
    echo "$local_xcode_output"
  fi
  fail_with_help "Xcode Command Line Tools are not installed yet." "print_xcode_help"
fi

set_step "Checking Homebrew"
if ! command_exists brew; then
  echo "Installing Homebrew..."
  echo "(You may be asked for your macOS password — this is normal.)"

  BREW_INSTALL_SCRIPT="$(mktemp -t gamejam-brew-install.XXXXXX)"
  if ! curl -fsSL "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh" -o "$BREW_INSTALL_SCRIPT"; then
    fail "Failed to download Homebrew installer. Check network/proxy settings, then re-run ./setup.sh."
  fi
  if [[ ! -s "$BREW_INSTALL_SCRIPT" ]]; then
    fail "Downloaded Homebrew installer was empty. Please retry."
  fi

  if ! NONINTERACTIVE=1 /bin/bash "$BREW_INSTALL_SCRIPT"; then
    fail_with_help "Homebrew installation failed." "print_homebrew_help"
  fi
fi
ensure_brew_shellenv

if ! command_exists brew; then
  fail_with_help "Homebrew is still not available after install." "print_homebrew_help"
fi

set_step "Installing nvm"
if ! brew_quiet list --formula nvm >/dev/null 2>&1; then
  if ! brew_quiet install nvm; then
    warn "brew install nvm failed. Trying brew update first..."
    brew_quiet update
    if ! brew_quiet install nvm; then
      fail_with_help "Failed to install nvm with Homebrew." "print_nvm_install_help"
    fi
  fi
fi

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -d "$NVM_DIR" ]]; then
  if ! mkdir -p "$NVM_DIR" 2>/dev/null; then
    fail_with_help "Could not create NVM_DIR: $NVM_DIR" "print_nvm_permissions_help"
  fi
fi
ensure_directory_writable "$NVM_DIR" "nvm directory" "print_nvm_permissions_help"
if [[ -d "$HOME/.npm" ]]; then
  ensure_directory_writable "$HOME/.npm" "npm cache directory" "print_nvm_permissions_help"
fi

NVM_SH="$(brew --prefix nvm)/nvm.sh"
if [[ ! -s "$NVM_SH" ]]; then
  fail_with_help "nvm.sh not found after install." "print_nvm_install_help"
fi

# shellcheck disable=SC1090
. "$NVM_SH"
hash -r 2>/dev/null || true

set_step "Ensuring nvm loads in your shell profile"
SHELL_NAME="$(basename "${SHELL:-}")"
PROFILE_FILES=()
case "$SHELL_NAME" in
  zsh)
    PROFILE_FILES+=("$HOME/.zshrc")
    ;;
  bash)
    PROFILE_FILES+=("$HOME/.bashrc" "$HOME/.bash_profile")
    ;;
  *)
    PROFILE_FILES+=("$HOME/.profile")
    ;;
esac

for profile in "${PROFILE_FILES[@]}"; do
  ensure_profile_has_nvm_block "$profile"
done

set_step "Installing Node version from .nvmrc"
cd "$PROJECT_DIR"
if [[ -f ".nvmrc" ]]; then
  if ! nvm install; then
    fail_with_help "Failed to install Node.js from .nvmrc." "print_nvm_permissions_help"
  fi
  if ! nvm use; then
    fail_with_help "nvm could not activate the Node.js version from .nvmrc." "print_node_path_help"
  fi
  hash -r 2>/dev/null || true
else
  fail "Missing .nvmrc."
fi

verify_active_node

if [[ ! -f "$SETUP_POST_SCRIPT" ]]; then
  fail "Missing scripts/setup-post.mjs."
fi

set_step "Running shared post-setup checks"
node "$SETUP_POST_SCRIPT" "${FORWARD_ARGS[@]+"${FORWARD_ARGS[@]}"}"
