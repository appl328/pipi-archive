'use strict';
const $ = selector => document.querySelector(selector);
let db, entries = [], page = 0, selected = 0, editing = null, deleted = null, pendingBackup = null, busy = false;
const MAX_IMAGE = 20 * 1024 * 1024;
const urls = new Map();
let noticeTimer;
function hideNotice() { clearTimeout(noticeTimer); $('#status').hidden = true; }
function notify(message, undo = false) {
  clearTimeout(noticeTimer);
  $('#status span').textContent = message;
  $('#undo').hidden = !undo;
  $('#status').hidden = false;
  noticeTimer = setTimeout(hideNotice, undo ? 6000 : 3000);
}
function fail(error) { console.error(error); notify(error.name === 'QuotaExceededError' ? '저장 공간이 부족함 · 먼저 백업한 뒤 공간을 확보해 주세요' : '작업하지 못했음 · ' + error.message); }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function updateMonth() { const date = today(); $('#month-title').textContent = Number(date.slice(5,7))+'월의 조각들'; $('#month-label').textContent = date.slice(0,7).replace('-', '. '); $('.issue').textContent = $('#month-label').textContent; }
function validDate(s) { if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s+'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0,10) === s; }
function connect() { return new Promise((resolve,reject) => { const request = indexedDB.open('pipi-archive',1); request.onupgradeneeded = () => request.result.createObjectStore('records',{keyPath:'id'}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => notify('다른 탭의 사진첩을 닫고 다시 열어 주세요'); }); }
function transaction(mode, action) { return new Promise((resolve,reject) => { const tx = db.transaction('records',mode); const request = action(tx.objectStore('records')); tx.oncomplete = () => resolve(request?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('저장이 취소됨')); }); }
async function refresh() { entries = await transaction('readonly',store => store.getAll()); entries.sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)); for(const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); render(); }
function imageURL(e) { if(!urls.has(e.id)) urls.set(e.id,URL.createObjectURL(e.image)); return urls.get(e.id); }
function render() { for(const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); const total = Math.max(1,Math.ceil(entries.length/4)); page = Math.max(0,Math.min(page,total-1)); $('#grid').replaceChildren(); if(!entries.length) { const empty = document.createElement('div'); empty.className='empty'; empty.innerHTML='<span>아직 비어 있는 첫 페이지</span><p>피피의 사진과 한마디를 넣어 주세요</p>'; $('#grid').append(empty); }
entries.slice(page*4,page*4+4).forEach((e,i) => { const card = document.createElement('button'); card.className='card'; card.innerHTML='<div class="photo"><img alt="피피 사진"></div><span class="caption"></span><time></time>'; card.querySelector('img').src=imageURL(e); card.querySelector('.caption').textContent=e.text || '사진으로 남긴 하루'; card.querySelector('time').textContent=e.date.replaceAll('-','. '); card.onclick=()=>openEntry(page*4+i); $('#grid').append(card); }); $('#page').textContent=`${page+1} / ${total}`; $('#prev').disabled=page===0; $('#next').disabled=page===total-1; $('#entry-total').textContent=entries.length; }
function openEntry(index) { selected=index; const e=entries[index]; if(!e)return; $('#large').src=imageURL(e); $('#message').textContent=e.text; $('#date').value=e.date; $('#count').textContent=`${index+1} / ${entries.length}`; $('#back').disabled=index===0; $('#forward').disabled=index===entries.length-1; if(!$('#viewer').open)$('#viewer').showModal(); }
function move(delta){ if(!busy && selected+delta>=0 && selected+delta<entries.length)openEntry(selected+delta); }
async function run(action) { if(busy)return; busy=true; try { await action(); } catch(e) { fail(e); } finally {busy=false;} }
async function checkImage(blob) { if(!['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type))throw new Error('PNG, JPG, WebP, GIF 사진을 사용해 주세요'); if(blob.size>MAX_IMAGE)throw new Error('사진 한 장은 20MB 이하여야 함'); const url=URL.createObjectURL(blob); try { const img=new Image(); img.src=url; await img.decode(); if(!img.naturalWidth)throw new Error('읽을 수 없는 사진'); } finally { URL.revokeObjectURL(url); } }
function compose(entry=null) { editing=entry; $('#composer form').reset(); $('#form-error').textContent=''; $('#form-title').textContent=entry?'기록 수정':'새로운 피피의 하루'; $('#photo-label').hidden=!!entry; $('#upload').required=!entry; $('#new-message').value=entry?.text || ''; $('#new-date').value=entry?.date || today(); $('#composer').showModal(); }
$('#add').onclick=()=>compose(); $('#cancel').onclick=()=>$('#composer').close(); $('.close').onclick=()=>$('#viewer').close(); $('#edit').onclick=()=>{const e=entries[selected];$('#viewer').close();compose(e);};
$('#composer form').onsubmit=async event=>{ event.preventDefault(); if(busy)return; busy=true; $('#save').disabled=true; try { const date=$('#new-date').value; if(!validDate(date))throw new Error('올바른 날짜를 입력해 주세요'); const image=editing?.image || $('#upload').files[0]; if(!image)throw new Error('사진을 선택해 주세요'); if(!editing)await checkImage(image); const entry={id:editing?.id || crypto.randomUUID(),createdAt:editing?.createdAt || new Date().toISOString(),date,text:$('#new-message').value,image}; await transaction('readwrite',s=>s.put(entry)); page=0; await refresh(); $('#composer').close(); notify('기록을 저장함'); }catch(e){$('#form-error').textContent=e.name==='QuotaExceededError'?'저장 공간이 부족함 · 백업 후 공간을 확보해 주세요':e.message;}finally{busy=false;$('#save').disabled=false;} };
$('#date').onchange=()=>run(async()=>{const original=entries[selected];const date=$('#date').value;if(!validDate(date)){$('#date').value=original.date;throw new Error('올바른 날짜를 입력해 주세요');}try{await transaction('readwrite',s=>s.put({...original,date}));await refresh();openEntry(entries.findIndex(e=>e.id===original.id));}catch(e){$('#date').value=original.date;throw e;}});
$('#delete-entry').onclick=()=>run(async()=>{ const entry=entries[selected]; await transaction('readwrite',s=>s.delete(entry.id)); deleted=entry; $('#viewer').close(); await refresh(); notify('기록을 삭제함',true); });
$('#undo').onclick=()=>run(async()=>{if(!deleted)return;await transaction('readwrite',s=>s.put(deleted));deleted=null;await refresh();notify('삭제한 기록을 복원함');}); $('#dismiss').onclick=hideNotice;
$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};$('#back').onclick=()=>move(-1);$('#forward').onclick=()=>move(1);
document.addEventListener('keydown',e=>{if($('#viewer').open && !['INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName)){if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1);}});
let touch; $('#large').addEventListener('touchstart',e=>{touch=[e.changedTouches[0].clientX,e.changedTouches[0].clientY];},{passive:true});$('#large').addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);touch=null;},{passive:true});
function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
$('#export').onclick=()=>run(async()=>{
  backupProgress('백업 만드는 중');
  const keys=await transaction('readonly',s=>s.getAllKeys());
  const parts=[new Blob(['{"format":"pipi-archive","version":1,"exportedAt":'+JSON.stringify(new Date().toISOString())+',"records":['])];
  for(let i=0;i<keys.length;i++){
    const e=await transaction('readonly',s=>s.get(keys[i]));
    if(!e)throw new Error('백업 중 기록이 변경됨 다시 시도해 주세요');
    parts.push(new Blob([(i?',':'')+JSON.stringify({...e,image:await dataURL(e.image)})]));
    backupProgress(`백업 만드는 중 · ${i+1} / ${keys.length}`);
    await new Promise(r=>setTimeout(r,0));
  }
  parts.push(new Blob([']}']));
  const url=URL.createObjectURL(new Blob(parts,{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`PIPI-ARCHIVE-backup-${today()}-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notify(`${keys.length}개 기록의 백업 다운로드를 시작함`);
});
// Read legacy JSON backups incrementally. Never materialize the entire file.
async function* backupRecords(file, chunkSize = 256 * 1024) {
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let prefix='', tail='', started=false, ended=false, phase='first', depth=0, quoted=false, escaped=false, parts=[];
  for(let offset=0;offset<file.size;offset+=chunkSize){
    let chunk=decoder.decode(await file.slice(offset,offset+chunkSize).arrayBuffer(),{stream:offset+chunkSize<file.size});
    if(!started){prefix+=chunk;const match=/"records"\s*:\s*\[/.exec(prefix);if(!match){if(prefix.length>65536)throw new Error('백업 머리글이 올바르지 않음');continue;}chunk=prefix.slice(match.index+match[0].length);prefix=prefix.slice(0,match.index+match[0].length-1);started=true;}
    let segment=0;
    for(let i=0;i<chunk.length;i++){
      const c=chunk[i];
      if(ended){tail+=chunk.slice(i);if(tail.length>65536)throw new Error('백업 끝부분이 올바르지 않음');break;}
      if(phase!=='record'){
        if(/\s/.test(c))continue;
        if(phase==='comma'){if(c===','){phase='next';continue;}if(c===']'){ended=true;continue;}throw new Error('백업 구분자가 올바르지 않음');}
        if(c===']'&&phase==='first'){ended=true;continue;}
        if(c!=='{')throw new Error('백업 기록이 올바르지 않음');
        phase='record';depth=1;quoted=false;escaped=false;segment=i;continue;
      }
      if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
      else if(c==='"')quoted=true;
      else if(c==='{'||c==='[')depth++;
      else if(c==='}'||c===']'){
        depth--;
        if(depth===0){parts.push(chunk.slice(segment,i+1));const record=JSON.parse(parts.join(''));parts=[];phase='comma';yield record;}
      }
    }
    if(phase==='record')parts.push(chunk.slice(segment));
  }
  if(!started||!ended||phase==='record')throw new Error('백업 파일이 중간에 끊겨 있음');
  const envelope=JSON.parse(prefix+'[]'+tail);
  if(envelope.format!=='pipi-archive'||envelope.version!==1)throw new Error('PIPI ARCHIVE 백업 파일이 아님');
}
function validateBackupRecord(e){
  if(typeof e.id!=='string'||!e.id||e.id.length>100||typeof e.text!=='string'||e.text.length>10000||!validDate(e.date)||typeof e.createdAt!=='string'||isNaN(Date.parse(e.createdAt))||typeof e.image!=='string')throw new Error('백업 기록 형식이 올바르지 않음');
  const comma=e.image.indexOf(',');
  if(!/^data:image\/(png|jpeg|webp|gif);base64$/.test(e.image.slice(0,comma)))throw new Error('백업 사진 형식이 올바르지 않음');
  return comma;
}
function backupImage(e){
  const comma=validateBackupRecord(e),parts=[];
  // Decode small base64 blocks, avoiding a second full-image binary string.
  for(let i=comma+1;i<e.image.length;i+=65536){const binary=atob(e.image.slice(i,i+65536));const bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);parts.push(bytes);}
  return new Blob(parts,{type:e.image.slice(5,e.image.indexOf(';'))});
}
function backupProgress(text){notify(text);clearTimeout(noticeTimer);}
$('#import').onclick=()=>{if(!busy)$('#backup-file').click();};
$('#backup-file').onchange=()=>run(async()=>{
  const file=$('#backup-file').files[0];$('#backup-file').value='';if(!file)return;
  pendingBackup=null;backupProgress('백업 확인 중 · 큰 파일은 시간이 걸림');
  let count=0;const ids=new Set();
  try{
    for await(const e of backupRecords(file)){validateBackupRecord(e);if(ids.has(e.id))throw new Error('백업에 중복 ID가 있음');ids.add(e.id);count++;if(count%10===0){backupProgress(`백업 확인 중 · ${count}개`);await new Promise(r=>setTimeout(r,0));}}
    pendingBackup=file;hideNotice();$('#restore-summary').textContent=`${count}개 기록을 순서대로 가져옴`;$('#restore').showModal();
  }catch(e){hideNotice();throw e;}
});
$('#restore-cancel').onclick=()=>{pendingBackup=null;$('#restore').close();};
$('#restore-confirm').onclick=()=>run(async()=>{
  if(!pendingBackup)return;const file=pendingBackup;pendingBackup=null;$('#restore').close();let added=0,skipped=0;
  try{
    for await(const e of backupRecords(file)){
      const exists=await transaction('readonly',s=>s.getKey(e.id));
      if(exists!==undefined){skipped++;continue;}
      const image=backupImage(e);
      // Do not decode all full-resolution images into GPU/image memory during restore.
      await transaction('readwrite',s=>s.put({id:e.id,text:e.text,date:e.date,createdAt:e.createdAt,image}));
      added++;backupProgress(`복원 중 · ${added}개 저장 / ${skipped}개 중복 건너뜀`);await new Promise(r=>setTimeout(r,0));
    }
    page=0;await refresh();notify(`백업 복원 완료 · ${added}개 저장 / ${skipped}개 중복`);
  }catch(e){await refresh();fail(e);$('#status span').textContent+=` · ${added}개는 저장됨 같은 파일로 다시 시도하면 이어서 복원함`;clearTimeout(noticeTimer);}
});

updateMonth();setInterval(updateMonth,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateMonth();if(db&&!busy&&!$('#viewer').open&&!$('#composer').open)refresh().catch(fail);}});
(async()=>{try{db=await connect();db.onversionchange=()=>db.close();await refresh();for(const id of ['add','export','import'])$('#'+id).disabled=false;}catch(e){$('#grid').textContent='저장소를 열지 못했음 · 일반 브라우저에서 다시 열어 주세요';fail(e);}})();

// Prevent touch-driven page zoom while preserving scrolling and photo swipes.
for (const eventName of ['gesturestart', 'gesturechange']) {
  document.addEventListener(eventName, event => event.preventDefault(), { passive: false });
}
