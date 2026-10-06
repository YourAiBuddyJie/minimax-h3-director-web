"""Web companion for H3 Director. Does not change the upstream node.

The installed ComfyUI uses V3 Autogrow image slots; Director emits a plural
list. Adapt only that expanded graph boundary, before execution validation.
"""
import nodes


def flatten_autogrow_references(graph):
    for node in graph.values():
        if node.get('class_type') != 'MiniMaxH3ReferenceToVideo':
            continue
        inputs = node.get('inputs', {})
        refs = inputs.get('ref_images')
        if isinstance(refs, list):
            # A plural list of graph links is not itself a single graph link.
            inputs.pop('ref_images')
            for index, link in enumerate(refs):
                inputs[f'ref_images.ref_image_{index}'] = link
    return graph


class MiniMaxH3DirectorWeb:
    CATEGORY = 'video/H3 Director Web'
    RETURN_TYPES = ('VIDEO', 'IMAGE', 'AUDIO', 'STRING', 'STRING', 'CONDITIONING', 'LATENT')
    RETURN_NAMES = ('video', 'frames', 'audio', 'prompt', 'report', 'positive', 'latent')
    FUNCTION = 'run'

    @classmethod
    def _director(cls):
        director = nodes.NODE_CLASS_MAPPINGS.get('MiniMaxH3Director')
        if director is None:
            raise RuntimeError('Please install/load Thefrizzy1 MiniMaxH3Director first')
        return director

    @classmethod
    def INPUT_TYPES(cls):
        return cls._director().INPUT_TYPES()

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return cls._director().VALIDATE_INPUTS(**kwargs)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return cls._director().IS_CHANGED(**kwargs)

    def run(self, **kwargs):
        result = self._director()().run(**kwargs)
        flatten_autogrow_references(result.get('expand', {}))
        return result


NODE_CLASS_MAPPINGS = {'MiniMaxH3DirectorWeb': MiniMaxH3DirectorWeb}
NODE_DISPLAY_NAME_MAPPINGS = {'MiniMaxH3DirectorWeb': 'MiniMax H3 Director · Web Reference Adapter'}
