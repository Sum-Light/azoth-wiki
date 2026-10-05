"""Publish approved map IDs while preserving the complete editor snapshot."""
import copy
import json
import re
import tempfile
from functools import lru_cache
from pathlib import Path


# Map numbers are integer pairs, never decimals. All endpoints are inclusive.
PUBLISHED_RANGES = {
    1: ((39, 41), (47, 57), (75, 80), (88, 90), (94, 95), (96, 108),
        (110, 113), (121, 126)),
    2: ((0, 0), (36, 36), (43, 46), (54, 55)),
    3: ((42, 42), (46, 47), (49, 49), (66, 115)),
    13: ((0, 0),),
    31: ((0, 0), (2, 3)),
    32: ((0, 0), (2, 3)),
    33: ((1, 1),),
    34: ((0, 1), (3, 7)),
    35: ((0, 1), (4, 4)),
    37: ((0, 0), (3, 3)),
}
PUBLISHED_GROUPS = range(39, 58)
MAP_PATH = re.compile(r'(?:^|/)map_(\d+)_(\d+)(?:\.md|/)?(?=[?#\s\"\'<>)]|$)')
_staging = None
_hidden = set()


@lru_cache(maxsize=1)
def map_identities():
    path = Path(__file__).resolve().parents[1] / 'docs/locations/map_identities.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def apply_identities(payload):
    review = map_identities()
    if review is None:
        return
    if review['rom_sha256'] != payload['rom_sha256']:
        raise ValueError('Map identity review belongs to a different atlas ROM')
    for key, entry in payload['maps'].items():
        identity = review['maps'].get(key)
        if identity:
            entry['label'] = identity['label']
            entry['kind'] = identity['kind']
            entry['category'] = identity['category']
            entry['identity'] = {field: identity[field] for field in ('status', 'confidence', 'basis', 'dialogue')}


def published(entry):
    group, number = map(int, entry['id'].split('.'))
    return group in PUBLISHED_GROUPS or any(
        first <= number <= last for first, last in PUBLISHED_RANGES.get(group, ()))


def public_atlas(payload):
    result = copy.deepcopy(payload)
    maps = result['maps'] = {key: entry for key, entry in result['maps'].items() if published(entry)}
    apply_identities(result)
    for entry in maps.values():
        entry['connections'] = [edge for edge in entry['connections'] if edge['target'] in maps]
        entry['passages'] = [edge for edge in entry['passages']
                             if edge['target'] in maps and all(key in maps for key in edge['via'])]
        entry['warps'] = [edge for edge in entry['warps'] if edge.get('target') is None or edge['target'] in maps]
        for stage in entry['stages']:
            stage['warps'] = [edge for edge in stage.get('warps', [])
                              if edge.get('target') is None or edge['target'] in maps]
    regions = result['regions'] = {
        key: dict(region, maps=[key for key in region['maps'] if key in maps])
        for key, region in result['regions'].items()
        if any(key in maps for key in region['maps'])
    }
    # Pallet's world-map position must not point at unrelated story maps.
    result['grids'] = {layer: [cell for cell in cells
                             if str(cell['mapsec']) in regions and cell['mapsec'] != 88]
                       for layer, cells in result['grids'].items()}
    return result


def hidden_link(value):
    return any('%s.%s' % match.groups() in _hidden for match in MAP_PATH.finditer(value))


def on_files(files, config):
    """Exclude pages/assets before navigation, search and sitemap generation."""
    from mkdocs.structure.files import File

    global _staging, _hidden
    if _staging is not None:
        _staging.cleanup()
    _staging = tempfile.TemporaryDirectory(prefix='azoth-public-maps-')
    docs = Path(config['docs_dir'])
    source = json.loads((docs / 'locations/atlas_data.json').read_text(encoding='utf-8'))
    atlas = public_atlas(source)
    _hidden = set(source['maps']) - set(atlas['maps'])
    world = json.loads((docs / 'locations/worldmap_data.json').read_text(encoding='utf-8'))
    world['maps'] = {key: entry for key, entry in world['maps'].items()
                     if '%s.%s' % (entry['g'], entry['n']) in atlas['maps']}
    world['secNames'] = {key: name for key, name in world['secNames'].items() if key in atlas['regions']}
    world['grids'] = atlas['grids']
    for entry in world['maps'].values():
        entry['label'] = atlas['maps']['%s.%s' % (entry['g'], entry['n'])]['label']
    replacements = {'locations/atlas_data.json': atlas, 'locations/worldmap_data.json': world}
    for file in list(files):
        path = file.src_path.replace('\\', '/')
        image = re.match(r'^locations/atlas/maps/map_(\d+)_(\d+)(?:_stage_\d+)?\.png$', path)
        if (path.startswith('locations/map_') and hidden_link(path)) or (
                image and '%s.%s' % image.groups() in _hidden) or path in replacements:
            files.remove(file)
    for path, data in replacements.items():
        target = Path(_staging.name) / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        files.append(File(path, _staging.name, config['site_dir'], config['use_directory_urls']))
    return files


def on_page_markdown(markdown, **kwargs):
    # Encounter tables also appear on individual Pokemon pages. Remove the
    # unpublished rows there and in the old location directory at build time.
    markdown = '\n'.join(line for line in markdown.split('\n')
                         if not (line.lstrip().startswith('|') and hidden_link(line)))
    review = map_identities()
    names = review['maps'] if review else {}
    # The old encounter directory and Pokemon encounter tables share map links.
    def rename_link(match):
        key_match = MAP_PATH.search(match.group(2))
        key = '%s.%s' % key_match.groups() if key_match else None
        keep_label = re.fullmatch(r'\d+\.\d+', match.group(1)) or match.group(1).startswith(('查看', '返回'))
        return '[%s](%s)' % (names[key]['label'], match.group(2)) if key in names and not keep_label else match.group(0)

    markdown = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', rename_link, markdown)
    markdown = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',
                      lambda match: match.group(1) if hidden_link(match.group(2)) else match.group(0), markdown)
    return re.sub(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                  lambda match: match.group(2) if hidden_link(match.group(1)) else match.group(0),
                  markdown, flags=re.DOTALL)


def on_post_build(**kwargs):
    global _staging
    if _staging is not None:
        _staging.cleanup()
        _staging = None
