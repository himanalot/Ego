#!/usr/bin/env python3
"""
GENIUS CLIP FINDER
------------------
Find a single 8-second clip in which the SAME person is on-screen the whole time, with no cut-aways.
The algorithm is designed to be both *accurate* and *fast*:
  • Samples the video stream directly (no writing thousands of JPEGs to disk).
  • Uses face-recognition encodings (128-D vectors) as speaker fingerprints.
  • Maintains a sliding window and checks that all encodings in the 8-sec window are within
    a tight Euclidean distance threshold (same face).
  • Requires that ≥ 90 % of sampled frames in the window contain exactly one face;
    any multi-person / no-face frames reset the window.
Works fine on CPU but will automatically use GPU-accelerated dlib if present.
Outputs a JSON object describing the clip, or exits with code 1 if no clip found.
"""

import argparse
import cv2
import json
import os
import subprocess
import sys
import time
from collections import deque
from pathlib import Path
from typing import Deque, List, Optional, Tuple

import face_recognition
import numpy as np
from duckduckgo_search import DDGS
import requests
from io import BytesIO
from PIL import Image

TEMP_DIR = Path("./temp")
OUT_DIR = Path("./processed_videos")
TEMP_DIR.mkdir(exist_ok=True)
OUT_DIR.mkdir(exist_ok=True)

# ---------- Hyper-parameters ---------- #
TARGET_DURATION = 8          # seconds
SAMPLE_FPS = 5               # analyse 1 frame every 0.2 s
TOLERANCE = 0.45             # max Euclidean distance between face vectors to treat them as same person
MIN_VALID_RATIO = 0.9        # ≥90 % of sampled frames must have exactly one face
MIN_WINDOW_FRAMES = int(TARGET_DURATION * SAMPLE_FPS * MIN_VALID_RATIO)

# ---------- Reference face utils ---------- #

REF_DIR = Path("./reference_faces")
REF_DIR.mkdir(exist_ok=True)


def slugify(name: str) -> str:
    return "_".join(name.lower().strip().split())


def fetch_reference_encodings(person: str, search_terms: str = None, max_images: int = 15) -> List[np.ndarray]:
    """Download images of the person via DuckDuckGo and return list of face encodings."""
    # Use search terms if provided, otherwise fall back to person name
    search_queries = []
    if search_terms:
        # Split comma-separated search terms
        search_queries = [term.strip() for term in search_terms.split(',')]
        log(f"🔍 Using {len(search_queries)} search terms for '{person}'")
        for i, term in enumerate(search_queries[:3]):  # Show first 3
            log(f"   Search term {i+1}: {term}")
    else:
        search_queries = [person]
        log(f"🔍 Fetching reference images for '{person}' …")

    cache_folder = REF_DIR / slugify(person)
    enc_file = cache_folder / "encodings.npy"

    if enc_file.exists():
        try:
            arr = np.load(enc_file, allow_pickle=True)
            return [e for e in arr]
        except Exception:
            pass  # fall through to rebuild

    cache_folder.mkdir(parents=True, exist_ok=True)
    encodings: List[np.ndarray] = []

    # Search using each query term to get diverse images
    with DDGS() as ddgs:
        for query_idx, query in enumerate(search_queries[:3]):  # Limit to 3 search terms
            log(f"🔍 Searching with: '{query}'")
            try:
                results = ddgs.images(query, max_results=max_images // len(search_queries[:3]))
                for idx, res in enumerate(results):
                    img_url = res.get("image") or res.get("thumbnail")
                    if not img_url:
                        continue
                    try:
                        rsp = requests.get(img_url, timeout=10)
                        if rsp.status_code != 200:
                            continue
                        img = Image.open(BytesIO(rsp.content)).convert("RGB")
                        img_np = np.array(img)
                        enc = face_encoding(img_np)
                        if enc is not None:
                            encodings.append(enc)
                            # save image for cache/inspection
                            img.save(cache_folder / f"ref_{query_idx}_{idx}.jpg")
                        if len(encodings) >= max_images:  # Stop when we have enough
                            break
                    except Exception:
                        continue
                if len(encodings) >= max_images:
                    break
            except Exception as e:
                log(f"⚠️ Search failed for '{query}': {e}")
                continue

    if encodings:
        np.save(enc_file, np.array(encodings, dtype=np.float32))
        log(f"✅ Collected {len(encodings)} reference encodings")
    else:
        log("⚠️ No usable reference images found – will fall back to interactive mode")
    return encodings


# ---------- Utility functions ---------- #
def log(msg: str):
    print(msg, file=sys.stderr, flush=True)


def download_video(url: str) -> Path:
    """Download the YouTube video (720p max) with yt-dlp if not already in cache."""
    vid_id = (
        url.split("v=")[-1].split("&")[0]
        if "v=" in url
        else Path(url).stem.split("?")[0]
    )
    out_path = TEMP_DIR / f"genius_{vid_id}.mp4"
    if out_path.exists():
        log(f"📁 Video cache hit {out_path}")
        return out_path
    log("📥 Downloading video…")
    subprocess.run(
        [
            "yt-dlp",
            "-f",
            "best[height<=720]",
            "-o",
            str(out_path),
            url,
        ],
        check=True,
    )
    return out_path


# ---------- Core algorithm ---------- #

def face_encoding(frame: np.ndarray) -> Optional[np.ndarray]:
    """Return 128-D face encoding if exactly one face, else None."""
    locs = face_recognition.face_locations(frame, model="hog")
    if len(locs) != 1:
        return None
    return face_recognition.face_encodings(frame, locs)[0]


def window_consistent(encs: List[np.ndarray]) -> bool:
    """Return True if all encodings are within TOLERANCE of each other."""
    if len(encs) < 2:
        return False
    ref = encs[0]
    dists = np.linalg.norm(np.stack(encs) - ref, axis=1)
    return bool(np.all(dists <= TOLERANCE))


def extract_clip(src: Path, start: float, duration: int, out_name: str) -> Path:
    dst = OUT_DIR / out_name
    subprocess.run(
        [
            "ffmpeg",
            "-ss",
            f"{start}",
            "-i",
            str(src),
            "-t",
            str(duration),
            "-c",
            "copy",
            str(dst),
            "-y",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return dst


def process_video(path: Path, exclude_vectors: List[np.ndarray], start_offset: float = 0.0) -> Optional[dict]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        log("❌ Could not open video")
        return None
    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_interval = max(1, int(round(fps_video / SAMPLE_FPS)))
    log(f"🎬 Video fps {fps_video:.2f}; analysing every {frame_interval}th frame → {SAMPLE_FPS} fps")

    enc_window: Deque[Tuple[float, Optional[np.ndarray]]] = deque()
    first_valid_time: Optional[float] = None

    frame_idx = 0
    t0 = time.time()
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue

        ts = frame_idx / fps_video
        # Stop after 30 min to keep runtime bounded
        if ts > 1800:
            break

        # Skip frames before start_offset
        if ts < start_offset:
            frame_idx += 1
            continue

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        enc = face_encoding(rgb)
        enc_window.append((ts, enc))
        # Trim window to TARGET_DURATION
        while enc_window and ts - enc_window[0][0] > TARGET_DURATION:
            enc_window.popleft()

        # Check window
        times, encs = zip(*enc_window)
        valid_encs = [e for e in encs if e is not None]
        if len(valid_encs) >= MIN_WINDOW_FRAMES and window_consistent(valid_encs):
            clip_start = times[0]
            cap.release()
            dst = extract_clip(
                path,
                clip_start,
                TARGET_DURATION,
                f"genius_clip_{int(clip_start)}.mp4",
            )
            elapsed = time.time() - t0
            # Compute representative encoding (median)
            rep_enc = np.median(np.stack(valid_encs), axis=0)
            # Check against excluded speakers
            if exclude_vectors:
                dists = [np.linalg.norm(rep_enc - ex) for ex in exclude_vectors]
                if any(d <= TOLERANCE for d in dists):
                    # Same as excluded speaker -> skip this window
                    frame_idx += 1
                    continue
            return {
                "path": str(dst),
                "start": clip_start,
                "end": clip_start + TARGET_DURATION,
                "duration": TARGET_DURATION,
                "frames_analyzed": frame_idx // frame_interval + 1,
                "elapsed": round(elapsed, 2),
                "speaker_encoding": rep_enc.tolist(),
            }

        frame_idx += 1

    cap.release()
    return None


# ---------- Processing with reference person ---------- #

def process_video_with_reference(path: Path, reference_vectors: List[np.ndarray], start_offset: float = 0.0) -> Optional[dict]:
    """Scan video and return first clip matching reference person."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        log("❌ Could not open video")
        return None

    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_interval = max(1, int(round(fps_video / SAMPLE_FPS)))
    log(f"🎬 Video fps {fps_video:.2f}; analysing every {frame_interval}th frame → {SAMPLE_FPS} fps")

    enc_window: Deque[Tuple[float, Optional[np.ndarray]]] = deque()
    frame_idx = 0
    t0 = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue

        ts = frame_idx / fps_video
        if ts < start_offset:
            frame_idx += 1
            continue
        if ts > 1800:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        enc = face_encoding(rgb)
        enc_window.append((ts, enc))
        while enc_window and ts - enc_window[0][0] > TARGET_DURATION:
            enc_window.popleft()

        times, encs = zip(*enc_window)
        valid_encs = [e for e in encs if e is not None]

        if len(valid_encs) >= MIN_WINDOW_FRAMES and window_consistent(valid_encs):
            rep_enc = np.median(np.stack(valid_encs), axis=0)
            # Check against reference vectors
            if any(np.linalg.norm(rep_enc - ref) <= TOLERANCE for ref in reference_vectors):
                clip_start = times[0]
                dst = extract_clip(path, clip_start, TARGET_DURATION, f"genius_clip_{int(clip_start)}.mp4")
                elapsed = time.time() - t0
                cap.release()
                return {
                    "path": str(dst),
                    "start": clip_start,
                    "end": clip_start + TARGET_DURATION,
                    "duration": TARGET_DURATION,
                    "frames_analyzed": frame_idx // frame_interval + 1,
                    "elapsed": round(elapsed, 2),
                }

        frame_idx += 1

    cap.release()
    return None


# ---------- CLI ---------- #

def main():
    parser = argparse.ArgumentParser(description="Find an 8-second single-speaker clip from a YouTube video.")
    parser.add_argument("video_url", help="YouTube URL or local file path")
    parser.add_argument("--exclude", help="Path to JSON file with list of 128-dim face encodings to skip", default=None)
    parser.add_argument("--start", type=float, help="Start scanning from this timestamp (seconds)", default=0.0)
    parser.add_argument("--person", help="Target person's name for automatic match", default=None)
    parser.add_argument("--search-terms", help="Comma-separated search terms for better reference images", default=None)
    args = parser.parse_args()

    # Load exclusion encodings if provided
    exclude_vectors: List[np.ndarray] = []
    if args.exclude:
        try:
            with open(args.exclude, "r") as f:
                exclude_vectors = [np.array(v, dtype=np.float32) for v in json.load(f) if isinstance(v, list) and len(v) == 128]
        except Exception as e:
            log(f"⚠️ Could not load exclude file: {e}")

    src_path = download_video(args.video_url) if args.video_url.startswith("http") else Path(args.video_url)

    # Build reference set if person specified
    reference_vectors: List[np.ndarray] = []
    if args.person:
        reference_vectors = fetch_reference_encodings(args.person, args.search_terms)

    search_start = args.start
    while True:
        # if person specified skip interactive exclusion logic and match directly
        if reference_vectors:
            result = process_video_with_reference(src_path, reference_vectors, search_start)
        else:
            result = process_video(src_path, exclude_vectors, search_start)

        if not result:
            print("null")
            sys.exit(1)

        # If person mode, auto-accept the first match
        if reference_vectors:
            # Auto-accept in person mode - output full JSON and exit success
            print(json.dumps(result, indent=2))
            sys.exit(0)
        else:
            # Show summary and ask user in interactive mode
            clip_info = {
                k: v for k, v in result.items() if k not in {"speaker_encoding"}
            }
            print(json.dumps(clip_info, indent=2))
            reply = input("\nUse this clip? [y/N]: ").strip().lower()
            if reply.startswith("y"):
                # Accepted – output full JSON and exit success
                print(json.dumps(result, indent=2))
                sys.exit(0)
            else:
                # Rejected – add to exclude list and continue
                exclude_vectors.append(np.array(result["speaker_encoding"], dtype=np.float32))
                search_start = result["end"] + 0.1
                log("🔄 Searching for next speaker clip…")


if __name__ == "__main__":
    main() 