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

导航中的“支线任务”位于首页后，收录任务001–096的目标、原文对白、分支奖励与依据。目录支持名称、编号、奖励关键词和类型筛选；奖励反查页与道具、宝可梦、招式详情页相互链接。Mega 波动、教学、服装和服务等解锁独立筛选，并保留条件。

- `data/sidequests.json`：已核对台本的独立数据快照，保留源文件校验值。
- `data/sidequest_unlocks.json`：非背包奖励补充，保留任务号、阶段、确认方式、证据符号及相关页面 ID。
- `data/sidequest_locations.json`：从脚本入口追踪分场对白的地图快照，含触发方式、坐标、依据与导航参考。
- `docs/sidequests/maps/`：Map_event_editor 原生渲染的126张地图及164张任务标记图；网页图片可点击放大。
- `tools/generate_sidequests.py`：生成 `docs/sidequests/` 并维护带标记的反查区块。
- `docs/stylesheets/sidequests.css`、`docs/javascripts/sidequests.js`：手机、深色模式与即时导航支持。

在 Project-Azoth 仓库中更新人工编排或奖励数据后，运行 `python wiki/tools/generate_sidequests.py --refresh-source`，再运行 `python -m mkdocs build -f wiki/mkdocs.yml`。普通重建只读取 wiki 内的数据快照；`generate_pokemon.py` 结束时也会自动同步反查，避免图鉴重建后丢失。

反查按物种/道具 ID 关联，包含宝可梦携带物；互斥分支、任务交付物、购买与退款按原核对说明区分。Mega 波动关联普通与 Mega 形态，保持独立统计，不当作赠送宝可梦。教学关联招式 ID，费用与开放条件保留在条目中。本批数据未覆盖全游戏获取途径。

地点覆盖821个分场中的753个，收录217个脚本入口；其余保留“地点待核”。坐标从0开始，表示地图事件初始位置。任务导航字段单独列作参考；ROM区域名可能保留旧名，不能直接当作室内房间名称。目录也支持按地图名和地图编号搜索。

地点刷新需在完整 Project-Azoth 工作区运行 `python tools/export_sidequest_locations.py`，读取核对快照、当前源码及匹配的ROM，再运行 Wiki 生成器。独立 Wiki 构建仅需已提交快照和PNG。Word地图版运行 `python tools/build_sidequest_scriptbook.py --locations`，输出到 `reports/sidequest_texts_20261003/Word台本_地图版/`。

构建后可运行 `python wiki/tools/check_sidequests.py` 检查96项编号、对白完整性、条件奖励与新增链接。浏览器检查脚本为 `wiki/tools/check_sidequests_browser.cjs`，需要 Node.js、Playwright 和 Microsoft Edge；通过 `WIKI_PREVIEW_URL` 指定已启动的本地站点地址，默认端口8765。截图输出到 `tmp/wiki-sidequests-preview/`。
