"""Render location acquisitions from a reviewed snapshot on every build."""
import collections
import html
import json
import posixpath
import re
from pathlib import Path
from urllib.parse import quote
from mkdocs.plugins import event_priority

DOCS = Path(__file__).resolve().parents[1] / 'docs'
DATA = None
LINKS = {}
ASSETS = {}
ASSET_BASE = ''
REVERSE = {}
MACHINES = {}
WILD = {}
CATEGORIES = (
    ('balls','地上的精灵球'),('hidden','隐藏道具'),('gifts','NPC 赠送'),
    ('quests','支线赠送'),('pokemon','赠送宝可梦与蛋'),('shops','商店'),
    ('exchanges','道具兑换'),('tutors','招式教学'),('trainers','NPC 阵容'))
CURRENCY_UNITS = {'money': '元', 'coins': '枚代币', 'BP': 'BP',
                  'BracerPoints': 'BracerPoints', 'BeautyPoints': '点 BeautyPoints'}


def on_pre_build(**kwargs):
    global DATA, LINKS, ASSETS
    DATA = json.loads((DOCS/'locations/map_content.json').read_text(encoding='utf-8'))
    if DATA.get('event_scope') not in ('static', 'static+dynamic'):
        raise ValueError('Re-export map content with explicit event scope before publishing')
    LINKS = {}
    ASSETS = json.loads((DOCS/'assets/map-content/manifest.json').read_text(encoding='utf-8'))['assets']
    for kind,folder in (('item','items'),('pokemon','pokemon'),('move','moves')):
        LINKS[kind] = {int(p.name.split('_')[0]):p.name for p in (DOCS/folder).glob('*.md')
                       if p.name.split('_')[0].isdigit()}
    build_reverse()


def safe(value):
    return html.escape(str(value)).replace('|','&#124;').replace('\n',' ')


def name(kind, number):
    names = DATA['names'][kind]
    return names[number] if isinstance(number,int) and 0<=number<len(names) else '编号 %s' % number


def link(kind, number):
    title = safe(name(kind,number))
    filename = LINKS[kind].get(number)
    folder = {'item':'items','pokemon':'pokemon','move':'moves'}[kind]
    return '[%s](../%s/%s)' % (title,folder,filename) if filename else title


def icon(kind, number):
    asset = ASSETS.get(kind, {}).get(str(number))
    if not asset:
        return ''
    return '<img class="mc-icon mc-icon-%s" src="%s/%s" alt="" loading="lazy" width="%s" height="%s">' % (
        kind, ASSET_BASE, asset['path'], asset['width'], asset['height'])


def illustrated(kind, number):
    return icon(kind, number) + ' ' + link(kind, number)


def map_link(key):
    return '[%s](map_%s.md#map-content)' % (safe(DATA['maps'][key]['label']),key.replace('.','_'))


def quest_link(q):
    return '[%s %s](../sidequests/%s.md)' % (q['number'],safe(q['title']),q['number'])


def quantities(r):
    values = r.get('quantities',[])
    if r.get('exchange_options'):
        values = [option['quantity'] for option in r['exchange_options']]
    if r['kind'] == 'shop' and not values:
        return '按购买数量'
    if r['kind'] == 'tutor':
        return '—'
    return '／'.join(str(v) for v in values) if values else '按分支决定'


def content(r):
    kind = 'item' if r['kind'] in ('item','pickup','hidden','shop') else 'move' if r['kind']=='tutor' else 'pokemon'
    if r.get('resolved_label'):
        value = safe(r['resolved_label'])
    else:
        value = '、'.join(link(kind,i) for i in r.get('ids',[])) or '运行时决定的内容'
    if r['kind'] in ('pokemon','egg'):
        if r['kind']=='egg':
            value += '的蛋'
        else:
            levels = r.get('levels',[])
            value += ' · Lv.' + ('／'.join(str(v) for v in levels) if levels else '随条件决定')
        held = [v for v in r.get('held_items',[]) if v]
        if held:
            value += '<br>携带：' + '／'.join(illustrated('item',i) for i in held)
    if r.get('random'):
        value = '随机一项：' + value
    return value


def cost(r):
    if r.get('unlock_cost') is not None:
        return '首次解锁 %s 点 BracerPoints；解锁后免费教学' % r['unlock_cost']
    if r.get('exchange_options'):
        unit = CURRENCY_UNITS[r['currency']]
        rows = ['每个 %s %s' % (r['unit_price'],unit)] if r.get('unit_price') is not None else []
        if len(r['exchange_options']) > 1:
            rows.extend('%s 个 → %s %s' % (option['quantity'],option['amount'],unit)
                        for option in r['exchange_options'])
        elif not rows:
            option = r['exchange_options'][0]
            rows.append('%s 个 → %s %s' % (option['quantity'],option['amount'],unit))
        return '<br>'.join(rows)
    if r.get('prices'):
        unit = CURRENCY_UNITS.get(r.get('currency'),'（币种待确认）')
        kind = 'pokemon' if r['kind'] in ('pokemon','egg') else 'item'
        return '；'.join('%s：%s %s' % (link(kind,int(i)),v,unit) for i,v in r['prices'].items())
    costs = []
    for c in r.get('costs',[]):
        amounts = c.get('amounts',[c.get('amount')])
        amount = '／'.join(str(v) for v in amounts if v is not None) or '依选项'
        if c['kind']=='item':
            costs.append('%s × %s' % (illustrated('item',c['id']),amount))
        elif c['kind']=='selected_item':
            costs.append('%s × %s' % (safe(c['label']),amount))
        elif c['kind']=='shard':
            costs.append('%s色碎片 × %s' % (c['color'],amount))
        else:
            costs.append(amount + ' ' + CURRENCY_UNITS[c['kind']])
    if costs:
        return '；'.join(costs) + ('；' + safe(r['cost_note']) if r.get('cost_note') else '')
    if r['kind']=='shop':
        return '商店标价；列表随剧情／菜单分支开放' if r['currency']=='money' else 'BP 商店标价'
    return r.get('cost_note','未检出直接收费；开放条件见说明')


def acquisition_method(r):
    category = r['category']
    if category in ('shops','exchanges','tutors','pokemon'):
        currencies = list(dict.fromkeys([r['currency']] if r.get('currency') else
                          [c['kind'] for c in r.get('costs',[]) if c['kind'] in CURRENCY_UNITS]))
        names = {'money': '金钱', 'coins': '游戏城代币', 'BP': 'BP',
                 'BracerPoints': 'BracerPoints', 'BeautyPoints': 'BeautyPoints'}
        if currencies:
            currency = '／'.join(names[c] for c in currencies)
            return currency + ('教学' if category=='tutors' else '购买' if currencies==['money'] else '兑换')
    return '赠送宝可梦的蛋' if r['kind']=='egg' else dict(CATEGORIES)[category]


def record_option(record, number):
    """Keep the selected reward's branch details in map and reverse rows."""
    option = dict(record, ids=[number] if number is not None else [])
    if record.get('prices') and number is not None:
        option['prices'] = {str(number): record['prices'][str(number)]} if str(number) in record['prices'] else {}
    detail = record.get('option_details', {}).get(str(number), {})
    if detail.get('condition'):
        option['acquisition_conditions'] = record.get('acquisition_conditions', []) + [detail['condition']]
    if 'costs' in detail:
        option['costs'] = detail['costs']
        option.pop('cost_note', None)
    return option


def positions(r):
    positions = []
    for origin in r['origins']:
        if origin.get('scene'):
            text = '从本地点进入后续演出'
        elif origin.get('x') is not None:
            text = '（%s，%s）' % (origin['x'],origin['y'])
        else:
            text = '进入地图触发'
        if text not in positions:
            positions.append(text)
    return '、'.join(positions)


def conditions(r, number=None):
    parts = []
    for q in r.get('quest_rewards',[]):
        text = quest_link(q) + ' · ' + safe(q['phase'])
        if text not in parts:
            parts.append(text)
    if not parts and r.get('context_quests'):
        parts.append('同一事件涉及的支线（不代表本项的全部前置）：' + '、'.join(
            quest_link(dict(number=number_,**DATA['quests'][number_])) for number_ in r['context_quests']))
    if r.get('note'):
        parts.append(safe(r['note']))
    parts.extend(safe(text) for text in r.get('acquisition_conditions', []) if safe(text) not in parts)
    branches = collections.OrderedDict()
    for o in r['origins']:
        gate = []
        if o.get('condition'):
            gate.append('地图入口条件：' + o['condition'])
        if o.get('stage_condition'):
            gate.append(('动态阶段条件：' if o.get('dynamic') else '基础事件出现条件：') + o['stage_condition'])
        if o.get('trigger'):
            gate.append('踏入事件坐标时 Var 0x%X = %s' % (o['trigger'], o['value']))
        if o.get('flag'):
            gate.append('事件显示标记 0x%X 未设置' % o['flag'])
        description = o.get('acquisition_condition', '')
        branches.setdefault(description, [])
        text = '；'.join(gate) or '此入口无额外地图阶段限制'
        if text not in branches[description]:
            branches[description].append(text)
    alternatives = []
    for description, gates in branches.items():
        entry = [safe(description)] if description else []
        if gates != ['此入口无额外地图阶段限制'] or len(branches) > 1:
            entry.append(('入口限制（满足任一组；组内条件同时满足）：' if len(gates) > 1 else '') + '<br>'.join(safe(g) for g in gates))
        if entry:
            alternatives.append('<br>'.join(entry))
    if len(branches) > 1:
        parts.append('以下获取入口任选其一，分别满足各自条件：<br>' + '<br>'.join(
            '入口%s：%s' % (i, text) for i, text in enumerate(alternatives, 1)))
    else:
        parts.extend(alternatives)
    if any(o.get('dynamic') for o in r['origins']):
        parts.append('含动态阶段事件')
    if number is not None:
        parts.append('[条件与出处](#content-evidence-%d)' % number)
    return '<br>'.join(parts) or '按事件进度领取'


def evidence(r, number):
    rows = ['<details id="content-evidence-%d" markdown="1"><summary>出处 %d · %s</summary>' %
            (number,number,positions(r)), '']
    for q in r.get('quest_rewards',[]):
        rows += [quest_link(q)+'：'+safe(q['text'])+'（'+safe(q['phase'])+'）','']
    if r.get('quote'):
        rows += ['> '+safe(r['quote']),'']
    if r.get('note'):
        rows += [safe(r['note']),'']
    for text in r.get('acquisition_conditions', []):
        rows += [safe(text), '']
    for item, detail in r.get('option_details', {}).items():
        option = record_option(r, int(item))
        rows += [content(option) + '：' + safe(detail.get('condition', '')) +
                 ('；费用：' + cost(option) if 'costs' in detail else ''), '']
    if r.get('exchange_options'):
        rows += ['兑换方式：'+cost(r), '']
    for field,label in (('exchange_evidence','兑换价格／数量依据'),('condition_evidence','领取条件依据')):
        if r.get(field):
            rows += [label+'：'+'、'.join('`'+safe(node)+'`' for node in r[field]), '']
    for o in r['origins']:
        parts = [o['root']]
        if o.get('acquisition_condition'):
            rows += [safe(o['acquisition_condition']), '']
        if o.get('scene'):
            parts.append(o['scene']+'；演出地图 '+o['map'])
        elif o.get('x') is not None:
            parts.append('初始坐标 (%s,%s)' % (o['x'],o['y']))
        if o.get('condition'):
            parts.append('地图头条件：'+o['condition'])
        if o.get('stage_condition'):
            parts.append(('动态阶段' if o.get('dynamic') else '基础事件阶段')+'：'+o['stage_condition'])
        if o.get('stage_rule'):
            parts.append('规则：'+o['stage_rule'])
        if o.get('flag'):
            parts.append('人物隐藏 Flag：0x%X' % o['flag'])
        if 'hidden_item_id' in o:
            parts.append('隐藏道具领取编号：%s' % o['hidden_item_id'])
        if o.get('trigger'):
            parts.append('触发 Var 0x%X = %s' % (o['trigger'],o['value']))
        rows += ['- '+safe(' · '.join(parts))]
    rows += ['', '执行点：`'+r['node']+'`。']
    if r.get('source'):
        rows += ['', '源码：`%s:%s`。' % (r['source']['path'],r['source']['line'])]
    rows += ['', '</details>', '']
    return rows


def trainer(tid, role='对手'):
    t = DATA['trainers'].get(str(tid))
    if not t:
        return ['%s编号 %s：队伍尚未解码。' % (role,tid),'']
    title = t['name'] if not t['name'].startswith('TRAINER_') else '未署名 NPC'
    rows = ['<div class="mc-trainer" markdown="1">', '',
            '<div class="mc-trainer-heading" markdown="1">', '',
            '%s **%s：%s**' % (icon('trainer',t.get('pic')),role,safe(title)), '']
    if t.get('dynamic'):
        return rows+['</div>', '', t['note'],'', '</div>', '']
    rows += ['%s · %s · 队伍编号 %s' % (safe(name('trainer_class',t['trainer_class'])),
              '双打对战' if t.get('double_battle') else '单打对战',tid), '', '</div>', '',
             '<div class="mc-party loc-table-scroll" markdown="1" tabindex="0" aria-label="训练师队伍，可横向滚动">', '',
             '| 宝可梦 | 基础等级 | 携带物 | 招式 1 | 招式 2 | 招式 3 | 招式 4 |',
             '|---|---|---|---|---|---|---|']
    for mon in t['party']:
        moves = [link('move',m) if m else '—' for m in mon['moves'][:4]]
        moves += ['—'] * (4-len(moves))
        if 'default' in t['party_template']:
            moves = ['按等级生成'] * 4
        rows.append('| %s%s | Lv.%s | %s | %s |' % (illustrated('pokemon',mon['species']),
            '（异色）' if mon.get('shiny') else '',mon['level'],
            illustrated('item',mon['item']) if mon['item'] else '无',' | '.join(moves)))
    rows += ['', '</div>', '']
    items = [i for i in t.get('items',[]) if i]
    if items:
        rows += ['训练师可用道具：'+'、'.join(illustrated('item',i) for i in items)+'。', '']
    rows += ['</div>', '']
    return rows


def map_content(key):
    entry = DATA['maps'][key]
    rows = ['## 本图获取与对战 {#map-content}', '',
            '[按地图查找](content.md) · [教学地点](../tutors/index.md#tutor-locations) · [收录与残留核对](content_review.md)', '',
            '坐标从 0 开始，表示相应事件阶段的初始位置；上方为基础事件图，动态阶段的 NPC 可能不同或发生走动。各分支、不同阶段或随机选项不表示能同时获得。','']
    stages = DATA.get('stages', {}).get(key, [])
    if stages:
        rows += ['### 动态事件阶段 {#content-stages}', '',
                 '同图规则按表中顺序首次匹配生效；未被动态规则替换的事件或地图头继续使用基础数据。Flag／Var 条件与地图头条件须同时满足。', '',
                 '| 阶段规则 | 实际生效条件 | 替换内容 |', '|---|---|---|']
        for stage in stages:
            if not stage['dynamic']:
                continue
            replacements = [label for field,label in (('replaces_events','人物／坐标／背景事件'),('replaces_header','地图头脚本')) if stage[field]]
            rows.append('| `%s` | %s | %s |' % (stage['condition'],safe(stage['stage_condition']),'、'.join(replacements) or '沿用基础内容'))
        rows += ['']
    groups = collections.defaultdict(list)
    for index,r in enumerate(entry['records'],1):
        groups[r['category']].append((index,r))
    for category,title in CATEGORIES:
        rows += ['### '+title+' {#content-'+category+'}', '']
        entries = groups[category]
        if not entries:
            rows += ['当前快照未确认本类内容。','']
            continue
        if category=='trainers':
            rows += ['等级为队伍表基础值；再战等脚本可能调整等级及进化。不同分支的对手分开列出。','']
            seen = set()
            for index,r in entries:
                signature = (tuple(r['ids']),tuple(r.get('second_opponents',[])),tuple(r.get('partners',[])),tuple(r.get('scale_levels',[])))
                if signature in seen:
                    continue
                seen.add(signature)
                rows += [positions(r)+' · '+conditions(r,index),'']
                if True in r.get('scale_levels',[]):
                    rows += ['此战分支设置等级同步：等级会按玩家队伍调整，不能把下表基础等级当作固定实战等级。','']
                for tid in r['ids']:
                    rows += trainer(tid)
                for tid in r.get('second_opponents',[]):
                    rows += trainer(tid,'第二位对手')
                for tid in r.get('partners',[]):
                    rows += trainer(tid,'同行队友')
            continue
        rows += ['<div class="mc-acquisition loc-table-scroll" markdown="1" tabindex="0" aria-label="%s，可横向滚动">' % title, '']
        priced = category in ('shops','exchanges','tutors') or any(r.get('costs') or r.get('cost_note') for _,r in entries)
        if priced:
            rows += ['| 图像 | 内容 | 数量 | 位置 | 费用／兑换 | 条件 |','|---|---|---|---|---|---|']
        else:
            rows += ['| 图像 | 内容 | 数量 | 位置 | 获取条件 |','|---|---|---|---|---|']
        for index,r in entries:
            # One illustrated row per option; keep its branch conditions and evidence.
            for number in (r.get('ids') or [None]):
                option = record_option(r, number)
                kind = 'pokemon' if r['kind'] in ('pokemon','egg') else 'item'
                picture = icon(kind,number) if r['kind']!='tutor' else '—'
                cells = [picture, content(option)]
                cells += ['1 只／枚' if category=='pokemon' else quantities(option), positions(r), cost(option)] if priced else [
                    '1 只／枚（依分支）' if category=='pokemon' else quantities(r), positions(r)]
                cells.append(conditions(option,index))
                rows.append('| '+' | '.join(cells)+' |')
        rows += ['', '</div>', '']
    if entry['pending']:
        rows += ['### 尚待确定的内容','',
                 '下列事件已找到入口，但具体奖池或可达性尚未确定，不计入上面的固定获取清单。','',
                 '| 位置 | 已知内容 | 待确认原因 |','|---|---|---|']
        seen=set()
        for r in entry['pending']:
            description = r.get('note') or r.get('quote') or r.get('instruction',content(r))
            row = '| %s | %s | %s |' % (positions(r),safe(description),safe(r['reason']))
            if row not in seen:
                seen.add(row)
                rows.append(row)
        rows += ['']
    rows += ['### 获取条件与脚本依据','']
    for index,r in enumerate(entry['records'],1):
        rows += evidence(r,index)
    if entry['excluded']:
        rows += ['<details markdown="1"><summary>已剔除的旧事件与不可达点位 · %d 条</summary>' % len(entry['excluded']), '',
                 '| 位置 | 原脚本内容 | 剔除依据 |','|---|---|---|']
        for r in entry['excluded']:
            label = '训练师 '+ '/'.join(map(str,r.get('ids',[]))) if r['kind']=='trainer' else content(r)
            rows.append('| %s | %s | %s · `%s` |' % (positions(r),label,safe(r['reason']),r['node']))
        rows += ['', '</details>', '']
    return '\n'.join(rows)


def directory():
    stats = DATA['stats']
    scope = '静态与动态阶段事件' if DATA['event_scope'] == 'static+dynamic' else '静态地图头'
    rows = ['# 每张地图的获取与对战', '',
            '按%s收录 **%d 张普通地图**。点击地点查看地面球、隐藏道具、NPC／支线赠送、宝可梦与蛋、商店兑换、招式教学和训练师阵容。' % (scope,stats['maps']), '',
            '专用过场地图不单独列入本目录；其中的奖励、馆主战和支线战斗归回实际地点。野生分布继续查看各地点原有的分布表。', '',
            '[地图总览](atlas.md) · [数据范围与残留核对](content_review.md)', '',
            '| 地点 | 地面球 | 隐藏 | NPC／支线 | 宝可梦／蛋 | 商店／兑换 | 教学 | 阵容 | 待核 |','|---|---|---|---|---|---|---|---|---|']
    for key,e in DATA['maps'].items():
        counts=collections.Counter(r['category'] for r in e['records'])
        rows.append('| %s · %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (map_link(key),key,
            counts['balls'],counts['hidden'],counts['gifts']+counts['quests'],counts['pokemon'],
            counts['shops']+counts['exchanges'],counts['tutors'],counts['trainers'],len(e['pending'])))
    rows += ['', '数字表示事件记录／脚本分支数；商店一条可含多种商品，同一奖励的重复入口已合并。0 表示当前未确认，不等于证明地图中绝对不存在。','']
    return '\n'.join(rows)


def tutor_directory():
    rows = ['## 教学 NPC 地点 {#tutor-locations}', '',
            '点击地点查看 NPC 坐标、费用与支线开放条件。这里只列本次地图快照确认的教学入口。', '',
            '| 招式 | 地点 | 费用／条件 |','|---|---|---|']
    seen=set()
    for key,e in DATA['maps'].items():
        for r in e['records']:
            if r['kind']!='tutor':
                continue
            for mid in r['ids']:
                url = '../locations/map_%s.md#content-tutors' % key.replace('.','_')
                row = '| %s | [%s](%s) | %s |' % (link('move',mid),safe(e['label']),url,cost(r)+'<br>'+conditions(r))
                if row not in seen:
                    seen.add(row)
                    rows.append(row)
    return '\n'.join(rows)+'\n'


def audit():
    stats=DATA['stats']
    scope = ('获取与对战内容包含静态和动态事件。基础事件优先读取引擎静态覆盖，其余读取 ROM；动态规则按首次匹配生效，分别继承未覆盖的事件和地图头。地图总览与支线台本的地图图像仍使用静态快照。'
             if DATA['event_scope'] == 'static+dynamic' else '仅收录静态地图头的事件和可达脚本。')
    rows=['# 地图内容收录与残留核对','',
          '[返回地图内容目录](content.md)','',
          '当前快照：%s。覆盖 %s 张普通地图，其中 %s 张有已收录内容；%s 条记录，剔除 %s 条残留或临时队伍记录，%s 条仍待确定。' %
          (DATA['snapshot_date'],stats['maps'],stats['with_content'],stats['records'],stats['excluded'],stats['pending']),'',
          scope+'碰撞、位置、NPC 图像、对白和脚本共同用于核对；柜台后的服务 NPC 保留。地面球以当前图像确认，不能套用原版图像常量。','',
          '支线奖励按实际奖励执行点关联。互斥选择、随机奖池、交付费用、临时参战宝可梦分别保留说明；仅有野生对战指令不能证明可捕获，未混入赠送名单。','',
          '基础阵容取引擎训练师覆盖表，其余读取 ROM；对战设施生成阵容及等级同步另行说明。当前快照不能保证所有原生函数、存档条件和人物移动都已完全还原。','',
          '过场只转移逐个核对过的脚本入口；同一地图的其他脚本不会自动继承归属。共用结算地图头、回程地点和远方地名不能单独证明奖励地点。','',
          ]
    coverage = DATA.get('review_coverage', {})
    acquisition = stats.get('acquisition_conditions', {})
    if acquisition:
        rows += ['获取条件：%s 条含人工整理说明，%s 条采用已核对的标准拾取规则，%s 条仍待补充。标准拾取规则不等同于逐条人工核对可达路线。' % (acquisition.get('manual', 0), acquisition.get('standard_pickup', 0), acquisition.get('pending', 0)), '']
    if coverage:
        rows += ['静态基线复核：%s 张地图、%s 个候选入口，其中 %s 个含内容记录；地形扫描覆盖 %s 张图的 %s 个位置入口，%s 项黑色地块提示已逐项处理。%s' % (
            coverage['maps'], coverage['candidate_origins'], coverage['origins_with_records'],
            coverage['terrain_maps'], coverage['terrain_origins'], coverage['terrain_findings'],
            coverage['method']), '']
        rows += ['- '+note for note in coverage['retained_context']] + ['']
    if DATA['event_scope'] == 'static+dynamic':
        rows += ['本轮加入 %s 张地图的 %s 个动态阶段，%s 条已收录记录含动态入口（包括与静态入口重复的内容，不代表全部为新增奖励）。独立的新动态人物不沿用静态坐标排除；原样继承的残留事件继续剔除。' % (stats['dynamic_maps'],stats['dynamic_stages'],stats['dynamic_records']), '']
    rows += ['## 过场内容归属','', '| 演出地图／入口 | 归属地点 | 依据 |','|---|---|---|']
    for key,o in DATA['scene_owners'].items():
        for root,evidence in o['roots'].items():
            rows.append('| %s · `%s` | %s | %s；%s |' % (key,root,map_link(o['map']),safe(o['reason']),safe(evidence)))
    rows += ['', '## 待确定的内容','', '| 地点 | 位置 | 内容与依据 |','|---|---|---|']
    for key,e in DATA['maps'].items():
        for r in e['pending']:
            detail = (r['note'] + '；' if r.get('note') else '') + r['reason']
            rows.append('| %s | %s | %s · `%s` |' % (map_link(key),positions(r),safe(detail),r['node']))
    if DATA['audit']:
        rows += ['', '## 未归入普通地图的演出事件','', '| 原地图 | 入口 | 处理 |','|---|---|---|']
        seen=set()
        for e in DATA['audit']:
            row='| %s | `%s` | %s |' % (e['origin']['map'],e['origin']['root'],safe(e['reason']))
            if row not in seen:
                rows.append(row)
                seen.add(row)
    rows += ['', '各地图末尾可展开已剔除的事件，查看坐标与理由。','',
             'ROM SHA-256：`%s`。' % DATA['rom_sha256'],'']
    return '\n'.join(rows)


def build_reverse():
    """Index confirmed acquisitions only; enemy parties and costs are not rewards."""
    global REVERSE, MACHINES, WILD
    REVERSE = {kind: collections.defaultdict(list) for kind in ('item','pokemon','move','ability')}
    MACHINES, WILD = {}, collections.defaultdict(list)
    for key, entry in DATA['maps'].items():
        for index, record in enumerate(entry['records'], 1):
            kind = record['kind']
            target = ('item' if kind in ('item','pickup','hidden','shop') else
                      'pokemon' if kind in ('pokemon','egg') else 'move' if kind=='tutor' else None)
            if target is None:
                continue
            method = acquisition_method(record)
            row = dict(map=key, method=method, record=record, index=index)
            for number in record.get('ids', []):
                if number in LINKS[target]:
                    REVERSE[target][number].append(dict(row, number=number))
            if target=='pokemon':
                for number in record.get('held_items', []):
                    if number and number in LINKS['item']:
                        REVERSE['item'][number].append(dict(row, number=number, method='赠送宝可梦携带'))
        # Existing encounter sections are the source of truth for species,
        # methods, time windows and map publication. Do not index scene maps.
        path = DOCS / ('locations/map_%s.md' % key.replace('.', '_'))
        heading = ''
        for line in path.read_text(encoding='utf-8').splitlines() if path.exists() else []:
            if line.startswith('## '):
                heading = line[3:].strip()
            if not (' · ' in heading or heading.startswith(('广播遇敌','大量出现','特殊广播'))):
                continue
            for match in re.finditer(r'\[([^\]]+)\]\(\.\./pokemon/(\d+)_[^)]+\.md\)', line):
                number = int(match[2])
                cells = [c.strip() for c in line.strip('|').split('|')]
                detail = '等级 %s · 概率 %s' % (cells[1], cells[2]) if len(cells)==3 and line.startswith('|') else heading
                if heading.startswith('广播遇敌') and line.startswith('|'):
                    detail = cells[0] + ' · ' + heading
                row = dict(map=key, method=heading, detail=detail, number=number, wild=True)
                if row not in WILD[number]:
                    WILD[number].append(row)
                    REVERSE['pokemon'][number].append(row)
    # Match the published machine directory to the actual item names, including
    # the extended TM51..58 names; never assume item IDs are one contiguous run.
    machine_items = {}
    for number, title in enumerate(DATA['names']['item']):
        match = re.fullmatch(r'(TM|HM)(\d+)', title)
        extra = re.fullmatch(r'招式学习器(\d+)', title)
        if match or extra:
            code = '%s%02d' % ((match[1], int(match[2])) if match else ('TM', int(extra[1])))
            machine_items[code] = number
    for line in (DOCS/'machines/index.md').read_text(encoding='utf-8').splitlines():
        match = re.search(r'>(TM\d+|HM\d+)</span>.*?\]\(\.\./moves/(\d+)_', line)
        if not match:
            continue
        code, move = match[1], int(match[2])
        item = machine_items.get(code)
        MACHINES[code] = dict(item=item, move=move)
        for row in REVERSE['item'].get(item, []):
            REVERSE['move'][move].append(dict(row, method=code+' · '+row['method']))
    # Wild-held items and abilities point through obtainable species. This is
    # a possible source, not a promise that a caught Pokemon has that ability/item.
    for folder, kind, heading in (('items','item','携带该道具的野生宝可梦'),
                                 ('abilities','ability','拥有该特性的宝可梦')):
        for path in (DOCS/folder).glob('*.md'):
            if not path.name.split('_')[0].isdigit():
                continue
            text = path.read_text(encoding='utf-8')
            section = re.search(r'^## '+heading+r'\s*\n(.*?)(?=^## |\Z)', text, re.M|re.S)
            if not section:
                continue
            number = int(path.name.split('_')[0])
            for sid in dict.fromkeys(int(s) for s in re.findall(r'\]\(\.\./pokemon/(\d+)_', section[1])):
                sources = WILD.get(sid, []) if kind=='item' else REVERSE['pokemon'].get(sid, [])
                for row in sources:
                    REVERSE[kind][number].append(dict(row, via=sid,
                        method=('野生宝可梦可能携带' if kind=='item' else '拥有该特性的宝可梦')+' · '+row['method']))


def reverse_map_link(row):
    anchor = 'wild-encounters' if row.get('wild') else 'content-evidence-%s' % row['index']
    return '[%s](../locations/map_%s.md#%s)' % (
        safe(DATA['maps'][row['map']]['label']), row['map'].replace('.','_'), anchor)


def reverse_summary(kind, number, only_tutors=False):
    rows = REVERSE[kind].get(number, [])
    if only_tutors:
        rows = [r for r in rows if r.get('record', {}).get('kind')=='tutor']
    unique = {}
    for row in rows:
        unique.setdefault((row['map'],row['method']),row)
    if not unique:
        return '暂未确认地点'
    result = [reverse_map_link(r)+'（'+safe(r['method'])+'）' for r in list(unique.values())[:2]]
    if len(unique)>2:
        filename = LINKS.get(kind, {}).get(number)
        if kind=='ability':
            filename = next((p.name for p in (DOCS/'abilities').glob('%04d_*.md' % number)), None)
        folder = dict(item='items',pokemon='pokemon',move='moves',ability='abilities')[kind]
        if filename:
            result.append('[全部 %s 项](../%s/%s#map-sources)' % (len(unique),folder,filename))
    return '<br>'.join(result)


def reverse_detail(kind, number):
    rows = ['## 地图获取与教学地点 {#map-sources}', '',
            '只列已确认的地图来源；不同阶段与分支不表示可以同时获得。点击地点查看位置、费用和完整条件。', '']
    if kind=='ability':
        rows += ['以下是拥有该特性的宝可梦的获取地点，不保证获得时具有该特性；隐藏特性等限制请查看宝可梦资料。', '']
    entries = REVERSE[kind].get(number, [])
    if not entries:
        return '\n'.join(rows+['当前快照尚未确认地图来源。', ''])
    rows += ['<div class="mc-reverse loc-table-scroll" markdown="1">', '',
             '| 地点 | 获取／教学方式 | 内容与条件 |', '|---|---|---|']
    seen = set()
    for row in entries:
        if row.get('wild'):
            detail = safe(row['detail'])
        else:
            record = row['record']
            reward = row.get('via', row['number'])
            option = record_option(record, reward) if reward in record['ids'] else dict(record)
            detail = positions(record)+'<br>'+conditions(option)
            if record['category'] in ('shops','exchanges','tutors') or option.get('costs') or option.get('cost_note'):
                detail += '<br>'+cost(option)
            if record['kind'] in ('pokemon','egg'):
                detail += '<br>'+content(option)
        if row.get('via'):
            detail = illustrated('pokemon',row['via'])+'<br>'+detail
        rendered = '| %s | %s | %s |' % (reverse_map_link(row),safe(row['method']),detail)
        if rendered not in seen:
            seen.add(rendered)
            rows.append(rendered)
    return '\n'.join(rows+['', '</div>', ''])


def with_reverse_detail(markdown, kind, number):
    markdown = re.sub(r'^(# [^\n]+\n)',
                      r'\1\n[查看地图获取／教学地点](#map-sources)\n', markdown, count=1)
    return markdown+'\n\n'+reverse_detail(kind,number)


def index_reverse(markdown, kind, directory):
    result = []
    for line in markdown.splitlines():
        if not line.startswith('|'):
            result.append(line)
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if cells[0]=='编号':
            extra = '地图获取／教学地点'
        elif all(re.fullmatch(r':?-+:?', c) for c in cells):
            extra = '---'
        else:
            match = re.search(r'\]\((?:\.\./(?:moves|items|abilities)/)?(\d+)_[^)]+\.md', line)
            if not match:
                result.append(line)
                continue
            number = int(match[1])
            if directory=='machines':
                code = re.search(r'>(TM\d+|HM\d+)</span>',line)
                item = MACHINES.get(code[1], {}).get('item') if code else None
                extra = reverse_summary('item',item)
                if item:
                    cells[0] = icon('item',item)+' '+cells[0]
            else:
                extra = reverse_summary(kind,number,only_tutors=directory=='tutors')
        result.append('| '+' | '.join(cells+[extra])+' |')
    return '\n'.join(result)


def encounter_icons(markdown):
    # Only touch links in existing encounter content, before appending gifts
    # and trainer cards (which already carry their own icons).
    marked = False
    output = []
    for line in markdown.splitlines():
        if not marked and line.startswith('## ') and (' · ' in line or line.startswith(('## 广播遇敌','## 大量出现','## 特殊广播'))):
            output += ['<span id="wild-encounters"></span>', '']
            marked = True
        line = re.sub(r'(\[[^\]]+\]\(\.\./pokemon/(\d+)_[^)]+\.md\))',
                      lambda m: icon('pokemon',int(m[2]))+' '+m[1],line)
        output.append(line)
    return '\n'.join(output)


@event_priority(-50)  # Run after Pokedex generates its HTML directory.
def on_page_markdown(markdown, page, **kwargs):
    global ASSET_BASE
    ASSET_BASE = posixpath.relpath('assets/map-content', posixpath.dirname(page.url))
    path=page.file.src_path.replace('\\','/')
    match=re.fullmatch(r'locations/map_(\d+)_(\d+)\.md',path)
    if match:
        key='.'.join(match.groups())
        if key in DATA['maps']:
            return encounter_icons(markdown)+'\n\n'+map_content(key)
    if path=='locations/content.md':
        return directory()
    if path=='locations/content_review.md':
        return audit()
    if path=='tutors/index.md':
        return index_reverse(markdown,'move','tutors')+'\n\n'+tutor_directory()
    for folder,kind in (('items','item'),('moves','move'),('machines','item'),('abilities','ability')):
        if path==folder+'/index.md':
            return index_reverse(markdown,kind,folder)
        match = re.fullmatch(folder+r'/(\d+)_[^/]+\.md',path)
        if match:
            return with_reverse_detail(markdown,kind,int(match[1]))
    if path=='pokemon/index.md':
        markdown = markdown.replace('<th scope="col">种族值总和</th>',
                                    '<th scope="col">种族值总和</th><th scope="col">地图获取地点</th>')
        def add_sources(match):
            row = match[0]
            sid = re.search(r'href="(\d+)_',row)
            if not sid:
                return row
            number = int(sid[1])
            search = safe(' '.join(DATA['maps'][r['map']]['label']+' '+r['method']
                                   for r in REVERSE['pokemon'].get(number, [])))
            row = re.sub(r'(data-search="[^"]*)"',lambda m: m[1]+' '+search+'"',row,count=1)
            # This directory is raw HTML; links must use output URLs, whereas
            # Markdown tables above deliberately use source-page paths.
            summary = reverse_summary('pokemon',number)
            summary = re.sub(r'\[([^\]]+)\]\(([^)]+)\.md(#[^)]*)?\)',
                lambda m: '<a href="%s/%s">%s</a>' % (quote(m[2],safe='/.'),m[3] or '',m[1]),summary)
            return row.replace('</tr>','<td class="mc-index-sources">'+summary+'</td></tr>')
        return re.sub(r'<tr data-dex-entry\b.*?</tr>',add_sources,markdown)
    match = re.fullmatch(r'pokemon/(\d+)_[^/]+\.md',path)
    if match:
        return with_reverse_detail(markdown,'pokemon',int(match[1]))
    return markdown
