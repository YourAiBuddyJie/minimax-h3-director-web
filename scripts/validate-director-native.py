"""Validate original and expanded graphs. Never enqueue or sample a model."""
import sys, os, json, pathlib, asyncio, collections, copy
core = pathlib.Path(sys.argv[1])
fixture_path = pathlib.Path(sys.argv[2])
report_path = pathlib.Path(sys.argv[3])
sys.path.insert(0, str(core)); os.chdir(core); sys.argv = [str(core / 'main.py')]
import folder_paths
from utils.extra_config import load_extra_path_config
load_extra_path_config(str(core / 'extra_model_paths.yaml'))
import nodes, execution
from PIL import Image

async def main():
    await nodes.init_extra_nodes(init_api_nodes=False)
    # Synthetic test image for static reference loading; never used as article output.
    image_path = pathlib.Path(folder_paths.get_input_directory()) / 'h3-director-web/qa.png'
    image_path.parent.mkdir(parents=True, exist_ok=True)
    if not image_path.exists(): Image.new('RGB', (32, 32), (60, 80, 100)).save(image_path)
    fixtures = json.loads(fixture_path.read_text(encoding='utf-8'))
    selected_names = {'MiniMaxH3Director', 'MiniMaxH3DirectorWeb', 'MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo', 'MiniMaxH3Join', 'MiniMaxH3FreeMemory', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'BasicGuider', 'BasicScheduler', 'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'VAEDecode', 'VAEDecodeAudio', 'ImageFromBatch', 'ImageScale', 'SaveVideo', 'LoraLoaderModelOnly'}
    metadata = {name: {'input': nodes.NODE_CLASS_MAPPINGS[name].INPUT_TYPES()} for name in selected_names if name in nodes.NODE_CLASS_MAPPINGS}
    report_path.with_name('原生节点接口元数据.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    reports = []
    for name, fixture in fixtures.items():
        api = fixture['workflow']
        valid = await execution.validate_prompt('web-static-only', api, None)
        if not valid[0]: raise AssertionError(valid)
        inputs = dict(api['5']['inputs'])
        objects = {key: object() for key in ['model', 'clip', 'video_vae', 'audio_vae', 'ref_model']}
        for key in objects:
            if key in inputs: inputs[key] = objects[key]
        inputs['write_sidecar'] = False; inputs['unique_id'] = 'web-static-only-' + name
        expanded = nodes.NODE_CLASS_MAPPINGS[api['5']['class_type']]().run(**inputs)
        graph = expanded['expand']
        counts = dict(collections.Counter(node['class_type'] for node in graph.values()))
        conds = [node for node in graph.values() if node['class_type'] == 'MiniMaxH3ImageToVideo']
        refs = [node for node in graph.values() if node['class_type'] == 'MiniMaxH3ReferenceToVideo']
        for ref in refs:
            assert 'ref_images' not in ref['inputs'], 'Autogrow references were not flattened'
            assert len([key for key in ref['inputs'] if key.startswith('ref_images.ref_image_')]) == 2
        # Replace external dummy model handles and loaded image tensors by loader links
        # to validate every expanded node input without executing loaders.
        checked_graph = copy.deepcopy(graph)
        for node in checked_graph.values():
            for key, value in list(node['inputs'].items()):
                if key in ('model', 'clip', 'vae') and not isinstance(value, (str, list, int, float, bool)):
                    if key == 'model':
                        original = graph[next(k for k, v in checked_graph.items() if v is node)]['inputs'][key]
                        loader = '7' if original is objects['ref_model'] else '1'
                    elif key == 'clip': loader = '2'
                    else: loader = '4' if node['class_type'] == 'VAEDecodeAudio' else '3'
                    node['inputs'][key] = [loader, 0]
                if key == 'image' and not isinstance(value, list): node['inputs'][key] = ['qa-image', 0]
        checked_graph.update({key: value for key, value in api.items() if key in ('1', '2', '3', '4', '7')})
        checked_graph['qa-image'] = {'class_type': 'LoadImage', 'inputs': {'image': 'h3-director-web/qa.png'}}
        checked_graph['qa-save'] = {'class_type': 'SaveVideo', 'inputs': {'video': expanded['result'][0], 'filename_prefix': 'STATIC_ONLY', 'format': 'mp4', 'codec': 'h264'}}
        checked = await execution.validate_prompt('web-expanded-static-only', checked_graph, None)
        if not checked[0]: raise AssertionError(checked)
        assert counts.get('SamplerCustomAdvanced') == len(fixture['timeline']['clips'])
        if name == 'continuous': assert ['first_frame' in node['inputs'] for node in conds] == [False, True, False]
        reports.append({'fixture': name, 'original_valid': True, 'expanded_valid': True, 'node_counts': counts, 'total_frames': fixture['totalFrames'], 'total_seconds': fixture['totalSeconds'], 'reference_slots': [key for ref in refs for key in ref['inputs'] if key.startswith('ref_images.')], 'report': expanded['result'][4], 'executed_model': False})
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(reports, ensure_ascii=False, indent=2))

asyncio.run(main())
