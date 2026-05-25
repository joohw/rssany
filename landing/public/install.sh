#!/usr/bin/env sh
set -eu

REPO_SLUG="joohw/clovapi"
DEFAULT_BASE_ROOT="https://downloads.clovapi.com/clovapi"

log() {
  printf '%s\n' "[clovapi install] $*"
}

fail() {
  printf '%s\n' "[clovapi install] error: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

trim_trailing_slash() {
  printf '%s' "$1" | sed 's:/*$::'
}

detect_os() {
  os_name="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os_name" in
    linux*) printf '%s' "linux" ;;
    darwin*) printf '%s' "darwin" ;;
    *) fail "unsupported OS: $os_name" ;;
  esac
}

detect_arch() {
  arch_name="$(uname -m)"
  case "$arch_name" in
    x86_64|amd64) printf '%s' "amd64" ;;
    arm64|aarch64) printf '%s' "arm64" ;;
    *) fail "unsupported arch: $arch_name" ;;
  esac
}

sha256_of_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $2}'
    return
  fi
  fail "no sha256 tool found (need sha256sum/shasum/openssl)"
}

resolve_version_tag() {
  if [ -n "${CLOVAPI_VERSION:-}" ]; then
    case "$CLOVAPI_VERSION" in
      v*) printf '%s' "$CLOVAPI_VERSION" ;;
      *) printf 'v%s' "$CLOVAPI_VERSION" ;;
    esac
    return
  fi

  latest_url="$1/latest.txt"
  log "resolving latest version from $latest_url"
  latest_value="$(curl -fsSL "$latest_url" | tr -d '\r\n' || true)"
  if [ -z "$latest_value" ] && printf '%s' "$1" | grep -q "github.com/$REPO_SLUG/releases/download"; then
    latest_value="$(curl -fsSL "https://api.github.com/repos/$REPO_SLUG/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 | tr -d '\r\n' || true)"
  fi
  if [ -z "$latest_value" ]; then
    fail "failed to resolve latest version (set CLOVAPI_VERSION manually)"
  fi
  case "$latest_value" in
    v*) printf '%s' "$latest_value" ;;
    *) printf 'v%s' "$latest_value" ;;
  esac
}

main() {
  need_cmd curl
  need_cmd awk
  need_cmd tar

  os_name="$(detect_os)"
  arch_name="$(detect_arch)"

  custom_base="${CLOVAPI_CLI_BASE_URL:-}"
  if [ -n "$custom_base" ]; then
    source_bases="$(trim_trailing_slash "$custom_base")"
  else
    source_bases="$(trim_trailing_slash "${CLOVAPI_R2_BASE_ROOT:-$DEFAULT_BASE_ROOT}")"
  fi

  if [ -z "$custom_base" ]; then
    source_bases="$source_bases https://github.com/$REPO_SLUG/releases/download"
  fi

  selected_base=""
  version_tag=""
  for base_root in $source_bases; do
    candidate_version="$(resolve_version_tag "$base_root" || true)"
    if [ -n "$candidate_version" ]; then
      selected_base="$base_root/$candidate_version"
      version_tag="$candidate_version"
      break
    fi
  done

  if [ -z "$selected_base" ] || [ -z "$version_tag" ]; then
    fail "could not resolve a downloadable version from configured sources"
  fi

  artifact_version="${version_tag#v}"
  archive_name="clovapi_${artifact_version}_${os_name}_${arch_name}.tar.gz"
  checksum_url="$selected_base/checksums.txt"
  archive_url="$selected_base/$archive_name"

  temp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t clovapi-install)"
  trap 'rm -rf "$temp_dir"' EXIT INT TERM

  checksum_file="$temp_dir/checksums.txt"
  archive_file="$temp_dir/$archive_name"

  log "downloading checksums from $checksum_url"
  curl -fsSL "$checksum_url" -o "$checksum_file" || fail "failed to download checksums.txt"

  log "downloading archive from $archive_url"
  curl -fsSL "$archive_url" -o "$archive_file" || fail "failed to download archive"

  expected_sha="$(awk -v n="$archive_name" '$2==n {print $1}' "$checksum_file")"
  [ -n "$expected_sha" ] || fail "checksum entry not found for $archive_name"

  actual_sha="$(sha256_of_file "$archive_file")"
  [ "$expected_sha" = "$actual_sha" ] || fail "checksum mismatch for $archive_name"

  tar -xzf "$archive_file" -C "$temp_dir" || fail "failed to extract archive"
  [ -f "$temp_dir/clovapi" ] || fail "binary not found in archive"
  chmod +x "$temp_dir/clovapi"

  install_dir="${CLOVAPI_INSTALL_DIR:-}"
  if [ -z "$install_dir" ]; then
    if [ -w "/usr/local/bin" ]; then
      install_dir="/usr/local/bin"
    else
      install_dir="$HOME/.local/bin"
    fi
  fi
  mkdir -p "$install_dir"
  cp "$temp_dir/clovapi" "$install_dir/clovapi"
  chmod +x "$install_dir/clovapi"

  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *)
      log "installed to $install_dir/clovapi"
      log "add to PATH if needed: export PATH=\"$install_dir:\$PATH\""
      ;;
  esac

  log "install complete ($("$install_dir/clovapi" version 2>/dev/null || true))"
}

main "$@"
