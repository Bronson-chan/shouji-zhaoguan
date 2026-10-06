const ADMIN_HASH = '8d32bcfcd4c90cbcd16993dacf46926809b1c939b7686b5bcf11262b58085268';
const STORAGE_KEY = 'zhaoguan-local-edits-v2';
const USAGE_KEY = 'zhaoguan-search-usage-v1';
const PHOTOS = {A:'assets/rack-A.jpg',B:'assets/rack-B.jpg',C:'assets/rack-C.jpg',D:'assets/rack-D.jpg'};
const xBounds = [147,250,323,388,452,517,581,651,719,793,861,964];
const yBounds = [118,188,253,315,375,437,499,568,639,711,790];

const $ = id => document.getElementById(id);
const state = {items:[],grids:{},rack:'ALL',shape:'全部',material:'全部',spec:'全部',selected:null,admin:sessionStorage.getItem('zhaoguan-admin')==='1',suggestionIndex:-1,deferredInstall:null,usage:{},nameFrequency:{},resumeSuggestions:false,zoom:1,pinchStart:0,pinchZoom:1};

function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function norm(value){return String(value).toLowerCase().replace(/毫米|mm|厚/g,'').replace(/矩形管|矩形|扁管/g,'扁').replace(/方管/g,'方').replace(/圆管/g,'圆').replace(/[×x＊*／/乘\-]/g,' ').replace(/[φΦ直径]/g,'').replace(/\s+/g,' ').trim();}
function specAliases(p){
  const dims=String(p.spec||p.name).match(/\d+(?:\.\d+)?/g)||[];
  if(dims.length<2)return '';
  return `${dims.join('')} ${dims.join(' ')} ${dims.join('x')} ${dims.join('*')} ${dims.join('-')} ${dims.join('乘')} 扁`;
}
function searchText(p){return norm(`${p.name} ${p.spec} ${p.thickness} ${p.material} ${p.shape} ${specAliases(p)}`);}
function pipeMatches(p,value){
  const q=norm(value); if(!q)return true;
  const hay=searchText(p),compactHay=hay.replace(/\s/g,''),compactQuery=q.replace(/\s/g,'');
  if(/[^\d.\s+]/.test(q)&&compactHay.includes(compactQuery))return true;
  const parts=q.match(/304|201|\d+(?:\.\d+)?\+?|足|标|方|圆|扁|矩形/g);
  const hayParts=hay.match(/304|201|\d+(?:\.\d+)?\+?|足|标|方|圆|扁|矩形/g)||[];
  return Boolean(parts?.length&&parts.every(part=>hayParts.includes(part)));
}
function searchScore(p,value){
  const q=norm(value),compactQuery=q.replace(/\s/g,''),name=norm(p.name),spec=norm(p.spec),compactName=name.replace(/\s/g,''),compactSpec=spec.replace(/\s/g,''),hay=searchText(p),compactHay=hay.replace(/\s/g,'');
  if(!q)return 0;
  let score=0;
  const queryDims=q.match(/\d+(?:\.\d+)?/g)||[],pipeDims=String(p.spec||p.name).match(/\d+(?:\.\d+)?/g)||[];
  if(name===q||spec===q)score+=1200;
  if(compactName===compactQuery||compactSpec===compactQuery)score+=1000;
  if(queryDims.length>1&&queryDims.every((dim,index)=>pipeDims[index]===dim))score+=1800;
  if(queryDims.length===1&&pipeDims[0]===queryDims[0])score+=1200;
  else if(queryDims.length===1&&pipeDims.slice(1).includes(queryDims[0]))score+=500;
  if(queryDims.length&&queryDims.length===pipeDims.length&&queryDims.every((dim,index)=>pipeDims[index]===dim))score+=300;
  if(compactName.startsWith(compactQuery)||compactSpec.startsWith(compactQuery))score+=400;
  if(compactHay.includes(compactQuery))score+=250;
  if(q.includes('扁')&&p.shape==='矩形管')score+=350;
  return score;
}
function shapeOf(name){return name.includes('圆')?'圆管':(name.includes('×')||name.includes('扁')?'矩形管':'方管');}
function displayName(p){return p.thickness.startsWith('足')?`${p.name} ${p.thickness}`:`${p.name} ${p.thickness}厚`;}
function locationCode(p){return `${p.rack}-${String(p.level).padStart(2,'0')}-${String(p.slot).padStart(2,'0')}`;}
function materialClass(value){return value==='304'?'material-304':'material-201';}
function aZoneBox(level,slot){const row=11-level;return {boxX:+(xBounds[slot-1]/1152*100).toFixed(3),boxY:+(yBounds[row-1]/869*100).toFixed(3),boxW:+((xBounds[slot]-xBounds[slot-1])/1152*100).toFixed(3),boxH:+((yBounds[row]-yBounds[row-1])/869*100).toFixed(3)};}
function rackBox(rack,level,slot){return state.grids?.[rack]?.cells?.[`${level}-${slot}`]||(rack==='A'&&level>=1&&level<=10&&slot>=1&&slot<=11?aZoneBox(level,slot):null);}
function localEdits(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}catch{return {};}}
function localUsage(){try{return JSON.parse(localStorage.getItem(USAGE_KEY)||'{}');}catch{return {};}}
function recordUsage(id){state.usage[id]=(state.usage[id]||0)+1;localStorage.setItem(USAGE_KEY,JSON.stringify(state.usage));}
function allMatches(){
  const q=$('pipeSearch').value;
  const matches=state.items.filter(p=>pipeMatches(p,q)&&(state.rack==='ALL'||p.rack===state.rack)&&(state.shape==='全部'||p.shape===state.shape)&&(state.material==='全部'||p.material===state.material)&&(state.spec==='全部'||p.name===state.spec));
  if(!q.trim())return matches.sort((a,b)=>(state.usage[b.id]||0)-(state.usage[a.id]||0)||(state.nameFrequency[b.name]||0)-(state.nameFrequency[a.name]||0)||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  return matches.sort((a,b)=>searchScore(b,q)-searchScore(a,q)||a.name.localeCompare(b.name,'zh-CN',{numeric:true})||b.level-a.level||a.slot-b.slot);
}

function renderAreas(){
  const areas=[['ALL','全部'],['A','A区'],['B','B区'],['C','C区'],['D','D区']];
  $('areaTabs').innerHTML=areas.map(([id,label])=>{
    const count=id==='ALL'?state.items.length:state.items.filter(p=>p.rack===id).length;
    return `<button type="button" class="area-tab ${state.rack===id?'active':''}" data-rack="${id}"><strong>${label}</strong><span>${count} 个规格</span></button>`;
  }).join('');
}
function renderSpecOptions(){
  const names=[...new Set(state.items.map(p=>p.name))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
  $('specFilter').innerHTML='<option>全部</option>'+names.map(name=>`<option ${state.spec===name?'selected':''}>${escapeHtml(name)}</option>`).join('');
}
function resultCard(p){return `<button type="button" class="result-card" data-id="${escapeHtml(p.id)}"><span class="result-main"><strong>${escapeHtml(displayName(p))}</strong><small>${escapeHtml(p.shape)} · 不锈钢</small></span><span class="result-location"><strong>● ${escapeHtml(p.rack)}区 · 第${p.level}层 · 第${p.slot}格</strong><small>${escapeHtml(locationCode(p))} · 位置准确</small></span><span class="material-chip ${materialClass(p.material)}">${escapeHtml(p.material)}</span><span class="result-arrow">›</span></button>`;}
function renderResults(){
  const matches=allMatches();
  const hasQuery=Boolean($('pipeSearch').value.trim());
  $('resultTitle').textContent=hasQuery?'▤  搜索结果':(state.rack==='ALL'?'▤  常用/全部管材':`▤  ${state.rack}区常用管材`);
  $('resultCount').textContent=`${matches.length} 个结果`;
  $('results').innerHTML=matches.map(resultCard).join('');
  const empty=$('emptyState');
  if(matches.length){empty.hidden=true;}else{
    empty.hidden=false;
    const areaCount=state.rack==='ALL'?state.items.length:state.items.filter(p=>p.rack===state.rack).length;
    empty.textContent=state.rack!=='ALL'&&!areaCount?`${state.rack}区还没有录入管材，后续录入后会显示在这里。`:'没有符合条件的管材，请调整搜索或筛选。';
  }
}
function renderSuggestions(){
  const q=$('pipeSearch').value.trim(), box=$('searchSuggestions');
  $('clearSearch').classList.toggle('visible',Boolean(q));
  if(!q){box.hidden=true;state.suggestionIndex=-1;return;}
  const matches=allMatches(); box.hidden=false;
  if(!matches.length){box.innerHTML='<div class="suggestion-empty">没有匹配规格，请换个写法</div>';return;}
  box.innerHTML=matches.map((p,index)=>`<button type="button" role="option" class="suggestion ${index===state.suggestionIndex?'active':''}" data-suggestion-id="${escapeHtml(p.id)}"><span class="material-chip ${materialClass(p.material)}">${escapeHtml(p.material)}</span><span class="suggestion-main"><strong>${escapeHtml(displayName(p))}</strong><span>${escapeHtml(p.shape)} · ${escapeHtml(p.rack)}区第${p.level}层第${p.slot}格</span></span><span class="suggestion-code">${escapeHtml(locationCode(p))}</span></button>`).join('');
}
function renderAll(){renderAreas();renderResults();renderSuggestions();}

function openLocation(id,resumeSuggestions=false){
  const p=state.items.find(item=>item.id===id); if(!p)return; state.selected=p.id;state.resumeSuggestions=resumeSuggestions&&Boolean($('pipeSearch').value.trim());recordUsage(p.id);renderResults();
  $('locationName').textContent=displayName(p); $('locationMaterial').textContent=p.material; $('locationMaterial').className=`material-chip ${materialClass(p.material)}`;
  $('locationCode').textContent=locationCode(p); $('locationWords').textContent=`${p.rack}架 · 第${p.level}层 · 第${p.slot}格`;
  const photo=$('rackPhoto'),photoSrc=PHOTOS[p.rack]||PHOTOS.A;
  photo.alt=`${p.rack}架实景照片`;
  $('locationHelp').innerHTML=`面向 ${escapeHtml(p.rack)} 架，从下往上第 <b>${p.level}</b> 层，从左往右第 <b>${p.slot}</b> 格。`;
  const marker=$('locationMarker'),unmapped=$('unmappedNotice');
  const mapped=Number.isFinite(p.boxX)&&Number.isFinite(p.boxY);
  marker.hidden=true;unmapped.hidden=true;photo.style.opacity='0';
  if(mapped){marker.style.left=`${p.boxX+p.boxW/2}%`;marker.style.top=`${p.boxY+p.boxH/2}%`;}
  const reveal=()=>{if(state.selected!==p.id)return;photo.style.opacity='1';marker.hidden=!mapped;unmapped.hidden=mapped;};
  photo.onload=reveal;photo.src=photoSrc;if(photo.complete)reveal();
  $('editPipeButton').hidden=!state.admin; $('searchSuggestions').hidden=true; $('locationDialog').showModal();
}
function setZoom(value){state.zoom=Math.max(1,Math.min(5,value));$('zoomContent').style.width=`${state.zoom*100}%`;$('zoomReset').textContent=`${Math.round(state.zoom*100)}%`;}
function openZoom(){
  const p=state.items.find(item=>item.id===state.selected);if(!p)return;
  const mapped=Number.isFinite(p.boxX)&&Number.isFinite(p.boxY),marker=$('zoomMarker');
  $('zoomTitle').textContent=`${displayName(p)} · ${locationCode(p)}`;$('zoomPhoto').src=PHOTOS[p.rack]||PHOTOS.A;marker.hidden=!mapped;
  if(mapped){marker.style.left=`${p.boxX+p.boxW/2}%`;marker.style.top=`${p.boxY+p.boxH/2}%`;}
  setZoom(1);$('zoomScroller').scrollTo(0,0);$('zoomDialog').showModal();
}
function openEdit(){
  const p=state.items.find(item=>item.id===state.selected); if(!p)return;
  $('locationDialog').close(); $('editName').value=p.name; $('editThickness').value=p.thickness; $('editMaterial').value=p.material; $('editRack').value=p.rack; $('editLevel').value=p.level; $('editSlot').value=p.slot; updateEditWarning(); $('editDialog').showModal();
}
function updateEditWarning(){const box=rackBox($('editRack').value,+$('editLevel').value,+$('editSlot').value);$('editWarning').hidden=Boolean(box);}
async function sha256(value){const data=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function updateAdminButton(){$('adminButton').textContent=state.admin?'退出管理':'管理员';}
function showInstallGuide(){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  $('installInstructions').innerHTML=ios?'<ol><li>点击 Safari 底部的“分享”按钮。</li><li>向下滑动并选择“添加到主屏幕”。</li><li>点击右上角“添加”。</li></ol>':'<ol><li>打开浏览器右上角菜单。</li><li>选择“安装应用”或“添加到主屏幕”。</li><li>确认安装“找管”。</li></ol>';
  $('installDialog').showModal();
}
function updateOnlineState(){$('offlineBadge').hidden=navigator.onLine;}

async function init(){
  try{
    const payload=await fetch('pipes.json'); const data=await payload.json(); const edits=localEdits();
    state.grids=data.grids||{};
    state.items=data.items.map(item=>{const merged=edits[item.id]?{...item,...edits[item.id]}:item;const box=rackBox(merged.rack,+merged.level,+merged.slot);return box?{...merged,...box}:merged;});
    state.usage=localUsage();state.nameFrequency=state.items.reduce((acc,item)=>(acc[item.name]=(acc[item.name]||0)+1,acc),{});
    renderSpecOptions(); renderAll(); updateAdminButton();
  }catch(error){$('resultCount').textContent='读取失败';$('emptyState').hidden=false;$('emptyState').textContent='离线数据读取失败，请联网刷新一次页面。';}

  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  updateOnlineState();
}

$('pipeSearch').addEventListener('input',()=>{state.suggestionIndex=-1;renderResults();renderSuggestions();});
$('pipeSearch').addEventListener('focus',renderSuggestions);
$('pipeSearch').addEventListener('keydown',event=>{
  const options=[...document.querySelectorAll('[data-suggestion-id]')];
  if(event.key==='ArrowDown'&&options.length){event.preventDefault();state.suggestionIndex=(state.suggestionIndex+1)%options.length;renderSuggestions();}
  if(event.key==='ArrowUp'&&options.length){event.preventDefault();state.suggestionIndex=(state.suggestionIndex-1+options.length)%options.length;renderSuggestions();}
  if(event.key==='Enter'&&options.length){event.preventDefault();openLocation(options[Math.max(0,state.suggestionIndex)]?.dataset.suggestionId);}
  if(event.key==='Escape')$('searchSuggestions').hidden=true;
});
$('clearSearch').addEventListener('click',()=>{$('pipeSearch').value='';$('pipeSearch').focus();renderResults();renderSuggestions();});
$('searchButton').addEventListener('click',()=>{$('pipeSearch').focus();renderResults();renderSuggestions();});
document.querySelectorAll('[data-query]').forEach(button=>button.addEventListener('click',()=>{$('pipeSearch').value=button.dataset.query;$('pipeSearch').focus();renderResults();renderSuggestions();}));
$('areaTabs').addEventListener('click',event=>{const button=event.target.closest('[data-rack]');if(!button)return;state.rack=button.dataset.rack;state.spec='全部';$('specFilter').value='全部';renderAll();});
$('results').addEventListener('click',event=>{const card=event.target.closest('[data-id]');if(card)openLocation(card.dataset.id,false);});
$('searchSuggestions').addEventListener('click',event=>{const option=event.target.closest('[data-suggestion-id]');if(option)openLocation(option.dataset.suggestionId,true);});
document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap')&&!event.target.closest('#locationDialog'))$('searchSuggestions').hidden=true;});
$('shapeFilter').addEventListener('change',event=>{state.shape=event.target.value;renderAll();});
$('materialFilter').addEventListener('change',event=>{state.material=event.target.value;renderAll();});
$('specFilter').addEventListener('change',event=>{state.spec=event.target.value;renderAll();});
$('resetFilters').addEventListener('click',()=>{state.rack='ALL';state.shape='全部';state.material='全部';state.spec='全部';$('shapeFilter').value='全部';$('materialFilter').value='全部';$('specFilter').value='全部';renderAll();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
$('editPipeButton').addEventListener('click',openEdit); ['editRack','editLevel','editSlot'].forEach(id=>$(id).addEventListener('change',updateEditWarning));
$('adminButton').addEventListener('click',()=>{if(state.admin){state.admin=false;sessionStorage.removeItem('zhaoguan-admin');updateAdminButton();$('editPipeButton').hidden=true;}else{$('adminPassword').value='';$('adminError').hidden=true;$('adminDialog').showModal();}});
$('adminForm').addEventListener('submit',async event=>{event.preventDefault();const valid=await sha256($('adminPassword').value)===ADMIN_HASH;if(!valid){$('adminError').textContent='管理密码不正确';$('adminError').hidden=false;return;}state.admin=true;sessionStorage.setItem('zhaoguan-admin','1');updateAdminButton();$('adminDialog').close();});
$('editForm').addEventListener('submit',event=>{
  event.preventDefault();const index=state.items.findIndex(item=>item.id===state.selected);if(index<0)return;
  const name=$('editName').value.trim(),rack=$('editRack').value,level=+$('editLevel').value,slot=+$('editSlot').value;
  const updated={...state.items[index],name,spec:name,shape:shapeOf(name),thickness:$('editThickness').value.trim(),material:$('editMaterial').value,rack,level,slot};
  const box=rackBox(rack,level,slot);if(box)Object.assign(updated,box);else{updated.boxX=null;updated.boxY=null;updated.boxW=null;updated.boxH=null;}
  state.items[index]=updated;const edits=localEdits();edits[updated.id]=updated;localStorage.setItem(STORAGE_KEY,JSON.stringify(edits));renderSpecOptions();renderAll();$('editDialog').close();openLocation(updated.id);
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.deferredInstall=event;});
$('installButton').addEventListener('click',async()=>{if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;}else showInstallGuide();});
$('locationDialog').addEventListener('close',()=>{if(state.resumeSuggestions){state.resumeSuggestions=false;requestAnimationFrame(renderSuggestions);}});
$('openZoom').addEventListener('click',openZoom);$('zoomIn').addEventListener('click',()=>setZoom(state.zoom+.5));$('zoomOut').addEventListener('click',()=>setZoom(state.zoom-.5));$('zoomReset').addEventListener('click',()=>setZoom(1));
$('zoomContent').addEventListener('dblclick',()=>setZoom(state.zoom===1?2:1));
$('zoomScroller').addEventListener('touchstart',event=>{if(event.touches.length===2){state.pinchStart=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);state.pinchZoom=state.zoom;}},{passive:true});
$('zoomScroller').addEventListener('touchmove',event=>{if(event.touches.length===2&&state.pinchStart){event.preventDefault();const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);setZoom(state.pinchZoom*distance/state.pinchStart);}},{passive:false});
window.addEventListener('online',updateOnlineState);window.addEventListener('offline',updateOnlineState);
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();}));

init();
