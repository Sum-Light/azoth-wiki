(() => {
  "use strict";
  const site = new URL("../", document.currentScript.src);
  const sections = {
    pokemon: "宝可梦图鉴", moves: "招式资料", abilities: "特性资料", items: "道具资料",
    locations: "地点与地图", sidequests: "支线任务", news: "公告", distribution: "配信",
    broadcast: "广播", events: "时间事件", home: "水银 HOME", savefix: "存档修复"
  };
  let dispose = () => {};
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function mount() {
    dispose();
    const article = document.querySelector("article.md-typeset");
    if (!article) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const section = location.pathname.slice(site.pathname.length).split("/")[0];
    const heading = article.querySelector("h1");
    if (heading && sections[section] && !article.querySelector(".wiki-path")) {
      const path = make("nav", "wiki-path");
      path.setAttribute("aria-label", "当前位置");
      const home = make("a", "", "百科首页");
      home.href = site.href;
      const parent = make("a", "", sections[section]);
      parent.href = new URL(`${section}/`, site).href;
      path.append(home, make("span", "", "/"), parent);
      heading.after(path);
      const chapters = [...article.querySelectorAll("h2[id]")].slice(0, 10);
      if (chapters.length >= 2) {
        const quick = make("nav", "wiki-section-links");
        quick.setAttribute("aria-label", "条目章节");
        for (const chapter of chapters) {
          const link = make("a", "", chapter.textContent.replace(/¶$/, "").trim());
          link.href = `#${chapter.id}`;
          quick.append(link);
        }
        path.after(quick);
      }
    }
    const profile = article.querySelector(".pk-head");
    if (profile && heading) profile.dataset.pokemonTitle = heading.textContent.replace(/¶$/, "").trim();
    article.querySelectorAll("table").forEach(table => {
      if (table.dataset.readableTable || !table.tBodies.length || table.tBodies[0].rows.length < 16) return;
      table.dataset.readableTable = "true";
      const body = table.tBodies[0];
      const rows = [...body.rows].map((row, index) => ({ row, index, search: row.textContent.normalize("NFKC").toLocaleLowerCase() }));
      let wrap = table.closest(".md-typeset__scrollwrap, .loc-table-scroll");
      if (!wrap) {
        wrap = make("div", "md-typeset__scrollwrap");
        table.before(wrap);
        wrap.append(table);
      }
      wrap.classList.add("wiki-table-scroll");
      wrap.tabIndex = 0;
      wrap.setAttribute("aria-label", "可滚动资料表格");
      const tools = make("div", "wiki-table-tools");
      const label = make("label", "", "表内查找");
      const input = make("input");
      input.type = "search";
      input.placeholder = "输入名称、编号或关键词";
      input.setAttribute("aria-label", "筛选当前表格");
      const count = make("output", "", `${rows.length} 条`);
      count.setAttribute("aria-live", "polite");
      label.append(input);
      tools.append(label, count);
      wrap.before(tools);
      const empty = make("p", "wiki-table-empty", "没有匹配的条目，清空关键词可查看全部内容。");
      empty.hidden = true;
      wrap.after(empty);
      input.addEventListener("input", () => {
        const tokens = input.value.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        let visible = 0;
        for (const entry of rows) {
          entry.row.hidden = !tokens.every(token => entry.search.includes(token));
          if (!entry.row.hidden) visible++;
        }
        count.textContent = `${visible} / ${rows.length} 条`;
        empty.hidden = visible !== 0;
        wrap.scrollTop = 0;
      }, options);
      const headers = [...(table.tHead?.rows[0]?.cells || [])];
      headers.forEach((header, column) => {
        if (!header.textContent.trim() || header.colSpan > 1 || rows.some(entry => entry.row.cells.length !== headers.length)) return;
        const button = make("button", "wiki-sort", header.textContent.trim());
        button.type = "button";
        button.setAttribute("aria-label", `按${header.textContent.trim()}排序`);
        header.replaceChildren(button);
        header.setAttribute("aria-sort", "none");
        button.addEventListener("click", () => {
          const ascending = header.getAttribute("aria-sort") !== "ascending";
          headers.forEach(th => th.setAttribute("aria-sort", "none"));
          header.setAttribute("aria-sort", ascending ? "ascending" : "descending");
          const sorted = rows.slice().sort((a, b) => {
            const left = a.row.cells[column].textContent.trim();
            const right = b.row.cells[column].textContent.trim();
            const difference = left.localeCompare(right, "zh-CN", { numeric: true });
            return (ascending ? difference : -difference) || a.index - b.index;
          });
          body.append(...sorted.map(entry => entry.row));
          wrap.scrollTop = 0;
        }, options);
      });
    });
    dispose = () => controller.abort();
  }
  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
