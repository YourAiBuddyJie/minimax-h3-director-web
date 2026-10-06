"""CPU-only joining of reviewed files. Never invokes a sampler."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import av
import folder_paths

def checked_output_file(item):
    if item.get('type', 'output') != 'output':
        raise ValueError('Only output videos can be joined')
    root = Path(folder_paths.get_output_directory()).resolve()
    name = item.get('filename', '')
    subfolder = item.get('subfolder', '')
    if not name or '/' in name or '\\' in name or ':' in name:
        raise ValueError('Invalid filename')
    path = (root / subfolder / name).resolve()
    if root not in path.parents or path.suffix.lower() != '.mp4' or not path.is_file():
        raise ValueError('Video must exist inside output directory')
    return path

def signature(path):
    with av.open(str(path)) as container:
        video = container.streams.video[0]
        audio = container.streams.audio
        return (video.width, video.height, str(video.average_rate), video.codec_context.name,
                tuple((s.codec_context.name, s.rate, str(s.layout)) for s in audio))

class MiniMaxH3ReviewedJoin:
    CATEGORY = 'video/H3 Director Web'
    RETURN_TYPES = ('VIDEO',)
    FUNCTION = 'join'
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'files_json': ('STRING', {'multiline': True})}}
    def join(self, files_json):
        items = json.loads(files_json)
        if not isinstance(items, list) or not 1 <= len(items) <= 120:
            raise ValueError('Expected 1-120 reviewed clips')
        paths = [checked_output_file(item) for item in items]
        if len(set(paths)) != len(paths):
            raise ValueError('Duplicate clips')
        if len({signature(path) for path in paths}) != 1:
            raise ValueError('Clip dimensions, fps, codecs or audio layout differ; normalize before joining')
        executable = shutil.which('ffmpeg')
        if not executable:
            try:
                import imageio_ffmpeg
                executable = imageio_ffmpeg.get_ffmpeg_exe()
            except ImportError as error:
                raise RuntimeError('Install ffmpeg or configure it on PATH for reviewed joining') from error
        target = Path(folder_paths.get_output_directory()) / 'h3-director-web' / 'reviewed'
        target.mkdir(parents=True, exist_ok=True)
        # Hardlinks have safe ASCII names in the manifest, even when source names contain quotes.
        with tempfile.TemporaryDirectory(prefix='join-', dir=str(target)) as work:
            work = Path(work)
            for index, path in enumerate(paths):
                linked = work / f'{index:04}.mp4'
                try:
                    os.link(path, linked)
                except OSError:
                    shutil.copyfile(path, linked)
            manifest = work / 'clips.txt'
            manifest.write_text(''.join(f"file '{index:04}.mp4'\n" for index in range(len(paths))), encoding='utf-8')
            output = target / f'{uuid.uuid4().hex}.mp4'
            try:
                subprocess.run([executable, '-nostdin', '-v', 'error', '-f', 'concat', '-safe', '1', '-i', str(manifest), '-c', 'copy', '-movflags', '+faststart', str(output)], check=True, capture_output=True, timeout=300)
                with av.open(str(output)) as result:
                    if not result.streams.video:
                        raise ValueError('Joined video is invalid')
            except Exception:
                output.unlink(missing_ok=True)
                raise
        from comfy_api.latest import InputImpl
        return (InputImpl.VideoFromFile(str(output)),)
