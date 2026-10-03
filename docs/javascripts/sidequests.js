/* Material instant navigation replaces the document body between visits. */
(() => {
  "use strict";
  const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
  let dispose = () => {};
  function mount() {
    dispose();
    const root = document.querySelector("[data-sq-browser]");
    if (!root) return;
    const form = root.querySelector("form");
    const query = form.elements.q;
    const kind = form.elements.kind;
    const rows = [...root.querySelectorAll("[data-sq-entry]")].map(element => ({
      element, search: normalize(element.dataset.search), kinds: element.dataset.kind.split(" ")
    }));
    const count = root.querySelector("[data-sq-count]");
    const empty = root.querySelector("[data-sq-empty]");
    const unit = root.dataset.sqBrowser === "quests" ? "项任务" : "种获得内容";
    const validKinds = [...kind.options].map(option => option.value);
    function apply(save) {
      const tokens = normalize(query.value).split(/\s+/).filter(Boolean);
      let matched = 0;
      for (const row of rows) {
        const visible = (kind.value === "all" || row.kinds.includes(kind.value)) && tokens.every(token => row.search.includes(token));
        row.element.hidden = !visible;
        if (visible) matched += 1;
      }
      count.textContent = `显示 ${matched} / ${rows.length} ${unit}`;
      empty.hidden = matched !== 0;
      if (save) {
        const url = new URL(window.location.href);
        query.value.trim() ? url.searchParams.set("sq", query.value.trim()) : url.searchParams.delete("sq");
        kind.value !== "all" ? url.searchParams.set("reward", kind.value) : url.searchParams.delete("reward");
        history.replaceState(history.state, "", url);
      }
    }
    function restore() {
      const params = new URLSearchParams(window.location.search);
      query.value = params.get("sq") || "";
      kind.value = validKinds.includes(params.get("reward")) ? params.get("reward") : "all";
      apply(false);
    }
    const change = () => apply(true);
    const submit = event => { event.preventDefault(); apply(true); };
    query.addEventListener("input", change);
    kind.addEventListener("change", change);
    form.addEventListener("submit", submit);
    window.addEventListener("popstate", restore);
    dispose = () => {
      query.removeEventListener("input", change);
      kind.removeEventListener("change", change);
      form.removeEventListener("submit", submit);
      window.removeEventListener("popstate", restore);
    };
    restore();
  }
  if (typeof document$ !== "undefined") {
    document$.subscribe(mount);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
