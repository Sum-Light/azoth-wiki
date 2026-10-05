(() => {
  "use strict";
  let dispose = () => {};
  const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
  function mount() {
    dispose();
    const root = document.querySelector("[data-pokedex]");
    if (!root) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const form = root.querySelector("form");
    const query = form.elements.pokemon;
    const type = form.elements.type;
    const buttons = [...root.querySelectorAll("[data-generation]")];
    const groups = [...root.querySelectorAll("[data-dex-group]")].map(node => ({
      node, id: node.dataset.dexGroup, rows: [...node.querySelectorAll("[data-dex-entry]")].map(row => ({
        node: row, search: normalize(row.dataset.search), types: row.dataset.types.split(" ")
      }))
    }));
    const count = root.querySelector("[data-dex-result]");
    const empty = root.querySelector("[data-dex-empty]");
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    let generation = "all";
    function render(save = true) {
      const tokens = normalize(query.value).split(/\s+/).filter(Boolean);
      let visible = 0;
      for (const group of groups) {
        let found = 0;
        for (const row of group.rows) {
          const show = (generation === "all" || generation === group.id) &&
            (!type.value || row.types.includes(type.value)) && tokens.every(token => row.search.includes(token));
          row.node.hidden = !show;
          if (show) found++;
        }
        group.node.hidden = found === 0;
        visible += found;
      }
      buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.generation === generation)));
      count.textContent = '显示 ' + visible + ' / ' + total + ' 个条目 · 图标按原尺寸显示';
      empty.hidden = visible !== 0;
      if (save) {
        const url = new URL(location.href);
        for (const [key, value] of [["q",query.value], ["type",type.value], ["gen",generation === "all" ? "" : generation]]) {
          value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
        }
        history.replaceState(history.state, "", url);
      }
    }
    function restore() {
      const params = new URLSearchParams(location.search);
      query.value = params.get("q") || "";
      type.value = [...type.options].some(option => option.value === params.get("type")) ? params.get("type") : "";
      generation = buttons.some(button => button.dataset.generation === params.get("gen")) ? params.get("gen") : "all";
      render(false);
    }
    query.addEventListener("input", () => render(), options);
    type.addEventListener("change", () => render(), options);
    form.addEventListener("submit", event => { event.preventDefault(); render(); }, options);
    form.addEventListener("reset", event => {
      event.preventDefault(); query.value = ""; type.value = ""; generation = "all"; render();
    }, options);
    buttons.forEach(button => button.addEventListener("click", () => { generation = button.dataset.generation; render(); }, options));
    window.addEventListener("popstate", restore, options);
    restore();
    dispose = () => controller.abort();
  }
  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once:true});
  else mount();
})();
