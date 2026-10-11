import argparse
import concurrent.futures
import os
import shutil
import time
from pathlib import Path
from urllib.parse import quote

import requests


def receive_segment(url: str, start: int, end: int, path: Path) -> Path:
    failures = 0
    while (path.stat().st_size if path.exists() else 0) < end - start + 1:
        received = path.stat().st_size if path.exists() else 0
        try:
            headers = {"Accept-Encoding": "identity", "Range": f"bytes={start + received}-{end}"}
            with requests.get(url, headers=headers, stream=True, timeout=(30, 45)) as response:
                if response.status_code != 206:
                    raise RuntimeError(f"range request returned HTTP {response.status_code}")
                with path.open("ab") as handle:
                    for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                        if chunk:
                            handle.write(chunk)
            failures = 0
        except (requests.RequestException, OSError, RuntimeError) as error:
            failures += 1
            if failures > 30:
                raise RuntimeError(f"segment {start}-{end} failed: {error}") from error
            time.sleep(min(failures * 2, 10))
    if path.stat().st_size != end - start + 1:
        raise RuntimeError(f"segment size mismatch: {path}")
    return path


def download(repo: str, filename: str, output: Path, workers: int) -> None:
    partial = output.with_suffix(output.suffix + ".part")
    url = f"https://huggingface.co/{repo}/resolve/main/{quote(filename, safe='/')}"
    probe = requests.get(url, headers={"Range": "bytes=0-0"}, stream=True, timeout=30)
    probe.raise_for_status()
    total = int(probe.headers["Content-Range"].rsplit("/", 1)[1])
    offset = partial.stat().st_size if partial.exists() else 0
    remaining = total - offset
    if remaining <= 0:
        os.replace(partial, output)
        return
    chunk_size = (remaining + workers - 1) // workers
    ranges = [(start, min(start + chunk_size - 1, total - 1)) for start in range(offset, total, chunk_size)]
    paths = [output.with_suffix(output.suffix + f".seg{index}") for index in range(len(ranges))]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(receive_segment, url, start, end, path) for (start, end), path in zip(ranges, paths)]
        for future in concurrent.futures.as_completed(futures):
            print(f"segment complete: {future.result().name}", flush=True)
    with partial.open("ab") as destination:
        for path in paths:
            with path.open("rb") as source:
                shutil.copyfileobj(source, destination, 8 * 1024 * 1024)
            path.unlink()
    if partial.stat().st_size != total:
        raise RuntimeError("assembled download size validation failed")
    os.replace(partial, output)
    print(f"complete: {output} ({total / 1024**3:.2f} GiB)", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("filename")
    parser.add_argument("output", type=Path)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    download(args.repo, args.filename, args.output, args.workers)
