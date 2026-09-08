import argparse
import os
import time
from pathlib import Path
from urllib.parse import quote

import requests


def download(repo: str, filename: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix(output.suffix + ".part")
    url = f"https://huggingface.co/{repo}/resolve/main/{quote(filename, safe='/')}"
    expected = None
    failures = 0

    while expected is None or partial.stat().st_size < expected:
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"Accept-Encoding": "identity"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        try:
            with requests.get(url, headers=headers, stream=True, timeout=(30, 45)) as response:
                response.raise_for_status()
                content_range = response.headers.get("Content-Range", "")
                if "/" in content_range:
                    expected = int(content_range.rsplit("/", 1)[1])
                elif response.headers.get("Content-Length"):
                    length = int(response.headers["Content-Length"])
                    expected = offset + length if response.status_code == 206 else length
                if offset and response.status_code != 206:
                    partial.unlink(missing_ok=True)
                    offset = 0
                mode = "ab" if offset else "wb"
                with partial.open(mode) as handle:
                    for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                        if chunk:
                            handle.write(chunk)
                failures = 0
        except (requests.RequestException, OSError) as error:
            failures += 1
            if failures > 40:
                raise RuntimeError(f"download repeatedly failed: {error}") from error
            size_gib = (partial.stat().st_size if partial.exists() else 0) / 1024**3
            print(f"retry {failures}: {size_gib:.2f} GiB received", flush=True)
            time.sleep(min(failures * 2, 15))

    if expected is None or partial.stat().st_size != expected:
        raise RuntimeError("download size validation failed")
    os.replace(partial, output)
    print(f"complete: {output} ({expected / 1024**3:.2f} GiB)", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("filename")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    download(args.repo, args.filename, args.output)
