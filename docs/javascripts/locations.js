(() => {
  "use strict";
  let dispose = () => {};
  const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
  const category = map => {
    if (map.kind === "剧情地图") return "story";
    if ([1, 2].includes(map.type)) return "town";
    if ([8, 9].includes(map.type)) return "indoor";
    if (![3, 4, 5].includes(map.type)) return "other";
    return map.type === 3 && !/森林|树林|公园|湖|山|遗迹|洞|谷|岛|塔/.test(map.name) ? "route" : "nature";
  };
  const groupNames = { town: "城镇", route: "道路", nature: "洞窟与自然区域", indoor: "室内", story: "剧情地图", other: "其他地点" };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function mount() {
    dispose();
    const root = document.querySelector("[data-location-atlas]");
    if (!root) return;
    const controller = new AbortController();
    const form = root.querySelector("form");
    const query = form.elements.place;
    const kind = form.elements.kind;
    const list = root.querySelector("[data-atlas-list]");
    const title = root.querySelector("[data-atlas-title]");
    const count = root.querySelector("[data-atlas-count]");
    const error = root.querySelector("[data-atlas-error]");
    const directory = root.querySelector("[data-atlas-directory]");
    const overlay = root.querySelector("[data-atlas-regions]");
    const dataURL = new URL(root.dataset.atlasUrl, location.href);
    const siteURL = new URL("../", dataURL);
    let data, sec = null;
    const mapURL = id => new URL(`locations/map_${id.replace(".", "_")}/`, siteURL).href;
    const mapLink = (map, label) => {
      const link = element("a", "", label || map.label);
      link.href = mapURL(map.id);
      return link;
    };
    function save() {
      const url = new URL(location.href);
      sec !== null ? url.searchParams.set("sec", sec) : url.searchParams.delete("sec");
      query.value ? url.searchParams.set("q", query.value) : url.searchParams.delete("q");
      kind.value !== "all" ? url.searchParams.set("kind", kind.value) : url.searchParams.delete("kind");
      history.replaceState(history.state, "", url);
    }
    function render(persist = true) {
      if (!data) return;
      const tokens = normalize(query.value).split(/\s+/).filter(Boolean);
      const matches = Object.values(data.maps).filter(map =>
        (sec === null || map.sec === Number(sec)) && (kind.value === "all" || category(map) === kind.value) &&
        tokens.every(token => normalize(`${map.label} ${map.id} ${data.regions[map.sec].name}`).includes(token)));
      list.replaceChildren();
      for (const group of Object.keys(groupNames)) {
        const rows = matches.filter(map => category(map) === group).sort((a, b) =>
          Number(b.on_worldmap) - Number(a.on_worldmap) || Number(Boolean(b.quests.length)) - Number(Boolean(a.quests.length)) ||
          a.id.localeCompare(b.id, undefined, { numeric: true }));
        if (!rows.length) continue;
        const section = element("section", "loc-atlas-group");
        section.append(element("h2", "", groupNames[group]));
        for (const map of rows) {
          const row = element("div", "loc-place");
          const imageLink = mapLink(map, "");
          imageLink.textContent = "";
          imageLink.setAttribute("aria-label", map.label);
          const image = element("img", "loc-place-thumb");
          image.src = new URL(map.image, siteURL).href;
          image.alt = map.label;
          image.loading = "lazy";
          image.width = 96;
          image.height = 80;
          imageLink.append(image);
          row.append(imageLink);
          const body = element("div", "loc-place-body");
          const link = mapLink(map);
          link.className = "loc-place-title";
          body.append(link, element("div", "loc-place-meta", `${map.kind} · 地图 ${map.id} · ${map.width} × ${map.height} 格`));
          const links = element("div", "loc-place-links");
          const neighbors = [...new Set(map.connections.map(edge => edge.target).concat(map.passages.map(edge => edge.target)))];
          neighbors.forEach((id, index) => {
            if (index) links.append(document.createTextNode(" · "));
            links.append(mapLink(data.maps[id]));
          });
          if (map.passages.length) links.append(element("span", "", " · 含通道连接"));
          body.append(links);
          row.append(body);
          section.append(row);
        }
        list.append(section);
      }
      title.textContent = sec !== null ? data.regions[sec].name : "全部区域";
      count.textContent = `${matches.length} 处地点`;
      root.querySelector("[data-atlas-empty]").hidden = matches.length !== 0;
      root.querySelectorAll("[data-region]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.region === String(sec))));
      if (persist) save();
    }
    function restore() {
      const params = new URLSearchParams(location.search);
      sec = data?.regions[params.get("sec")] ? params.get("sec") : null;
      query.value = params.get("q") || "";
      kind.value = [...kind.options].some(option => option.value === params.get("kind")) ? params.get("kind") : "all";
      render(false);
    }
    function select(value) {
      sec = value === sec ? null : value;
      query.value = "";
      kind.value = "all";
      render();
    }
    const onInput = () => { if (query.value.trim()) sec = null; render(); };
    query.addEventListener("input", onInput);
    kind.addEventListener("change", () => render(), { signal: controller.signal });
    form.addEventListener("submit", event => { event.preventDefault(); render(); }, { signal: controller.signal });
    window.addEventListener("popstate", restore);
    async function load() {
      error.hidden = true;
      try {
        const response = await fetch(dataURL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Atlas HTTP ${response.status}`);
        data = await response.json();
        if (!root.isConnected) return;
        overlay.replaceChildren();
        directory.replaceChildren();
        const cfg = data.calibration;
        for (const cells of Object.values(data.grids)) for (const cell of cells) {
          const region = data.regions[cell.mapsec];
          if (!region) continue;
          const button = element("button", "loc-region-hit");
          button.type = "button";
          button.dataset.region = String(cell.mapsec);
          button.title = region.name;
          button.setAttribute("aria-label", region.name);
          button.style.left = `${cfg.x + cell.x * cfg.w / cfg.columns}%`;
          button.style.top = `${cfg.y + cell.y * cfg.h / cfg.rows}%`;
          button.style.width = `${cell.w * cfg.w / cfg.columns}%`;
          button.style.height = `${cell.h * cfg.h / cfg.rows}%`;
          button.addEventListener("click", () => select(String(cell.mapsec)), { signal: controller.signal });
          overlay.append(button);
        }
        const all = element("button", "", "全部区域");
        all.type = "button";
        all.addEventListener("click", () => { sec = null; render(); }, { signal: controller.signal });
        directory.append(all);
        for (const [id, region] of Object.entries(data.regions)) {
          if (!region.maps.length) continue;
          const button = element("button", "", `${region.name} · ${region.maps.length}`);
          button.type = "button";
          button.dataset.region = id;
          button.addEventListener("click", () => select(id), { signal: controller.signal });
          directory.append(button);
        }
        restore();
      } catch (exception) {
        if (exception.name === "AbortError") return;
        count.textContent = "载入失败";
        error.hidden = false;
      }
    }
    root.querySelector("[data-atlas-retry]").addEventListener("click", load, { signal: controller.signal });
    dispose = () => { controller.abort(); query.removeEventListener("input", onInput); window.removeEventListener("popstate", restore); };
    load();
  }
  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
