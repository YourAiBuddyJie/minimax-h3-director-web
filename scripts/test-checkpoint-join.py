"""CPU fixture integration test; does not submit ComfyUI or load model weights."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import av
import shutil

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    sys.modules['folder_paths'] = types.SimpleNamespace(get_output_directory=lambda: str(root))
    sys.modules['comfy_api.latest'] = types.SimpleNamespace(InputImpl=types.SimpleNamespace(VideoFromFile=lambda path: path))
    spec = importlib.util.spec_from_file_location('join_test', Path(__file__).resolve().parents[1] / 'integrations/ComfyUI-H3-Director-Web-Bridge/checkpoint_join.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg: raise RuntimeError('ffmpeg not on PATH')
    for i, color in enumerate(['red', 'blue']):
        subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=64x96:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(root / f'{i}.mp4')], check=True)
    files = [{'filename': f'{i}.mp4', 'type': 'output'} for i in range(2)]
    import json
    joined = module.MiniMaxH3ReviewedJoin().join(json.dumps(files))[0]
    with av.open(joined) as video:
        frames = list(video.decode(video=0))
        assert len(frames) == 48, len(frames)
        assert video.streams.audio, 'Audio must survive joining'
        first, last = frames[0].to_ndarray(format='rgb24').mean(axis=(0, 1)), frames[-1].to_ndarray(format='rgb24').mean(axis=(0, 1))
        assert first[0] > first[2] and last[2] > last[0], 'Clip order must be retained'
    for invalid in [{'filename': '../secret.mp4'}, {'filename': '0.mp4', 'subfolder': '../'}, {'filename': '0.mp4', 'type': 'input'}]:
        try: module.checked_output_file(invalid)
        except ValueError: pass
        else: raise AssertionError('Unsafe path accepted')
    try: module.MiniMaxH3ReviewedJoin().join(json.dumps([files[0], files[0]]))
    except ValueError: pass
    else: raise AssertionError('Duplicate clips accepted')
    print('PASS: ordered CPU join, 48 frames, audio retained, unsafe paths and duplicates rejected')
