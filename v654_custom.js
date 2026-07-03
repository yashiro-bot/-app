(function(){
'use strict';
/* ====================================================
   V6.54 — 纯 DOM 操作，不碰 app-service.js，不加 XHR 拦截
   ==================================================== */
var K_DRAFT = 'cigar:draft:';
function log(m){try{console.log('[V6.54]',m)}catch(e){}}

// ───── 页面 / 客户ID ─────
function page(){ return (window.location.hash||'').toLowerCase(); }
function getCid(){
  var h = page(), m = h.match(/customerid[=:](\d+)/);
  return m ? parseInt(m[1],10) : 0;
}

// ───── 草稿存储 ─────
function loadDraft(cid){
  try{ var r=localStorage.getItem(K_DRAFT+cid); return r?JSON.parse(r):null; }catch(e){return null;}
}
function saveDraft(cid, data){
  try{ localStorage.setItem(K_DRAFT+cid, JSON.stringify({data:data, at:Date.now()})); }catch(e){}
}
function clearDraft(cid){
  try{ localStorage.removeItem(K_DRAFT+cid); }catch(e){}
}
function allDraftIds(){
  var ids=[];
  try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.indexOf(K_DRAFT)===0) ids.push(k.substring(K_DRAFT.length)); } }catch(e){}
  return ids;
}

// ───── 收集所有输入值 ─────
function collectSpecData(){
  var scroll = document.querySelector('.spec-scroll, [class*="spec-scroll"]');
  if(!scroll) return null;
  var data={}, has=false;
  for(var i=0;i<scroll.children.length;i++){
    var sec = scroll.children[i];
    var inputs = sec.querySelectorAll('input');
    if(inputs.length===0) continue;
    var secData={};
    for(var j=0;j<inputs.length;j++){
      var inp = inputs[j];
      var label = '';
      for(var p = inp.previousElementSibling; p; p = p.previousElementSibling){
        if(p.matches && p.matches('.input-label, [class*="label"]')){ label=(p.textContent||'').trim(); break; }
      }
      var val = inp.value || '0';
      if(parseFloat(val)>0) has=true;
      secData[label||'f'+j] = val;
    }
    data['sec_'+i] = secData;
  }
  return has ? data : null;
}

// ───── 恢复草稿 ─────
function restoreDraftToForm(cid){
  var draft = loadDraft(cid);
  if(!draft||!draft.data) return 0;
  var scroll = document.querySelector('.spec-scroll, [class*="spec-scroll"]');
  if(!scroll) return 0;

  var restored=0;
  for(var si=0; si<scroll.children.length; si++){
    var sec = scroll.children[si];
    var inputs = sec.querySelectorAll('input');
    if(inputs.length===0) continue;
    var secKey = 'sec_'+si, secData = draft.data[secKey];
    if(!secData) continue;

    for(var j=0;j<inputs.length;j++){
      var inp = inputs[j];
      var label='';
      for(var p = inp.previousElementSibling; p; p = p.previousElementSibling){
        if(p.matches && p.matches('.input-label, [class*="label"]')){ label=(p.textContent||'').trim(); break; }
      }
      var savedVal = secData[label||'f'+j];
      if(savedVal===undefined||savedVal===null||savedVal===''||savedVal==='0') continue;

      inp.value = savedVal;
      try{
        var evt = new CustomEvent('input', { bubbles: true, detail: { value: savedVal } });
        inp.dispatchEvent(evt);
        restored++;
      }catch(e){}
    }
  }
  return restored;
}

// ───── 规格分页 ─────
var _pag = { idx:0, sections:[], active:false };
function setupPagination(){
  if(_pag.active) return;
  var scroll = document.querySelector('.spec-scroll, [class*="spec-scroll"]');
  if(!scroll) return;

  var sections=[];
  for(var i=0;i<scroll.children.length;i++){
    var ch=scroll.children[i];
    if(ch.querySelectorAll && ch.querySelectorAll('input').length>0) sections.push(ch);
  }
  if(sections.length<2) return;
  _pag.sections=sections; _pag.active=true;

  // 隐藏草稿按钮
  function hideDraftBtn(){
    var btns=document.querySelectorAll('[class*="draft"],[class*="save"]');
    for(var k=0;k<btns.length;k++){ btns[k].style.display='none'; }
  }
  hideDraftBtn();
  setInterval(hideDraftBtn,2000);

  // 导航条
  var nav=document.createElement('view');
  nav.id='v654-pag';
  nav.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:16rpx;background:#fff;border-top:1px solid #eee;margin:8rpx 16rpx;border-radius:8rpx;';

  var prev=document.createElement('view');
  prev.style.cssText='padding:12rpx 28rpx;background:#1989fa;color:#fff;border-radius:8rpx;font-size:28rpx;text-align:center;min-width:120rpx;font-weight:500;';
  prev.textContent='← 上一页';

  var ctr=document.createElement('view');
  ctr.style.cssText='font-size:26rpx;color:#666;flex:1;text-align:center;font-weight:500;';

  var next=document.createElement('view');
  next.style.cssText='padding:12rpx 28rpx;background:#1989fa;color:#fff;border-radius:8rpx;font-size:28rpx;text-align:center;min-width:120rpx;font-weight:500;';
  next.textContent='下一页 →';

  nav.appendChild(prev); nav.appendChild(ctr); nav.appendChild(next);

  var ab=document.querySelector('.action-bar, [class*="action"]');
  if(ab) ab.parentNode.insertBefore(nav, ab);
  else scroll.parentNode.appendChild(nav);

  function show(idx){
    if(idx<0)idx=0; if(idx>=_pag.sections.length)idx=_pag.sections.length-1;
    _pag.idx=idx;
    for(i=0;i<_pag.sections.length;i++) _pag.sections[i].style.display=(i===idx)?'':'none';
    ctr.textContent=(idx+1)+'/'+_pag.sections.length;
    prev.style.display=(idx===0)?'none':'';
    next.style.display=(idx>=_pag.sections.length-1)?'none':'';
  }

  prev.onclick=function(){
    var cid=getCid(), data=collectSpecData();
    if(cid&&data) saveDraft(cid,data);
    show(_pag.idx-1);
  };
  next.onclick=function(){
    var cid=getCid(), data=collectSpecData();
    if(cid&&data) saveDraft(cid,data);
    show(_pag.idx+1);
  };

  show(0);
  log('Pagination: '+sections.length+' specs');
}

// ───── 注入草稿条目到采集进度页 ─────
function injectDraftCards(){
  if(document.getElementById('v654-ds')) return;
  var list = document.querySelector('.card-list, [class*="card-list"]');
  if(!list) return;
  var ids=allDraftIds();
  if(!ids.length) return;

  var sec=document.createElement('view');
  sec.id='v654-ds';
  sec.style.cssText='margin:12rpx 16rpx;background:#fff8e1;border-radius:8rpx;overflow:hidden;';

  var hd=document.createElement('view');
  hd.style.cssText='padding:16rpx;font-size:26rpx;color:#e65100;font-weight:500;border-bottom:1px solid #ffe082;';
  hd.textContent='未完成采集 ('+ids.length+')';
  sec.appendChild(hd);

  for(var j=0;j<ids.length;j++){(function(id){
    var e=document.createElement('view');
    e.style.cssText='padding:16rpx;border-bottom:1px solid #fff9c4;display:flex;justify-content:space-between;align-items:center;';
    e.innerHTML='<text style="font-size:24rpx;color:#555;">客户 #'+id+'</text><text style="font-size:26rpx;color:#1989fa;font-weight:500;">继续采集 →</text>';
    e.onclick=function(){ try{ uni.navigateTo({url:'/pages/collect/index?customerId='+id}); }catch(e){} };
    sec.appendChild(e);
  })(ids[j]);}

  if(list.firstChild) list.insertBefore(sec,list.firstChild);
  else list.appendChild(sec);
}

// ───── 启动 ─────
function init(){
  log('Starting...');

  // 2秒间隔保存草稿
  setInterval(function(){
    if(getCid()){
      var data=collectSpecData();
      if(data) saveDraft(getCid(),data);
    }
  },2000);

  // 页面隐藏保存
  document.addEventListener('visibilitychange',function(){
    if(document.hidden && getCid()){
      var data=collectSpecData();
      if(data) saveDraft(getCid(),data);
    }
  });

  // 主功能循环
  setInterval(function(){
    var h = page();

    // 采集页：分页 + 恢复
    if(h.indexOf('collect')>=0 && document.querySelector('.spec-scroll, [class*="spec-scroll"]')){
      if(!document.getElementById('v654-pag')) setupPagination();

      if(!window._v654_restored){
        var cid = getCid();
        if(cid){
          var n = restoreDraftToForm(cid);
          if(n>0){
            window._v654_restored=true;
            log('Restored '+n+' fields');
          }
        }
      }

      // 持续恢复 20s
      if(window._v654_restored && !window._v654_restore_done){
        if(!window._v654_restore_timer){
          window._v654_restore_timer=0;
          window._v654_restore_int=setInterval(function(){
            if(window._v654_restore_timer>=40){
              clearInterval(window._v654_restore_int);
              window._v654_restore_done=true;
              return;
            }
            restoreDraftToForm(getCid());
            window._v654_restore_timer++;
          },500);
        }
      }
    }

    // 采集进度页：注入草稿
    if((h.indexOf('history')>=0||h.indexOf('hist')>=0) && document.querySelector('.card-list, [class*="card-list"]')){
      if(!document.getElementById('v654-ds')) injectDraftCards();
    }
  },1000);

  log('V6.54 active');
}

// ───── 安全启动 ─────
if(document.readyState==='complete'||document.readyState==='interactive')
  setTimeout(init,3000);
else
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(init,3000); });

})();
