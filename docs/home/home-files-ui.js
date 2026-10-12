/* Loaded after HOME so the existing parser and editor are reused. */
let saveDirectory = null;
let selectedDirectoryFiles = [];
let directoryEpoch = 0;
let backupRecord = null;
const canPickDirectory = window.isSecureContext && typeof window.showDirectoryPicker === 'function';
const emulatorGuides = {
  other: '在模拟器设置中查看存档位置，选择实际存档文件夹或 ROM 所在文件夹。网页只搜索你选择的目录，不能扫描整部手机。',
  pizza: 'Pizza Boy 各版本的存储位置可能不同：先在模拟器设置中查看存档目录，或使用存档导出功能。若支持自定义存档目录，可选 Documents 下的共享文件夹，再在这里选同一目录。找不到目录时先导出游戏存档；编辑后使用模拟器的导入功能。',
  myboy: 'My Boy 旧版常见位置是内部存储 / MyBoy / save；新版请以模拟器设置显示的位置为准。如果实际存档在 Android/data 内，系统选择器通常不能授权访问。请使用模拟器的存档导出 / 导入功能，或它支持的自定义共享目录。',
  delta: '在 Delta 游戏列表长按游戏，进入 Manage Save File / 管理存档文件，选择 Export File / 导出文件。将导出的 SAV 读入 HOME；完成后导出 SAV，再回到同一菜单选择 Import File / 导入文件。不要选 Save State / 即时存档。Delta 内部文件名可能不是 ROM 名，搜索不到时清空 ROM 名或直接选择导出的文件。',
};

function updateFileStatus() {
  $('exportSavBtn').disabled = !currentSave || saveBusy;
  $('saveBtn').textContent = !currentSave ? '保存 HOME' : currentFileHandle ? '保存 HOME 并覆盖原 SAV' : '保存 HOME 并导出 SAV';
  $('fileStatus').textContent = !currentSave ? '尚未读取 SAV。' : '当前文件：' + currentSavePath + (currentFileHandle
    ? '。保存时申请写入权限并覆盖此文件；若这是导出副本，仍需导入模拟器。'
    : '。当前以副本读取，保存后需导入模拟器或手动替换原文件。');
}

function rememberPreferences() {
  try { localStorage.setItem('mercury-home-file-preferences', JSON.stringify({ emulator: $('emulator').value, rom: $('romName').value })); }
  catch (_) { /* Browsing still works without preference storage. */ }
}

function directoryKey() { return 'directory-' + $('emulator').value; }

function updateDirectoryStatus(message) {
  $('directoryStatus').textContent = message;
  $('searchSaves').disabled = !saveDirectory && !selectedDirectoryFiles.length;
  $('forgetDirectory').hidden = !saveDirectory && !selectedDirectoryFiles.length;
}

function resetSearch() {
  directoryEpoch++;
  $('saveResults').replaceChildren();
  $('searchStatus').textContent = '';
}

async function restoreDirectory() {
  resetSearch();
  const epoch = directoryEpoch;
  saveDirectory = null;
  selectedDirectoryFiles = [];
  $('emulatorGuide').textContent = emulatorGuides[$('emulator').value];
  $('emulatorHelp').open = false;
  updateDirectoryStatus('尚未选择存档目录，也可以直接点上方「选择或拖入 SAV」。');
  if (!canPickDirectory) return;
  try {
    const directory = await HomeFiles.stored(directoryKey());
    if (epoch !== directoryEpoch || !directory) return;
    saveDirectory = directory;
    updateDirectoryStatus('已记住目录：' + directory.name + '。点「搜索存档 / 重新授权」继续。');
  } catch (_) {
    if (epoch === directoryEpoch) updateDirectoryStatus('浏览器暂不能恢复目录；请重新选择，当前仍可读取文件。');
  }
}

async function chooseSaveDirectory() {
  if (!canPickDirectory) { $('directoryFiles').click(); return; }
  const key = directoryKey();
  const epoch = directoryEpoch;
  try {
    const options = { id: 'mercury-' + $('emulator').value, mode: 'read' };
    if (saveDirectory) options.startIn = saveDirectory;
    const directory = await window.showDirectoryPicker(options);
    if (epoch !== directoryEpoch) return;
    resetSearch();
    saveDirectory = directory;
    selectedDirectoryFiles = [];
    const selectedEpoch = directoryEpoch;
    updateDirectoryStatus('已选择目录：' + directory.name + '。仅在此目录及其子目录中搜索。');
    try { await HomeFiles.stored(key, directory); }
    catch (_) { if (selectedEpoch === directoryEpoch) updateDirectoryStatus('已选择：' + directory.name + '，但浏览器不能记住目录；本次仍可使用。'); }
    if (selectedEpoch === directoryEpoch) await searchSaves();
  } catch (err) {
    if (err.name !== 'AbortError') updateDirectoryStatus('目录授权未完成：' + err.message + '。可改用上方选择 SAV。');
  }
}

async function searchSaves() {
  resetSearch();
  const epoch = directoryEpoch;
  const directory = saveDirectory;
  const files = selectedDirectoryFiles;
  rememberPreferences();
  $('searchStatus').textContent = '正在搜索所选目录…';
  try {
    if (directory && !await HomeFiles.permission(directory, 'read')) {
      if (epoch === directoryEpoch) $('searchStatus').textContent = '未获得目录读取权限。请再次点搜索授权，或重新选择目录。';
      return;
    }
    const result = await HomeFiles.search(directory, files, $('romName').value, () => epoch !== directoryEpoch);
    if (epoch !== directoryEpoch) return;
    for (const entry of result.entries.slice(0, 100)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'save-result';
      const title = document.createElement('strong');
      title.textContent = entry.path;
      const info = document.createElement('small');
      info.textContent = '128 KiB · ' + new Date(entry.file.lastModified).toLocaleString() + (entry.handle ? ' · 可申请覆盖' : ' · 导入副本') + ' · 点击读取';
      button.append(title, info);
      button.onclick = async () => {
        try { await loadFile(entry.handle ? await entry.handle.getFile() : entry.file, entry.handle, entry.path); }
        catch (err) { $('summary').textContent = '读取失败：' + err.message + '。请重新搜索或授权目录。'; }
      };
      $('saveResults').append(button);
    }
    $('searchStatus').textContent = result.entries.length
      ? '找到 ' + result.entries.length + ' 份候选存档，请核对路径和修改时间后点击读取。' + (result.entries.length > 100 ? '仅显示前 100 份，请输入更完整的 ROM 名。' : '')
      : '没有找到匹配的 128 KiB 存档。试试缩短 / 清空 ROM 名，或选择模拟器导出的 SAV。';
    if (result.skipped) $('searchStatus').textContent += ' 有 ' + result.skipped + ' 个文件或目录无法读取。';
    if (result.limited) $('searchStatus').textContent += ' 目录过大或层级过深，搜索未完成；请改选更具体的存档文件夹。';
  } catch (err) {
    if (epoch === directoryEpoch) $('searchStatus').textContent = '搜索失败：' + err.message;
  }
}

async function refreshBackup() {
  try {
    backupRecord = await HomeFiles.stored('backup');
    $('saveBackup').hidden = !backupRecord;
    if (backupRecord) $('backupStatus').textContent = '最近一次覆盖前备份：' + backupRecord.name + ' · ' + new Date(backupRecord.date).toLocaleString() + '。仅保留最近一组，清除网站数据会丢失；恢复时请配套使用 SAV 与 HOME。';
  } catch (_) { /* Overwrite itself reports storage errors and stops. */ }
}

$('chooseDirectory').onclick = chooseSaveDirectory;
$('searchSaves').onclick = searchSaves;
$('romName').oninput = () => { rememberPreferences(); resetSearch(); };
$('romName').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); searchSaves(); } };
$('emulator').onchange = () => { rememberPreferences(); restoreDirectory(); };
$('forgetDirectory').onclick = async () => {
  const key = directoryKey();
  resetSearch();
  saveDirectory = null;
  selectedDirectoryFiles = [];
  updateDirectoryStatus('已忘记当前目录。浏览器权限可在网站设置中撤销；已读取的 SAV 仍保留。');
  try { await HomeFiles.stored(key, undefined, true); }
  catch (_) { updateDirectoryStatus('本次已断开目录，但浏览器未能删除记忆；可在网站设置中撤销目录权限。'); }
};
$('directoryFiles').onchange = (event) => {
  if (event.target.files.length) {
    resetSearch();
    saveDirectory = null;
    selectedDirectoryFiles = Array.from(event.target.files);
    updateDirectoryStatus('已读取所选目录的文件副本。本次可搜索，不能直接覆盖；下次需重新选择目录。');
    searchSaves();
  }
  event.target.value = '';
};
$('exportSavBtn').onclick = () => persistSave(true);
$('downloadSavBackup').onclick = () => {
  if (backupRecord) downloadBytes(new Uint8Array(backupRecord.bytes), backupRecord.name.replace(/(\.[^.]+)$/, '_before_home$1'));
};
$('downloadHomeBackup').onclick = () => {
  if (backupRecord) downloadBytes(new TextEncoder().encode(backupRecord.home), '水银HOME_覆盖前配套备份.json');
};

try {
  const preferences = JSON.parse(localStorage.getItem('mercury-home-file-preferences') || 'null');
  if (preferences && Object.prototype.hasOwnProperty.call(emulatorGuides, preferences.emulator)) {
    $('emulator').value = preferences.emulator;
    $('romName').value = typeof preferences.rom === 'string' ? preferences.rom : '';
  } else if (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) $('emulator').value = 'delta';
} catch (_) {}
$('accessSupport').textContent = canPickDirectory
  ? '当前浏览器支持目录授权。首次选择目录，之后可记住并搜索；保存时另行申请文件写入权限。Android/data 等系统限制目录不能通过授权解锁。'
  : '当前浏览器不能授权直接覆盖原文件。可选择 SAV，或尝试选择目录搜索副本（iOS 18.4+）；编辑后导出并导入模拟器。Android 用户可尝试新版 Chrome。';
if (!canPickDirectory) $('chooseDirectory').textContent = '选择目录搜索（只读）';
window.addEventListener('beforeunload', (event) => {
  if (unsavedChanges || saveBusy) { event.preventDefault(); event.returnValue = ''; }
});
updateFileStatus();
restoreDirectory();
refreshBackup();
