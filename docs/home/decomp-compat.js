/* Project Azoth BAG16 / PC18 bridge. HOME remains the original FC 58-byte format. */
(function (global) {
  "use strict";
  const meta = global.AZOTH_HOME_DECOMP_DATA;
  if (!meta || meta.schema !== 1) throw new Error("新版对战塔转换数据未加载，请刷新页面。");
  const SIGNATURE = 0x41313601, SECTOR = 4096, PAYLOAD = 3968;
  const sizes = [meta.layout.sb2, PAYLOAD, PAYLOAD, PAYLOAD, meta.layout.sb1 - 3 * PAYLOAD,
    ...Array(8).fill(PAYLOAD), meta.layout.pc - 8 * PAYLOAD];
  const reverse = {};
  for (const [kind, table] of Object.entries(meta.forward)) {
    reverse[kind] = {};
    // Reviewed many-to-one aliases use the first legacy ID as canonical.
    for (const [old, current] of Object.entries(table)) {
      if (reverse[kind][current] === undefined) reverse[kind][current] = Number(old);
    }
  }
  const ballReverse = Object.fromEntries(meta.balls.map((id, i) => [id, i]));
  const stats = ["hp", "atk", "def", "spe", "spa", "spd"];
  const fields = [
    ["personality", 32], ["otId", 32],
    ...Array.from({length: 12}, (_, i) => ["nick" + i, 8]),
    ...Array.from({length: 7}, (_, i) => ["ot" + i, 8]),
    ...stats.map(s => ["ev_" + s, 8]),
    ["ppBonuses", 8], ["friendship", 8], ["pokerus", 8], ["metLocation", 8],
    ["language", 3], ["natureModifier", 5], ["badEgg", 1], ["hasSpecies", 1],
    ["isEggHeader", 1], ["daysSinceFormChange", 3], ["markings", 4], ["shinyModifier", 1],
    ["species", 11], ["teraType", 5], ["heldItem", 10], ["exp", 21], ["ball", 6],
    ...Array.from({length: 4}, (_, i) => ["move" + i, 11]),
    ["evolutionTracker1", 5], ["evolutionTracker2", 5],
    ...stats.map(s => ["hyper_" + s, 1]),
    ["metLevel", 7], ["metGame", 4], ["dynamaxLevel", 4], ["otGender", 1],
    ...stats.map(s => ["iv_" + s, 5]),
    ["isEgg", 1], ["gigantamax", 1], ["shadow", 1], ["abilityNum", 2],
    ["fateful", 1], ["glamour", 8]
  ];
  let home, parseHome;
  function configure(data, parser) { home = data; parseHome = parser; }
  function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function bytes(raw, length) {
    if (!raw || raw.length !== length || !Array.from(raw).every(n => Number.isInteger(n) && n >= 0 && n <= 255))
      throw new Error("宝可梦原始数据长度或内容无效，操作已取消。");
    return Uint8Array.from(raw);
  }
  function readRecord(raw) {
    raw = bytes(raw, 61);
    let cursor = 0;
    const result = {};
    for (const [name, width] of fields) {
      let value = 0;
      for (let i = 0; i < width; i++, cursor++) value += ((raw[cursor >> 3] >> (cursor & 7)) & 1) * 2 ** i;
      result[name] = value;
    }
    return result;
  }
  function writeRecord(record) {
    const raw = new Uint8Array(61);
    let cursor = 0;
    for (const [name, width] of fields) {
      const value = record[name] ?? 0;
      if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) throw new Error("新版对战塔字段越界：" + name);
      for (let i = 0; i < width; i++, cursor++) raw[cursor >> 3] |= (Math.floor(value / 2 ** i) & 1) << (cursor & 7);
    }
    return raw;
  }
  function shinyValue(pid, ot) { return ((pid & 65535) ^ (pid >>> 16) ^ (ot & 65535) ^ (ot >>> 16)) >>> 0; }
  function gender(pid, ratio) {
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 255) throw new Error("缺少性别比例数据，请刷新页面后重试。");
    return ratio === 255 ? 2 : ratio === 254 ? 1 : Number((pid & 255) < ratio);
  }
  function unownLetter(pid) {
    return (((pid & 0x03000000) >>> 18) | ((pid & 0x00030000) >>> 12) |
      ((pid & 0x00000300) >>> 6) | (pid & 3)) % 28;
  }
  function compatiblePersonality(r, species) {
    const current = meta.species[r.species], old = home.species[species], original = r.personality;
    const nature = original % 25, sex = gender(original, current.genderRatio), oldSex = gender(original, old.genderRatio);
    const shiny = Boolean((shinyValue(original, r.otId) < meta.layout.shinyOdds) ^ r.shinyModifier);
    // Slots follow the reviewed species/ability import policy, not numeric ability IDs or translated names.
    if (!current.abilities[r.abilityNum] || (r.abilityNum === 2 && !old.hiddenAbility) ||
        (r.abilityNum !== 2 && !old.abilities[r.abilityNum]))
      throw new Error("此个体的特性槽在旧版 HOME 中不存在，无法传送。");
    const macro = old.macro || "", isUnown = /^SPECIES_UNOWN(?:_|$)/.test(macro);
    const isMinior = /^SPECIES_MINIOR(?:_|$)/.test(macro);
    const isRareEvolution = /^SPECIES_(?:DUNSPARCE|DUDUNSPARCE|TANDEMAUS|MAUSHOLD)(?:_|$)/.test(macro);
    const lowFits = pid => gender(pid, current.genderRatio) === sex && gender(pid, old.genderRatio) === oldSex &&
      (r.abilityNum === 2 || ((old.abilities[1] ? pid & 1 : 0) === r.abilityNum &&
       (current.abilities[1] ? pid & 1 : 0) === r.abilityNum));
    const fits = pid => lowFits(pid) && pid % 25 === nature && (shinyValue(pid, r.otId) < 16) === shiny &&
      (!isUnown || unownLetter(pid) === unownLetter(original)) &&
      (!isMinior || pid % 7 === original % 7) &&
      (macro !== "SPECIES_WURMPLE" || ((pid >>> 16) % 10 < 5) === ((original >>> 16) % 10 < 5)) &&
      (!isRareEvolution || (pid % 100 === 0) === (original % 100 === 0));
    if (fits(original)) return original;
    if (macro === "SPECIES_SPINDA") throw new Error("此晃晃斑需要调整 PID，但会改变斑纹，无法传送。");
    if (!Array.from({length: 256}, (_, low) => low).some(lowFits))
      throw new Error("此个体的性别与特性槽无法同时保留到旧版 HOME，无法传送。");
    if (shiny) {
      // Complete, bounded shiny search: each low half and all 16 FC shiny XOR values.
      const trainerXor = (r.otId & 65535) ^ (r.otId >>> 16);
      for (let step = 0; step < 65536; step++) {
        const low = ((original & 65535) + step) & 65535;
        if (!lowFits(low)) continue;
        for (let xor = 0; xor < 16; xor++) {
          const candidate = ((trainerXor ^ low ^ xor) * 65536 + low) >>> 0;
          if (fits(candidate)) return candidate;
        }
      }
    } else {
      // Nature-preserving nearby candidates; no RNG and no unsigned-wrap nature changes.
      for (let step = 1; step <= 65536; step++) {
        for (const candidate of [original + step * 25, original - step * 25])
          if (candidate >= 0 && candidate <= 0xffffffff && fits(candidate)) return candidate;
      }
    }
    throw new Error("未找到能同时保留性格、性别、闪光、特性和特殊形态／进化分支的 PID，无法传送。");
  }
  const tokenCache = new WeakMap();
  function tokens(charmap) {
    if (tokenCache.has(charmap)) return tokenCache.get(charmap);
    const result = Object.entries(charmap).filter(([k]) => /^(?:[0-9a-f]{2})+$/i.test(k))
      .map(([k, value]) => ({raw: k.match(/../g).map(n => parseInt(n, 16)), value}))
      .sort((a, b) => b.raw.length - a.raw.length);
    tokenCache.set(charmap, result);
    return result;
  }
  function decode(raw, map) {
    const entries = tokens(map);
    let out = "";
    for (let i = 0; i < raw.length && raw[i] !== 255;) {
      const entry = entries.find(e => i + e.raw.length <= raw.length && e.raw.every((n, j) => raw[i+j] === n));
      if (!entry) throw new Error("姓名含目标版本无法识别的字符，操作已取消。");
      out += entry.value; i += entry.raw.length;
    }
    return out;
  }
  function encode(text, map, capacity, label) {
    const entries = tokens(map).filter(e => e.value && e.raw[0] !== 255);
    const result = [];
    for (let i = 0; i < text.length;) {
      const matches = entries.filter(e => text.startsWith(e.value, i)).sort((a, b) => b.value.length - a.value.length || a.raw.length - b.raw.length);
      if (!matches.length) throw new Error(label + "含目标版本无法表示的字符，操作已取消。");
      result.push(...matches[0].raw); i += matches[0].value.length;
    }
    if (result.length > capacity) throw new Error(label + "超出目标版本的长度限制，操作已取消。");
    const out = new Uint8Array(capacity).fill(255); out.set(result); return out;
  }
  function mapped(kind, id, toCurrent) {
    const value = (toCurrent ? meta.forward : reverse)[kind][id];
    if (value === undefined || (id !== 0 && value === 0)) {
      const label = {species: "宝可梦／形态", items: "携带道具", moves: "招式"}[kind];
      const name = toCurrent ? (kind==="species" ? home.species[id]?.name : home[kind][id])
        : (kind==="species" ? meta.species[id]?.name : meta.names[kind][id]);
      throw new Error(label + (name ? "「"+name+"」" : "") + " #" + id + (toCurrent ? "没有新版对战塔映射" : "在旧版 HOME 中不存在") + "，无法传送。");
    }
    return value;
  }
  function recordError(r) {
    if (r.badEgg || !r.hasSpecies || r.isEgg !== r.isEggHeader || !r.species || !meta.species[r.species] ||
        r.heldItem >= meta.layout.itemsCount || r.abilityNum > 2 || r.teraType >= 21 || r.ball >= 28 ||
        ((r.personality % 25) ^ r.natureModifier) >= 25 || [0,1,2,3].some(i => r["move"+i] >= meta.layout.movesCount))
      return "个体数据异常或为坏蛋，保留原槽位，禁止传送。";
    return "";
  }
  function parseCurrent(raw) {
    raw = bytes(raw, 61);
    if (raw.every(b => b === 0)) return null;
    const r = readRecord(raw), data = meta.species[r.species];
    let nickname = "", error = recordError(r);
    try { nickname = decode(Array.from({length: 12}, (_, i) => r["nick"+i]), meta.chars); }
    catch (e) { error = error || e.message; }
    const table = meta.experienceTables[data?.growthRate ?? 0];
    let level = 1;
    if (table) for (let i = 1; i < table.length && r.exp >= table[i]; i++) level = i;
    return {format: "decomp", raw: Array.from(raw), personality: r.personality, otId: r.otId,
      species: r.species, heldItem: r.heldItem, exp: r.exp, friendship: r.friendship, nickname, level,
      moves: [r.move0,r.move1,r.move2,r.move3].filter(Boolean),
      ivs: Object.fromEntries(stats.map(s => [s,r["iv_"+s]])), evs: Object.fromEntries(stats.map(s => [s,r["ev_"+s]])),
      shiny: Boolean((shinyValue(r.personality,r.otId) < meta.layout.shinyOdds) ^ r.shinyModifier),
      invalidReason: error};
  }
  function toCurrent(mon) {
    if (!mon) return null;
    if (mon.format === "decomp") return parseCurrent(bytes(mon.raw,61));
    const raw = bytes(mon.raw,58), dv = view(raw), r = {};
    if ((raw[19] & 1) || !dv.getUint16(28,true)) throw new Error("坏蛋或空个体不能传送。");
    r.personality = dv.getUint32(0,true); r.otId = dv.getUint32(4,true);
    r.species = mapped("species",dv.getUint16(28,true),true);
    if (!meta.species[r.species]) throw new Error("新版对战塔没有启用这个物种。");
    r.heldItem = mapped("items",dv.getUint16(30,true),true);
    let packed = 0n;
    for (let i=0;i<5;i++) packed |= BigInt(raw[39+i]) << BigInt(i*8);
    for (let i=0;i<4;i++) r["move"+i] = mapped("moves",Number((packed >> BigInt(i*10)) & 1023n),true);
    const ivs = dv.getUint32(54,true), met = dv.getUint16(52,true);
    const eggName = Boolean(ivs & 0x40000000) && raw[8]===0x60 && raw[9]===0x6f && raw[10]===0x8b && raw[11]===255;
    const nick = encode(eggName ? "蛋" : decode(raw.slice(8,18),home.charmap),meta.chars,12,"昵称");
    const ot = encode(decode(raw.slice(20,27),home.charmap),meta.chars,7,"训练家姓名");
    nick.forEach((n,i) => r["nick"+i]=n); ot.forEach((n,i) => r["ot"+i]=n);
    r.language = raw[18] <= 7 ? raw[18] : 2;
    r.exp = dv.getUint32(32,true); r.ppBonuses=raw[36]; r.friendship=raw[37]; r.ball=meta.balls[raw[38]];
    if (r.ball===undefined) throw new Error("精灵球类型无法转换。");
    r.hasSpecies=1; r.isEgg=r.isEggHeader=(ivs>>>30)&1; r.markings=raw[27]&15;
    r.shinyModifier=Number((shinyValue(r.personality,r.otId)<16)!==(shinyValue(r.personality,r.otId)<meta.layout.shinyOdds));
    r.abilityNum=ivs>>>31 ? 2 : (meta.species[r.species].abilities[1] ? r.personality&1 : 0);
    stats.forEach((s,i) => {r["ev_"+s]=raw[44+i];r["iv_"+s]=(ivs>>>(i*5))&31;});
    r.pokerus=raw[50]; r.metLocation=raw[51]>=0x58 && raw[51]<=0xc4 ? raw[51]-0x58 : raw[51]>=0xfd ? raw[51] : meta.layout.mapsecNone;
    r.metLevel=met&127; r.metGame=(met>>>7)&15; r.otGender=met>>>15; r.gigantamax=(met>>>11)&1;
    const tera=raw[19]>>>3;
    if (tera>=1 && tera<=18 && tera!==10) r.teraType=tera;
    else if (tera===24 || tera===25) r.teraType=tera===24?19:20;
    else if (tera===0) r.teraType=meta.species[r.species].types[r.personality&1];
    else throw new Error("此太晶设置无法转换到新版对战塔。");
    const result=parseCurrent(writeRecord(r));
    if (result.invalidReason) throw new Error(result.invalidReason);
    // Session-only provenance preserves reviewed duplicate IDs on an immediate return.
    result.homeOrigin=Array.from(raw);
    return result;
  }
  function toHome(mon, notices = []) {
    if (!mon) return null;
    if (mon.format!=="decomp") {
      const result=parseHome(bytes(mon.raw,58));
      if (!result || !home.species[result.species]) throw new Error("HOME 中不存在这个物种。");
      if (result.species!==mon.species) throw new Error("HOME 物种与原始数据不一致，操作已取消。");
      return result;
    }
    const r=readRecord(mon.raw), invalid=recordError(r);
    if (invalid) throw new Error(invalid);
    const origin=mon.homeOrigin ? bytes(mon.homeOrigin,58) : null;
    function oldId(kind,id,offset) {
      const previous=origin && view(origin).getUint16(offset,true);
      return previous!==null && meta.forward[kind][previous]===id ? previous : mapped(kind,id,false);
    }
    const species=oldId("species",r.species,28), item=oldId("items",r.heldItem,30);
    const moves=[0,1,2,3].map(i=>mapped("moves",r["move"+i],false));
    const unsupported=["natureModifier","daysSinceFormChange","evolutionTracker1","evolutionTracker2","dynamaxLevel","shadow","fateful","glamour",...stats.map(s=>"hyper_"+s)];
    if (unsupported.some(k=>r[k])) throw new Error("此个体含旧版 HOME 无法保存的薄荷／训练／其他个体状态，无法无损传送。");
    const personality=compatiblePersonality(r,species);
    const ball=ballReverse[r.ball===0 ? 1 : r.ball]; // BALL_STRANGE -> BALL_POKE; legacy ID comes from the mapping.
    if (ball===undefined) throw new Error("此精灵球在旧版 HOME 中不存在，无法传送。");
    const raw=new Uint8Array(58), dv=view(raw);
    dv.setUint32(0,personality,true);dv.setUint32(4,r.otId,true);
    raw.set(encode(decode(Array.from({length:12},(_,i)=>r["nick"+i]),meta.chars),home.charmap,10,"昵称"),8);
    raw.set(encode(decode(Array.from({length:7},(_,i)=>r["ot"+i]),meta.chars),home.charmap,7,"训练家姓名"),20);
    raw[18]=r.language;
    const tera=r.teraType===0 ? meta.species[r.species].types[r.personality&1] : r.teraType;
    if (tera===10) throw new Error("此太晶属性在旧版 HOME 中不可表示。");
    raw[19]=2|(r.isEgg<<2)|((tera===19?24:tera===20?25:tera)<<3);raw[27]=r.markings;
    dv.setUint16(28,species,true);dv.setUint16(30,item,true);dv.setUint32(32,r.exp,true);
    raw[36]=r.ppBonuses;raw[37]=r.friendship;raw[38]=ball;
    let packed=0n;moves.forEach((id,i)=>packed|=BigInt(id)<<BigInt(i*10));
    for(let i=0;i<5;i++)raw[39+i]=Number((packed>>BigInt(i*8))&255n);
    let ivs=0;stats.forEach((s,i)=>{raw[44+i]=r["ev_"+s];ivs+=(r["iv_"+s]*2**(i*5));});
    ivs+=r.isEgg*2**30+(r.abilityNum===2?2**31:0);
    raw[50]=r.pokerus;raw[51]=r.metLocation<=0x6c?r.metLocation+0x58:r.metLocation>=0xfd?r.metLocation:0xff;
    dv.setUint16(52,r.metLevel|(r.metGame<<7)|(r.gigantamax<<11)|(r.otGender<<15),true);
    dv.setUint32(54,ivs,true);
    const result=parseHome(raw);
    if (personality!==r.personality) notices.push("传入 HOME／分享时会调整 PID，保留特性槽、性格、性别和闪光状态；传回后使用转换后的 PID。");
    if (r.ball===0) notices.push("奇异球会转换为普通精灵球，传回后仍为精灵球。");
    return result;
  }
  function checksum(raw) {
    const dv=view(raw);let sum=0;
    for(let i=0;i<raw.length;i+=4)sum=(sum+dv.getUint32(i,true))>>>0;
    return ((sum>>>16)+(sum&65535))&65535;
  }
  function crc(raw) {
    let value=0x1121;
    for(const byte of raw){value^=byte;for(let i=0;i<8;i++)value=(value&1)?(value>>>1)^0x8408:value>>>1;}
    return (~value)&65535;
  }
  function readSlot(raw,base) {
    const dv=view(raw), sections={}, locations={};let counter;
    if(raw.length<(base+14)*SECTOR)return null;
    for(let i=0;i<14;i++){
      const at=(base+i)*SECTOR,id=dv.getUint16(at+0xff4,true),count=dv.getUint32(at+0xffc,true);
      if(dv.getUint32(at+0xff8,true)!==SIGNATURE || id>=14 || sections[id] ||
        (counter!==undefined && count!==counter) || count%2!==base/14)return null;
      const data=raw.slice(at,at+sizes[id]);
      if(checksum(data)!==dv.getUint16(at+0xff6,true))return null;
      sections[id]=data;locations[id]=at;counter=count;
    }
    const pc=view(sections[5]);
    if(pc.getUint32(0,true)!==0x38314350 || pc.getUint16(4,true)!==1 || pc.getUint16(6,true)!==33540 ||
      pc.getUint32(12,true)!==0 || (pc.getUint16(8,true)&0x8000) || (pc.getUint16(10,true)&0xf000) || sections[5][16]>=18)return null;
    for(let i=0;i<5;i++)if(((pc.getUint16(8,true)>>(i*3))&7)>4)return null;
    const extension=new Uint8Array(14*116);
    for(let id=0;id<14;id++)extension.set(raw.slice(locations[id]+PAYLOAD,locations[id]+0xff4),id*116);
    const azoth=extension.slice(4,1328),av=view(azoth);
    if(azoth.some(b=>b!==0) && (av.getUint32(0,true)!==0x48545a41 || av.getUint16(4,true)!==1 || av.getUint16(6,true)!==crc(azoth.slice(8))))return null;
    return {counter,baseSector:base,sections,locations};
  }
  function parseSave(buffer) {
    const raw=new Uint8Array(buffer);
    if(raw.length<32*SECTOR)throw new Error("存档不足 128 KiB，请使用游戏内保存的完整 SAV。");
    const slots=[readSlot(raw,0),readSlot(raw,14)].filter(Boolean);
    if(!slots.length)return null;
    const slot=slots.reduce((a,b)=>((b.counter-a.counter)>>>0)<0x80000000?b:a);
    const storage=new Uint8Array(meta.layout.pc);let at=0;
    for(let id=5;id<14;id++){storage.set(slot.sections[id],at);at+=sizes[id];}
    const boxes=Array.from({length:18},()=>[]);
    for(let box=0;box<18;box++)for(let pos=0;pos<30;pos++){
      const off=17+(box*30+pos)*61,mon=parseCurrent(storage.slice(off,off+61));
      if(mon)boxes[box].push({...mon,box,slot:pos});
    }
    return {format:"decomp",counter:slot.counter,slot,boxes};
  }
  function writeSave(out,save) {
    if(save.format!=="decomp" || save.boxes.length!==18)throw new Error("当前存档格式不匹配。");
    const slot=readSlot(out,save.slot.baseSector);
    if(!slot || slot.counter!==save.counter)throw new Error("原始存档校验失败，未写入。");
    const storage=new Uint8Array(meta.layout.pc);let at=0;
    for(let id=5;id<14;id++){storage.set(slot.sections[id],at);at+=sizes[id];}
    storage.fill(0,17,17+540*61);
    for(let box=0;box<18;box++){
      const occupied=new Set();
      for(const mon of save.boxes[box]){
        if(mon.format!=="decomp" || !Number.isInteger(mon.slot) || mon.slot<0 || mon.slot>=30 || occupied.has(mon.slot))throw new Error("当前存档箱子数据异常，未写入。");
        occupied.add(mon.slot);storage.set(bytes(mon.raw,61),17+(box*30+mon.slot)*61);
      }
    }
    // All validation precedes mutation. Preserve every byte outside the selected PC payload/checksums.
    at=0;const dv=view(out);
    for(let id=5;id<14;id++){
      const chunk=storage.slice(at,at+sizes[id]);at+=sizes[id];
      out.set(chunk,slot.locations[id]);dv.setUint16(slot.locations[id]+0xff6,checksum(chunk),true);
    }
    if(!readSlot(out,slot.baseSector))throw new Error("写入后存档校验失败。");
  }
  function displaySpecies(mon) {
    if(mon.format!=="decomp")return home.species[mon.species]||{};
    const current=meta.species[mon.species]||{},old=home.species[reverse.species[mon.species]]||{};
    const types=["","一般","格斗","飞行","毒","地面","岩石","虫","幽灵","钢","???","火","水","草","电","超能力","冰","龙","恶","妖精","星晶"];
    return {...old,name:current.name||("当前版物种 #"+mon.species),types:(current.types||[]).map(t=>types[t])};
  }
  function displayId(kind,id,mon) {return mon.format==="decomp"?reverse[kind][id]:id;}
  function displayName(kind,id,mon) {return mon.format==="decomp"?meta.names[kind][id]:home[kind][id];}
  const conversionCache=new WeakMap();
  function conversionInfo(mon) {
    if (!mon || mon.format!=="decomp") return {reason:"",notices:[]};
    const signature=JSON.stringify([mon.raw,mon.homeOrigin]);
    const cached=conversionCache.get(mon);
    if (cached && cached.signature===signature) return {reason:cached.reason,notices:[...cached.notices]};
    const notices=[];let reason="";
    try {toHome(mon,notices);} catch(e) {reason=e.message;notices.length=0;}
    conversionCache.set(mon,{signature,reason,notices});
    return {reason,notices:[...notices]};
  }
  function reason(mon) {if(mon?.format==="decomp")return conversionInfo(mon).reason;try{toHome(mon);return "";}catch(e){return e.message;}}
  global.AzothHomeCompat={configure,parseSave,writeSave,toCurrent,toHome,parseCurrent,readRecord,writeRecord,
    displaySpecies,displayId,displayName,reason,conversionInfo,checksum,crc,readSlot,meta,sizes,fields};
})(window);
