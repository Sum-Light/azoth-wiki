# 宝可梦水银 百科

基于 MkDocs Material 的资料站，图鉴数据由脚本直接从 ROM 提取。

## 本地预览

```
pip install -r requirements.txt   # 需要 Python 3.8+
python tools/generate_pokemon.py  # 从 ROM 生成 docs/pokemon/ 下的页面
python tools/generate_sidequests.py  # 96 项支线与道具/宝可梦反查（无需 ROM）
mkdocs serve                      # http://127.0.0.1:8000
```

## 部署

推送到 `main` 分支后，`.github/workflows/deploy-wiki.yml` 会自动重新生成页面并发布到 GitHub Pages（需在仓库 Settings → Pages 中选择 GitHub Actions 作为来源）。

## 目录结构

- `mkdocs.yml` — 站点配置
- `docs/` — 手写内容（首页、攻略等）与生成内容（`docs/pokemon/`，勿手改）
- `tools/generate_pokemon.py` — 数据提取与页面生成，数据来源：
  - ROM 内 `gSpeciesNames` / `gBaseStats` / `gEvolutionTable`（指针偏移见 CFRU 的 `include/new/rom_locs.h`）
  - `charmap.tbl`（中文文本解码）
  - `strings/ability_name_table.string`（特性中文名）

游戏 ROM 更新后，重新运行生成脚本即可同步图鉴。

## 招式索引

招式学习机与定点教学索引由 `python wiki/tools/generate_move_indexes.py` 从 `data/move_indexes.json` 和现有图鉴／招式页生成，列出128个TM／HM与146个普通教学招式。使用 `--refresh-source` 可只读当前ROM的招式表并更新快照；完整图鉴生成也会同步索引。索引中的可学习条目数量包括不同形态，点击数量可进入招式页的对应学习名单，不代表教学NPC位置或剧情开放条件。

## 按地图获取与对战

“地图获取与对战”目录覆盖已开放的普通地图，专用过场不单列；馆主战、支线奖励归回实际触发地点。地点页按地面球、隐藏道具、NPC／支线赠送、赠送宝可梦与蛋、商店、兑换、教学和 NPC 阵容分栏，并保留初始坐标、阶段条件与脚本出处。定点教学索引同时列出教学 NPC 的地点与费用。

Wiki 仅收录静态地图头：布局、地图事件、获取内容及支线地点均优先读取引擎静态覆盖，其余读取 ROM 静态数据。动态地图头的布局、事件、出口及其带入的获取内容不收录；静态脚本自身的 Flag／Var 分支条件仍保留。地图快照以 `event_scope: static` 标记，旧动态图片在构建时排除。

- `data/map_content_review.json`：人工核对的点位排除、柜台保留、随机奖池、兑换价格、临时队伍排除与过场归属；不要用脚本地址或碰撞位一刀切排除事件。
- `docs/locations/map_content.json`：只读提取后的发布快照，包括地图内容、训练师阵容、来源和待核项。挖矿、三地鼠挑战等原生小游戏的奖池尚未完整还原，单独标作待确定，不冒充固定奖励。
- `hooks/map_content.py`：构建时把快照补入地点页和教学索引，生成 `locations/content.md` 与核对目录。普通 MkDocs 构建及独立 Wiki 部署不需要 ROM，也不依赖工作区临时文件。
- 完整工作区更新：`python -X utf8 tools/collect_map_content.py` → `python -X utf8 tools/review_map_content.py` → 核对候选点位、修订人工数据 → `python -X utf8 tools/export_map_content.py` → `python -X utf8 -m mkdocs build -f wiki/mkdocs.yml`。收集脚本复用地图编辑器及脚本图；图片核对工具为 `tools/map_content_review_images.py`。运行期间不写 ROM。

## 支线任务资料

2026-10-05补齐小茜百货大楼开场与跨地图演出，并按callasm任务分发表衔接源码过场；33条漏收对白补入对应位置，20项任务的内容或编排更新。台本和Wiki共用有顺序的场景选编，姓名框标签只用于说话人。

导航中的“支线任务”已同步2026-10-05剧情补全版：96项、266个条件阶段（含6个可选阶段）、335页游戏见闻。见闻录正文中`,`、`.`改为`。`，`!`改为`！`，`?`改为`？`；顿号因游戏字库限制也排为句号。任务页包括阶段Flag／Var、修订说明、原文与补齐对白、地图和分支奖励；另有阶段总表、涉及地图目录、Word下载，以及地点页返回任务和具体场景的链接。

- `data/sidequests.json`：已核对台本的独立数据快照，保留源文件校验值。
- `data/sidequest_unlocks.json`：非背包奖励补充，保留任务号、阶段、确认方式、证据符号及相关页面 ID。
- `data/sidequest_locations.json`：从脚本入口追踪分场对白的地图快照，含触发方式、坐标、依据与导航参考。
- `docs/sidequests/maps/`：复用 Map_event_editor 绘制静态地图、人物／宝可梦图像及事件标记，并叠加任务入口编号，图片可点击放大。事件预览保留初始位置，不按存档 Flag 隐藏人物。
- 地图与事件图像使用编辑器默认的 CFRU `test.gba`（不存在时使用 CFRU `BPRE0.gba`），可通过导出工具的 `--map-rom` 指定；`--rom` 仅指定台本脚本追踪所用 ROM。两者分别记录校验值，避免旧 ROM 与当前图像表地址混用。ROM 区域名“真新镇”在任务地图中显示为“剧情地图”。
- `python tools/export_wiki_atlas.py`：从编辑器 ROM 导出地图查看功能，沿地图头连接与静态传送事件追踪通道，生成 `docs/locations/atlas_data.json`、地图图像和地点页的 `location-atlas` 区块。区域定位复用现有大地图的 mapsec 与校准值；可变返回出口不推断目的地。先生成图鉴和任务页，再运行此工具补充地图区块。
  普通通道要求沿途连接可回连；只导出静态布局与出口。缺少可靠房间名称的地点保留地图编号，不根据原版命名猜测用途。
  只调整地点页排版或重建被其他生成器覆盖的区块时，运行 `python tools/export_wiki_atlas.py --pages-only`，复用已导出的地图快照。
- 地图按 `hooks/map_publication.py` 的 `PUBLISHED_RANGES`／`PUBLISHED_GROUPS` 白名单发布，以整数 `(mapgroup, mapnum)` 判断，不按 mapsec 或区域名称决定开放范围。范围两端均包含，重叠编号只收录一次。构建时统一过滤地图数据、详情页、图片、搜索、连接与野生分布入口；源码保留完整快照，便于后续开放。mapsec 仅用于目录区域分组与大地图定位，剧情地图不标在原真新镇的位置。同步到独立 Wiki 仓库时必须同时同步 `hooks/`。
- `tools/generate_sidequests.py`：生成 `docs/sidequests/` 并维护带标记的反查区块。
- `docs/stylesheets/sidequests.css`、`docs/javascripts/sidequests.js`：手机、深色模式与即时导航支持。
- 全站阅读样式由最后加载的 `docs/stylesheets/encyclopedia.css` 统一覆盖：正文、侧栏目录、章节导航、带边界与隔行底色的表格、图鉴资料框及地图／任务排版。`docs/javascripts/encyclopedia.js` 为长表格添加本地筛选与列排序，兼容 Material 即时导航，不改动生成的数据正文。
- `hooks/pokedex.py` 在构建时读取生成器现有的图鉴总表，将目录按编号分成世代区段，补上彩色属性、名称／编号／属性筛选；详情页补上相邻条目导航和含特性的资料框。展示由 `pokedex.css`／`pokedex.js` 负责，不重读 ROM、不修改编号、种族值或形态数据。超出世代编号范围的条目保留在“其他编号”。本 hook 同时为本地全站 CSS／JS 添加内容哈希版本号，避免发布后命中旧资源缓存。
- 像素图使用 `docs/stylesheets/pixel-images.css` 与 `docs/javascripts/pixel-images.js`，以图片真实宽高乘正整数设置显示尺寸。大图保留原尺寸并在容器内滚动；看图窗口提供1／2／3／4倍；地图列表以原像素裁切预览，禁止缩放成任意尺寸的缩略图。大地图只裁掉空海域，热点仍以完整512×256底图定位；独立分布地图同样只提供整数倍率。不要恢复图片 `max-width:100%`、非整数 `transform:scale()`、`object-fit:contain` 缩略图或任意百分比拉伸。浏览器自身缩放仍由用户控制。
- `docs/stylesheets/standalone.css` 统一独立分布地图、HOME与修复工具的阅读样式。HOME图标同样按原图尺寸整数倍显示。生成器重建后继续使用这些共享样式和脚本，无需逐个修改数千篇生成页面。

在 Project-Azoth 仓库中更新人工编排或奖励数据后，运行 `python wiki/tools/generate_sidequests.py --refresh-source`，再运行 `python -m mkdocs build -f wiki/mkdocs.yml`。普通重建只读取 wiki 内的数据快照；`generate_pokemon.py` 结束时也会自动同步反查，避免图鉴重建后丢失。

反查按物种/道具 ID 关联，包含宝可梦携带物；互斥分支、任务交付物、购买与退款按原核对说明区分。Mega 波动关联普通与 Mega 形态，保持独立统计，不当作赠送宝可梦。教学关联招式 ID，费用与开放条件保留在条目中。本批数据未覆盖全游戏获取途径。

地点覆盖统计保存在 `data/sidequest_build.json`。导出器也追踪支线分发表跳转，未关联入口的分场保留“地点待核”。坐标从0开始，表示地图事件初始位置。任务导航字段单独列作参考；ROM区域名可能保留旧名，不能直接当作室内房间名称。

同步修订台本与地图，在完整Project-Azoth根目录依次执行：

```text
python -X utf8 tools/refresh_sidequest_scene_sources.py
python -X utf8 tools/build_mission_journals.py --book
python -X utf8 wiki/tools/generate_sidequests.py --refresh-review --snapshot-only
python -X utf8 tools/export_sidequest_locations.py
python -X utf8 wiki/tools/generate_sidequests.py
python -m mkdocs build -f wiki/mkdocs.yml
```

地图默认读取 `任务/BPRE0.gba` 和当前CFRU事件源码，也可用 `--rom` 指定匹配的ROM。独立Wiki构建仅需快照和PNG。修订Word下载文件位于 `docs/sidequests/downloads/`。

构建后可运行 `python wiki/tools/check_sidequests.py` 检查96项编号、对白完整性、条件奖励与新增链接。浏览器检查脚本为 `wiki/tools/check_sidequests_browser.cjs`，需要 Node.js、Playwright 和 Microsoft Edge；通过 `WIKI_PREVIEW_URL` 指定已启动的本地站点地址，默认端口8765。截图输出到 `tmp/wiki-sidequests-preview/`。
