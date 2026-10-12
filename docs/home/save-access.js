/* Local file access only: no save data or directory names leave this browser. */
(() => {
  'use strict';
  const SAVE_EXT = /\.(sav|sa1|fla|srm)$/i;
  const MAX_ENTRIES = 5000;
  let database;

  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('mercury-home-files-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他 HOME 页面后重试。'));
    });
    return database;
  }

  async function stored(key, value, remove = false) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', value === undefined && !remove ? 'readonly' : 'readwrite');
      const store = tx.objectStore('files');
      const request = remove ? store.delete(key) : value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error || request.error);
      tx.onabort = () => reject(tx.error || new Error('浏览器没有保存本地备份。'));
    });
  }

  function romStem(value) {
    return String(value).normalize('NFKC').trim().split(/[\\/]/).pop()
      .replace(/\.(sav|sa1|fla|srm)$/i, '').replace(/\.(gba|zip|7z)$/i, '').toLocaleLowerCase();
  }

  function matchRank(name, query) {
    if (!SAVE_EXT.test(name)) return -1;
    const stem = romStem(name), wanted = romStem(query);
    if (!wanted || stem === wanted) return 0;
    return stem.includes(wanted) ? 1 : -1;
  }

  async function permission(handle, mode) {
    const options = { mode };
    if (await handle.queryPermission(options) === 'granted') return true;
    return await handle.requestPermission(options) === 'granted';
  }

  function sameBytes(a, b) {
    const left = new Uint8Array(a), right = new Uint8Array(b);
    return left.length === right.length && left.every((value, i) => value === right[i]);
  }

  async function search(directory, selectedFiles, query, cancelled = () => false) {
    const result = { entries: [], visited: 0, skipped: 0, limited: false };
    async function add(file, path, handle) {
      const rank = matchRank(file.name, query);
      if (rank >= 0 && file.size === 128 * 1024) result.entries.push({ file, path, handle, rank });
    }
    async function walk(dir, prefix, depth) {
      if (depth > 12) { result.limited = true; return; }
      try {
        for await (const [name, entry] of dir.entries()) {
          if (cancelled()) return;
          if (++result.visited > MAX_ENTRIES) { result.limited = true; return; }
          const path = prefix + name;
          if (entry.kind === 'directory') await walk(entry, path + '/', depth + 1);
          else if (matchRank(name, query) >= 0) {
            try { await add(await entry.getFile(), path, entry); }
            catch (_) { result.skipped++; }
          }
          if (result.visited > MAX_ENTRIES) return;
        }
      } catch (_) { result.skipped++; }
    }
    if (directory) await walk(directory, directory.name + '/', 0);
    else {
      for (const file of selectedFiles) {
        if (cancelled()) break;
        if (++result.visited > MAX_ENTRIES) { result.limited = true; break; }
        await add(file, file.webkitRelativePath || file.name, null);
      }
    }
    result.entries.sort((a, b) => a.rank - b.rank || b.file.lastModified - a.file.lastModified || a.path.localeCompare(b.path));
    return result;
  }

  // A failed backup blocks overwrite. Keep the previous save and its HOME boxes together.
  async function overwrite(handle, original, output, backup) {
    let latest = await handle.getFile();
    if (!sameBytes(await latest.arrayBuffer(), original)) throw new Error('原存档已被模拟器或其他程序修改，已停止覆盖。请导出当前编辑副本，重新读取最新存档后再操作。');
    await stored('backup', { ...backup, bytes: original.slice(0), date: new Date().toISOString() });
    let stream;
    try {
      stream = await handle.createWritable();
      latest = await handle.getFile();
      if (!sameBytes(await latest.arrayBuffer(), original)) throw new Error('原存档在保存过程中发生变化，已停止覆盖。请先退出模拟器。');
      await stream.write(output);
      await stream.close();
      stream = null;
    } finally {
      if (stream) { try { await stream.abort(); } catch (_) {} }
    }
  }

  window.HomeFiles = { stored, romStem, matchRank, permission, sameBytes, search, overwrite };
})();
