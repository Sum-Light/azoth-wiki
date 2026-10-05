"""Build the Pokedex presentation from existing ROM-derived Markdown."""
import hashlib
import html
import re
from pathlib import Path
from urllib.parse import quote

TYPES = {
    '一般': '#75766c', '格斗': '#ab443b', '飞行': '#7163b1', '毒': '#8e459c',
    '地面': '#916b2d', '岩石': '#82772f', '虫': '#677b26', '幽灵': '#635189',
    '钢': '#657e88', '火': '#b85225', '水': '#3b70b5', '草': '#437f32',
    '电': '#8d710c', '超能力': '#b6436e', '冰': '#337f88', '龙': '#6950b3',
    '恶': '#66534a', '妖精': '#a24d7e',
}
GENERATIONS = [
    (1, 151, '第一世代'), (152, 251, '第二世代'), (252, 386, '第三世代'),
    (387, 493, '第四世代'), (494, 649, '第五世代'), (650, 721, '第六世代'),
    (722, 809, '第七世代'), (810, 905, '第八世代'), (906, 1025, '第九世代'),
]
_entries = []
_by_file = {}


def esc(value):
    return html.escape(str(value), quote=True)


def generation(number):
    return next((i for i, (lo, hi, _) in enumerate(GENERATIONS, 1) if lo <= number <= hi), 0)


def parse_index(markdown):
    entries = []
    for line in markdown.splitlines():
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if len(cells) != 5:
            continue
        link = re.fullmatch(r'\[(.+)\]\((.+\.md)\)', cells[2])
        if not link or not cells[4].isdigit():
            continue
        image = re.search(r'src="([^"]+)"', cells[0])
        number = int(cells[1]) if cells[1].isdigit() else 0
        name, filename = link.groups()
        entries.append(dict(name=name, file=filename, number=number, gen=generation(number),
                            species=filename.split('_', 1)[0], image=image[1] if image else '',
                            types=cells[3].split('/'), total=int(cells[4])))
    return entries


def type_badges(types):
    return ''.join('<span class="dex-type" style="--type-color:%s">%s</span>' % (
        TYPES.get(name, '#65726f'), esc(name)) for name in types)


def entry_url(entry, sibling=False):
    return ('../' if sibling else '') + quote(entry['file'][:-3], safe='') + '/'


def on_config(config):
    global _entries, _by_file
    docs = Path(config['docs_dir'])
    _entries = parse_index((docs / 'pokemon/index.md').read_text(encoding='utf-8'))
    _by_file = {entry['file']: (index, entry) for index, entry in enumerate(_entries)}
    # Version local assets by contents so Pages does not serve a previous skin.
    for setting in ('extra_css', 'extra_javascript'):
        config[setting] = [
            '%s?v=%s' % (name.split('?')[0], hashlib.sha256(
                (docs / name.split('?')[0]).read_bytes()).hexdigest()[:12])
            if isinstance(name, str) and (docs / name.split('?')[0]).is_file() else name
            for name in config[setting]
        ]
    return config


def directory():
    rows = ['# 宝可梦图鉴', '',
            '按本作全国图鉴编号排列，包含不同形态与特殊条目。点击名称查看种族值、特性、进化、招式与分布。', '',
            '<div class="dex-directory" data-pokedex>',
            '<div class="dex-summary"><strong>%d</strong><span>个图鉴条目 · 含不同形态</span></div>' % len(_entries),
            '<form class="dex-filters" role="search">',
            '<label class="dex-search">查找宝可梦<input name="pokemon" type="search" placeholder="名称、图鉴编号或本作物种编号" autocomplete="off"></label>',
            '<label>属性<select name="type"><option value="">全部属性</option>']
    rows.extend('<option>%s</option>' % esc(name) for name in TYPES if any(name in entry['types'] for entry in _entries))
    rows.extend(['</select></label><button type="reset">重置筛选</button></form>',
                 '<nav class="dex-generations" aria-label="按图鉴世代筛选">',
                 '<button type="button" data-generation="all" aria-pressed="true">全部</button>'])
    for i, (_, _, name) in enumerate(GENERATIONS, 1):
        rows.append('<button type="button" data-generation="%d" aria-pressed="false">%s</button>' % (i, name))
    rows.extend(['<button type="button" data-generation="0" aria-pressed="false">其他编号</button></nav>',
                 '<p class="dex-result" data-dex-result aria-live="polite">共 %d 个条目。像素图标按原尺寸显示。</p>' % len(_entries)])
    for group in list(range(1, 10)) + [0]:
        entries = [entry for entry in _entries if entry['gen'] == group]
        if not entries:
            continue
        name = GENERATIONS[group - 1][2] if group else '其他编号'
        span = '#%04d—#%04d' % GENERATIONS[group - 1][:2] if group else '按本作数据保留'
        rows.extend(['<section class="dex-group" data-dex-group="%d">' % group,
                     '<h2 id="generation-%d">%s <small>%s</small></h2>' % (group, name, span),
                     '<div class="dex-table-scroll" tabindex="0" aria-label="%s图鉴表，可横向滚动">' % name,
                     '<table class="dex-table" data-readable-table="true"><thead><tr><th scope="col">图像</th>',
                     '<th scope="col">全国编号</th><th scope="col">宝可梦</th><th scope="col">属性</th><th scope="col">种族值总和</th></tr></thead><tbody>'])
        for entry in entries:
            number = '#%04d' % entry['number'] if entry['number'] else '—'
            icon = '<img class="pk-icon" src="%s" alt="" loading="lazy" width="32" height="32">' % esc(entry['image']) if entry['image'] else ''
            rows.append('<tr data-dex-entry data-types="%s" data-search="%s"><td>%s</td><td class="dex-number">%s</td>'
                        '<td class="dex-name"><a href="%s">%s</a></td><td><span class="dex-types">%s</span></td>'
                        '<td class="dex-total">%d</td></tr>' % (
                            esc(' '.join(entry['types'])), esc('%s %s %s' % (entry['name'], number, entry['species'])),
                            icon, number, entry_url(entry), esc(entry['name']), type_badges(entry['types']), entry['total']))
        rows.append('</tbody></table></div></section>')
    rows.extend(['<p class="dex-empty" data-dex-empty hidden>没有找到符合条件的宝可梦。可以清空关键词或重置筛选。</p>',
                 '</div>', '', '<noscript>当前显示全部条目；启用 JavaScript 后可使用世代、名称与属性筛选。</noscript>', ''])
    return '\n'.join(rows)


def profile(markdown, filename):
    index, entry = _by_file[filename]
    head = re.search(r'<div class="pk-head">.*?</div>\s*</div>', markdown, re.DOTALL)
    if not head:
        return markdown
    sprite = re.search(r'<img\b[^>]+>', head[0])
    number = '#%04d' % entry['number'] if entry['number'] else '无全国编号'
    rows = ['<nav class="dex-pager" aria-label="相邻图鉴条目">']
    if index:
        previous = _entries[index - 1]
        rows.append('<a href="%s" rel="prev">← %s</a>' % (entry_url(previous, True), esc(previous['name'])))
    else:
        rows.append('<span></span>')
    rows.append('<a href="../">图鉴目录</a>')
    if index + 1 < len(_entries):
        following = _entries[index + 1]
        rows.append('<a href="%s" rel="next">%s →</a>' % (entry_url(following, True), esc(following['name'])))
    rows.extend(['</nav>', '<aside class="dex-infobox" aria-label="宝可梦基本资料">',
                 '<div class="dex-infobox-title"><strong>%s</strong><span>%s</span></div>' % (esc(entry['name']), number),
                 '<div class="dex-portrait">%s</div>' % (sprite[0] if sprite else ''),
                 '<div class="dex-portrait-caption">游戏内正面图像</div>',
                 '<div class="dex-infobox-types">%s</div>' % type_badges(entry['types']),
                 '<dl class="dex-facts"><dt>全国图鉴编号</dt><dd>%s</dd>' % number,
                 '<dt>本作物种编号</dt><dd>%s</dd><dt>种族值总和</dt><dd>%s</dd>' % (entry['species'], entry['total'])])
    abilities = re.search(r'^## 特性\s*\n(.*?)(?=^## |\Z)', markdown, re.MULTILINE | re.DOTALL)
    if abilities:
        for label, name, target in re.findall(r'^\| ([^|]+?) \| \[([^\]]+)\]\(([^)]+\.md)\) \|', abilities[1], re.MULTILINE):
            # Raw HTML is served one directory deeper than Markdown URLs.
            url = '../' + target[:-3] + '/'
            rows.append('<dt>%s</dt><dd><a href="%s">%s</a></dd>' % (esc(label), esc(quote(url, safe='/')), esc(name)))
    rows.extend(['</dl></aside>', '<p class="dex-lead"><strong>%s</strong>是%s属性的宝可梦。以下数据以《宝可梦水银》当前收录版本为准。</p>' % (
        esc(entry['name']), esc('／'.join(entry['types']))), ''])
    return markdown[:head.start()] + '\n'.join(rows) + markdown[head.end():]


def on_page_markdown(markdown, page, **kwargs):
    path = page.file.src_path.replace('\\', '/')
    if path == 'pokemon/index.md':
        return directory()
    if path.startswith('pokemon/') and path.split('/')[-1] in _by_file:
        return profile(markdown, path.split('/')[-1])
    return markdown
