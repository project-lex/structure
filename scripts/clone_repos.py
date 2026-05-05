#!/usr/bin/env python3
"""Clone repositories listed in `config/repos.yaml`.

Usage:
  ./scripts/clone_repos.py [--config CONFIG] [--dest DIR] [--dry-run]

The script tries to use PyYAML if available; otherwise it falls back
to a simple parser that supports a top-level YAML list (lines starting
with `-`) or plain lines with git URLs.
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path


def parse_with_pyyaml(path):
    import yaml

    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    # If the file is a list of strings
    if isinstance(data, list):
        return [str(x).strip() for x in data if x]

    # If it's a dict, try common keys
    if isinstance(data, dict):
        for key in ("repos", "repositories", "git", "urls"):
            if key in data and isinstance(data[key], list):
                return [str(x).strip() for x in data[key] if x]

        # As a fallback, pick the first list found
        for v in data.values():
            if isinstance(v, list):
                return [str(x).strip() for x in v if x]

    return None


def ensure_pyyaml_installed() -> bool:
    """Ensure PyYAML is installed. Return True if yaml can be imported."""
    try:
        import yaml  # noqa: F401
        return True
    except Exception:
        print("PyYAML not found — attempting to install via pip...", file=sys.stderr)
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "pyyaml"], check=True)
            # try import again
            import importlib
            importlib.invalidate_caches()
            import yaml  # noqa: F401
            print("PyYAML installed successfully.")
            return True
        except Exception as e:
            print(f"Failed to install PyYAML: {e}", file=sys.stderr)
            return False


def simple_fallback_parse(path):
    repos = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("-"):
                # YAML-like list item
                candidate = line.lstrip("- ").strip()
                if candidate:
                    repos.append(candidate)
                continue
            # If the line looks like a git url, accept it
            if line.startswith("git@") or line.startswith("http://") or line.startswith("https://"):
                repos.append(line)
                continue
            # Otherwise ignore
    return repos


def parse_repos(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    # Try PyYAML first; ensure it's installed if missing
    if ensure_pyyaml_installed():
        try:
            pyyaml_res = parse_with_pyyaml(str(path))
            if pyyaml_res is not None:
                return pyyaml_res
        except Exception as e:
            print(f"PyYAML parse failed: {e}", file=sys.stderr)

    # fallback
    return simple_fallback_parse(str(path))


def run_clone(repo_url: str, dest: Path, depth: int | None, dry_run: bool) -> int:
    def repo_dir_name(url: str) -> str:
        s = url.rstrip("/\n")
        # handle scp-like URLs (git@host:owner/repo.git)
        if ":" in s and "//" not in s:
            # split off the host part
            s = s.split(":", 1)[1]
        # take last path component if any
        if "/" in s:
            s = s.rsplit("/", 1)[1]
        # strip .git suffix
        if s.endswith(".git"):
            s = s[:-4]
        return s

    repo_name = repo_dir_name(repo_url)
    target = dest / repo_name
    cmd = ["git", "clone"]
    if depth and depth > 0:
        cmd += ["--depth", str(depth)]
    cmd += ["--recurse-submodules", repo_url, str(target)]

    print("Cloning/updating:", repo_url)
    print("->", target)

    # If target exists and looks like a git repo, update it instead of cloning
    if target.exists():
        git_dir = target / ".git"
        if git_dir.exists():
            # update existing repo: fetch and update main branch
            fetch_cmd = ["git", "fetch", "origin"]
            check_origin_main = ["git", "rev-parse", "--verify", "origin/main"]
            check_local_main = ["git", "rev-parse", "--verify", "main"]
            checkout_from_origin = ["git", "checkout", "-B", "main", "origin/main"]
            checkout_local = ["git", "checkout", "main"]
            pull_cmd = ["git", "pull", "--ff-only", "origin", "main"]

            print("Existing repository found — will update 'main' branch")
            if dry_run:
                print("DRY RUN:", " ".join(fetch_cmd), "(cwd=", target, ")")
                print("DRY RUN:", " ".join(check_origin_main), "(cwd=", target, ")")
                print("DRY RUN:", " ".join(check_local_main), "(cwd=", target, ")")
                print("DRY RUN:", " ".join(checkout_from_origin), "(if origin/main exists)")
                print("DRY RUN:", " ".join(checkout_local), "(if local main exists)")
                print("DRY RUN:", " ".join(pull_cmd), "(cwd=", target, ")")
                return 0

            # perform update
            rc = subprocess.run(fetch_cmd, cwd=str(target)).returncode
            if rc != 0:
                return rc

            # check if origin/main exists
            origin_main = subprocess.run(check_origin_main, cwd=str(target), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if origin_main.returncode != 0:
                print("Remote branch 'origin/main' not found; skipping update.")
                return 0

            # if local main exists, checkout it; otherwise create from origin/main
            local_main = subprocess.run(check_local_main, cwd=str(target), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if local_main.returncode != 0:
                rc = subprocess.run(checkout_from_origin, cwd=str(target)).returncode
                if rc != 0:
                    return rc
            else:
                rc = subprocess.run(checkout_local, cwd=str(target)).returncode
                if rc != 0:
                    return rc

            # pull latest changes
            rc = subprocess.run(pull_cmd, cwd=str(target)).returncode
            return rc
        else:
            print(f"Target exists but is not a git repository: {target}; skipping.")
            return 0

    # perform clone
    if dry_run:
        print("DRY RUN:", " ".join(cmd))
        return 0

    proc = subprocess.run(cmd)
    return proc.returncode


def main():
    ap = argparse.ArgumentParser(description="Clone repositories listed in a YAML file.")
    ap.add_argument("--config", "-c", default="config/repos.yaml", help="Path to repos config file")
    ap.add_argument("--dest", "-d", default="..", help="Destination directory to clone into (default: ../)")
    ap.add_argument("--depth", type=int, default=None, help="Shallow clone depth (passes --depth to git clone)")
    ap.add_argument("--dry-run", action="store_true", help="Print clone commands without executing them")
    args = ap.parse_args()

    cfg = Path(args.config)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    try:
        repos = parse_repos(cfg)
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        sys.exit(2)

    if not repos:
        print(f"No repositories found in {cfg}", file=sys.stderr)
        sys.exit(1)

    failures = []
    for repo in repos:
        rc = run_clone(repo, dest, args.depth, args.dry_run)
        if rc != 0:
            failures.append((repo, rc))

    if failures:
        print("Some clones failed:")
        for r, code in failures:
            print(f" - {r}: exit {code}")
        sys.exit(3)

    print("All done.")


if __name__ == "__main__":
    main()
