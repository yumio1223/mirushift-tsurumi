/************************************************************
 * 一体型 最終形態 V27（🛁 入浴表示・🎈レク表示・日報レイアウト改善）
 *   ＋ 日報自動生成／PDF保存（月フォルダ振り分け）統合版
 *
 *  ▼ V27 追加点
 *   ・入浴（シフト表6〜8行目）をわかりやすく表示
 *       通常の曜日 → 「水曜の方」
 *       曜日が違う → 「⚠️振替」（日曜は「⚠️入浴あり」）を赤字で表示
 *       オムツ補充 → 「オムツ補充（入浴なし）」、同じ階はまとめて1つに
 *   ・行事の種類をマークで区別
 *       3〜4行目の「1F」など → 🩺往診 ／ その他 → 📌 ／ 5行目 → 🎈レク
 *   ・オムツ補充が日報の入浴欄と備考に二重に出ないように整理
 *   ・日報：事務・食事・洗濯・清掃の行を横並びにして高さを節約
 *   ・日報：各階の名前は大きさそのまま、名前の間の空行をなくす
 *   ・日報：1F・2FのF列の下を、2人目用の記入欄（名前／PHS／鍵／iPad）に
 *
 *  ▼ V26 追加点
 *   ・階の欄が「F」（FREE・フロア固定なし）のとき、
 *     その人を 1階・2階・3階すべてに展開して出す。
 ************************************************************/

const SRC_SHEET_NAME  = 'シフト表';
const MAIN_SHEET_NAME = 'メイン';
const SHIFT_YEAR      = 2026;   
const TZ  = "Asia/Tokyo";
const DAY = ["日","月","火","水","木","金","土"];
const ORDER_WORK  = ["夜勤明け","早出","日勤","遅出","夜勤入り","休(有給)"];
const ORDER_FLOOR = ["1階","2階","3階","事務所","看護師","洗濯"];

const EMOJI = {夜勤明け:"😴",早出:"🌅",日勤:"🌞",遅出:"🌇",夜勤入り:"🌙", 有給:"🏝️"};

const WEEKLY_SHEET_NAME = '📅1週間一覧';
const FULL_SHEET_NAME   = '💻全体一覧(PC横スクロール)';
const ALERT_SHEET_NAME  = '🚨シフト警告';
const SEARCH_SHEET_NAME = '🔍予定検索'; 

const OFFICE  = ['大本明正', '中野博美', '髙橋愉香', '羽原淳子'];
const NURSE   = ['生田直子','平島美紀','山本壽子','木田尚美','宮﨑喜美子'];
const LAUNDRY = ['吉田清', '前田', '福澤'];
const KITCHEN_SHEET_NAME = '厨房';
const DUTY_ORDER = ['夜勤明け', '早出', '日勤', '遅出', '夜勤入り', '休(有給)', ''];

// ★「F」（FREE・フロア固定なし）のときに使う 時間コード→勤務帯 の辞書。
const FREE_CODE_DUTY = {
  '1115': '日勤',
};

// ★ 入浴欄（シフト表6〜8行目）の曜日判定用
const WEEK_CHARS = "日月火水木金土";

function translateEvent(text) {
  let s = String(text).trim();
  if (!s) return '';
  s = s.replace(/秋桜精神?/g, '秋桜会CL精神科').replace(/T精/g, 'T内科精神').replace(/天六/g, '天六メンタルCL').replace(/谷町/g, '谷町眼科');
  let parts = s.split(/[\/／]/).map(p => {
    let trimmed = p.trim();
    if (trimmed === 'T' || trimmed === 'T内') return 'T内科';
    if (trimmed === '天' || trimmed === '天精') return '天六メンタルCL';
    return trimmed;
  });
  return parts.join('／');
}

// ==========================================
// 🛁 入浴情報（シフト表 6行目=1F／7行目=2F／8行目=3F）
// ==========================================
// その日の入浴欄を読んで、階ごとに「通常／振替／オムツ補充／その他」に分ける
function 入浴情報を読む(dStr, shiftValues) {
  const dObj = toDate(dStr);
  const dow = dObj ? dObj.getDay() : -1;
  const res = { dow: dow, floors: [] };
  let targetCol = -1;
  for (let c = 1; c < shiftValues[0].length; c++) {
    if (convertDateFromShift(shiftValues[0][c]) === dStr) { targetCol = c; break; }
  }
  ['1F', '2F', '3F'].forEach((fl, i) => {
    const r = 5 + i;
    const raw = (targetCol !== -1 && r < shiftValues.length) ? String(shiftValues[r][targetCol]).trim() : '';
    const info = { fl: fl, raw: raw, type: 'none', day: '', extra: '' };
    if (!raw) {
      // 空欄は何も出さない
    } else if (raw.includes('オムツ')) {
      info.type = 'omutsu';
    } else if (WEEK_CHARS.includes(raw.charAt(0))) {
      info.day = raw.charAt(0);
      // 「金（+藤原さん）」「土(一般のみ)」「土リフト無し」→ 括弧を外して補足にする
      info.extra = raw.slice(1).trim().replace(/^[（(]/, '').replace(/[）)]$/, '').trim();
      info.type = (info.day === DAY[dow]) ? 'normal' : 'irregular';
    } else {
      info.type = 'other';
    }
    res.floors.push(info);
  });
  return res;
}

// 今日・明日・1週間一覧などの行事欄に出す入浴のお知らせ（いつも通りの日は出さない）
function 入浴のお知らせ(bath) {
  const out = [];
  const om = bath.floors.filter(f => f.type === 'omutsu').map(f => f.fl);
  if (om.length) out.push(om.length === 3 ? '🧷 オムツ補充（全階・入浴なし）' : `🧷 オムツ補充（${om.join('・')}・入浴なし）`);
  bath.floors.forEach(f => {
    const ex = f.extra ? `（${f.extra}）` : '';
    if (f.type === 'irregular') {
      out.push(bath.dow === 0 ? `⚠️ ${f.fl}入浴あり：${f.day}曜の方${ex}` : `⚠️ ${f.fl}入浴振替：${f.day}曜の方${ex}`);
    } else if (f.type === 'normal' && f.extra) {
      out.push(`🛁 ${f.fl}入浴：${f.day}曜の方${ex}`);
    } else if (f.type === 'other') {
      out.push(`🛁 ${f.fl}入浴：${f.raw}`);
    }
  });
  return out;
}

// 日報の入浴欄の文字を作る（振替の部分は赤字にする）
function 入浴欄の文字を作る(bath) {
  const entries = []; // 1つの階ぶん = [{t:文字, red:赤字か}]
  const omFloors = bath.floors.filter(f => f.type === 'omutsu').map(f => f.fl);
  let omDone = false;
  bath.floors.forEach(f => {
    if (f.type === 'none') return;
    if (f.type === 'omutsu') {
      if (omDone) return;
      omDone = true;
      const head = omFloors.length === 3 ? '【全階】' : `【${omFloors.join('・')}】`;
      entries.push([{ t: `${head}\nオムツ補充\n（入浴なし）`, red: false }]);
      return;
    }
    const head = `【${f.fl}】\n`;
    const ex = f.extra ? `\n（${f.extra}）` : '';
    if (f.type === 'normal') {
      entries.push([{ t: `${head}${f.day}曜の方${ex}`, red: false }]);
    } else if (f.type === 'irregular') {
      const body = (bath.dow === 0 ? `⚠️入浴あり\n${f.day}曜の方` : `⚠️振替\n${f.day}曜の方`) + ex;
      entries.push([{ t: head, red: false }, { t: body, red: true }]);
    } else {
      entries.push([{ t: `${head}${f.raw}`, red: false }]);
    }
  });

  let text = '';
  const redRanges = [];
  entries.forEach((segs, i) => {
    if (i > 0) text += '\n\n';
    segs.forEach(s => {
      const start = text.length;
      text += s.t;
      if (s.red) redRanges.push([start, text.length]);
    });
  });
  return { text: text, redRanges: redRanges };
}

// ==========================================
// 📌 行事（シフト表 3〜5行目）＋入浴のお知らせ
//   includeBath = false のときは入浴・オムツを入れない（日報は入浴欄に出すため）
// ==========================================
function getEventsForDate(dStr, shiftValues, includeBath) {
  if (includeBath === undefined) includeBath = true;
  let events = [];
  const cols = shiftValues[0].length;
  let targetCol = -1;
  for (let c = 1; c < cols; c++) {
    if (convertDateFromShift(shiftValues[0][c]) === dStr) { targetCol = c; break; }
  }
  if (targetCol !== -1) {
    // 3行目・4行目：往診・受診など
    for (let r = 2; r <= 3; r++) {
      if (r < shiftValues.length) {
        let val = String(shiftValues[r][targetCol]).trim();
        if (!val) continue;
        if (/^[1-3１-３][FＦfｆ階]$/.test(val)) { events.push('🩺 ' + translateEvent(val) + '往診'); continue; }
        let tr = translateEvent(val);
        if (tr) events.push((CLINIC_WORDS.some(w => tr.includes(w)) ? '🩺 ' : '📌 ') + tr);
      }
    }
    // 5行目：レクリエーション
    if (shiftValues.length > 4) {
      let rec = String(shiftValues[4][targetCol]).trim();
      if (rec) events.push('🎈 レク：' + rec);
    }
  }
  if (includeBath) events = events.concat(入浴のお知らせ(入浴情報を読む(dStr, shiftValues)));
  return [...new Set(events)];
}

function normalizeName(name) {
  const s = String(name).trim();
  if (s.includes('グエンティト')) return 'トゥオン';
  if (s.includes('ユエン')) return 'ユエン';
  if (s.includes('レイラニー')) return 'レイラニー';
  return s;
}

function detectDivision(name) {
  const s = String(name);
  if (OFFICE.some(m => s.includes(m))) return '事務所';
  if (NURSE.some(m => s.includes(m))) return '看護師';
  if (LAUNDRY.some(m => s.includes(m))) return '洗濯';
  if (s === '洗濯') return 'ヘッダー'; 
  return 'フロア';
}

function convertFloor(floorRaw) {
  const s = String(floorRaw).trim();
  if (!s) return '';
  if (s.includes('/') || s.includes('／')) {
    return s.split(/[\/／]/).map(str => {
      const p = str.trim();
      if (/1F|１F|1階|１階/.test(p)) return '1階';
      if (/2F|２F|2階|２階/.test(p)) return '2階';
      if (/3F|３F|3階|３階/.test(p)) return '3階';
      if (/事務|事/.test(p)) return '事務所';
      return p;
    }).filter(x => x !== '').join('／');
  } else {
    const matches = s.match(/(1[FＦ階]|１[FＦ階]|2[FＦ階]|２[FＦ階]|3[FＦ階]|３[FＦ階]|事務|事)/g);
    if (matches && matches.length > 1) {
      return matches.map(p => {
        if (/1F|１F|1階|１階/.test(p)) return '1階';
        if (/2F|２F|2階|２階/.test(p)) return '2階';
        if (/3F|３F|3階|３階/.test(p)) return '3階';
        if (/事務|事/.test(p)) return '事務所';
        return p;
      }).join('／');
    }
    if (/1F|１F|1階|１階/.test(s)) return '1階';
    if (/2F|２F|2階|２階/.test(s)) return '2階';
    if (/3F|３F|3階|３階/.test(s)) return '3階';
    if (/事務|事/.test(s)) return '事務所';
    return s;
  }
}

function parseCode(code, division) {
  if (code instanceof Date) return { duty: '', shortCode: '', isWork: false };
  
  let s = String(code).trim().replace(/[\s ]+/g, '');
  s = s.replace(/[０-９]/g, function(m) {
    return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
  });

  if (!s) return { duty: '', shortCode: '', isWork: false };
  if (s.includes('AM/PM')) return { duty: '日勤', shortCode: 'AM/PM', isWork: true };

  if (/^\d{1,2}-\d+$/.test(s)) {
    let duty = '日勤';
    if (s.startsWith('7')) duty = '早出';
    if (s.startsWith('42')) duty = '夜勤明け'; 
    return { duty, shortCode: s, isWork: true };
  }
  
  if (s === '79') return { duty: '早出', shortCode: '79', isWork: true }; 
  if (s === '7730') return { duty: '早出', shortCode: '7:30', isWork: true };
  if (s === '7309') return { duty: '早出', shortCode: '9:00', isWork: true };

  const n = Number(s); 
  if (n === 999) return { duty: '休(有給)', shortCode: '999', isWork: false };
  if (isNaN(n) || n === 0) return { duty: '', shortCode: '', isWork: false };

  if (n === 1)  return { duty: '日勤',      shortCode: '', isWork: true };
  if (n === 2)  return { duty: '早出',      shortCode: '', isWork: true };
  if (n === 3)  return { duty: '遅出',      shortCode: '', isWork: true };
  if (n === 41) return { duty: '夜勤入り', shortCode: '', isWork: true };
  if (n === 42) return { duty: '夜勤明け', shortCode: '', isWork: true };

  if (division === 'フロア') {
    let duty = '日勤';
    if (s.startsWith('7')) duty = '早出';
    else if (s.startsWith('9') || s.startsWith('14') || s === '1013' || s === '1016') duty = '日勤'; 
    else if (s.startsWith('10') || s.startsWith('18') || s === '1619' || /^17\d*/.test(s)) duty = '遅出';
    else if (s.startsWith('20')) duty = '夜勤入り';
    return { duty, shortCode: s, isWork: true };
  } else {
    return { duty: '', shortCode: s, isWork: true };
  }
}

function convertDateFromShift(dateRaw) {
  if (!dateRaw) return '';
  let month, day;
  if (dateRaw instanceof Date) { month = dateRaw.getMonth() + 1; day = dateRaw.getDate(); }
  else {
    const m = String(dateRaw).trim().match(/(\d+)月(\d+)日/);
    if (!m) return '';
    month = Number(m[1]); day = Number(m[2]);
  }
  const year = (month === 12) ? SHIFT_YEAR - 1 : SHIFT_YEAR;
  return `${year}/${('0'+month).slice(-2)}/${('0'+day).slice(-2)}`;
}

function findDateColumns(values) {
  const result = {};
  for (let c = 1; c < values[0].length; c++) {
    for (let r = 0; r < Math.min(10, values.length); r++) {
      const dateStr = convertDateFromShift(values[r][c]);
      if (dateStr) { result[c] = dateStr; break; }
    }
  }
  return result;
}

function getRoleSortKey(role) {
  const s = String(role);
  if (s.includes('1階')) return 0; if (s.includes('2階')) return 1;
  if (s.includes('3階')) return 2; if (s === '事務所') return 3;
  if (s === '看護師') return 4; if (s === '洗濯') return 5; return 999;
}

const fmt = (d, pat) => Utilities.formatDate(d, TZ, pat);
const ymd = d => d ? fmt(d, "yyyy/MM/dd") : "";
const toDate = v => {
  if (v instanceof Date) return v; if (!v) return null;
  const d = new Date(String(v).replace(/[年月日]/g,"/").replace(/\/+/g,"/"));
  return isNaN(d) ? null : d;
};

const workColor = w => {
  const s = String(w || "");
  if (s.includes("有給")) return "#d5a6bd"; 
  if (s.includes("夜勤明け")) return "#dce6f1";
  if (s.includes("早出")) return "#f4cccc";
  if (s.includes("日勤")) return "#fff2cc";
  if (s.includes("遅出")) return "#d9ead3";
  if (s.includes("夜勤入り")) return "#cfe2f3";
  return "#ffffff";
};

const withEmoji = w => {
  const s = String(w || "");
  const k = ORDER_WORK.find(x => s.includes(x));
  return k ? `${EMOJI[k]} ${s}` : s;
};

function メインを作る() {
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName(SRC_SHEET_NAME);
  if (!src) return;
  let main = ss.getSheetByName(MAIN_SHEET_NAME) || ss.insertSheet(MAIN_SHEET_NAME);
  const values = src.getDataRange().getValues();
  const dateCols = findDateColumns(values);
  const output = [];

  for (let col of Object.keys(dateCols).map(Number)) {
    const dateStr = dateCols[col];
    for (let r = 0; r < values.length; r++) {
      if (!values[r][0]) continue;
      const name = normalizeName(values[r][0]);
      let division = detectDivision(name);
      if (division === 'ヘッダー' || name.includes('入浴') || name.includes('行事')) continue;

      const codeRaw = values[r][col];
      const codeStr = String(codeRaw).trim();
      const floorRaw = (r + 1 < values.length) ? values[r + 1][col] : '';
      let role = convertFloor(floorRaw);   
      
      if (division !== 'フロア' && (role.includes('1階') || role.includes('2階') || role.includes('3階'))) division = 'フロア';
      const parsed = parseCode(codeRaw, division);

      if (division === 'フロア') {
        if (codeStr.startsWith('42') && role === '' && col > 0) { 
           const pRole = convertFloor(r + 1 < values.length ? values[r + 1][col - 1] : '');
           if (pRole) role = pRole; 
        }
      } else { role = division; }

      if (codeStr === '7185' || codeStr === '919' || codeStr === '920') {
        const parts = String(floorRaw).split(/[\/／]/); 
        const mLoc = (s) => {
           let t = String(s).trim();
           if (/1F|１F|1階|１階/.test(t)) return '1階';
           if (/2F|２F|2階|２階/.test(t)) return '2階';
           if (/3F|３F|3階|３階/.test(t)) return '3階';
           return '事務所'; 
        };
        let l1 = parts.length >= 2 ? mLoc(parts[0]) : convertFloor(floorRaw);
        let l2 = parts.length >= 2 ? mLoc(parts[1]) : l1;
        const d1 = (codeStr === '7185') ? '早出' : '日勤';
        const sc = (codeStr === '920') ? '' : codeStr; 
        output.push([dateStr, name, l1, d1, sc, '']);
        let n2 = (codeStr === '920') ? name + '(20)' : name;
        output.push([dateStr, n2, l2, '遅出', sc, '']);
        continue;
      }

      if (name === '寺井由美子' && codeStr.includes('AM/PM')) {
        const parts = String(floorRaw).split(/[\/／]/); 
        let aLoc = parts.length >= 2 ? convertFloor(parts[0]) : (convertFloor(floorRaw).includes('階') ? convertFloor(floorRaw).split('／')[0] : '事務所');
        let pLoc = parts.length >= 2 ? convertFloor(parts[1]) : '事務所';
        output.push([dateStr, name + '(AM)', aLoc || '事務所', '日勤', '', '']);
        output.push([dateStr, name + '(PM)', pLoc || '事務所', '日勤', '', '']);
        continue;
      }

      // ★「F」（FREE・フロア固定なし）＝ 1階・2階・3階すべてに展開する回路★
      if (role === 'F' || role === 'Ｆ') {
        let fCode = String(codeRaw).trim().replace(/[\s ]+/g, '').replace(/[０-９]/g, function(m) {
          return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
        });
        const fDuty = FREE_CODE_DUTY[fCode];
        if (fDuty) {
          ['1階', '2階', '3階'].forEach(fl => {
            output.push([dateStr, name, fl, fDuty, fCode, '']);
          });
        }
        continue;
      }

      // ★大本さんの複雑なスラッシュ切り替え＆同一階ガッチャンコ吸収回路★
      if (division === 'フロア' && codeStr.includes('/')) {
        let normalizedCodeStr = codeStr.replace(/[０-９]/g, function(m) {
          return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
        });
        
        const tParts = normalizedCodeStr.split('/');
        const fParts = role.split('／');
        
        let restoredParts = [];
        let prevEnd = "";
        for (let i = 0; i < tParts.length; i++) {
          let p = tParts[i].trim();
          if (p.length === 3 || p.length === 4) {
            restoredParts.push(p);
            prevEnd = p.slice(-2);
          } else if (p.length === 2 && prevEnd !== "") {
            let fullCode = prevEnd + p;
            restoredParts.push(fullCode);
            prevEnd = p;
          } else {
            restoredParts.push(tParts[i].trim());
          }
        }
        
        let floorMap = {};
        for (let i = 0; i < restoredParts.length; i++) {
          const pRes = parseCode(restoredParts[i], division);
          if (!pRes.isWork) continue;
          
          const f = fParts[i] !== undefined ? fParts[i].trim() : (fParts[0] ? fParts[0].trim() : '');
          if (!f) continue;
          
          if (!floorMap[f]) {
            floorMap[f] = { duty: pRes.duty, shortCodes: [] };
          }
          if (pRes.shortCode) {
            floorMap[f].shortCodes.push(pRes.shortCode);
          }
          floorMap[f].duty = pRes.duty;
        }
        
        for (let f in floorMap) {
          let combinedShort = floorMap[f].shortCodes.join('/');
          output.push([dateStr, name, f, floorMap[f].duty, combinedShort, '']);
        }
        continue;
      }

      if (!parsed.isWork) continue;  

      if (division === 'フロア' && role.includes('／') && !codeStr.includes('/') && !codeStr.includes('／')) {
        const fs = role.split('／').map(s => s.trim());
        output.push([dateStr, name, fs[0], parsed.duty, parsed.shortCode, '']);
        output.push([dateStr, name, fs[1], parsed.duty, parsed.shortCode, '']);
        continue;
      }
      
      output.push([dateStr, name, role, parsed.duty, parsed.shortCode, '']);
    }
  }
  output.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    let ai = getRoleSortKey(a[2]), bi = getRoleSortKey(b[2]);
    if (ai !== bi) return ai - bi;
    let ad = DUTY_ORDER.indexOf(a[3]), bd = DUTY_ORDER.indexOf(b[3]);
    return (ad===-1?999:ad) - (bd===-1?999:bd);
  });
  main.clearContents();
  main.getRange(1, 1, 1, 6).setValues([['日付','氏名','階','勤務帯','短時間コード','行事']]);
  if (output.length > 0) main.getRange(2, 1, output.length, 6).setValues(output);

  // 📢 前回との違いを「シフト送信待ち」にためる（失敗してもメイン作りは止めない）
  try { シフト変更を記録する_(output, values); } catch (e) { Logger.log('シフト変更の記録に失敗：' + e); }
}

function getMainIndex(){
  const h = SpreadsheetApp.getActive().getSheetByName(MAIN_SHEET_NAME).getRange(1,1,1,6).getValues()[0];
  return { cDate: h.indexOf("日付"), cName: h.indexOf("氏名"), cFloor: h.indexOf("階"), cWork: h.indexOf("勤務帯"), cShort: h.indexOf("短時間コード") };
}

function 昨日を更新(){ 単日(-1, "⏪昨日"); }
function 三日分まとめて更新(){ 単日(0,"😊今日"); 単日(1,"🌈明日"); 単日(2,"🌙あさって"); }

function 単日(offset, name){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), main = ss.getSheetByName(MAIN_SHEET_NAME), src = ss.getSheetByName(SRC_SHEET_NAME);
  if (!main || !src) return;
  const idx = getMainIndex(), shiftValues = src.getDataRange().getValues(), base = new Date(); base.setDate(base.getDate() + offset);
  const target = ymd(base);
  const list = main.getDataRange().getValues().slice(1).filter(r => ymd(toDate(r[idx.cDate])) === target);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  出力描画(sh, target, list, idx, shiftValues, name);
}

// 👑 単日シート用（今日・明日など）
function 出力描画(sh, targetDStr, list, idx, shiftValues, sheetName){
  const dObj = toDate(targetDStr);
  let label = sheetName.replace(/[^昨日今日明日あさって]/g, '');
  let emoji = label==="昨日"?"⏪":label==="今日"?"😊":label==="明日"?"🌈":"🌙";
  const events = getEventsForDate(targetDStr, shiftValues, true);
  const title = `${emoji}${label}（${fmt(dObj,"M/d")}・${DAY[dObj.getDay()]}）`;
  const bg = label.includes("昨日") ? "#c9daf8" : label.includes("今日") ? "#ea9999" : "#f9cb9c";  
  sh.clear(); sh.setHiddenGridlines(true);
  
  sh.getRange("A1:D1").merge().setValue(title).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground(bg);
  sh.setRowHeight(1, 40);

  // 【2行目】行事（🩺往診・📌行事・🎈レク・🧷オムツ・⚠️入浴）
  if (events.length > 0) {
    const evText = events.join("\n");
    sh.getRange("A2:D2").merge().setValue(evText).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(12).setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true).setBackground(bg);
    sh.setRowHeight(2, 10 + (events.length * 20));
  } else {
    sh.getRange("A2:D2").merge().setBackground(bg);
    sh.setRowHeight(2, 5); 
  }

  sh.getRange(3,1,1,4).setValues([["日付","氏名","階","勤務帯"]]).setFontFamily("Noto Sans JP").setFontWeight("bold").setHorizontalAlignment("center");
  if (!list.length){ 基本整形(sh, 3); return; }
  
  const exp = [...list].sort((a,b)=>{
    let fa = ORDER_FLOOR.indexOf(String(a[idx.cFloor]).trim()), fb = ORDER_FLOOR.indexOf(String(b[idx.cFloor]).trim());
    if (fa !== fb) return fa - fb;
    return ORDER_WORK.indexOf(String(a[idx.cWork]).trim()) - ORDER_WORK.indexOf(String(b[idx.cWork]).trim());
  });
  
  let row = 4;
  ORDER_FLOOR.forEach(fl => {
    const grp = exp.filter(x => String(x[idx.cFloor]).trim() === fl);
    if (!grp.length) return;
    sh.getRange(row,1,1,4).merge().setValue(`${fl}（合計：${grp.length}名）`).setFontFamily("Noto Sans JP").setFontWeight("bold").setHorizontalAlignment("left");
    sh.setRowHeight(row,24); row++;
    let mems = fl === "事務所" ? grp.sort((a,b)=>{
      let ia = OFFICE.indexOf(String(a[idx.cName]).trim().replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, "")), ib = OFFICE.indexOf(String(b[idx.cName]).trim().replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, ""));
      return (ia===-1?999:ia) - (ib===-1?999:ib);
    }) : grp;
    mems.forEach(r => {
      const w = String(r[idx.cWork] || "").trim(), sRaw = String(r[idx.cShort] || "").trim();
      let nOut = r[idx.cName], wOut = w ? withEmoji(w) : sRaw;
      if (fl !== "事務所" && fl !== "看護師") { nOut = sRaw ? `${r[idx.cName]}（${sRaw}）` : r[idx.cName]; wOut = withEmoji(w); }
      const c = (fl === "事務所" || fl === "看護師") ? "#eeeeee" : workColor(w);
      sh.getRange(row, 1, 1, 4).setValues([[fmt(toDate(r[idx.cDate]), "M/d"), nOut, r[idx.cFloor], wOut]]).setBackgrounds([[c,c,c,c]]).setHorizontalAlignment("center");
      row++;
    }); row++; 
  });
  基本整形(sh, row - 1);
}

function 基本整形(sh, lastRow){ 
  sh.getRange(1,1,Math.max(1,lastRow),4).setFontFamily("Noto Sans JP").setHorizontalAlignment("center").setVerticalAlignment("middle"); 
  sh.setColumnWidth(1,58); sh.setColumnWidth(2,170); sh.setColumnWidth(3,58); sh.setColumnWidth(4,140); 
  sh.setFrozenRows(3); 
}

// 👑 横スクロールシート用（1週間・全体一覧）
function 描画ブロック_横並び用(sh, targetDStr, startCol, headLabel, list, idx, shiftValues){
  const dObj = toDate(targetDStr); const events = getEventsForDate(targetDStr, shiftValues, true);
  const title = `${headLabel} ${fmt(dObj,"M/d")}（${DAY[dObj.getDay()]}）`;
  
  sh.getRange(2, startCol, 1, 4).merge().setValue(title).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#fff2cc");
  sh.setRowHeight(2, 30);
  
  // 【3行目】行事（🩺往診・📌行事・🎈レク・🧷オムツ・⚠️入浴）
  if (events.length > 0) {
    const evText = events.join("\n");
    sh.getRange(3, startCol, 1, 4).merge().setValue(evText).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(12).setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true).setBackground("#fff2cc");
    const curH = sh.getRowHeight(3) || 21;
    const nH = 10 + (events.length * 20);
    if (nH > curH) sh.setRowHeight(3, nH);
  } else {
    sh.getRange(3, startCol, 1, 4).merge().setBackground("#fff2cc");
  }

  sh.getRange(4, startCol, 1, 4).setValues([["日付","氏名","階","勤務帯"]]).setFontFamily("Noto Sans JP").setFontWeight("bold").setHorizontalAlignment("center");
  if (!list.length) return;
  const exp = [...list].sort((a,b)=>{
    let fa = ORDER_FLOOR.indexOf(String(a[idx.cFloor]).trim()), fb = ORDER_FLOOR.indexOf(String(b[idx.cFloor]).trim());
    if (fa !== fb) return fa - fb;
    return ORDER_WORK.indexOf(String(a[idx.cWork]).trim()) - ORDER_WORK.indexOf(String(b[idx.cWork]).trim());
  });
  let row = 5; 
  ORDER_FLOOR.forEach(fl => {
    const grp = exp.filter(x => String(x[idx.cFloor]).trim() === fl);
    if (!grp.length) return;
    sh.getRange(row, startCol, 1, 4).merge().setValue(`${fl}（合計：${grp.length}名）`).setFontFamily("Noto Sans JP").setFontWeight("bold").setHorizontalAlignment("left");
    sh.setRowHeight(row,22); row++;
    let mems = fl === "事務所" ? grp.sort((a,b)=>{
      let ia = OFFICE.indexOf(String(a[idx.cName]).trim().replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, "")), ib = OFFICE.indexOf(String(b[idx.cName]).trim().replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, ""));
      return (ia===-1?999:ia) - (ib===-1?999:ib);
    }) : grp;
    mems.forEach(r => {
      const w = String(r[idx.cWork] || "").trim(), sRaw = String(r[idx.cShort] || "").trim();
      let nOut = r[idx.cName], wOut = w ? withEmoji(w) : sRaw;
      if (fl !== "事務所" && fl !== "看護師") { nOut = sRaw ? `${r[idx.cName]}（${sRaw}）` : r[idx.cName]; wOut = withEmoji(w); }
      const c = (fl === "事務所" || fl === "看護師") ? "#eeeeee" : workColor(w);
      sh.getRange(row, startCol, 1, 4).setValues([[fmt(toDate(r[idx.cDate]), "M/d"), nOut, r[idx.cFloor], wOut]]).setBackgrounds([[c,c,c,c]]).setHorizontalAlignment("center");
      row++;
    }); row++; 
  });
}

function 一週間一覧を更新(){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), main = ss.getSheetByName(MAIN_SHEET_NAME), src = ss.getSheetByName(SRC_SHEET_NAME);
  if (!main || !src) return;
  const idx = getMainIndex(), all = main.getDataRange().getValues().slice(1), shiftValues = src.getDataRange().getValues(); 
  let sheet = ss.getSheetByName(WEEKLY_SHEET_NAME) || ss.insertSheet(WEEKLY_SHEET_NAME);
  sheet.clear(); sheet.setHiddenGridlines(true);
  if (sheet.getMaxColumns() < 35) sheet.insertColumnsAfter(sheet.getMaxColumns(), 35 - sheet.getMaxColumns());
  sheet.getRange("1:1").breakApart();
  const sDate = new Date(); sDate.setDate(sDate.getDate() + 3); const eDate = new Date(); eDate.setDate(eDate.getDate() + 9);     
  
  sheet.getRange(1,1,1,35).merge().setValue(`📅 1週間パッと見一覧（${fmt(sDate, "M/d")} 〜 ${fmt(eDate, "M/d")}）`).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#eeeeee");
  sheet.setRowHeight(1,36);
  sheet.setRowHeight(3,5); 
  
  for(let i=0; i<7; i++){
    const b = new Date(); b.setDate(b.getDate() + 3 + i); const t = ymd(b); const sCol = i * 5 + 1; 
    描画ブロック_横並び用(sheet, t, sCol, "📅", all.filter(r => ymd(toDate(r[idx.cDate])) === t), idx, shiftValues);
    sheet.setColumnWidth(sCol, 58); sheet.setColumnWidth(sCol+1, 170); sheet.setColumnWidth(sCol+2, 58); sheet.setColumnWidth(sCol+3, 140);
    if (i < 6) sheet.setColumnWidth(sCol+4, 15); 
  }
  sheet.getRange(1,1,sheet.getMaxRows(),35).setFontFamily("Noto Sans JP").setVerticalAlignment("middle"); 
  sheet.setFrozenRows(4); 
}

function 全体シフト一覧を更新(){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), main = ss.getSheetByName(MAIN_SHEET_NAME), src = ss.getSheetByName(SRC_SHEET_NAME);
  if (!main || !src) return;
  const idx = getMainIndex(), all = main.getDataRange().getValues().slice(1), shiftValues = src.getDataRange().getValues(); 
  const dStrs = Object.values(findDateColumns(shiftValues)).sort((a,b) => toDate(a) - toDate(b));
  if (dStrs.length === 0) return;
  let sheet = ss.getSheetByName(FULL_SHEET_NAME) || ss.insertSheet(FULL_SHEET_NAME);
  sheet.clear(); sheet.setHiddenGridlines(true);
  const reqCols = Math.max(20, dStrs.length * 5);
  if (sheet.getMaxColumns() < reqCols) sheet.insertColumnsAfter(sheet.getMaxColumns(), reqCols - sheet.getMaxColumns());
  sheet.getRange("1:1").breakApart();
  sheet.getRange(1,1,1,reqCols).merge().setValue(`💻 全体シフト一覧（全 ${dStrs.length} 日分） ※PC横スクロール確認用`).setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#d9ead3");
  sheet.setRowHeight(1,36);
  sheet.setRowHeight(3,5); 
  
  dStrs.forEach((d, i) => {
    const sCol = i * 5 + 1; 
    描画ブロック_横並び用(sheet, d, sCol, "📅", all.filter(r => ymd(toDate(r[idx.cDate])) === d), idx, shiftValues);
    sheet.setColumnWidth(sCol, 58); sheet.setColumnWidth(sCol+1, 170); sheet.setColumnWidth(sCol+2, 58); sheet.setColumnWidth(sCol+3, 140);
    if (i < dStrs.length - 1) sheet.setColumnWidth(sCol+4, 15); 
  });
  sheet.getRange(1,1,sheet.getMaxRows(),reqCols).setFontFamily("Noto Sans JP").setVerticalAlignment("middle"); 
  sheet.setFrozenRows(4); 
}

function シフト警告を更新() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), main = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!main) return;
  const idx = getMainIndex(), all = main.getDataRange().getValues().slice(1), stats = {};
  all.forEach(r => {
    const dObj = toDate(r[idx.cDate]); if (!dObj) return;
    const dStr = ymd(dObj), name = String(r[idx.cName]).trim(), flRaw = String(r[idx.cFloor]).trim(), duty = String(r[idx.cWork]).trim(), shortCode = String(r[idx.cShort]).trim(); 
    if (duty.includes('有給')) return; 
    if (!stats[dStr]) stats[dStr] = {};
    ['1階', '2階', '3階'].forEach(fl => {
      if (flRaw.includes(fl)) {
        if (!stats[dStr][fl]) stats[dStr][fl] = { '夜勤明け':{m:0, s:0}, '早出':{m:0, s:0}, '日勤':{m:0, s:0}, '遅出':{m:0, s:0}, '夜勤入り':{m:0, s:0} };
        if (stats[dStr][fl][duty]) {
          let isSub = shortCode !== '';
          if (name.includes('松岡')) isSub = shortCode === '912';
          if (name.includes('(AM)') || name.includes('(PM)')) isSub = true;
          if (duty === '夜勤明け' || duty === '夜勤入り' || ['919', '7185', '916'].includes(shortCode)) isSub = false; 
          if (isSub) stats[dStr][fl][duty].s++; else stats[dStr][fl][duty].m++;
        }
      }
    });
  });
  const alerts = [];
  for (const dStr in stats) {
    const dObj = toDate(dStr), dow = dObj.getDay(); let msgs = [];
    ['1階', '2階', '3階'].forEach(fl => {
      ['夜勤明け', '早出', '日勤', '遅出', '夜勤入り'].forEach(duty => {
        const s = stats[dStr][fl] ? stats[dStr][fl][duty] : {m:0, s:0}; let rM = 1, rS = 0;
        if (duty === '日勤') { if (dow === 0) rM = 0; else if (fl === '2階' && (dow === 2 || dow === 5)) { rM = 1; rS = 1; } }
        else if (duty === '遅出' && fl === '2階' && dow === 0) rM = 2;
        if (fl === '1階' && duty === '日勤' && dow !== 0) {
          if (s.m + s.s === 0) msgs.push(`❌ ${fl}：【${duty}】が 0名 です！`);
          else if (s.m + s.s > 1) msgs.push(`⚠️ ${fl}：【${duty}】が合計 ${s.m + s.s}名 います！`);
          return;
        }
        if (s.m < rM) msgs.push(`❌ ${fl}：【${duty}】のメインが ${s.m}名 です！`);
        else if (s.m > rM) msgs.push(`⚠️ ${fl}：【${duty}】のメインが ${s.m}名 います！`);
        if (rS > 0 && s.s < rS) msgs.push(`❌ ${fl}：【${duty}(短時間)】が ${s.s}名 です！`);
      });
    });
    if (msgs.length > 0) alerts.push({ dObj: dObj, msgs: msgs });
  }
  alerts.sort((a,b) => a.dObj - b.dObj);
  let sh = ss.getSheetByName(ALERT_SHEET_NAME) || ss.insertSheet(ALERT_SHEET_NAME);
  sh.showSheet(); sh.clear(); sh.setHiddenGridlines(true);
  sh.getRange(1, 1, 1, 5).merge().setValue('🚨 シフト抜け漏れ・ダブり報告').setFontFamily("Noto Sans JP").setFontWeight("bold").setFontSize(16).setBackground("#f4cccc").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(1, 40);
  if (alerts.length === 0) { sh.getRange(3, 1).setValue("🎉 完璧です！").setFontColor("#38761d"); return; }
  let row = 3;
  alerts.forEach(al => {
    sh.getRange(row, 1, 1, 5).merge().setValue(`■ ${fmt(al.dObj, "M/d")}（${DAY[al.dObj.getDay()]}）`).setFontWeight("bold").setBackground("#eeeeee"); row++;
    al.msgs.forEach(msg => {
      let r = sh.getRange(row, 1, 1, 5).merge().setValue(`・${msg}`);
      if (msg.includes('❌')) r.setFontColor("#cc0000"); if (msg.includes('⚠️')) r.setFontColor("#e69138"); row++;
    }); row++; 
  });
}

function 予定を検索する() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SEARCH_SHEET_NAME); if (!sh) return;
  const names = []; for (let i=4; i<=13; i++) { let v = String(sh.getRange(`C${i}`).getValue()).trim(); if(v) names.push(v); }
  const sDateStr = String(sh.getRange("C14").getValue()).trim(), eDateStr = String(sh.getRange("C15").getValue()).trim(), tDuty = String(sh.getRange("C16").getValue()).trim(), tCode = String(sh.getRange("C17").getValue()).trim();
  const idx = getMainIndex(), all = ss.getSheetByName(MAIN_SHEET_NAME).getDataRange().getValues().slice(1);
  let sDate = sDateStr ? new Date(sDateStr) : new Date("2000/01/01"), eDate = eDateStr ? new Date(eDateStr) : new Date("2100/12/31");
  let filtered = all.filter(r => {
    const d = toDate(r[idx.cDate]); if (!d || d < sDate || d > eDate) return false;
    const n = String(r[idx.cName]).replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, "").trim(), duty = String(r[idx.cWork]).trim(), code = String(r[idx.cShort]).trim();
    if (names.length > 0 && !names.includes(n)) return false;
    if (tDuty && !duty.includes(tDuty)) return false; if (tCode && code !== tCode) return false; return true;
  });
  sh.getRange("B22:E1000").clearContent().clearFormat().clearDataValidations();
  let row = 22;
  if (names.length > 1 && !tDuty && !tCode) {
    const dMap = {};
    all.forEach(r => {
      const d = toDate(r[idx.cDate]); if (!d || d < sDate || d > eDate) return;
      const dS = ymd(d), n = String(r[idx.cName]).replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, "").trim();
      if (!dMap[dS]) dMap[dS] = { dObj: d, w: new Set() }; if (!String(r[idx.cWork]).includes("有給")) dMap[dS].w.add(n);
    });
    const aWork = [], aOff = [];
    Object.values(dMap).sort((a,b)=>a.dObj-b.dObj).forEach(d => {
      let c = 0; names.forEach(n => { if(d.w.has(n)) c++; });
      const ds = `${fmt(d.dObj, "M/d")}（${DAY[d.dObj.getDay()]}）`; if (c === names.length) aWork.push(ds); else if (c === 0) aOff.push(ds);
    });
    sh.getRange(row, 2, 1, 3).merge().setValue(`👩‍🤝‍👩 ピックアップ：${names.join("、")}`).setFontWeight("bold").setBackground("#eeeeee").setBorder(true,true,true,true,false,false); row++;
    sh.getRange(row, 2, 1, 3).merge().setValue("☕️ 全員がお休みの日").setFontColor("#c90076"); row++;
    (aOff.length>0?aOff:['・該当なし']).forEach(d => { sh.getRange(row, 2, 1, 3).merge().setValue(d.includes('・')?d:`・${d}`); row++; });
    sh.getRange(row, 2, 1, 3).merge().setValue("🏢 全員が出勤の日").setFontColor("#1155cc"); row++;
    (aWork.length>0?aWork:['・該当なし']).forEach(d => { sh.getRange(row, 2, 1, 3).merge().setValue(d.includes('・')?d:`・${d}`); row++; }); row++;
  }
  sh.getRange(row, 2, 1, 3).merge().setValue("📊 詳細な検索結果").setFontWeight("bold").setBackground("#eeeeee").setBorder(true,true,true,true,false,false); row++;
  if (filtered.length === 0) { sh.getRange(row, 2, 1, 3).merge().setValue("該当なし！").setFontColor("#cc0000"); return; }
  sh.getRange(row, 2, 1, 3).setValues([["日付", "氏名", "勤務帯"]]).setBackground("#d9ead3"); row++;
  filtered.sort((a,b) => toDate(a[idx.cDate]) - toDate(b[idx.cDate])).forEach(r => {
    const d = toDate(r[idx.cDate]), w = String(r[idx.cWork]||"").trim(), c = String(r[idx.cShort]||"").trim();
    let wOut = w && c ? `${withEmoji(w)} (${c})` : (w ? withEmoji(w) : c);
    sh.getRange(row, 2, 1, 3).setValues([[`${fmt(d, "M/d")}（${DAY[d.getDay()]}）`, r[idx.cName], wOut]]).setBackgrounds([[workColor(w), workColor(w), workColor(w)]]).setHorizontalAlignment("center"); row++;
  }); sh.getRange(row - filtered.length - 1, 2, filtered.length + 1, 3).setBorder(true,true,true,true,true,true);
}

function 検索をクリアする() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SEARCH_SHEET_NAME); if (!sh) return;
  sh.getRange("C4:D17").clearContent(); sh.getRange("B22:E1000").clearContent().clearFormat().clearDataValidations();
  sh.getRange("B22:D22").merge().setValue("✨ クリアしました ✨").setFontColor("#999999").setHorizontalAlignment("center");
}

function 毎朝の自動更新用() {
  メインを作る();
  SpreadsheetApp.flush();
  昨日を更新();         
  三日分まとめて更新(); 
  一週間一覧を更新();   
  並び順_メイン最後();
}

function PC用_全部まとめて更新(){
  メインを作る();
  SpreadsheetApp.flush();
  昨日を更新();
  三日分まとめて更新();
  一週間一覧を更新(); 
  全体シフト一覧を更新(); 
  シフト警告を更新(); 
  並び順_メイン最後();
}

function 全部まとめて更新() {
  PC用_全部まとめて更新();
}

function 並び順_メイン最後(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ["⏪昨日", "😊今日", "🌈明日", "🌙あさって", WEEKLY_SHEET_NAME, FULL_SHEET_NAME, SRC_SHEET_NAME, MAIN_SHEET_NAME, ALERT_SHEET_NAME, SEARCH_SHEET_NAME].forEach((name, i) => {
    const sh = ss.getSheetByName(name); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  });
  if (ss.getSheetByName("😊今日")) ss.setActiveSheet(ss.getSheetByName("😊今日")); 
}

// ==========================================
// 📝 日報出力機能（PDF保存つき）
// ==========================================

// ▼ 事務所メンバーの表示振り分け（人が入れ替わったらここを直すだけ）
const 事務グループ   = ['髙橋愉香', '羽原淳子']; // → 7行目「事務」欄に表示
const 管理者ケアマネ = ['中野博美', '大本明正']; // → 1F F列「管理者 ケアマネ」に表示

// ▼ 清掃メンバー（2人ずつ2行で表示）
const 清掃メンバー = ['小林', '宇都宮', '徳田', '中南'];

function 日報_片付けだけ() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const targets = ss.getSheets().filter(s => s.getName().indexOf("📝日報_") === 0);
  if (targets.length === 0) { ui.alert("片付ける日報はありませんでした。"); return; }
  const res = ui.alert("日報の片付け", targets.length + "枚の日報シートを削除します。よろしいですか？", ui.ButtonSet.OK_CANCEL);
  if (res !== ui.Button.OK) return;
  targets.forEach(s => ss.deleteSheet(s));
  ui.alert("✅ " + targets.length + "枚の日報を片付けました。");
}

function 日報_明後日から3日分() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  古い日報を片付け();
  let first = null;
  for (let i = 2; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const sh = 日報シートを生成する(d);
    if (sh && !first) first = sh;
  }
  if (first) ss.setActiveSheet(first);
}

function 日報_明日() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  古い日報を片付け();
  const d = new Date(); d.setDate(d.getDate() + 1);
  const sh = 日報シートを生成する(d);
  if (sh) ss.setActiveSheet(sh);
}

function 日報_日付指定() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("日報を作成する日付",
    "日付を入力してください。\n・1日だけ：  8/23\n・複数まとめて：  8/23.8/24.8/25\n（日付どうしの区切りは . ／ 過去の日付もOK）",
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const text = String(res.getResponseText()).trim();
  if (!text) { ui.alert("日付が入力されていません。"); return; }

  const pairs = [], bad = [];

  if (text.indexOf("/") !== -1 || text.indexOf("／") !== -1) {
    text.split(/[^\d\/／]+/).forEach(tok => {
      const t = tok.trim();
      if (!t) return;
      const m = t.match(/^(\d{1,2})[\/／](\d{1,2})$/);
      if (!m) { bad.push(t); return; }
      pairs.push([Number(m[1]), Number(m[2])]);
    });
  } else {
    const nums = text.split(/[^\d]+/).filter(x => x !== "").map(Number);
    if (nums.length === 0 || nums.length % 2 !== 0) {
      ui.alert("日付の数が合いません。\n「月」と「日」がペアになるように入力してください。\n例：8/23.8/24");
      return;
    }
    for (let i = 0; i < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
  }

  const dates = [];
  pairs.forEach(pr => {
    const mo = pr[0], da = pr[1];
    if (mo < 1 || mo > 12 || da < 1 || da > 31) { bad.push(mo + "/" + da); return; }
    const yr = (mo === 12) ? SHIFT_YEAR - 1 : SHIFT_YEAR;
    dates.push(new Date(yr, mo - 1, da));
  });

  if (bad.length) { ui.alert("次の入力が読み取れませんでした：\n" + bad.join("、") + "\n\n「8/23」または「8/23.8/24」の形式で入力してください。"); return; }
  if (!dates.length) { ui.alert("有効な日付がありませんでした。"); return; }

  古い日報を片付け();
  let first = null;
  dates.forEach(d => { const sh = 日報シートを生成する(d); if (sh && !first) first = sh; });
  if (first) ss.setActiveSheet(first);
}

function 古い日報を片付け() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(s => { if (s.getName().indexOf("📝日報_") === 0) ss.deleteSheet(s); });
}

// ===== 日報シート本体を生成（targetDateObj = 作りたい日のDate）=====
function 日報シートを生成する(targetDateObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  const srcSheet = ss.getSheetByName(SRC_SHEET_NAME);

  if (!mainSheet || !srcSheet) {
    SpreadsheetApp.getUi().alert('エラー: メインシートまたはシフト表が見つかりません。');
    return null;
  }

  const targetDateStr = Utilities.formatDate(targetDateObj, TZ, "yyyy/MM/dd");

  const reiwa = targetDateObj.getFullYear() - 2018;
  const displayDateStr = `令和${reiwa}年${targetDateObj.getMonth() + 1}月${targetDateObj.getDate()}日(${DAY[targetDateObj.getDay()]})`;

  const newSheetName = `📝日報_${Utilities.formatDate(targetDateObj, TZ, "MMdd")}`;

  let reportSheet = ss.getSheetByName(newSheetName);
  if (reportSheet) ss.deleteSheet(reportSheet);
  reportSheet = ss.insertSheet(newSheetName);
  ss.setActiveSheet(reportSheet);
  ss.moveActiveSheet(ss.getNumSheets());

  const data = mainSheet.getDataRange().getValues();
  const headers = data[0];
  const cDate = headers.indexOf("日付");
  const cName = headers.indexOf("氏名");
  const cFloor = headers.indexOf("階");
  const cWork = headers.indexOf("勤務帯");
  const cShort = headers.indexOf("短時間コード");

  const dailyData = data.slice(1).filter(row => {
    if (!row[cDate]) return false;
    const d = (row[cDate] instanceof Date) ? row[cDate] : new Date(String(row[cDate]).replace(/[年月日]/g,"/").replace(/\/+/g,"/"));
    if (isNaN(d)) return false;
    return Utilities.formatDate(d, TZ, "yyyy/MM/dd") === targetDateStr;
  });

  const f1 = { 明: [], 早: [], 遅: [], 日: [], 入: [] };
  const f2 = { 明: [], 早: [], 遅: [], 日: [], 入: [] };
  const f3 = { 明: [], 早: [], 遅: [], 日: [], 入: [] };
  const jimu = [];
  const kanri = [];
  const nurse = [];
  const laundry = [];

  function formatName(fullName, shortCode) {
    let n = String(fullName).trim();
    let parts = n.split(/[\s　]+/);
    let lastName = parts[0];

    if (n.includes("山本美")) lastName = "山本み";
    else if (n.includes("山本壽")) lastName = "山本壽";
    else if (n.includes("山本育")) lastName = "山本育";
    else if (n.includes("ユエン")) lastName = "ユエン";
    else if (n.includes("レイラニー")) lastName = "レイラニー";
    else if (n.includes("トゥオン")) lastName = "トゥオン";
    else if (n.includes("圓能寺")) lastName = "圓能寺";
    else if (n.includes("吉田千代美")) lastName = "千代美";
    else if (n.includes("森千絵")) lastName = "森千"; else if (n.includes("森健")) lastName = "森健";
    else if (lastName.startsWith("泉")) lastName = "泉";
    else if (lastName.startsWith("二ノ宮")) lastName = "二ノ宮";
    else if (lastName.length > 2) lastName = lastName.substring(0, 2);

    if (n.includes("(AM)")) lastName += "（AM）";
    else if (n.includes("(PM)")) lastName += "（PM）";

    return shortCode ? `${lastName}(${shortCode})` : lastName;
  }

  dailyData.forEach(row => {
    const floor = String(row[cFloor]).trim();
    const work = String(row[cWork]).trim();
    if (work.includes("有給")) return;

    const rawName = String(row[cName]).replace(/\(AM\)|\(PM\)/g, "").replace(/\(20\)/g, "").trim();
    const nameStr = formatName(row[cName], String(row[cShort]).trim());

    if (floor.includes("1階"))      振り分け(f1, work, nameStr);
    else if (floor.includes("2階")) 振り分け(f2, work, nameStr);
    else if (floor.includes("3階")) 振り分け(f3, work, nameStr);
    else if (floor.includes("事務所")) {
      if (事務グループ.some(m => rawName.includes(m)))        jimu.push(nameStr);
      else if (管理者ケアマネ.some(m => rawName.includes(m))) kanri.push(nameStr);
      else jimu.push(nameStr);
    }
    else if (floor.includes("看護師")) nurse.push(nameStr);
    else if (floor.includes("洗濯"))   laundry.push(nameStr);
  });

  function 振り分け(targetMap, work, name) {
    if (work.includes("明")) targetMap.明.push(name);
    else if (work.includes("早")) targetMap.早.push(name);
    else if (work.includes("遅")) targetMap.遅.push(name);
    else if (work.includes("入")) targetMap.入.push(name);
    else targetMap.日.push(name);
  }

  const srcData = srcSheet.getDataRange().getValues();
  let targetCol = -1;
  for (let c = 1; c < srcData[0].length; c++) {
    if (convertDateFromShift(srcData[0][c]) === targetDateStr) { targetCol = c; break; }
  }

  // 🛁 入浴（通常／⚠️振替／オムツ補充 を整理して表示）
  const bath = 入浴欄の文字を作る(入浴情報を読む(targetDateStr, srcData));

  // 洗濯（シフト表の「洗濯」行をその日ぶん直接読む）
  if (targetCol !== -1) {
    for (let r = 0; r < srcData.length; r++) {
      if (String(srcData[r][0]).trim() === "洗濯") {
        const cell = String(srcData[r][targetCol] || "").trim();
        if (cell) cell.split(/[\/／]/).forEach(nm => { const t = nm.trim(); if (t) laundry.push(formatName(t, "")); });
        break;
      }
    }
  }

  // 厨房（朝食・昼食・夕食）
  const asaSet = new Set(), hiruSet = new Set(), yuSet = new Set();
  const kitchenSheet = ss.getSheetByName(KITCHEN_SHEET_NAME);
  if (kitchenSheet) {
    const kv = kitchenSheet.getDataRange().getValues();
    const kDate = (v) => {
      if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy/MM/dd");
      const str = String(v).trim();
      const m = str.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (m) { const mo = Number(m[1]); const yr = (mo === 12) ? SHIFT_YEAR - 1 : SHIFT_YEAR; return `${yr}/${("0"+mo).slice(-2)}/${("0"+Number(m[2])).slice(-2)}`; }
      return convertDateFromShift(v);
    };
    let kCol = -1;
    for (let c = 0; c < kv[0].length && kCol === -1; c++) {
      for (let r = 0; r < Math.min(5, kv.length); r++) {
        if (kDate(kv[r][c]) === targetDateStr) { kCol = c; break; }
      }
    }
    if (kCol !== -1) {
      let curName = "";
      for (let r = 0; r < kv.length; r++) {
        const aVal = String(kv[r][0]).trim();
        if (aVal === "氏名") continue;
        if (aVal) curName = aVal;
        if (!curName) continue;
        let raw = String(kv[r][kCol]).replace(/[\s　\n\r]+/g, "");
        if (!raw) continue;
        raw = raw.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
        raw.split(/[\/／]/).forEach(code => {
          const c = code.trim();
          if (!c || c === "999") return;
          const nm = formatName(curName, "");
          if (c === "61") asaSet.add(nm);
          else if (c === "81") yuSet.add(nm);
          else hiruSet.add(nm);
        });
      }
    }
  }
  const asa = [...asaSet], hiru = [...hiruSet], yu = [...yuSet];

  // --- レイアウト描画 ---
  reportSheet.setHiddenGridlines(true);
  for (let i = 1; i <= 6; i++) reportSheet.setColumnWidth(i, 200);
  reportSheet.getRange(1, 1, 40, 6).setFontFamily("Noto Sans JP").setVerticalAlignment("middle");

  // ヘッダー（左：日付、右：カギ表）
  reportSheet.getRange(2, 1, 2, 3).merge().setValue(displayDateStr).setFontSize(26).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  reportSheet.getRange(4, 1, 2, 3).merge().setValue("レザミ鶴見緑地 業務日誌").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");

  reportSheet.getRange(2, 4, 1, 3).setValues([["階", "カギ", "PHS"]]).setBackground("#eeeeee").setFontWeight("bold").setHorizontalAlignment("center").setFontSize(14);
  const keyTable = [
    ["1階", "1 / 2 / 3", "102 / 103"],
    ["2階", "4 / 5 / 6", "101 / 104 / 105"],
    ["3階", "7 / 8 / 9", "106 / 108"]
  ];
  reportSheet.getRange(3, 4, 3, 3).setValues(keyTable).setHorizontalAlignment("center").setFontSize(14);
  reportSheet.getRange(2, 4, 4, 3).setBorder(true, true, true, true, true, true);
  for (let r = 1; r <= 5; r++) reportSheet.setRowHeight(r, 28);
  reportSheet.setRowHeight(6, 10);

  // 事務・食事・洗濯・清掃（★横並びにして高さを節約）
  reportSheet.getRange(7, 1, 1, 6).setValues([["事務", "朝食", "昼食", "夕食", "洗濯", "清掃"]]).setBackground("#eeeeee").setFontWeight("bold").setHorizontalAlignment("center").setFontSize(12);
  const cleanNames = 清掃メンバー.slice(0, 2).join("・") + (清掃メンバー.length > 2 ? "\n" + 清掃メンバー.slice(2).join("・") : "");
  reportSheet.getRange(8, 1, 1, 6)
    .setValues([[jimu.join("・"), asa.join("・"), hiru.join("・"), yu.join("・"), laundry.join("・"), cleanNames]])
    .setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(14).setWrap(true);
  reportSheet.getRange(7, 1, 2, 6).setBorder(true, true, true, true, true, true);
  reportSheet.setRowHeight(7, 28);
  reportSheet.setRowHeight(8, 52);
  reportSheet.setRowHeight(9, 10);

  // 各階ブロック
  //   col6Mode = 'free'   → F列の名前の下を「2人目用の記入欄」にする（1F・2F）
  //   col6Mode = 'merged' → F列を4行ぶん結合して1つの欄にする（3F入浴）
  function drawFloorBlock(startRow, color, headers, namesData, col6Data, col6Mode) {
    reportSheet.getRange(startRow, 1, 1, 6).setValues([headers]).setBackground(color).setFontWeight("bold").setHorizontalAlignment("center").setFontSize(11);
    reportSheet.setRowHeight(startRow, 32);

    // 名前（大きさはそのまま・名前の間の空行なし）
    reportSheet.getRange(startRow + 1, 1, 1, 5).setValues([namesData])
      .setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(25).setFontWeight("bold").setWrap(true);
    reportSheet.setRowHeight(startRow + 1, 90);

    const checks = [
      ["  PHS             /   "],
      ["  鍵               /   "],
      ["  iPad            /   "]
    ];
    for (let c = 1; c <= 5; c++) {
      reportSheet.getRange(startRow + 2, c, 3, 1).setValues(checks).setHorizontalAlignment("left").setFontSize(14);
    }
    for (let r = 2; r <= 4; r++) reportSheet.setRowHeight(startRow + r, 84);

    if (col6Mode === 'free') {
      // 上：管理者・看護師の名前
      reportSheet.getRange(startRow + 1, 6).setValue(col6Data)
        .setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(18).setWrap(true);
      // 下：2人目用の記入欄（ほかの列と同じ高さ）
      const freeChecks = [
        ["  名前＿＿＿＿＿＿\n  PHS             /   "],
        ["  鍵               /   "],
        ["  iPad            /   "]
      ];
      reportSheet.getRange(startRow + 2, 6, 3, 1).setValues(freeChecks)
        .setHorizontalAlignment("left").setVerticalAlignment("middle").setFontSize(14).setWrap(true);
    } else {
      reportSheet.getRange(startRow + 1, 6, 4, 1).merge().setValue(col6Data)
        .setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(18).setWrap(true);
    }
    reportSheet.getRange(startRow, 1, 5, 6).setBorder(true, true, true, true, true, true);
  }

  drawFloorBlock(10, "#cfe2f3",
    ["1F 夜勤明", "1F 早出", "1F 遅出", "1F 日勤その他", "1F 夜勤入", "事務 管理者 ケアマネ"],
    [f1.明.join("\n"), f1.早.join("\n"), f1.遅.join("\n"), f1.日.join("\n"), f1.入.join("\n")],
    kanri.join("\n"), 'free'
  );
  reportSheet.setRowHeight(15, 10);

  drawFloorBlock(16, "#f4cccc",
    ["2F 夜勤明", "2F 早出", "2F 遅出", "2F 日勤その他", "2F 夜勤入", "看護師(PHS: 107)"],
    [f2.明.join("\n"), f2.早.join("\n"), f2.遅.join("\n"), f2.日.join("\n"), f2.入.join("\n")],
    nurse.join("\n"), 'free'
  );
  reportSheet.setRowHeight(21, 10);

  drawFloorBlock(22, "#d9ead3",
    ["3F 夜勤明", "3F 早出", "3F 遅出", "3F 日勤その他", "3F 夜勤入", "入浴"],
    [f3.明.join("\n"), f3.早.join("\n"), f3.遅.join("\n"), f3.日.join("\n"), f3.入.join("\n")],
    "", 'merged'
  );
  // ★入浴を目立たせる
  reportSheet.getRange(22, 6).setFontSize(13).setBackground("#ffd966");
  const bathCell = reportSheet.getRange(23, 6, 4, 1);
  bathCell.setBackground("#fff2cc").setFontSize(18).setFontWeight("bold").setVerticalAlignment("top");
  if (bath.text) {
    const red = SpreadsheetApp.newTextStyle().setForegroundColor("#cc0000").build();
    const rb = SpreadsheetApp.newRichTextValue().setText(bath.text);
    bath.redRanges.forEach(rg => rb.setTextStyle(rg[0], rg[1], red));
    reportSheet.getRange(23, 6).setRichTextValue(rb.build());
  }
  reportSheet.setRowHeight(27, 10);

  // 備考／申し送り（🩺往診・📌行事・🎈レク。入浴・オムツは入浴欄に出すのでここには出さない）
  const events = getEventsForDate(targetDateStr, srcData, false);

  reportSheet.getRange(28, 1, 1, 6).merge().setValue("■ 備考 / 申し送り")
    .setFontWeight("bold").setBackground("#eeeeee").setFontSize(12).setHorizontalAlignment("left");
  reportSheet.setRowHeight(28, 28);

  const evText = events.join("\n");
  reportSheet.getRange(29, 1, 1, 6).merge().setValue(evText)
    .setFontWeight("bold").setFontSize(25).setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true);
  reportSheet.setRowHeight(29, events.length ? 12 + events.length * 40 : 26);

  // 手書きスペース（あまり使わないので控えめに）
  reportSheet.getRange(30, 1, 7, 6).merge().setValue("");
  for (let r = 30; r <= 36; r++) reportSheet.setRowHeight(r, 9);

  reportSheet.getRange(28, 1, 1, 6).setBorder(true, true, true, true, false, false);
  reportSheet.getRange(29, 1, 1, 6).setBorder(true, true, false, true, false, false);
  reportSheet.getRange(30, 1, 7, 6).setBorder(false, true, true, true, true, true);

  // ★余分な行・列を削除して印刷を1ページに
  const maxR = reportSheet.getMaxRows();
  const maxC = reportSheet.getMaxColumns();
  if (maxC > 6) reportSheet.deleteColumns(7, maxC - 6);
  if (maxR > 36) reportSheet.deleteRows(37, maxR - 36);

  return reportSheet;
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu("📋シフト出力")
    .addItem("シフト表→メイン","メインを作る")
    .addItem("⏪昨日を更新","昨日を更新")
    .addItem("三日分まとめて更新","三日分まとめて更新")
    .addItem("📅1週間一覧を更新","一週間一覧を更新")
    .addItem("💻全体シフト一覧を更新(PC用)","全体シフト一覧を更新")
    .addItem("🚨シフト警告を更新(管理者用)","シフト警告を更新")
    .addItem("📢シフト変更をポータルへ","シフト変更をポータルへ")
    .addSeparator()
    .addItem("📝明日","日報_明日")
    .addItem("📝明後日から3日分","日報_明後日から3日分")
    .addItem("📝日付を指定して作成","日報_日付指定")
    .addItem("🗑️日報を片付け","日報_片付けだけ")
    .addSeparator()
    .addItem("🔍選んだ条件で検索！","予定を検索する")
    .addItem("🧹検索結果をクリア！","検索をクリアする")
    .addSeparator()
    .addItem("全部まとめて更新（手動用）","PC用_全部まとめて更新")
    .addToUi();
}

function onEdit(e) {
  if (!e || e.range.getSheet().getName() !== SEARCH_SHEET_NAME) return;
  const r = e.range.getRow(), c = e.range.getColumn(), val = e.range.getValue();
  if (c === 5 && val === true) {
    if (r === 20) 予定を検索する(); 
    else if (r === 21) 検索をクリアする(); 
    else if (r === 22) 毎朝の自動更新用(); 
    e.range.setValue(false); }
  }
  // ==========================================
// 📢 シフト変更をポータルへ
//   「メインを作る」のたびに前回との違いを「📢シフト送信待ち」にためる。
//   メニュー「📢シフト変更をポータルへ」で送るものを選び、1枚の付箋にして掲示板へ。
// ==========================================
const PORTAL_SPREADSHEET_ID = '1lGMGmxPkNxoAKjnyVY90BW8LmV24p9SZ3uOoIgwRifs';
const PORTAL_SHIFT_SHEET    = 'シフト変更連携';   // ポータル側に作るタブ
const SHIFT_QUEUE_SHEET     = '📢シフト送信待ち'; // こちら側にためるタブ
const SHIFT_SNAP_SHEET      = '📢シフト前回';     // 前回の状態（非表示）
const SHIFT_MAIL_TO         = 'lesamis.style.tsurumi@gmail.com';
const SHIFT_MAIL_SUBJECT    = '【重要】掲示板が更新されました';
const SHIFT_MAIL_BODY       = '掲示板が更新されました。';
const H_SHIFT_QUEUE = ['ID', '状態', 'キー', '日付', '前', '後', '記録日時', '送信日時', '送信者'];
const FLOOR_SHORT = { '1階': '1F', '2階': '2F', '3階': '3F', '事務所': '事務所', '看護師': '看護', '洗濯': '洗濯' };
const SEG_ORDER   = ['全階(F)', '1F', '2F', '3F', '事務所', '看護', '洗濯'];
// 🩺にする病院名（行事欄）
const CLINIC_WORDS = ['T内科', '天六メンタルCL', '秋桜会CL精神科', '谷町眼科'];

function segRank_(fl) { const i = SEG_ORDER.indexOf(fl); return i < 0 ? 99 : i; }

// 日報と同じ短い名前
function 短い名前_(fullName) {
  const n = String(fullName).replace(/\(AM\)|\(PM\)|\(20\)/g, '').trim();
  let s = n.split(/[\s　]+/)[0];
  if (n.includes("山本美")) s = "山本み";
  else if (n.includes("山本壽")) s = "山本壽";
  else if (n.includes("山本育")) s = "山本育";
  else if (n.includes("ユエン")) s = "ユエン";
  else if (n.includes("レイラニー")) s = "レイラニー";
  else if (n.includes("トゥオン")) s = "トゥオン";
  else if (n.includes("圓能寺")) s = "圓能寺";
  else if (n.includes("吉田千代美")) s = "千代美";
  else if (n.includes("森千絵")) s = "森千"; else if (n.includes("森健")) s = "森健";
  else if (s.startsWith("泉")) s = "泉";
  else if (s.startsWith("二ノ宮")) s = "二ノ宮";
  else if (s.length > 2) s = s.substring(0, 2);
  return s;
}

// 入浴欄を1つの言葉にする
function 入浴の一言_(f, dow) {
  const ex = f.extra ? `（${f.extra}）` : '';
  if (f.type === 'omutsu') return 'オムツ補充（入浴なし）';
  if (f.type === 'normal') return `${f.day}曜の方${ex}`;
  if (f.type === 'irregular') return (dow === 0 ? `⚠️入浴あり ${f.day}曜の方` : `⚠️振替 ${f.day}曜の方`) + ex;
  if (f.type === 'other') return f.raw;
  return '';
}

// 今の状態を「キー → 中身」の形にする
//   S|日付|氏名 → 「1F 早出／2F 遅出」   ※有給・休みは入れない（＝休み）
//   E|日付|行事・レク・入浴1F〜3F
//   D|日付 → その日がシフト表にあるかどうか
function シフト状態を作る_(output, values) {
  const st = {};
  const dates = Object.values(findDateColumns(values));
  dates.forEach(d => { st['D|' + d] = '1'; });

  const segs = {};
  output.forEach(r => {
    const duty = String(r[3] || '').trim();
    if (duty.includes('有給')) return;
    const rawName = String(r[1]);
    const base = rawName.replace(/\(AM\)|\(PM\)|\(20\)/g, '').trim();
    const ap = rawName.includes('(AM)') ? '(AM)' : (rawName.includes('(PM)') ? '(PM)' : '');
    const floorRaw = String(r[2]).trim();
    const fl = FLOOR_SHORT[floorRaw] || floorRaw;
    const code = String(r[4] || '').trim();
    const body = (duty ? duty + (code ? '(' + code + ')' : '') : code) + ap;
    const k = 'S|' + r[0] + '|' + base;
    (segs[k] = segs[k] || []).push({ fl: fl, body: body });
  });
  Object.keys(segs).forEach(k => {
    const byBody = {};
    segs[k].forEach(x => { (byBody[x.body] = byBody[x.body] || []).push(x.fl); });
    const out = [];
    Object.keys(byBody).forEach(b => {
      let fls = byBody[b];
      if (['1F', '2F', '3F'].every(f => fls.includes(f))) {   // F（フリー）は1つにまとめる
        out.push({ fl: '全階(F)', body: b });
        fls = fls.filter(f => !['1F', '2F', '3F'].includes(f));
      }
      fls.forEach(f => out.push({ fl: f, body: b }));
    });
    out.sort((a, b) => (segRank_(a.fl) - segRank_(b.fl)) || (a.body < b.body ? -1 : (a.body > b.body ? 1 : 0)));
    st[k] = [...new Set(out.map(x => (x.fl + ' ' + x.body).trim()))].join('／');
  });

  dates.forEach(d => {
    const ev = getEventsForDate(d, values, false);
    const gyo = ev.filter(e => !e.startsWith('🎈'));
    const rec = ev.filter(e => e.startsWith('🎈')).map(e => e.replace(/^🎈 レク：/, ''));
    if (gyo.length) st['E|' + d + '|行事'] = gyo.join('・');
    if (rec.length) st['E|' + d + '|レク'] = rec.join('・');
    const bath = 入浴情報を読む(d, values);
    bath.floors.forEach(f => {
      const t = 入浴の一言_(f, bath.dow);
      if (t) st['E|' + d + '|入浴' + f.fl] = t;
    });
  });
  return st;
}

function 前回の状態を読む_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHIFT_SNAP_SHEET);
  if (!sh || sh.getLastRow() < 1) return null;
  const st = {};
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(r => { if (r[0] !== '') st[String(r[0])] = String(r[1]); });
  return st;
}

function 今の状態を保存_(st) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHIFT_SNAP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHIFT_SNAP_SHEET, ss.getNumSheets());
    sh.getRange('A:B').setNumberFormat('@');
    sh.hideSheet();
  }
  sh.clearContents();
  const rows = Object.keys(st).map(k => [k, st[k]]);
  if (!rows.length) return;
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}

function 送信待ちシート_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHIFT_QUEUE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHIFT_QUEUE_SHEET, ss.getNumSheets());
    sh.getRange('A:I').setNumberFormat('@');
    sh.getRange(1, 1, 1, H_SHIFT_QUEUE.length).setValues([H_SHIFT_QUEUE]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 前回との違いを見つけて、送信待ちにためる
function シフト変更を記録する_(output, values) {
  if (!output || !output.length) return; // シフト表が読めなかったときは何もしない
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return;
  try {
    const cur = シフト状態を作る_(output, values);
    const prev = 前回の状態を読む_();
    if (prev) {
      const today = ymd(new Date());
      const keys = {};
      Object.keys(prev).concat(Object.keys(cur)).forEach(k => { if (!k.startsWith('D|')) keys[k] = 1; });
      const changes = [];
      Object.keys(keys).forEach(k => {
        const d = k.split('|')[1];
        if (d < today) return;                               // 過去の日付は出さない
        if (!prev['D|' + d] || !cur['D|' + d]) return;       // 新しく入った日（翌月分など）は出さない
        const a = prev[k] || '', b = cur[k] || '';
        if (a !== b) changes.push({ key: k, date: d, before: a, after: b });
      });
      if (changes.length) 送信待ちに入れる_(changes);
    }
    今の状態を保存_(cur);
  } finally {
    lock.releaseLock();
  }
  try {
    const n = 送信待ちの件数_();
    if (n) SpreadsheetApp.getActive().toast(`シフト変更が ${n} 件たまっています。メニュー「📢シフト変更をポータルへ」から送れます。`, '📢 シフト変更', 8);
  } catch (e) {}
}

// 同じ人・同じ日の「待ち」があれば1件にまとめる（元に戻ったら取消）
function 送信待ちに入れる_(changes) {
  const sh = 送信待ちシート_();
  const nowStr = fmt(new Date(), 'yyyy/MM/dd HH:mm');
  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, 9).getValues() : [];
  const pending = {};
  vals.forEach((v, i) => { if (String(v[1]) === '待ち') pending[String(v[2])] = i; });
  const add = [];
  changes.forEach(c => {
    const i = pending[c.key];
    if (i !== undefined) {
      vals[i][5] = c.after;
      vals[i][6] = nowStr;
      if (String(vals[i][4]) === c.after) vals[i][1] = '取消';
    } else {
      add.push([Utilities.getUuid(), '待ち', c.key, c.date, c.before, c.after, nowStr, '', '']);
    }
  });
  if (vals.length) sh.getRange(2, 1, vals.length, 9).setValues(vals);
  if (add.length) {
    const need = sh.getLastRow() + add.length;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(sh.getLastRow() + 1, 1, add.length, 9).setValues(add);
  }
}

function 送信待ちの件数_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHIFT_QUEUE_SHEET);
  if (!sh || sh.getLastRow() < 2) return 0;
  const today = ymd(new Date());
  return sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues()
    .filter(v => String(v[0]) === '待ち' && String(v[2]) >= today).length;
}

// 1行ぶんの表示を作る
function 行_(ids, date, order, text, flText) {
  const d = toDate(date);
  const floors = [];
  String(flText).replace(/([1-3])F/g, (m, n) => { if (!floors.includes(n)) floors.push(n); return m; });
  const other = /全階|事務所|看護|洗濯/.test(flText) || !floors.length;
  return { ids: ids, date: date, label: `${fmt(d, 'M/d')}(${DAY[d.getDay()]})`, order: order, text: text, floors: floors, other: other };
}

// 送信待ちの行を、画面・付箋に出す文にする（入れ替えは1行にまとめる）
function 送信待ちを行にする_(rows) {
  const items = [];
  const used = {};
  const shifts = rows.filter(r => r.key.startsWith('S|'));
  shifts.forEach((a, i) => {
    if (used[a.id]) return;
    for (let j = i + 1; j < shifts.length; j++) {
      const b = shifts[j];
      if (used[b.id] || a.date !== b.date) continue;
      if (a.before === b.after && a.after === b.before && a.before !== a.after) {
        used[a.id] = used[b.id] = true;
        const na = 短い名前_(a.key.split('|')[2]), nb = 短い名前_(b.key.split('|')[2]);
        items.push(行_([a.id, b.id], a.date, 1,
          `⇄ ${na} ${a.before || '休み'} と ${nb} ${b.before || '休み'} が入れ替え`, a.before + '／' + b.before));
        break;
      }
    }
  });
  rows.forEach(r => {
    if (used[r.id]) return;
    const p = r.key.split('|');
    const bf = r.before, af = r.after;
    if (p[0] === 'S') {
      items.push(行_([r.id], r.date, 1, `${短い名前_(p[2])}：${bf || '休み'} → ${af || '休み'}`, bf + '／' + af));
    } else if (p[2] === '行事') {
      items.push(行_([r.id], r.date, 2, `行事：${bf || '（なし）'} → ${af || '（なし）'}`, ''));
    } else if (p[2] === 'レク') {
      items.push(行_([r.id], r.date, 3, `🎈 レク：${bf || '（なし）'} → ${af || '（なし）'}`, ''));
    } else {
      const f = p[2].replace('入浴', '');
      items.push(行_([r.id], r.date, 4, `🛁 ${f}入浴：${bf || '（なし）'} → ${af || '（なし）'}`, f));
    }
  });
  const rank = it => it.floors.length ? Number(it.floors[0]) : 9;
  items.sort((a, b) =>
    (a.date < b.date ? -1 : (a.date > b.date ? 1 : 0)) ||
    (a.order - b.order) || (rank(a) - rank(b)) ||
    (a.text < b.text ? -1 : (a.text > b.text ? 1 : 0)));
  return items;
}

// 付箋の中身
function シフト付箋を作る_(items) {
  const lines = ['シフト変更 ' + items.length + '件'];
  let cur = '', expiry = '', other = false;
  const floors = [];
  items.forEach(it => {
    if (it.date !== cur) { cur = it.date; lines.push('■ ' + it.label); }
    lines.push(it.text);
    it.floors.forEach(f => { if (!floors.includes(f)) floors.push(f); });
    if (it.other) other = true;
    if (it.date > expiry) expiry = it.date;
  });
  return {
    content: lines.join('\n').replace(/</g, '＜').replace(/>/g, '＞'),
    floor: (!other && floors.length === 1) ? floors[0] : '全体',
    expiry: expiry   // 一番遅い変更日まで表示
  };
}

function ポータルに書く_(sender, floor, content, expiry) {
  const pss = SpreadsheetApp.openById(PORTAL_SPREADSHEET_ID);
  let sh = pss.getSheetByName(PORTAL_SHIFT_SHEET);
  if (!sh) {
    sh = pss.insertSheet(PORTAL_SHIFT_SHEET, pss.getNumSheets());
    sh.getRange(1, 1, 1, 7).setValues([['タイムスタンプ', '報告者', '対象の階', '内容', '表示期限', '完了', '写真']]);
    sh.setFrozenRows(1);
  }
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 4, 1, 2).setNumberFormat('@');
  sh.getRange(row, 1, 1, 5).setValues([[new Date(), sender, floor, content, expiry]]);
}

// ▼ メニューから開く
function シフト変更をポータルへ() {
  const html = HtmlService.createHtmlOutputFromFile('ShiftSend').setWidth(680).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, '📢 シフト変更をポータルへ');
}

// ▼ 画面から呼ぶ：送信待ちの一覧
function getShiftQueue() {
  const res = { items: [], sender: PropertiesService.getUserProperties().getProperty('shiftSender') || '' };
  const sh = SpreadsheetApp.getActive().getSheetByName(SHIFT_QUEUE_SHEET);
  if (!sh || sh.getLastRow() < 2) return res;
  const today = ymd(new Date());
  const n = sh.getLastRow() - 1;
  const vals = sh.getRange(2, 1, n, 9).getValues();
  let expired = false;
  const rows = [];
  vals.forEach(v => {
    if (String(v[1]) !== '待ち') return;
    if (String(v[3]) < today) { v[1] = '期限切れ'; expired = true; return; }
    rows.push({ id: String(v[0]), key: String(v[2]), date: String(v[3]), before: String(v[4]), after: String(v[5]) });
  });
  if (expired) sh.getRange(2, 2, n, 1).setValues(vals.map(v => [v[1]]));
  res.items = 送信待ちを行にする_(rows);
  return res;
}

// ▼ 画面から呼ぶ：チェックした分を1枚の付箋にして送る／外した分は「送らない」
function sendShiftToPortal(sendIds, skipIds, sender) {
  sender = String(sender || '').trim();
  const sendSet = {}, skipSet = {};
  (sendIds || []).forEach(x => { sendSet[String(x)] = true; });
  (skipIds || []).forEach(x => { skipSet[String(x)] = true; });
  if (Object.keys(sendSet).length && !sender) throw new Error('送る人の名前を入れてください。');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) throw new Error('いま更新中です。少し待ってからもう一度お試しください。');
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHIFT_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return { sent: 0, skipped: 0, mailError: '' };
    const n = sh.getLastRow() - 1;
    const vals = sh.getRange(2, 1, n, 9).getValues();
    const nowStr = fmt(new Date(), 'yyyy/MM/dd HH:mm');
    const toSend = [];
    let skipped = 0;
    vals.forEach(v => {
      if (String(v[1]) !== '待ち') return;
      const id = String(v[0]);
      if (sendSet[id]) {
        toSend.push({ id: id, key: String(v[2]), date: String(v[3]), before: String(v[4]), after: String(v[5]) });
        v[1] = '送信済'; v[7] = nowStr; v[8] = sender;
      } else if (skipSet[id]) {
        skipped++;
        v[1] = '送らない'; v[7] = nowStr; v[8] = sender;
      }
    });
    let sentCount = 0, mailError = '';
    if (toSend.length) {
      const items = 送信待ちを行にする_(toSend);
      const note = シフト付箋を作る_(items);
      ポータルに書く_(sender, note.floor, note.content, note.expiry); // 失敗したらここで止まる（状態は変えない）
      sentCount = items.length;
    }
    if (toSend.length || skipped) sh.getRange(2, 1, n, 9).setValues(vals);
    if (sender) PropertiesService.getUserProperties().setProperty('shiftSender', sender);
    if (toSend.length) {
      try { GmailApp.sendEmail(SHIFT_MAIL_TO, SHIFT_MAIL_SUBJECT, SHIFT_MAIL_BODY); }
      catch (e) { mailError = String(e && e.message ? e.message : e); }
    }
    return { sent: sentCount, skipped: skipped, mailError: mailError };
  } finally {
    lock.releaseLock();
  }
}
