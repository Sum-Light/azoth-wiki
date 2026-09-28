# 宝可梦水银 百科

基于 MkDocs Material 的资料站，图鉴数据由脚本直接从 ROM 提取。

## 本地预览

```
pip install -r requirements.txt   # 需要 Python 3.8+
python tools/generate_pokemon.py  # 从 ROM 生成 docs/pokemon/ 下的页面
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
