/* Pixel art uses native pixels or positive integer multiples at normal zoom. */
(() => {
  "use strict";
  let dispose = () => {};
  let viewer;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function size(image, scale) {
    if (!image.naturalWidth) return;
    scale = Math.max(1, Math.floor(scale));
    image.style.setProperty("width", `${image.naturalWidth * scale}px`, "important");
    image.style.setProperty("height", `${image.naturalHeight * scale}px`, "important");
    image.dataset.pixelScale = String(scale);
  }
  function openImage(source) {
    if (!viewer) {
      viewer = node("dialog", "pixel-viewer");
      viewer.setAttribute("aria-label", "像素图查看器");
      const bar = node("div", "pixel-viewer-bar");
      const title = node("span", "pixel-viewer-title");
      const body = node("div", "pixel-viewer-body");
      body.tabIndex = 0;
      body.setAttribute("aria-label", "图片区域，可横向或纵向滚动");
      const image = node("img", "pixel-image");
      body.append(image);
      bar.append(title);
      const buttons = [];
      const setScale = scale => {
        size(image, scale);
        buttons.forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.scale) === scale)));
      };
      for (const scale of [1, 2, 3, 4]) {
        const button = node("button", "", `${scale}×`);
        button.type = "button";
        button.dataset.scale = String(scale);
        button.setAttribute("aria-label", `${scale}倍原始尺寸`);
        button.addEventListener("click", () => setScale(scale));
        buttons.push(button);
        bar.append(button);
      }
      const close = node("button", "", "关闭 ×");
      close.type = "button";
      close.addEventListener("click", () => viewer.close());
      bar.append(close);
      image.addEventListener("load", () => setScale(1));
      viewer.append(bar, body, node("p", "pixel-viewer-help", "仅按整数倍显示。大图可横向、纵向滚动；按 Esc 关闭。"));
      viewer.addEventListener("click", event => { if (event.target === viewer) viewer.close(); });
      document.body.append(viewer);
      viewer.showImage = sourceImage => {
        title.textContent = sourceImage.alt || "地图与游戏图像";
        image.alt = sourceImage.alt || "游戏图像";
        image.src = sourceImage.currentSrc || sourceImage.src;
        if (!viewer.open) viewer.showModal();
        if (image.complete) setScale(1);
        body.scrollTo(0, 0);
      };
    }
    viewer.showImage(source);
  }
  function mount() {
    dispose();
    if (viewer?.open) viewer.close();
    const root = document.querySelector(".md-content, [data-pixel-document]");
    if (!root) return;
    const controller = new AbortController();
    const seen = new WeakSet();
    const worlds = new Set();
    const fitWorld = host => {
      const crop = host.querySelector(".loc-world-crop");
      const canvas = crop?.querySelector(".loc-world-canvas");
      const image = canvas?.querySelector("img");
      if (!image) return;
      const scale = Math.max(1, Math.min(3, Math.floor(host.clientWidth / 384)));
      crop.style.width = `${384 * scale}px`;
      crop.style.height = `${160 * scale}px`;
      canvas.style.width = `${512 * scale}px`;
      canvas.style.height = `${256 * scale}px`;
      canvas.style.left = `${-16 * scale}px`;
      image.style.setProperty("width", `${512 * scale}px`, "important");
      image.style.setProperty("height", `${256 * scale}px`, "important");
      image.dataset.pixelScale = String(scale);
    };
    const resize = new ResizeObserver(entries => entries.forEach(entry => fitWorld(entry.target)));
    function setupWorlds() {
      root.querySelectorAll(".loc-world-stage, .loc-world-preview").forEach(host => {
        if (worlds.has(host)) return;
        worlds.add(host);
        const canvas = host.querySelector(".loc-world-canvas");
        if (!canvas) return;
        if (!canvas.parentElement.classList.contains("loc-world-crop")) {
          const crop = node("span", "loc-world-crop");
          canvas.before(crop);
          crop.append(canvas);
        }
        host.tabIndex = 0;
        resize.observe(host);
        fitWorld(host);
      });
    }
    function prepare(image) {
      if (seen.has(image) || /\.svg(?:[?#]|$)/i.test(image.src)) return;
      seen.add(image);
      if (image.closest(".loc-world-canvas")) return;
      if (image.classList.contains("loc-place-thumb")) {
        image.title = "原尺寸局部预览；进入地点页查看完整地图";
        return; // object-fit:none crops a native-pixel preview without resampling.
      }
      image.classList.add("pixel-image");
      image.style.setProperty("width", "auto", "important");
      image.style.setProperty("height", "auto", "important");
      const loaded = () => {
        if (!image.naturalWidth) return;
        const target = image.matches(".pk-sprite, .dist-sprite, .detail-sprite") ? 128 :
          image.matches(".mon-icon") && window.innerWidth > 720 ? 64 : 0;
        const scale = Math.max(1, Math.floor(target / image.naturalWidth) || 1);
        size(image, scale);
        const profile = image.closest(".pk-head");
        if (profile) profile.dataset.spriteScale = String(scale);
        if (!image.naturalWidth || image.matches(".pk-sprite, .evo-sprite, .dist-sprite, .dist-icon, .pk-icon, .sq-icon, .mon-icon, .item-icon, .detail-sprite")) return;
        if (image.naturalWidth <= 96 && image.naturalHeight <= 96) return;
        let viewport = image.closest(".pixel-scroll");
        if (!viewport) {
          viewport = image.closest(".loc-image-link, .sq-map > a, .loc-stages figure > a");
          if (!viewport) {
            viewport = node("span", "pixel-scroll");
            image.before(viewport);
            viewport.append(image);
          }
          viewport.classList.add("pixel-scroll");
          viewport.tabIndex = 0;
          viewport.setAttribute("aria-label", "原尺寸图片，可滚动查看");
          const caption = node("span", "pixel-caption");
          caption.append(node("span", "", `原尺寸 ${image.naturalWidth} × ${image.naturalHeight} · 1×`));
          const enlarge = node("button", "", "放大查看");
          enlarge.type = "button";
          enlarge.addEventListener("click", () => openImage(image), { signal: controller.signal });
          caption.append(enlarge);
          viewport.after(caption);
        }
      };
      image.addEventListener("load", loaded, { signal: controller.signal });
      if (image.complete) loaded();
    }
    const scan = () => {
      setupWorlds();
      root.querySelectorAll("img").forEach(prepare);
    };
    scan();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; scan(); });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", event => {
      const link = event.target.closest("a");
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
      const image = link.querySelector("img");
      if (!image || !/\.(png|gif|webp|jpe?g)(?:[?#]|$)/i.test(link.href)) return;
      event.preventDefault();
      openImage(image);
    }, { signal: controller.signal });
    dispose = () => { controller.abort(); observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); };
  }
  if (typeof document$ !== "undefined") document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
