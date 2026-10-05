"""Render location acquisitions from a reviewed snapshot on every build."""
import collections
import html
import json
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / 'docs'
DATA = None
LINKS = {}
CATEGORIES = (
    ('balls','地上的精灵球'),('hidden','隐藏道具'),('gifts','NPC 赠送'),
    ('quests','支线赠送'),('pokemon','赠送宝可梦与蛋'),('shops','商店'),
    ('exchanges','道具兑换'),('tutors','招式教学'),('trainers','NPC 阵容'))


def on_pre_build(**kwargs):
    global DATA, LINKS
    DATA = json.loads((DOCS/'locations/map_content.json').read_text(encoding='utf-8'))
    if DATA.get('event_scope') != 'static':
        raise ValueError('Re-export static map content before publishing')
    LINKS = {}
    for kind,folder in (('item','items'),('pokemon','pokemon'),('move','moves')):
        LINKS[kind] = {int(p.name.split('_')[0]):p.name for p in (DOCS/folder).glob('*.md')
                       if p.name.split('_')[0].isdigit()}


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


def map_link(key):
    return '[%s](map_%s.md#map-content)' % (safe(DATA['maps'][key]['label']),key.replace('.','_'))


def quest_link(q):
    return '[%s %s](../sidequests/%s.md)' % (q['number'],safe(q['title']),q['number'])


def quantities(r):
    values = r.get('quantities',[])
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
            value += '<br>携带：' + '／'.join(link('item',i) for i in held)
    if r.get('random'):
        value = '随机一项：' + value
    return value


def cost(r):
    if r.get('prices'):
        unit = '元' if r.get('currency')=='money' else '枚代币'
        return '；'.join('%s：%s %s' % (link('item',int(i)),v,unit) for i,v in r['prices'].items())
    costs = []
    for c in r.get('costs',[]):
        amounts = c.get('amounts',[c.get('amount')])
        amount = '／'.join(str(v) for v in amounts if v is not None) or '依选项'
        if c['kind']=='item':
            costs.append('%s × %s' % (link('item',c['id']),amount))
        elif c['kind']=='shard':
            costs.append('%s色碎片 × %s' % (c['color'],amount))
        else:
            costs.append(amount + {'money':' 元','coins':' 枚代币','BP':' BP','BracerPoints':' BracerPoints'}[c['kind']])
    if costs:
        return '；'.join(costs)
    if r['kind']=='shop':
        return '商店标价；列表随剧情／菜单分支开放' if r['currency']=='money' else 'BP 商店标价'
    return r.get('cost_note','未检出直接收费；开放条件见说明')


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
    if not parts:
        for number_ in r.get('context_quests',[]):
            parts.append(quest_link(dict(number=number_,**DATA['quests'][number_])))
    if r.get('note'):
        parts.append(safe(r['note']))
    if any(o.get('condition') for o in r['origins']):
        parts.append('分阶段出现')
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
    for o in r['origins']:
        parts = [o['root']]
        if o.get('scene'):
            parts.append(o['scene']+'；演出地图 '+o['map'])
        elif o.get('x') is not None:
            parts.append('初始坐标 (%s,%s)' % (o['x'],o['y']))
        if o.get('condition'):
            parts.append('阶段条件：'+o['condition'])
        if o.get('flag'):
            parts.append('人物隐藏 Flag：0x%X' % o['flag'])
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
    rows = ['**%s：%s** · 队伍编号 %s' % (role,safe(title),tid),'']
    if t.get('dynamic'):
        return rows+[t['note'],'']
    rows += ['| 宝可梦 | 基础等级 | 携带物 | 招式 |','|---|---|---|---|']
    for mon in t['party']:
        moves = ' / '.join(link('move',m) for m in mon['moves'] if m)
        if 'default' in t['party_template']:
            moves = '按等级自动生成'
        rows.append('| %s%s | %s | %s | %s |' % (link('pokemon',mon['species']),
            '（异色）' if mon.get('shiny') else '',mon['level'],
            link('item',mon['item']) if mon['item'] else '无',moves or '无'))
    items = [i for i in t.get('items',[]) if i]
    if items:
        rows += ['', '训练师可用道具：'+'、'.join(link('item',i) for i in items)+'。']
    rows += ['']
    return rows


def map_content(key):
    entry = DATA['maps'][key]
    rows = ['## 本图获取与对战 {#map-content}', '',
            '[按地图查找](content.md) · [教学地点](../tutors/index.md#tutor-locations) · [收录与残留核对](content_review.md)', '',
            '坐标从 0 开始，对应上方地图的事件初始位置；NPC 可能走动。各分支、不同阶段或随机选项不表示能同时获得。','']
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
        if category in ('shops','exchanges','tutors'):
            rows += ['| 内容 | 位置 | 费用／兑换 | 条件 |','|---|---|---|---|']
            for index,r in entries:
                rows.append('| %s | %s | %s | %s |' % (content(r),positions(r),cost(r),conditions(r,index)))
        else:
            rows += ['| 内容 | 数量 | 位置 | 条件 |','|---|---|---|---|']
            for index,r in entries:
                rows.append('| %s | %s | %s | %s |' % (content(r),
                    '1 只／枚（依分支）' if category=='pokemon' else quantities(r),positions(r),conditions(r,index)))
        rows += ['']
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
    rows = ['# 每张地图的获取与对战', '',
            '按静态地图头收录 **%d 张普通地图**。点击地点查看地面球、隐藏道具、NPC／支线赠送、宝可梦与蛋、商店兑换、招式教学和训练师阵容。' % stats['maps'], '',
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
    rows=['# 地图内容收录与残留核对','',
          '[返回地图内容目录](content.md)','',
          '当前快照：%s。覆盖 %s 张普通地图，其中 %s 张有已收录内容；%s 条记录，剔除 %s 条残留或临时队伍记录，%s 条仍待确定。' %
          (DATA['snapshot_date'],stats['maps'],stats['with_content'],stats['records'],stats['excluded'],stats['pending']),'',
          '仅收录静态地图头的布局、事件和可达脚本，优先读取引擎静态覆盖，其余读取 ROM 静态数据。动态地图头的布局、事件与获取内容不收录。碰撞、位置、NPC 图像、对白和脚本共同用于核对；柜台后的服务 NPC 保留。地面球以当前图像确认，不能套用原版图像常量。','',
          '支线奖励按实际奖励执行点关联。互斥选择、随机奖池、交付费用、临时参战宝可梦分别保留说明；仅有野生对战指令不能证明可捕获，未混入赠送名单。','',
          '基础阵容取引擎训练师覆盖表，其余读取 ROM；对战设施生成阵容及等级同步另行说明。当前快照不能保证所有原生函数、存档条件和人物移动都已完全还原。','',
          '过场只转移逐个核对过的静态脚本入口；同一地图的其他脚本不会自动继承归属。共用结算地图头、回程地点和远方地名不能单独证明奖励地点。','',
          ]
    coverage = DATA.get('review_coverage', {})
    if coverage:
        rows += ['本次全量复核：%s 张地图、%s 个候选入口，其中 %s 个含内容记录；地形扫描覆盖 %s 张图的 %s 个位置入口，%s 项黑色地块提示已逐项处理。%s' % (
            coverage['maps'], coverage['candidate_origins'], coverage['origins_with_records'],
            coverage['terrain_maps'], coverage['terrain_origins'], coverage['terrain_findings'],
            coverage['method']), '']
        rows += ['- '+note for note in coverage['retained_context']] + ['']
    rows += ['## 过场内容归属','', '| 演出地图／入口 | 归属地点 | 依据 |','|---|---|---|']
    for key,o in DATA['scene_owners'].items():
        for root,evidence in o['roots'].items():
            rows.append('| %s · `%s` | %s | %s；%s |' % (key,root,map_link(o['map']),safe(o['reason']),safe(evidence)))
    rows += ['', '## 待确定的内容','', '| 地点 | 位置 | 内容与依据 |','|---|---|---|']
    for key,e in DATA['maps'].items():
        for r in e['pending']:
            rows.append('| %s | %s | %s · `%s` |' % (map_link(key),positions(r),safe(r.get('note',r['reason'])),r['node']))
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


def on_page_markdown(markdown, page, **kwargs):
    path=page.file.src_path.replace('\\','/')
    match=re.fullmatch(r'locations/map_(\d+)_(\d+)\.md',path)
    if match:
        key='.'.join(match.groups())
        if key in DATA['maps']:
            return markdown+'\n\n'+map_content(key)
    if path=='locations/content.md':
        return directory()
    if path=='locations/content_review.md':
        return audit()
    if path=='tutors/index.md':
        return markdown+'\n\n'+tutor_directory()
    return markdown
