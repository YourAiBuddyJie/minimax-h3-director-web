import type { DirectorBeat, ReferenceAssetKind } from './director.ts';

export type H3PromptReference = { id: string; title: string; kind?: ReferenceAssetKind; role?: string };

export function parseBeatDuration(value: string): number | null {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const seconds = Number(match[0]);
  return Number.isFinite(seconds) && seconds >= 4 && seconds <= 15 ? seconds : null;
}

export function normalizeBeatDuration(value: string, fallback = 6): string {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : fallback;
  const seconds = Math.min(15, Math.max(4, Number.isFinite(parsed) ? parsed : fallback));
  return `${seconds.toFixed(1)}s`;
}

function safeId(value: string, index: number) {
  const normalized = value.trim().replace(/[^\p{Script=Han}A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/g, '');
  return normalized || `uploaded-image-${index + 1}`;
}

function referenceRole(reference: H3PromptReference, index: number, mode: DirectorBeat['mode']) {
  if (mode === 'FL2VA') return index === 0 ? 'the literal opening frame at 0.00 seconds' : 'the literal ending frame';
  if (reference.role) return reference.role;
  const roles: Record<ReferenceAssetKind, string> = {
    identity: 'character facial identity, hairstyle, body type, and base costume continuity',
    location: 'the single continuous location, fixed landmarks, spatial axis, materials, and lighting direction',
    prop: 'the key prop design and its current physical state',
    costume: 'the character costume and its current condition',
    body_state: 'the character identity plus the current injury, poisoning, wetness, or physical state',
    first_frame: 'the shot composition and action starting state',
    last_frame: 'the shot composition and action ending state',
  };
  return reference.kind ? roles[reference.kind] : 'the explicitly selected visual identity, state, composition, and environment anchors visible in this image';
}

export function buildH3VideoPrompt(beat: DirectorBeat, inputReferences: H3PromptReference[]): string {
  const duration = parseBeatDuration(beat.duration) ?? 6;
  const references = inputReferences.map((reference, index) => ({ ...reference, atId: `@${safeId(reference.id, index)}`, picture: `<Picture ${index + 1}>`, role: referenceRole(reference, index, beat.mode) }));
  const source = (beat.prompt || beat.summary).trim();
  const soundscape = 'Use only diegetic ambience, breathing, fabric movement, footsteps, impacts, and prop sounds supported by the described action; synchronize every sound to the visible event and do not invent extra dialogue.';

  if (beat.mode === 'FL2VA' && references.length >= 2) {
    return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${duration.toFixed(2)}-second mark of the target video.\nReference asset ID mapping — <Picture 1> = ${references[0].atId} (input image 1, ${references[0].title}, opening frame); <Picture 2> = ${references[1].atId} (input image 2, ${references[1].title}, ending frame).\n\nintegrated_multimodal_description: [Shot 1] Live-action cinematic vertical drama. Begin exactly from <Picture 1>, preserving its identities, costume, props, camera axis, location landmarks, and lighting. ${source} Show a continuous, physically plausible motion path with observable pose and object-state changes, then converge exactly to <Picture 2> at ${duration.toFixed(2)} seconds. Do not cut away, swap identities, change location, or introduce unreferenced people.\n\noverall_soundscape: ${soundscape}\n\nnon_diegetic_music: N/A`;
  }

  if (beat.mode === 'Ref2VA' && references.length) {
    const definitions = references.map((reference, index) => `<Subject ${index + 1}> is defined by ${reference.picture} (${reference.atId}, input image ${index + 1}, “${reference.title}”) and provides ${reference.role}.`).join('\n');
    const retention = references.map((reference, index) => `<Subject ${index + 1}> (appears in [Shot 1]): fully_preserved - preserve ${reference.role}; use ${reference.atId} only for this stated purpose.`).join('\n');
    const subjects = references.map((_, index) => `<Subject ${index + 1}>`).join(' and ');
    return `subject_definitions:\n${definitions}\n\nsummary:\n[reference generation] Create a ${duration.toFixed(2)}-second vertical drama shot using ${subjects} according to the explicit reference roles above.\n\nretention_analysis:\n${retention}\n\ndetailed_description:\nThe target video uses a realistic live-action cinematic style and one physically continuous space.\n[Shot 1] ${source} Keep every referenced identity, costume, body state, prop state, landmark, camera axis, and light direction consistent for the full ${duration.toFixed(2)} seconds. Use the exact original dialogue, speaking order, and addressee; do not add subtitles, watermarks, readable overlay text, unreferenced characters, or a second location.\n\noverall_soundscape:\n${soundscape}\n\nnon_diegetic_music:\nN/A`;
  }

  return `integrated_multimodal_description: [Shot 1] Live-action cinematic vertical drama in one physically continuous space. ${source} Complete the described action and reaction within ${duration.toFixed(2)} seconds. Preserve the exact original dialogue, speaking order, and addressee; do not add subtitles, watermarks, readable overlay text, extra characters, or an unrelated location.\n\noverall_soundscape: ${soundscape}\n\nnon_diegetic_music: N/A`;
}
