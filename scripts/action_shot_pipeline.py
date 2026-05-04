from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "frontend" / "public" / "nba" / "action-shots"
DEFAULT_RAW_DIR = ROOT / "tmp" / "action-shots" / "raw"


def load_manifest(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict):
        players = payload.get("players")
    else:
        players = payload
    if not isinstance(players, list):
        raise ValueError(f"Manifest at {path} must contain a players array.")
    return [item for item in players if isinstance(item, dict)]


def build_prompt(item: dict) -> str:
    name = str(item.get("name", "")).strip()
    jersey_team = str(item.get("jerseyTeam") or item.get("team") or "").strip()
    if not name or not jersey_team:
        raise ValueError(f"Manifest item is missing name or jerseyTeam: {item}")
    return "\n".join(
        [
            "Use case: photorealistic-natural",
            "Asset type: basketball player cutout asset for fantasy lineup UI",
            f"Primary request: {name} in a real in-game NBA action moment, three-quarter body, isolated for background removal",
            "Scene/backdrop: perfectly flat solid #00ff00 chroma-key background only",
            f"Subject: {name} wearing a {jersey_team} game uniform, realistic body proportions and facial likeness, energetic live-game posture with the basketball",
            "Style/medium: photorealistic editorial sports photography",
            "Composition/framing: centered single subject, generous padding around the whole body, no cropping of head, arms, hands, or ball",
            "Lighting/mood: clean arena lighting on subject only",
            "Constraints: background must be one totally uniform #00ff00 color; no crowd; no court; no floor plane; no shadows; no contact shadow; no reflection; no text; no watermark; do not use #00ff00 anywhere on the subject",
        ]
    )


def resolve_helper_path(explicit: str | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    action_helper = os.environ.get("ACTION_SHOT_REMOVE_HELPER")
    if action_helper:
        candidates.append(Path(action_helper).expanduser())
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        candidates.append(Path(codex_home) / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py")
    candidates.append(Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py")

    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "Could not find remove_chroma_key.py. Set ACTION_SHOT_REMOVE_HELPER or pass --helper."
    )


def print_prompts(manifest_path: Path) -> int:
    items = load_manifest(manifest_path)
    for index, item in enumerate(items, start=1):
        slug = str(item.get("slug") or f"player-{index}").strip()
        prompt = str(item.get("prompt") or build_prompt(item))
        print(f"===== {slug} =====")
        print(prompt)
        print()
    return 0


def postprocess_manifest(
    manifest_path: Path,
    out_dir: Path,
    raw_dir: Path,
    helper: Path,
    python_exe: str,
    force: bool,
) -> int:
    items = load_manifest(manifest_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    results: list[tuple[str, Path]] = []
    for index, item in enumerate(items, start=1):
        slug = str(item.get("slug") or f"player-{index}").strip()
        source = str(item.get("source") or "").strip()
        if not slug or not source:
            raise ValueError(f"Manifest item {index} must include slug and source.")

        source_path = Path(source).expanduser()
        if not source_path.is_file():
            raise FileNotFoundError(f"Source image not found for {slug}: {source_path}")

        raw_copy = raw_dir / f"{slug}-chroma{source_path.suffix.lower() or '.png'}"
        final_out = out_dir / f"{slug}.png"
        shutil.copy2(source_path, raw_copy)

        command = [
            python_exe,
            str(helper),
            "--input",
            str(raw_copy),
            "--out",
            str(final_out),
            "--auto-key",
            "border",
            "--soft-matte",
            "--transparent-threshold",
            "12",
            "--opaque-threshold",
            "220",
            "--despill",
        ]
        if force:
            command.append("--force")
        subprocess.run(command, check=True)
        results.append((slug, final_out))

    print("Processed action shots:")
    for slug, path in results:
        print(f"- {slug}: {path}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Batch prompt and chroma-key pipeline for lineup action-shot assets.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prompts_parser = subparsers.add_parser("print-prompts", help="Print one built-in image prompt per manifest entry.")
    prompts_parser.add_argument("--manifest", required=True, help="Path to a JSON manifest.")

    post_parser = subparsers.add_parser("postprocess", help="Copy generated chroma-key images and convert them to transparent PNGs.")
    post_parser.add_argument("--manifest", required=True, help="Path to a JSON manifest with source image paths.")
    post_parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Directory for final transparent PNGs.")
    post_parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR), help="Directory for copied chroma-key source files.")
    post_parser.add_argument("--helper", default=None, help="Optional explicit path to remove_chroma_key.py.")
    post_parser.add_argument("--python-exe", default=sys.executable, help="Python executable used to run the chroma-key helper.")
    post_parser.add_argument("--force", action="store_true", help="Overwrite existing output PNGs.")

    args = parser.parse_args(argv)
    if args.command == "print-prompts":
        return print_prompts(Path(args.manifest))
    if args.command == "postprocess":
        return postprocess_manifest(
            manifest_path=Path(args.manifest),
            out_dir=Path(args.out_dir),
            raw_dir=Path(args.raw_dir),
            helper=resolve_helper_path(args.helper),
            python_exe=args.python_exe,
            force=args.force,
        )
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
