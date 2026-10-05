"""Publish the Johto atlas while keeping the complete editor snapshot in source."""
import copy
import json
import re
import tempfile
from pathlib import Path


# These are the CURRENT ROM's mapsec values, not vanilla FireRed constants.
# 97 / 123 / 132 are Indigo Plateau, Route 23 and Victory Road. League
# interiors (137) belong to Indigo Plateau and remain available as well.
HIDDEN_SECTIONS = (
    set(range(89, 97)) | {98} | (set(range(101, 126)) - {123}) |
    {126, 128, 131, 136, 138, 139, 141, 196, 202, 203, 210}
)
# Section 88 also labels Johto cutscenes; section 133 also labels Mahogany's
# Rocket hideout. Only the original Pallet / Celadon maps are withheld.
HIDDEN_MAPS = {'3.0', '4.0', '4.1', '4.2', '4.3'} | {
    '1.%d' % number for number in range(42, 47)
}
MAP_PATH = re.compile(r'(?:^|/)map_(\d+)_(\d+)(?:\.md|/)?(?=[?#\s\"\'<>)]|$)')
_staging = None
_hidden = set()


def published(entry):
    return entry['sec'] not in HIDDEN_SECTIONS and entry['id'] not in HIDDEN_MAPS


def public_atlas(payload):
    result = copy.deepcopy(payload)
    maps = result['maps'] = {key: entry for key, entry in result['maps'].items() if published(entry)}
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
