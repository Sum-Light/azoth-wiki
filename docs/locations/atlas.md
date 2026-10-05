---
title: 查看地图
hide:
  - toc
---

# 查看地图

已开放地图按地点收录，可搜索地点名称或地图编号。

<div class="loc-atlas" data-location-atlas data-atlas-url="../atlas_data.json">
  <form class="loc-atlas-toolbar" role="search">
    <label class="loc-search-label"><span>地点</span><input type="search" name="place" placeholder="搜索地点或地图编号" autocomplete="off"></label>
    <label><span>类型</span><select name="kind"><option value="all">全部地点</option><option value="town">城镇</option><option value="route">道路</option><option value="nature">洞窟与自然区域</option><option value="indoor">室内</option><option value="story">剧情地图</option><option value="other">其他地点</option></select></label>
    <a href="../worldmap.html">野生分布地图 &rarr;</a>
  </form>
  <div class="loc-atlas-layout">
    <div class="loc-atlas-world">
      <div class="loc-world-stage"><div class="loc-world-canvas"><img src="../worldmap.png" alt="宝可梦水银世界地图" width="512" height="256"><div data-atlas-regions></div></div></div>
      <div class="loc-region-caption"><strong data-atlas-title>世界地图</strong><span data-atlas-count aria-live="polite">正在载入地点</span></div>
    </div>
    <div class="loc-atlas-results"><div data-atlas-list></div><p data-atlas-empty hidden>没有找到对应地点。</p></div>
  </div>
  <nav class="loc-region-directory" aria-label="区域目录" data-atlas-directory></nav>
  <p class="loc-atlas-error" data-atlas-error hidden role="alert">地图数据暂时无法载入。<button type="button" data-atlas-retry>重新载入</button></p>
</div>

<noscript><p>可通过<a href="../">地点目录</a>查看各地点的地图、连接与野生分布。</p></noscript>
