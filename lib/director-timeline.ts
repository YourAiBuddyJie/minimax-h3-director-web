import type { DirectorBeat } from './director.ts';
import type { ApiWorkflow } from './comfy.ts';
import { buildH3VideoPrompt } from './h3-video-prompt.ts';
import { reviewBeat } from './director-review.ts';

export type TimelineImage = { id: string; title: string; kind?: import('./director.ts').ReferenceAssetKind; file: string };
export type DirectorOptions = { steps: number; seed: number; megapixels: number; aspect: '16:9' | '9:16' | '1:1'; label: string; acceleration?: 'standard' | 'turbo8' };

// Same 17k+5 grid and ceiling policy as the installed Director duration.py.
export function h3Timing(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 4 || seconds > 15) throw new Error('时长必须为 4–15 秒');
  const scaled = seconds * 24;
  const floor = Math.floor(scaled);
  const raw = scaled - floor === 0.5 ? floor + (floor % 2) : Math.round(scaled);
  const frames = Math.min(345, Math.max(107, raw + ((5 - raw % 17 + 17) % 17)));
  return { requestedSeconds: seconds, frames, actualSeconds: frames / 24 };
}

export function requiredBeatImages(beat: DirectorBeat): number {
  if (beat.continuityFromPrevious || beat.mode === 'T2V') return 0;
  if (beat.mode === 'I2V') return 1;
  if (beat.mode === 'FL2VA') return 2;
  return Math.max(1, beat.referenceAssetIds?.length || 2);
}

export function compileDirectorTimeline(beats: DirectorBeat[], images: Record<string, TimelineImage>, options: DirectorOptions) {
  if (options.acceleration && !['standard', 'turbo8'].includes(options.acceleration)) throw new Error('未知加速模式');
  const turbo = options.acceleration === 'turbo8';
  if (turbo && beats.some((beat) => beat.mode === 'Ref2VA')) throw new Error('Turbo 8步仅适用于 T2V/I2V/FL2VA；多图参考需使用标准模式或对应专用 LoRA');
  if (!beats.length || beats.length > 120) throw new Error('请选择 1–120 个分镜');
  if (!Number.isInteger(options.steps) || options.steps < 4 || options.steps > 40) throw new Error('步数必须为 4–40');
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > Number.MAX_SAFE_INTEGER - 120) throw new Error('种子必须为安全整数');
  if (![0.4, 0.7, 1].includes(options.megapixels) || !['16:9', '9:16', '1:1'].includes(options.aspect)) throw new Error('分辨率或画幅无效');
  if (new Set(beats.map((beat) => beat.id)).size !== beats.length) throw new Error('分镜 ID 重复');
  let start = 0;
  const rows: Array<{ id: string; mode: string; requestedSeconds: number; frames: number; actualSeconds: number; startFrame: number }> = [];
  const clips = beats.map((beat, index) => {
    const errors = reviewBeat(beat, beats[index - 1]).filter((issue) => issue.severity === 'error');
    if (errors.length) throw new Error(`Beat ${beat.id}：${errors.map((issue) => issue.message).join('；')}`);
    const timing = h3Timing(Number.parseFloat(beat.duration));
    const expected = requiredBeatImages(beat);
    const ids = beat.referenceAssetIds || [];
    if (ids.length !== expected || ids.some((id) => !id || !images[id])) throw new Error(`Beat ${beat.id} 需要 ${expected} 张已采用素材，按顺序绑定`);
    if (new Set(ids).size !== ids.length) throw new Error(`Beat ${beat.id} 的图片槽位重复`);
    if (beat.mode === 'Ref2VA' && ids.length > 9) throw new Error('多图参考最多 9 张图片');
    const refs = ids.map((id) => images[id]);
    refs.forEach((ref) => { if (!ref.file || ref.file.includes('..') || /[\\:[\]]/.test(ref.file) || ref.file.startsWith('/')) throw new Error('Director 素材必须为 input 中的相对路径'); });
    const spec = (image: TimelineImage) => ({ file: image.file, kind: 'image', type: 'input', subfolder: '' });
    const media: { first_frame: ReturnType<typeof spec> | null; last_frame: ReturnType<typeof spec> | null; refs: Array<ReturnType<typeof spec> & { role: string }> } = { first_frame: null, last_frame: null, refs: [] };
    if (beat.mode === 'I2V' && !beat.continuityFromPrevious) media.first_frame = spec(refs[0]);
    if (beat.mode === 'FL2VA') { media.first_frame = spec(refs[0]); media.last_frame = spec(refs[1]); }
    if (beat.mode === 'Ref2VA') media.refs = refs.map((ref) => ({ ...spec(ref), role: ref.kind === 'location' ? 'scene' : 'identity' }));
    const mode = beat.continuityFromPrevious ? 'auto' : ({ T2V: 't2v', I2V: 'i2v', FL2VA: 'flf2v', Ref2VA: 'r2v' } as const)[beat.mode];
    if (!mode) throw new Error(`未知生成模式：${beat.mode}`);
    rows.push({ id: beat.id, mode: beat.continuityFromPrevious ? 'I2V · 上段末帧' : beat.mode, ...timing, startFrame: start });
    const promptRefs = beat.continuityFromPrevious ? [{ id: 'previous-last-frame', title: '上一段实际末帧', kind: 'first_frame' as const }] : refs;
    const prompt = buildH3VideoPrompt({ ...beat, duration: `${timing.actualSeconds}s` }, promptRefs, options.aspect);
    const clip = { id: beat.id, index: index + 1, start_frame: start, length: timing.frames, mode, enhance_prompt: false, prompt, audio_prompt: '', negative_prompt: '', camera: '', media, settings_mode: 'manual', settings: { steps: turbo ? 8 : options.steps, sampler: 'res_multistep', scheduler: beat.mode === 'Ref2VA' ? 'beta' : 'simple', denoise: 1, seed: options.seed + index } };
    start += timing.frames;
    return clip;
  });
  const timeline = { schema_version: 2, clips, negatives: [], audio: {}, global: { style: '', prompt_dialect: 'timestamps', continuity: true } };
  const workflow: ApiWorkflow = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
    '5': { class_type: 'MiniMaxH3Director', inputs: { timeline_json: JSON.stringify(timeline), global_style: '', aspect_ratio: options.aspect, resolution: `${options.megapixels.toFixed(1)} MP`, fps: 24, seed: options.seed, prompt_dialect: 'timestamps', model: ['1', 0], clip: ['2', 0], video_vae: ['3', 0], audio_vae: ['4', 0], continuity: true, ref_image_size: 'match', keyframe_resize: 'lanczos', write_sidecar: true, vram_staging: 'on', frame_interpolation: 'off' } },
    '6': { class_type: 'SaveVideo', inputs: { video: ['5', 0], filename_prefix: `h3-director-web/director/${options.label.replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 80) || 'film'}`, format: 'mp4', codec: 'h264' } },
  };
  if (turbo) {
    workflow['8'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', strength_model: 1 } };
    workflow['5'].inputs!.model = ['8', 0];
  }
  if (beats.some((beat) => beat.mode === 'Ref2VA')) {
    workflow['5'].class_type = 'MiniMaxH3DirectorWeb';
    workflow['7'] = { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', weight_dtype: 'default' } };
    workflow['5'].inputs!.ref_model = ['7', 0];
  }
  return { timeline, workflow, rows, totalFrames: start, totalSeconds: start / 24 };
}
