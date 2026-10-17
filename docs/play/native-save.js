/* Shared real-file bindings. Callers hold azoth-web-player-save during IO.
 * Handles live separately from the mGBA byte-only files database. */
(() => {
  "use strict";
  const DB = "azoth-native-saves-v1", STORE = "bindings";
  const supported = () => isSecureContext && !!window.showSaveFilePicker && !!window.showOpenFilePicker && !!navigator.locks;
  const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
  async function database(action) {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("请关闭其他水银页面后重试。"));
    });
    try { return await action(db); } finally { db.close(); }
  }
  function record(key, value) {
    return database(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, value === undefined ? "readonly" : "readwrite"), store = tx.objectStore(STORE);
      const r = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      tx.oncomplete = () => resolve(r.result || null);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("无法保存文件绑定。"));
    }));
  }
  async function permission(handle, ask = true) {
    if (!supported()) throw new Error("此浏览器不支持本地文件自动读写，请使用支持的浏览器或导入／导出 SAV。");
    const options = {mode: "readwrite"};
    if (await handle.queryPermission(options) === "granted") return;
    if (ask && await handle.requestPermission(options) === "granted") return;
    throw new Error("本地文件未授权，请点击按钮重新授权；存档尚未写入本地文件。");
  }
  async function read(handle) {
    const file = await handle.getFile();
    if (!/\.(sav|srm)$/i.test(file.name) || ![0, 131072, 131088].includes(file.size))
      throw new Error("请选择 128 KB 的 .sav / .srm（可含 RTC 信息），不要选择即时存档。");
    return new Uint8Array(await file.arrayBuffer());
  }
  async function write(handle, before, after) {
    await permission(handle, false);
    let actual = await read(handle);
    if (equal(actual, after)) return;
    if (!equal(actual, before)) throw new Error("本地存档已被其他程序修改，已停止写入。请导出当前进度备份，再重新打开游戏读取本地文件。");
    const stream = await handle.createWritable();
    try {
      // Recheck after acquiring the browser's writer. External applications do
      // not participate in our Web Lock; do not use the same file concurrently.
      actual = await read(handle);
      if (!equal(actual, before)) throw new Error("本地存档刚刚发生变化，已停止写入。");
      await stream.write(after); await stream.close();
    } catch (error) { try { await stream.abort(); } catch {} throw error; }
  }
  async function checkBinding(key, handle) {
    for (const other of ["azoth-tower-v3", "azoth-fc-v1"]) {
      const entry = other !== key && await record(other);
      if (entry && await handle.isSameEntry(entry.handle)) throw new Error("两个版本不能绑定同一份存档，请分别选择文件。");
    }
  }
  async function bind(key, handle) {
    await checkBinding(key, handle);
    await record(key, {handle});
  }
  function saveDB(action) {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("azoth-single-html-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("请关闭其他水银页面后重试。"));
      r.onsuccess = async () => { try { resolve(await action(r.result)); } catch (e) { reject(e); } finally { r.result.close(); } };
    });
  }
  function browser(key, bytes) {
    return saveDB(db => new Promise((resolve, reject) => {
      const tx = db.transaction("files", bytes === undefined ? "readonly" : "readwrite"), store = tx.objectStore("files");
      const r = bytes === undefined ? store.get(key) : store.put(bytes.slice(), key);
      tx.oncomplete = () => resolve(r.result); tx.onerror = tx.onabort = () => reject(tx.error);
    }));
  }
  async function assertReady() {
    if (await browser("azoth-home-pending-v1")) throw new Error("HOME 有未完成的保存，请先打开 HOME 完成恢复，再启动游戏或更换文件。");
  }
  window.AzothNativeSave = Object.freeze({supported, equal, permission, read, write, bind, checkBinding,
    get: key => record(key), forget: key => record(key, null), browser, assertReady});
})();
