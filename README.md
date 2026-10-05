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

## 支线任务

2026-10-05补齐小茜百货大楼开场与跨地图演出，并按callasm任务分发表衔接源码过场；33条漏收对白补入对应位置，20项任务的内容或编排更新。台本和Wiki共用有顺序的场景选编，姓名框标签只用于说话人。

导航中的“支线任务”已同步2026-10-05剧情补全版：96项、266个条件阶段（含6个可选阶段）、335页游戏见闻。见闻录正文中`,`、`.`改为`。`，`!`改为`！`，`?`改为`？`；顿号因游戏字库限制也排为句号。任务页包括阶段Flag／Var、修订说明、原文与补齐对白、地图和分支奖励；另有阶段总表、涉及地图目录、Word下载，以及地点页返回任务和具体场景的链接。

- `data/sidequests.json`：已核对台本的独立数据快照，保留源文件校验值。
- `data/sidequest_unlocks.json`：非背包奖励补充，保留任务号、阶段、确认方式、证据符号及相关页面 ID。
- `data/sidequest_locations.json`：从脚本入口追踪分场对白的地图快照，含触发方式、坐标、依据与导航参考。
- `docs/sidequests/maps/`：复用 Map_event_editor 绘制的地图、人物／宝可梦图像及事件标记，并叠加任务入口编号；动态地图按对应阶段分别导出，图片可点击放大。事件预览保留初始位置，不按存档 Flag 隐藏人物。
- `tools/generate_sidequests.py`：生成 `docs/sidequests/` 并维护带标记的反查区块。
- `docs/stylesheets/sidequests.css`、`docs/javascripts/sidequests.js`：手机、深色模式与即时导航支持。

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
