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

导航中的“支线任务”位于首页后，收录任务001–096的目标、原文对白、分支奖励与指令依据。目录支持名称、编号、奖励关键词和类型筛选；奖励反查页与道具、宝可梦详情页相互链接。

- `data/sidequests.json`：已核对台本的独立数据快照，保留源文件校验值。
- `tools/generate_sidequests.py`：生成 `docs/sidequests/` 并维护带标记的反查区块。
- `docs/stylesheets/sidequests.css`、`docs/javascripts/sidequests.js`：手机、深色模式与即时导航支持。

在 Project-Azoth 仓库中更新人工编排或奖励数据后，运行 `python wiki/tools/generate_sidequests.py --refresh-source`，再运行 `python -m mkdocs build -f wiki/mkdocs.yml`。普通重建只读取 wiki 内的数据快照；`generate_pokemon.py` 结束时也会自动同步反查，避免图鉴重建后丢失。

反查按物种/道具 ID 关联，包含宝可梦携带物；互斥分支、任务交付物、购买与退款按原核对说明区分。本批数据未覆盖全游戏获取途径。

构建后可运行 `python wiki/tools/check_sidequests.py` 检查96项编号、对白完整性、条件奖励与新增链接。浏览器检查脚本为 `wiki/tools/check_sidequests_browser.cjs`，需要 Node.js、Playwright 和 Microsoft Edge；通过 `WIKI_PREVIEW_URL` 指定已启动的本地站点地址，默认端口8765。截图输出到 `tmp/wiki-sidequests-preview/`。
