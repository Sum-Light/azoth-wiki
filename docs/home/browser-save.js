// Shared with the pinned online player's standalone-core.mjs / app.mjs.
// Metadata keys deliberately stay outside /data/: the player never flushes them.
(() => {
  "use strict";
  const DB = "azoth-single-html-v1", STORE = "files";
  const profiles = Object.freeze({
    tower: Object.freeze({key: "/data/saves/azoth-tower-v3.sav", format: "decomp", label: "对战塔 3.0"}),
    fc: Object.freeze({key: "/data/saves/azoth-fc-v1.sav", format: "fc", label: "FC 1.33"})
  });
  function profileKey(profile) {
    if (!Object.hasOwn(profiles, profile)) throw new Error("未知游戏版本。");
    return profiles[profile].key;
  }
  const JOURNAL = "azoth-home-pending-v1", BACKUP = "azoth-home-backup-v1";
  const LOCK = "azoth-web-player-save";
  const encode = value => new TextEncoder().encode(JSON.stringify(value));
  const decode = value => value ? JSON.parse(new TextDecoder().decode(value)) : null;
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const supported = () => location.protocol !== "file:" && !!navigator.locks && !!window.indexedDB;
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("请关闭其他游戏或 HOME 页面后重试。"));
    });
  }
  async function usingDB(action) {
    const db = await open();
    try { return await action(db); } finally { db.close(); }
  }
  function read(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly"), req = tx.objectStore(STORE).get(key);
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("读取浏览器存档失败。"));
    });
  }
  function locked(action) {
    if (!supported()) return Promise.reject(new Error("请在同一浏览器的在线百科打开 HOME；此浏览器不支持时请使用 SAV 文件。"));
    return navigator.locks.request(LOCK, {ifAvailable: true}, lock => {
      if (!lock) throw new Error("请先在游戏内保存，并关闭直接游玩页面及其他正在保存的 HOME 页面。" );
      return usingDB(action);
    });
  }
  const native = () => {
    if (!window.AzothNativeSave) throw new Error("存档组件未加载，请刷新页面后重试。");
    return window.AzothNativeSave;
  };
  const nativeKey = profile => profileKey(profile).split("/").pop().replace(/\.sav$/, "");
  async function binding(profile, ask = true) {
    const entry = await native().get(nativeKey(profile));
    if (entry) await native().permission(entry.handle, ask);
    return entry;
  }
  async function finish(db, homeKey, ask = false) {
    const journal = decode(await read(db, JOURNAL));
    if (!journal) return;
    if (journal.homeKey !== homeKey) throw new Error("发现其他版本的恢复记录，请保留网站数据并联系维护者。" );
    const current = localStorage.getItem(homeKey);
    if (current !== journal.before && current !== journal.after) throw new Error("HOME 已在另一页面更改，请保留网站数据并联系维护者。" );
    if (journal.nativeKey) {
      const entry = await native().get(journal.nativeKey);
      if (!entry) throw new Error("本地文件绑定丢失，请保留网站数据并联系维护者。");
      await native().permission(entry.handle, ask);
      const after = new Uint8Array(await read(db, journal.saveKey));
      await native().write(entry.handle, new Uint8Array(journal.fileBefore), after);
    }
    const latest = localStorage.getItem(homeKey);
    if (latest !== journal.before && latest !== journal.after) throw new Error("HOME 在保存期间发生变化，请保留网站数据并联系维护者。");
    localStorage.setItem(homeKey, journal.after);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(JOURNAL);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("恢复记录清理失败。"));
    });
  }
  async function recover(homeKey, ask = false) {
    if (!supported()) return;
    // A running player may hold the lock; normal HOME file use still works if
    // there is no interrupted browser commit to recover.
    const pending = await usingDB(db => read(db, JOURNAL));
    if (pending) await locked(db => finish(db, homeKey, ask));
  }
  async function load(homeKey, profile = "tower") {
    const saveKey = profileKey(profile);
    return locked(async db => {
      await finish(db, homeKey, true);
      const entry = await binding(profile);
      const value = entry ? await native().read(entry.handle) : await read(db, saveKey);
      if (entry) await native().browser(saveKey, value);
      if (!value || !value.byteLength) throw new Error("没有网页存档。请先在直接游玩中使用游戏内保存，再关闭游戏页面。" );
      return {bytes: new Uint8Array(value).slice(), home: localStorage.getItem(homeKey), local: !!entry, name: entry?.handle.name};
    });
  }
  async function save(before, after, homeKey, homeBefore, homeAfter, profile = "tower") {
    const saveKey = profileKey(profile);
    return locked(async db => {
      if (await read(db, JOURNAL)) throw new Error("有尚未完成的保存，请刷新 HOME 恢复后再操作。" );
      const entry = await binding(profile);
      if (entry && !equal(await native().read(entry.handle), before)) throw new Error("本地文件已更新，请重新读取后再传送。");
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
        let failure;
        const req = store.get(saveKey);
        req.onsuccess = () => {
          try {
            if (!equal(new Uint8Array(req.result || 0), before)) throw new Error("网页存档已更新，请刷新 HOME 并重新读取后再传送。" );
            if (localStorage.getItem(homeKey) !== homeBefore) throw new Error("HOME 已在其他页面更新，请刷新并重新读取后再传送。" );
            store.put(before.slice(), BACKUP + "-" + profile);
            store.put(encode({homeKey, saveKey, before: homeBefore, after: homeAfter, ...(entry ? {nativeKey: nativeKey(profile), fileBefore: Array.from(before)} : {})}), JOURNAL);
            store.put(after.slice(), saveKey);
          } catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("浏览器存储空间不足或保存失败。"));
      });
      // SAV + recovery journal commit atomically. localStorage is a separate
      // store; preserve the journal and block editing until recovery if it fails.
      try { await finish(db, homeKey); return {pending: false}; }
      catch (error) { return {pending: true, error}; }
    });
  }
  window.AzothBrowserSave = Object.freeze({supported, recover, load, save, profiles});
})();
