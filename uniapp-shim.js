(function() {
  window.__setSupabase = function(url, key) {
    try { localStorage.setItem('sb_url', url); localStorage.setItem('sb_key', key); } catch(e) {}
    debugLog('Supabase configured: ' + (url ? 'yes' : 'no'));
  };

  var _debugVisible = false;
  function toggleDebug() {
    var d = document.getElementById('__debug');
    if (d) {
      _debugVisible = !_debugVisible;
      d.style.display = _debugVisible ? '' : 'none';
    }
  }
  function debugLog(msg, isError) {
    try {
      var d = document.getElementById('__debug');
      if (!d) {
        d = document.createElement('div');
        d.id = '__debug';
        d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:35vh;overflow:auto;background:rgba(255,255,255,0.95);color:#000;font:10px/1.3 monospace;padding:4px;z-index:99999;border-top:2px solid #888;white-space:pre-wrap;display:none';
        document.body.appendChild(d);
        var toggle = document.createElement('div');
        toggle.id = '__debug_toggle';
        toggle.textContent = '🐛';
        toggle.style.cssText = 'position:fixed;top:4px;right:4px;font-size:18px;cursor:pointer;z-index:99999;opacity:0.6;background:rgba(0,0,0,0.1);border-radius:50%;padding:4px;line-height:1;';
        toggle.onclick = toggleDebug;
        document.body.appendChild(toggle);
      }
      if (!_debugVisible && d.style.display === 'none') { /* collect but don't show */ }
      var line = document.createElement('div');
      line.textContent = '[' + new Date().toISOString().substr(11, 8) + '] ' + (isError ? 'ERR: ' : '') + msg;
      line.style.color = isError ? '#c00' : '#060';
      d.appendChild(line);
      while (d.childNodes.length > 30) d.removeChild(d.firstChild);
      d.scrollTop = d.scrollHeight;
    } catch (e) {}
    try { console.log((isError ? '[ERR] ' : '') + msg); } catch (e) {}
  }
  window.__debugLog = debugLog;

  window.addEventListener('error', function(e) {
    var msg = 'Uncaught: ' + (e.message || '') + ' @ ' + (e.filename||'') + ':' + (e.lineno||'') + ':' + (e.colno||'');
    debugLog(msg, true);
  }, true);

  debugLog('Shim v19 starting (script-tag injection)...');

  // ───── App 版本 & 更新配置 ─────
  window.__appVersion = { code: 114, name: '1.1.4' };
  window.__appDisplay = '鹭茄记 V' + window.__appVersion.name;
  window.__updateUrl = (function(){
    try { return localStorage.getItem('cigar:update_url') || 'https://raw.githubusercontent.com/yashiro-bot/-app/main/version.json'; } catch(e) { return ''; }
  })();

  // ───── 诊断 Toast（不依赖 DOM，优先用 uni 桥，退路 DOM） ─────
  function _uniToast(msg) {
    try { if (typeof uni !== 'undefined' && uni.showToast) { uni.showToast({ title: msg, icon: 'none', duration: 3000 }); return; } } catch(e) {}
    try { if (typeof plus !== 'undefined' && plus.nativeUI) { plus.nativeUI.toast(msg); return; } } catch(e) {}
    // DOM 退路：插到 #app 里面而非 body
    try {
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.82);color:#fff;padding:14px 28px;border-radius:10px;font-size:15px;z-index:999999;max-width:80vw;text-align:center;pointer-events:none';
      t.textContent = msg;
      (document.getElementById('app') || document.body).appendChild(t);
      setTimeout(function(){ t.style.transition='opacity 0.3s'; t.style.opacity='0'; setTimeout(function(){ t.remove(); }, 350); }, 2200);
    } catch(e) { try { console.log('[TOAST] ' + msg); } catch(e2) {} }
  }
  // ───── 诊断 Modal（不依赖 confirm/alert） ─────
  function _uniModal(title, msg, okCb, cancelCb) {
    try {
      if (typeof uni !== 'undefined' && uni.showModal) {
        uni.showModal({ title: title || '', content: msg || '', showCancel: !!cancelCb, success: function(res) { if (res.confirm) okCb && okCb(); else cancelCb && cancelCb(); } });
        return;
      }
    } catch(e) {}
    // DOM 退路
    try {
      var old = document.getElementById('_ccm'); if (old) old.remove();
      var bg = document.createElement('div'); bg.id = '_ccm';
      bg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:999999;display:flex;align-items:center;justify-content:center';
      bg.onclick = function(e) { if (e.target === bg) { bg.remove(); cancelCb && cancelCb(); } };
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:14px;width:300px;max-width:85vw;padding:24px 20px 16px;box-shadow:0 8px 30px rgba(0,0,0,0.2);text-align:center';
      if (title) { var titleEl = document.createElement('div'); titleEl.style.cssText = 'font-size:17px;font-weight:700;color:#222;margin-bottom:10px'; titleEl.textContent = title; box.appendChild(titleEl); }
      if (msg) { var msgEl = document.createElement('div'); msgEl.style.cssText = 'font-size:15px;color:#555;line-height:1.5;margin-bottom:20px;white-space:pre-wrap'; msgEl.textContent = msg; box.appendChild(msgEl); }
      var br = document.createElement('div'); br.style.cssText = 'display:flex;gap:10px;justify-content:center';
      if (cancelCb) {
        var cb = document.createElement('button'); cb.textContent = '取消'; cb.style.cssText = 'flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:15px;color:#666;cursor:pointer';
        cb.onclick = function() { bg.remove(); cancelCb(); }; br.appendChild(cb);
      }
      var ob = document.createElement('button'); ob.textContent = '确定'; ob.style.cssText = 'flex:1;padding:10px;border:none;border-radius:8px;background:#1989fa;font-size:15px;color:#fff;font-weight:600;cursor:pointer';
      ob.onclick = function() { bg.remove(); okCb && okCb(); }; br.appendChild(ob);
      box.appendChild(br); bg.appendChild(box);
      (document.getElementById('app') || document.body).appendChild(bg);
    } catch(e) { debugLog('_uniModal DOM fallback failed: ' + e.message, true); }
  }

  // ───── 打开 URL（多路回退） ─────
  function _openUrl(url, debugLabel) {
    debugLog('openUrl(' + debugLabel + '): ' + url);
    var isIntent = url.indexOf('intent://') === 0;

    // intent:// 特殊处理：不能用 location.href（会触发 ERR_UNKNOWN_URL_SCHEME 错误页）
    if (isIntent) {
      // 方式A：window.open 新窗口（不影响当前页面）
      try {
        window.open(url, '_blank');
        debugLog('intent via window.open');
        return true;
      } catch(e) { debugLog('intent window.open error: ' + e.message); }
      // 方式B：隐藏 <a> 点击
      try {
        var a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        debugLog('intent via <a> click');
        return true;
      } catch(e) { debugLog('intent <a> error: ' + e.message); }
      // 方式C：UniAppBridge
      try {
        if (window.UniAppBridge && window.UniAppBridge.openURL) {
          window.UniAppBridge.openURL(url);
          debugLog('intent via UniAppBridge');
          return true;
        }
      } catch(e) { debugLog('intent UniAppBridge error: ' + e.message); }
      debugLog('All intent methods failed');
      return false;
    }

    // 普通 URL（http/https/APK 下载）
    // 方案A：plus.runtime.openURL
    try {
      if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.openURL) {
        plus.runtime.openURL(url);
        debugLog('plus.runtime.openURL OK');
        return true;
      }
    } catch(e) { debugLog('plus.runtime error: ' + e.message); }
    // 方案B：uni.downloadFile
    try {
      if (typeof uni !== 'undefined' && uni.downloadFile && url.endsWith('.apk')) {
        uni.downloadFile({
          url: url,
          success: function(res) { debugLog('uni.downloadFile OK: ' + (res.tempFilePath || '')); },
          fail: function(err) { debugLog('uni.downloadFile fail: ' + (err && (err.errMsg || JSON.stringify(err)))); }
        });
        return true;
      }
    } catch(e) { debugLog('uni.downloadFile error: ' + e.message); }
    // 方案C：UniAppBridge.openURL
    try {
      if (window.UniAppBridge && window.UniAppBridge.openURL) {
        window.UniAppBridge.openURL(url);
        debugLog('UniAppBridge.openURL OK');
        return true;
      }
    } catch(e) { debugLog('UniAppBridge error: ' + e.message); }
    // 方案D：window.open
    try {
      window.open(url, '_blank');
      debugLog('window.open OK');
      return true;
    } catch(e) { debugLog('window.open error: ' + e.message); }
    // 方案E：location.href 直接导航（对 APK 下载可能触发系统下载管理器）
    try {
      window.location.href = url;
      debugLog('location.href OK');
      return true;
    } catch(e) { debugLog('location.href error: ' + e.message); }
    return false;
  }
  window.__checkUpdate = function(silent) {
    var url = window.__updateUrl;
    debugLog('__checkUpdate called, silent=' + silent + ', url=' + url + ' (len=' + (url||'').length + ')');
    if (!url) { _btnStatus('未配置更新地址'); return; }
    var cur = window.__appVersion;

    // 改按钮文字和状态条 —— 这是WebView中唯一可靠的反馈方式
    var btn = document.getElementById('__profile_update');
    var statusEl = document.getElementById('__profile_upd_status');
    if (statusEl) { statusEl.textContent = '检查中...'; statusEl.style.color = '#e65100'; }

    var TIMEOUT_MS = 12000;
    var finished = false;

    var done = function(info) {
      if (finished) return; finished = true;
      try {
        debugLog('Update check done: v' + info.versionCode + ' >? cur ' + cur.code);
        if (info.versionCode > cur.code) {
          var apkUrl = info.apkUrl;
          var tagName = 'v' + info.versionName;
          var releasesUrl = 'https://github.com/yashiro-bot/-app/releases/tag/' + tagName;
          _btnStatus('发现新版 ' + info.versionName + '，点按钮去 GitHub 下载', '#e65100');
          if (btn) {
            btn.textContent = '去 GitHub 下载 ' + info.versionName;
            btn.onclick = function() {
              btn.textContent = '打开 GitHub...';
              _btnStatus('正在打开 GitHub 发布页...', '#e65100');
              var ok = _openUrl(releasesUrl, 'releases page');
              if (ok) {
                _btnStatus('已打开，请点击 .apk 文件下载', '#e65100');
              } else {
                _btnStatus('无法打开：' + releasesUrl, '#c00');
                btn.textContent = '手动：浏览器打开此链接';
                btn.onclick = function() { _openUrl(releasesUrl, 'retry releases'); };
              }
            };
          }
        } else if (!silent) {
          _btnStatus('已是最新版 (' + cur.name + ')', '#2e7d32');
          if (btn) btn.textContent = '✓ 已是最新版';
        }
      } catch(e) {
        debugLog('done() error: ' + e.message, true);
        _btnStatus('检查异常');
      }
    };

    var fail = function(reason) {
      if (finished) return; finished = true;
      debugLog('Update FAILED: ' + (reason || 'unknown'), true);
      var releasesUrl = 'https://github.com/yashiro-bot/-app/releases/latest';
      _btnStatus('更新服务器不可达，请手动检查', '#c00');
      if (btn) {
        btn.textContent = '去 GitHub 查看';
        btn.onclick = function() { _openUrl(releasesUrl, 'releases page'); };
      }
    };

    // ───── 方案A：GitHub API（已在 V1.0.6 中确认可用） ─────
    var tryAPI = function() {
      var apiUrl = 'https://api.github.com/repos/yashiro-bot/-app/releases/latest';
      debugLog('GitHub API: ' + apiUrl);
      if (typeof fetch === 'undefined') { tryXHR(); return; }

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var tid = controller ? setTimeout(function() { controller.abort(); tryRaw(); }, TIMEOUT_MS) : null;

      fetch(apiUrl, { method: 'GET', cache: 'no-cache', signal: controller ? controller.signal : undefined })
        .then(function(r) {
          if (tid) clearTimeout(tid);
          debugLog('GitHub API status=' + r.status);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(data) {
          var tag = (data.tag_name || '').replace(/^v/, '');
          var parts = tag.split('.');
          var vc = parseInt(parts[0]||'0')*100 + parseInt(parts[1]||'0')*10 + parseInt(parts[2]||'0');
          var apkAsset = null;
          if (data.assets && data.assets.length > 0) {
            for (var i = 0; i < data.assets.length; i++) {
              if ((data.assets[i].name || '').toLowerCase().endsWith('.apk')) { apkAsset = data.assets[i]; break; }
            }
          }
          done({
            versionCode: vc,
            versionName: tag,
            apkUrl: apkAsset ? apkAsset.browser_download_url : '',
            note: data.body || ''
          });
        })
        .catch(function(e) {
          if (tid) clearTimeout(tid);
          if (e.name === 'AbortError') { debugLog('API timeout, fallback raw'); tryRaw(); }
          else { debugLog('API error: ' + e.message); tryRaw(); }
        });
    };

    // ───── 方案B：raw.githubusercontent.com ─────
    var tryRaw = function() {
      debugLog('Raw fetch: ' + url);
      if (typeof fetch === 'undefined') { tryXHR(); return; }
      fetch(url, { method: 'GET', cache: 'no-cache' })
        .then(function(r) {
          debugLog('Raw status=' + r.status);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(done)
        .catch(function(e) { debugLog('Raw error: ' + e.message); fail(e.message); });
    };

    // ───── 方案C：XHR 最终退路 ─────
    var tryXHR = function() {
      debugLog('XHR fallback');
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = TIMEOUT_MS;
        xhr.onload = function() {
          debugLog('XHR status=' + xhr.status);
          if (xhr.status >= 200 && xhr.status < 300) { try { done(JSON.parse(xhr.responseText)); } catch(e) { fail('JSON: ' + e.message); } }
          else { fail('HTTP ' + xhr.status); }
        };
        xhr.onerror = function() { fail('XHR network error'); };
        xhr.ontimeout = function() { fail('XHR timeout'); };
        xhr.send();
      } catch(e) { fail('XHR: ' + e.message); }
    };

    // 状态条辅助
    function _btnStatus(msg, color) {
      debugLog('Status: ' + msg);
      var el = document.getElementById('__profile_upd_status');
      if (!el) {
        // 在按钮下方创建状态条
        var p = btn && btn.parentNode;
        if (!p) return;
        el = document.createElement('div');
        el.id = '__profile_upd_status';
        el.style.cssText = 'text-align:center;font-size:12px;padding:4px 0 6px;min-height:16px;transition:color 0.3s';
        if (btn) btn.parentNode.insertBefore(el, btn.nextSibling);
      }
      el.textContent = msg;
      if (color) el.style.color = color;
    }

    // 开始
    _btnStatus('连接更新服务器...');
    if (btn) { btn.textContent = '检查中...'; btn.disabled = true; }
    tryAPI();
  };
  window.__showToast = _uniToast;

  // ───── 启动时请求定位权限（4路触发） ─────
  window.__locationDenied = false;
  (function(){
    var tried = 0, maxTries = 4;
    function tryLocation() {
      tried++;
      // 方式1：浏览器原生 API → WebView → onGeolocationPermissionsShowPrompt
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function(pos) { debugLog('Location OK via browser API'); window.__locationDenied = false; },
          function(err) { debugLog('Location err: ' + err.message); window.__locationDenied = true; },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
      // 方式2：native JS 接口 Android.getLastKnownLocation()
      if (typeof Android !== 'undefined' && Android.getLastKnownLocation) {
        try { Android.getLastKnownLocation(); } catch(e) { /* ignore */ }
      }
      // 方式3：UniAppBridge 原生桥
      if (window.UniAppBridge && typeof window.UniAppBridge.getLocation === 'function') {
        try {
          window.UniAppBridge.getLocation(
            JSON.stringify({callbackId:'loc_'+tried}),
            JSON.stringify({callbackId:'loc_'+tried+'_fail'})
          );
        } catch(e) { /* ignore */ }
      }
      if (tried < maxTries) setTimeout(tryLocation, 2000);
    }
    setTimeout(tryLocation, 500);
  })();

  // ───── 打开系统定位/应用权限设置（WebView中弹窗不可用，改按钮+状态条） ─────
  window.__openLocationSettings = function() {
    debugLog('__openLocationSettings clicked');
    var btn = document.getElementById('__profile_location_guide');
    var statusEl = document.getElementById('__profile_loc_status');
    var setStatus = function(msg, color) {
      debugLog('Loc status: ' + msg);
      if (!statusEl) {
        if (!btn) return;
        statusEl = document.createElement('div');
        statusEl.id = '__profile_loc_status';
        statusEl.style.cssText = 'text-align:center;font-size:12px;padding:4px 0 8px;min-height:16px;line-height:1.4';
        btn.parentNode.insertBefore(statusEl, btn.nextSibling);
      }
      statusEl.textContent = msg;
      if (color) statusEl.style.color = color;
    };

    // 方式A：uni.openSetting（UniApp 原生设置页，最可能生效）
    try {
      if (typeof uni !== 'undefined' && uni.openSetting) {
        setStatus('正在打开权限设置...', '#e65100');
        if (btn) btn.textContent = '打开设置中...';
        debugLog('Calling uni.openSetting...');
        uni.openSetting({
          success: function(r) {
            debugLog('openSetting success: ' + JSON.stringify(r));
            setStatus('已返回应用，请检查定位权限', '#2e7d32');
            if (btn) btn.textContent = '✓ 请检查定位权限';
            setTimeout(function() { if (btn) btn.textContent = '定位未开启？点击跳转系统设置 →'; }, 5000);
          },
          fail: function(err) {
            debugLog('openSetting failed: ' + (err && (err.errMsg || JSON.stringify(err))), true);
            tryIntent();
          }
        });
        return;
      }
    } catch(e) { debugLog('uni.openSetting error: ' + e.message, true); }
    tryIntent();

    function tryIntent() {
      setStatus('正在跳转应用设置...', '#e65100');
      if (btn) btn.textContent = '跳转设置中...';
      var ok = _openUrl('intent://com.cigar.collection/#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;S:package=com.cigar.collection;end', 'location intent');
      if (ok) {
        setStatus('请允许定位权限后返回', '#2e7d32');
        if (btn) btn.textContent = '✓ 已跳转设置';
        setTimeout(function() { if (btn) btn.textContent = '定位未开启？点击跳转系统设置 →'; }, 6000);
      } else {
        // 方式C：显示手动操作指南
        setStatus('无法自动跳转，请手动操作：', '#c00');
        if (btn) {
          btn.textContent = '手动：设置 → 应用 → 雪茄采集 → 权限 → 位置信息';
          btn.style.fontSize = '11px'; btn.style.whiteSpace = 'normal'; btn.style.height = 'auto'; btn.style.padding = '8px'; btn.style.lineHeight = '1.4';
        }
        setTimeout(function() {
          if (btn) {
            btn.textContent = '定位未开启？点击跳转系统设置 →';
            btn.style.fontSize = '13px'; btn.style.whiteSpace = ''; btn.style.height = ''; btn.style.padding = '10px'; btn.style.lineHeight = '';
          }
        }, 10000);
      }
    }
  };

  // Force viewport meta (backup for document.write in HTML)
  (function() {
    var vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement('meta');
      vp.name = 'viewport';
      document.head.appendChild(vp);
    }
    vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no';
  })();

  // Ensure body has background so "blank" isn't invisible
  document.documentElement.style.cssText = 'height:100%;background:#f5f6fa;font-size:18px;';
  document.body.style.cssText = 'margin:0;min-height:100%;background:#f5f6fa;font-size:1rem;';

  var noop = function() {};
  var DPR = window.devicePixelRatio || 1;

  window.plus = {
    runtime: { ready: function(c){if(c)setTimeout(c,0);return Promise.resolve();}, launchpath:'__uniappview.html', arguments:'', version:'1.0.0', appid:'com.cigar.collection', channel:'debug', getProperty:function(){return '';}, openURL:function(u){if(window.UniAppBridge)window.UniAppBridge.openURL(u);}, quit:noop, restart:noop, install:noop, setBadgeNumber:noop, processId:1 },
    screen: { resolutionWidth: window.innerWidth*DPR, resolutionHeight: window.innerHeight*DPR, scale: DPR, dpi: 160*DPR, logicalWidth: window.innerWidth, logicalHeight: window.innerHeight, autoRotation: 'portrait' },
    camera: { captureImage: function(s,f){if(window.UniAppBridge)window.UniAppBridge.takePhoto();if(f)f({code:-1,message:'相机未实现'});}, getCamera:noop },
    geolocation: { getCurrentPosition: function(s,f){if(window.UniAppBridge)window.UniAppBridge.getLocation();if(s)s({coords:{latitude:24.5159,longitude:118.1258,accuracy:50,altitude:0,altitudeAccuracy:0,heading:0,speed:0},timestamp:Date.now()});}, watchPosition:function(){return 1;}, clearWatch:noop },
    io: { resolveLocalFileSystemURL: noop, requestFileSystem: noop, convertLocalFileSystemURL: noop, File: function(){} },
    device: { model:'Android', vendor:'Test', platform:'Android', imei:'', uuid:'debug-uuid', screen:'normal' },
    os: { name:'Android', version:'14', language:'zh-CN', vendor:'Android' },
    nativeUI: { showToast: function(o,s){var m=(o&&o.message)||(o&&o.title)||'操作成功';if(window.UniAppBridge)window.UniAppBridge.showToast(m);if(s)s();}, alert:noop, confirm:noop, closeWaiting:noop, showWaiting:noop, actionSheet:noop, pickDate:noop, pickTime:noop },
    navigator: { setUserAgent:noop, getUserAgent:function(){return navigator.userAgent;}, updateSplashscreen:noop, closeSplashscreen:noop, hasNotchInScreen:function(){return false;}, isImmersedStatusbar:function(){return false;}, setStatusBarBackground:noop, setStatusBarStyle:noop },
    storage: { setItem:function(k,v){try{localStorage.setItem(k,v);}catch(e){}}, getItem:function(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}, removeItem:function(k){try{localStorage.removeItem(k);}catch(e){}}, clear:function(){try{localStorage.clear();}catch(e){}} },
    plus: {}, console: { log: function(){try{console.log.apply(console,arguments);}catch(e){}} }
  };

  function makeWebview() {
    return {
      id:'1', getURL:function(){return location.href;}, getTitle:function(){return document.title;},
      setStyle:noop, getStyle:function(){return{};}, show:noop, hide:noop, close:noop,
      addEventListener:noop, removeEventListener:noop, canBack:function(){return false;}, canForward:function(){return false;},
      back:noop, forward:noop, evalJS:noop, append:noop, remove:noop, loadURL:noop, stop:noop, reload:noop,
      postMessageToUniNView:noop, postMessage:noop, interceptTouchEvent:noop
    };
  }
  window.plus.webview = {
    currentWebview: function(){return makeWebview();},
    create: function(_,__,opts){return makeWebview();},
    close: noop, show: noop, hide: noop,
    getWebviewById: function(id){return makeWebview();},
    getLaunchWebview: function(){return makeWebview();},
    getAllWebviews: function(){return [makeWebview()];},
    postMessageToUniNView: noop
  };
  window.plus.plus = window.plus;

  window.uni = {
    showToast: function(o){var m=(o&&o.title)||(o&&o.message)||'操作成功';if(window.UniAppBridge)window.UniAppBridge.showToast(m);},
    showLoading: noop, hideLoading: noop, showActionSheet: noop,
    showModal: function(o){if(o&&o.content&&window.UniAppBridge)window.UniAppBridge.showToast(o.content);},
    getSystemInfoSync: function(){return {platform:'android',version:'14',model:'Android',screenWidth:window.innerWidth,screenHeight:window.innerHeight,windowWidth:window.innerWidth,windowHeight:window.innerHeight,statusBarHeight:24,safeAreaInsets:{top:0,bottom:0,left:0,right:0},safeArea:{top:0,bottom:0,left:0,right:0,width:window.innerWidth,height:window.innerHeight},pixelRatio:DPR,SDKVersion:'14',deviceId:'debug-device',deviceBrand:'Test',deviceModel:'Android',deviceType:'phone',devicePixelRatio:DPR,deviceOrientation:'portrait',osName:'android',osVersion:'14',osLanguage:'zh-CN',system:'Android 14',host:'',appId:'com.cigar.collection',appName:'雪茄采集',appVersion:'1.0.0',appVersionCode:'1',browserName:'webview',browserVersion:'1.0',uniPlatform:'web',uniCompileVersion:'4.84',uniRuntimeVersion:'3.0'};},
    getSystemInfo: function(s){if(s)s(this.getSystemInfoSync());},
    chooseImage: function(o,s,f){if(f)f({errMsg:'chooseImage not impl'});},
    getLocation: function(o,s,f){if(f)f({errMsg:'getLocation not impl'});},
    request: noop, setStorageSync: function(k,v){try{localStorage.setItem(k,v);}catch(e){}}, getStorageSync: function(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}, removeStorageSync: function(k){try{localStorage.removeItem(k);}catch(e){}}, getStorageInfoSync: function(){return {keys:Object.keys(localStorage||{}),currentSize:0,limitSize:10240};},
            navigateTo: function(o){if(o&&o.url)navigateToPage(o.url);}, navigateBack: function(){if(_pageHistory.length>0)navigateToPage(_pageHistory.pop());}, redirectTo: function(o){if(o&&o.url)navigateToPage(o.url);}, switchTab: function(o){if(o&&o.url)navigateToPage(o.url);}, reLaunch: function(o){_pageHistory=[];if(o&&o.url)navigateToPage(o.url);},
    scanCode: function(o,s,f){if(f)f({errMsg:'scan not impl'});},
    uploadFile: function(o,s,f){if(f)f({errMsg:'upload not impl'});},
    chooseLocation: function(o,s,f){if(f)f({errMsg:'chooseLocation not impl'});},
    getLocale: function(){return 'zh-CN';}, setLocale: noop,
    onNetworkStatusChange: noop, offNetworkStatusChange: noop,
    onAppShow: noop, offAppShow: noop, onAppHide: noop, offAppHide: noop,
    createSelectorQuery: noop, createMapContext: noop, pageScrollTo: noop,
    login: function(o){if(o&&o.fail)o.fail({errMsg:'login not impl'});}, checkSession: function(){},
    requireGlobal: function(){return {};},
    restoreGlobal: noop
  };

  function makeEmitter() {
    var handlers = {};
    return {
      subscribe: function(event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      publishHandler: function(event, data) {
        var list = handlers[event] || [];
        for (var i = 0; i < list.length; i++) {
          try { list[i](data); } catch (e) { debugLog('handler['+event+']: ' + e.message, true); }
        }
      }
    };
  }
  window.UniViewJSBridge = makeEmitter();

  window.__$__ = function(id) {
    if (typeof id === 'string') {
      return { $: document.getElementById(id) || document.body, $$: {}, dataset: {} };
    }
    return { $: document.body, $$: {}, dataset: {} };
  };
  window.rpx2px = function(rpx) { return (rpx * window.innerWidth) / 750; };
  window.normalizeStyleName = function(s) { return s; };
  window.normalizeStyleValue = function(s) { return s; };
  window.__f__ = function() { try { console.log.apply(console, arguments); } catch(e) {} };

  debugLog('Shim v7 installed. Loading via <script> tags...');

  // Page registry - app-service.js uses __definePage to register pages
  window.__definePage = function(path, component) {
    if (!window.__pages) window.__pages = {};
    window.__pages[path] = component;
    // Log first time each page is registered (for debugging)
    if (!window.__pageLogDone) window.__pageLogDone = {};
    if (!window.__pageLogDone[path]) {
      window.__pageLogDone[path] = true;
      try { console.log('[__definePage] ' + path + ' = ' + (component ? (component.__name || 'anonymous') : 'UNDEFINED')); } catch(e) {}
    }
  };
  // Fallback: also try to detect pages via global variables that app-service.js declares
  window.__refreshPageRegistry = function() {
    // Scan common global names that app-service.js uses for page components
    var candidates = ['ln', 'gn', 'Rn', 'Nn', 'Cn', 'jn'];
    var names = ['pages/login/index', 'pages/customers/index', 'pages/collect/index', 'pages/history/index', 'pages/history/detail', 'pages/profile/index'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var v = eval.call(window, candidates[i]);
        if (v && !window.__pages[names[i]]) {
          window.__pages[names[i]] = v;
          debugLog('Page registry fallback: ' + names[i] + ' from ' + candidates[i]);
        }
      } catch(e) {}
    }
  };
  // Other __ globals that may be referenced
  window.__CANCEL__ = false;
  window.__globalStyles = [];

  // Weex global (weex framework) - stub since not needed for our test build
  window.weex = {
    config: { env: { platform: 'android', version: '14', scale: DPR, deviceWidth: window.innerWidth, deviceHeight: window.innerHeight } },
    requireModule: function(){return {};},
    registerComponent: noop,
    callJS: noop,
    fireEvent: noop
  };

  // Load script in global scope via <script> tag injection
  function loadScriptGlobal(name) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', name, true);
      xhr.onload = function() {
        if (xhr.status !== 0 && xhr.status !== 200) {
          debugLog('XHR fail: ' + name + ' status=' + xhr.status, true);
          reject(new Error('XHR ' + xhr.status));
          return;
        }
        var code = xhr.responseText;
        // Inject via script tag to run in GLOBAL scope
        var s = document.createElement('script');
        s.text = code;
        s.onerror = function() { debugLog('Script err: ' + name, true); reject(new Error('script err')); };
        try {
          (document.head || document.documentElement).appendChild(s);
          debugLog('Loaded (global): ' + name + ' (' + code.length + ' chars)');
          resolve();
        } catch (e) {
          debugLog('EXEC ERR (' + name + '): ' + e.message, true);
          debugLog('Stack: ' + (e.stack || ''), true);
          reject(e);
        }
      };
      xhr.onerror = function() { debugLog('XHR err: ' + name, true); reject(new Error('network')); };
      xhr.send();
    });
  }

  function firePlusReady() {
    try {
      if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.ready) plus.runtime.ready();
      var e = new Event('plusready');
      document.dispatchEvent(e);
      if (typeof window.plusready === 'function') window.plusready();
      debugLog('plusready fired');
    } catch (ex) { debugLog('plusready err: ' + ex.message, true); }
  }

  function start() {
    debugLog('typeof Vue = ' + typeof window.Vue);
    loadScriptGlobal('vue.global.prod.js')
      .then(function() {
        debugLog('typeof Vue after load = ' + typeof window.Vue);
        // Patch Vue to add uni-app extensions
        if (window.Vue) {
          // createVueApp is uni-app's app entry creator - just an alias for createApp
          if (!window.Vue.createVueApp) {
            window.Vue.createVueApp = function(app) {
              var instance = window.Vue.createApp(app);
              instance._component.__isApp = true;
              return instance;
            };
          }
          // Page creator for pages
          if (!window.Vue.createPage) {
            window.Vue.createPage = function(page) {
              var c = window.Vue.defineComponent(page);
              c.__isPage = true;
              return c;
            };
          }
          // Component creator for components
          if (!window.Vue.createComponent) {
            window.Vue.createComponent = function(comp) {
              return window.Vue.defineComponent(comp);
            };
          }
          // Subpackage component
          if (!window.Vue.createSubpackageComponent) {
            window.Vue.createSubpackageComponent = function(comp) {
              return window.Vue.defineComponent(comp);
            };
          }
          // runWhen (sometimes used)
          if (!window.Vue.runWhen) {
            window.Vue.runWhen = function(c) { return c ? c() : undefined; };
          }
          // Patch createElementBlock/createElementVNode to remap uni-app tags (view, text, etc.) to div
          // so they render as proper block elements instead of HTMLUnknownElement
          if (window.Vue.createElementBlock) {
            var _origBlock = window.Vue.createElementBlock;
            window.Vue.createElementBlock = function(tag, ...rest) {
              if (tag === 'view' || tag === 'text' || tag === 'scroll-view' || tag === 'swiper') tag = 'div';
              return _origBlock(tag, ...rest);
            };
          }
          if (window.Vue.createElementVNode) {
            var _origVNode = window.Vue.createElementVNode;
            window.Vue.createElementVNode = function(tag, props, ...rest) {
              if (tag === 'view' || tag === 'text' || tag === 'scroll-view' || tag === 'swiper') tag = 'div';
              // uni-app compiles v-model on <input> as onUpdate:modelValue (custom component style)
              // Bridge it to native oninput so input refs actually update:
              if ((tag === 'input' || tag === 'textarea') && props) {
                var updateVal = props['onUpdate:modelValue'];
                if (updateVal) {
                  if (!props.onInput) {
                    props.onInput = function($event) {
                      updateVal($event.target.value);
                    };
                  }
                }
                // Force-enable inputs: uni-app's loading flag never resets (i() has no finally),
                // so disabled:true sticks forever and blocks typing
                delete props.disabled;
              }
              return _origVNode(tag, props, ...rest);
            };
          }
          debugLog('Vue patched: createVueApp=' + (typeof window.Vue.createVueApp) + ' block=' + (typeof window.Vue.createElementBlock));
        }
        // uni-app lifecycle hooks need Vue.injectHook (unexported internal)
        if (window.Vue && !window.Vue.injectHook) {
          window.Vue.injectHook = function(lifecycle, hook, target) {
            if (!target) return;
            (target[lifecycle] || (target[lifecycle] = [])).push(hook);
            return hook;
          };
          window.Vue.isInSSRComponentSetup = false;
          debugLog('Vue injected: injectHook');
        }
        // Mock API: accounts, customers, cigar-specs (from xlsx + form image)
        (function() {
          var _origXhrOpen = XMLHttpRequest.prototype.open;
          var _origXhrSend = XMLHttpRequest.prototype.send;
          var _accounts = {"a":{"password":"1","token":"mock-token-a","user":{"id":1,"username":"a","name":"测1","role":"test","roleName":"测试人员"}},"b":{"password":"2","token":"mock-token-b","user":{"id":2,"username":"b","name":"测2","role":"test","roleName":"测试人员"}},"c":{"password":"3","token":"mock-token-c","user":{"id":3,"username":"c","name":"测3","role":"test","roleName":"测试人员"}},"d":{"password":"4","token":"mock-token-d","user":{"id":4,"username":"d","name":"测4","role":"test","roleName":"测试人员"}},"lishaoyong":{"password":"lishaoyong5117","token":"mock-token-lishaoyong","user":{"id":5,"username":"lishaoyong","name":"李少勇","role":"admin","roleName":"管理员"}},"chenweiwei":{"password":"chenweiwei9550","token":"mock-token-chenweiwei","user":{"id":6,"username":"chenweiwei","name":"陈伟慰","role":"admin","roleName":"管理员"}},"huagnkaiyin":{"password":"huagnkaiyin9556","token":"mock-token-huagnkaiyin","user":{"id":7,"username":"huagnkaiyin","name":"黄开胤","role":"admin","roleName":"管理员"}},"xuxixi":{"password":"xuxixi6096","token":"mock-token-xuxixi","user":{"id":8,"username":"xuxixi","name":"徐希西","role":"admin","roleName":"管理员"}},"xiongyuchen":{"password":"xiongyuchen7615","token":"mock-token-xiongyuchen","user":{"id":9,"username":"xiongyuchen","name":"熊宇辰","role":"admin","roleName":"管理员"}},"wujingjing":{"password":"wjj2656","token":"mock-token-wujingjing","user":{"id":10,"username":"wujingjing","name":"邬晶晶","role":"manager","roleName":"客户经理"}},"caichoujuan":{"password":"ccj4890","token":"mock-token-caichoujuan","user":{"id":11,"username":"caichoujuan","name":"蔡绸绢","role":"manager","roleName":"客户经理"}},"jijunhao":{"password":"jjh1279","token":"mock-token-jijunhao","user":{"id":12,"username":"jijunhao","name":"纪君豪","role":"manager","roleName":"客户经理"}},"linhaibin":{"password":"lhb0573","token":"mock-token-linhaibin","user":{"id":13,"username":"linhaibin","name":"林海滨","role":"manager","roleName":"客户经理"}},"chenshanqiang":{"password":"csq3287","token":"mock-token-chenshanqiang","user":{"id":14,"username":"chenshanqiang","name":"陈善强","role":"manager","roleName":"客户经理"}},"houzhiyu":{"password":"hzy2865","token":"mock-token-houzhiyu","user":{"id":15,"username":"houzhiyu","name":"侯志育","role":"manager","roleName":"客户经理"}},"wubin":{"password":"wb8926","token":"mock-token-wubin","user":{"id":16,"username":"wubin","name":"吴斌","role":"manager","roleName":"客户经理"}},"yesijie":{"password":"ysj3877","token":"mock-token-yesijie","user":{"id":17,"username":"yesijie","name":"叶思婕","role":"manager","roleName":"客户经理"}},"xiaoxiuchun":{"password":"xxc9137","token":"mock-token-xiaoxiuchun","user":{"id":18,"username":"xiaoxiuchun","name":"肖秀春","role":"manager","roleName":"客户经理"}},"guanrui":{"password":"gr2191","token":"mock-token-guanrui","user":{"id":19,"username":"guanrui","name":"关锐","role":"manager","roleName":"客户经理"}}};
          var _customers = [{"id": "350206210761", "code": "350206210761", "name": "味厦觅（厦门）供应链有限公司", "phone": "17365189661", "contact_person": "沈越明", "contactPerson": "沈越明", "grade": "A+档", "manager": "吴斌", "gis_lng": 118.093214, "gisLng": 118.093214, "gis_lat": 24.525285, "gisLat": 24.525285, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206210862", "code": "350206210862", "name": "漳州市友铭商贸有限公司厦门分公司", "phone": "13606919000", "contact_person": "李坤辉", "contactPerson": "李坤辉", "grade": "A+档", "manager": "林海滨", "gis_lng": 118.183955, "gisLng": 118.183955, "gis_lat": 24.530367, "gisLat": 24.530367, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206211611", "code": "350206211611", "name": "厦门闽茄荟文化传播有限公司", "phone": "18159893383", "contact_person": "刘金福", "contactPerson": "刘金福", "grade": "A+档", "manager": "纪君豪", "gis_lng": 118.151249, "gisLng": 118.151249, "gis_lat": 24.527588, "gisLat": 24.527588, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206211331", "code": "350206211331", "name": "厦门船缘文传商贸有限公司", "phone": "13459207779", "contact_person": "陈慕华", "contactPerson": "陈慕华", "grade": "A档", "manager": "吴斌", "gis_lng": 118.104498, "gisLng": 118.104498, "gis_lat": 24.525338, "gisLat": 24.525338, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206111501", "code": "350206111501", "name": "厦门市湖里区心驰千里烟酒商行（工商个体户）", "phone": "13779938168", "contact_person": "林丽春", "contactPerson": "林丽春", "grade": "A档", "manager": "纪君豪", "gis_lng": 118.1555, "gisLng": 118.1555, "gis_lat": 24.532563, "gisLat": 24.532563, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206100107", "code": "350206100107", "name": "厦门市湖里区郭宝勇食杂店", "phone": "13400678478", "contact_person": "郭宝勇", "contactPerson": "郭宝勇", "grade": "A档", "manager": "邬晶晶", "gis_lng": 118.144163, "gisLng": 118.144163, "gis_lat": 24.521481, "gisLat": 24.521481, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206200126", "code": "350206200126", "name": "福建海晟连锁营销发展有限公司厦门海天店", "phone": "13696930951", "contact_person": "秦琴", "contactPerson": "秦琴", "grade": "A档", "manager": "蔡绸绢", "gis_lng": 118.088176, "gisLng": 118.088176, "gis_lat": 24.507618, "gisLat": 24.507618, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206200554", "code": "350206200554", "name": "厦门中卷商贸有限公司", "phone": "13850079168", "contact_person": "林燕君", "contactPerson": "林燕君", "grade": "A档", "manager": "蔡绸绢", "gis_lng": 118.087694, "gisLng": 118.087694, "gis_lat": 24.508488, "gisLat": 24.508488, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206109137", "code": "350206109137", "name": "厦门市湖里区振鹏兴便利店", "phone": "15959215900", "contact_person": "胡振鹏", "contactPerson": "胡振鹏", "grade": "A档", "manager": "林海滨", "gis_lng": 118.15089, "gisLng": 118.15089, "gis_lat": 24.502444, "gisLat": 24.502444, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206109345", "code": "350206109345", "name": "厦门市湖里区参九巴巴烟酒商行", "phone": "17075406666", "contact_person": "林志豪", "contactPerson": "林志豪", "grade": "A档", "manager": "林海滨", "gis_lng": 118.151077, "gisLng": 118.151077, "gis_lat": 24.506843, "gisLat": 24.506843, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206209823", "code": "350206209823", "name": "厦门酒零后酒业有限公司", "phone": "18250773222", "contact_person": "黄丽兰", "contactPerson": "黄丽兰", "grade": "A档", "manager": "邬晶晶", "gis_lng": 118.135978, "gisLng": 118.135978, "gis_lat": 24.510884, "gisLat": 24.510884, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206110562", "code": "350206110562", "name": "厦门市湖里区皮皮侠米便利店", "phone": "13950119434", "contact_person": "吴丽娜", "contactPerson": "吴丽娜", "grade": "A档", "manager": "吴斌", "gis_lng": 118.095292, "gisLng": 118.095292, "gis_lat": 24.526746, "gisLat": 24.526746, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206210804", "code": "350206210804", "name": "崇茗商贸（厦门）有限公司", "phone": "18559671777", "contact_person": "孙保龙", "contactPerson": "孙保龙", "grade": "A档", "manager": "陈善强", "gis_lng": 118.171241, "gisLng": 118.171241, "gis_lat": 24.511086, "gisLat": 24.511086, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206210922", "code": "350206210922", "name": "厦门禾青风商贸有限公司", "phone": "13400625399", "contact_person": "高毅华", "contactPerson": "高毅华", "grade": "A档", "manager": "吴斌", "gis_lng": 118.103579, "gisLng": 118.103579, "gis_lat": 24.537044, "gisLat": 24.537044, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206111412", "code": "350206111412", "name": "厦门市湖里区好日新食杂店", "phone": "13860440468", "contact_person": "颜荣耀", "contactPerson": "颜荣耀", "grade": "A档", "manager": "叶思婕", "gis_lng": 118.125151, "gisLng": 118.125151, "gis_lat": 24.495071, "gisLat": 24.495071, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206111643", "code": "350206111643", "name": "厦门市湖里区悦鑫行烟酒商行（个体工商户）", "phone": "19979487900", "contact_person": "雷建华", "contactPerson": "雷建华", "grade": "A档", "manager": "陈善强", "gis_lng": 118.071048, "gisLng": 118.071048, "gis_lat": 24.489386, "gisLat": 24.489386, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206107822", "code": "350206107822", "name": "厦门市湖里区瀚水水烟酒商行", "phone": "18950108077", "contact_person": "林芳荣", "contactPerson": "林芳荣", "grade": "B档", "manager": "肖秀春", "gis_lng": 118.104798, "gisLng": 118.104798, "gis_lat": 24.518701, "gisLat": 24.518701, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206111528", "code": "350206111528", "name": "厦门市湖里区二茄村烟酒商行（个体工商户）", "phone": "15980818618", "contact_person": "张素英", "contactPerson": "张素英", "grade": "B档", "manager": "纪君豪", "gis_lng": 118.156012, "gisLng": 118.156012, "gis_lat": 24.533073, "gisLat": 24.533073, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}, {"id": "350206101082", "code": "350206101082", "name": "厦门市湖里区爱兵食杂店", "phone": "18950090789", "contact_person": "苏爱兵", "contactPerson": "苏爱兵", "grade": "B档", "manager": "邬晶晶", "gis_lng": 118.147679, "gisLng": 118.147679, "gis_lat": 24.527832, "gisLat": 24.527832, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206200125", "code": "350206200125", "name": "福建海晟连锁营销发展有限公司厦门新景天湖广场店", "phone": "18959223190", "contact_person": "秦琴", "contactPerson": "秦琴", "grade": "B档", "manager": "叶思婕", "gis_lng": 118.127522, "gisLng": 118.127522, "gis_lat": 24.498653, "gisLat": 24.498653, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206107440", "code": "350206107440", "name": "厦门市湖里区杨悦辰便利店", "phone": "15759089670", "contact_person": "林小妹", "contactPerson": "林小妹", "grade": "B档", "manager": "肖秀春", "gis_lng": 118.105816, "gisLng": 118.105816, "gis_lat": 24.517495, "gisLat": 24.517495, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206107474", "code": "350206107474", "name": "厦门市湖里区远航优品便利店", "phone": "18205995475", "contact_person": "黄小庆", "contactPerson": "黄小庆", "grade": "B档", "manager": "陈善强", "gis_lng": 118.077007, "gisLng": 118.077007, "gis_lat": 24.489936, "gisLat": 24.489936, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206208469", "code": "350206208469", "name": "厦门市海松生态茶业有限公司", "phone": "13779990577", "contact_person": "许添平", "contactPerson": "许添平", "grade": "B档", "manager": "蔡绸绢", "gis_lng": 118.096551, "gisLng": 118.096551, "gis_lat": 24.50623, "gisLat": 24.50623, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206109707", "code": "350206109707", "name": "厦门市湖里区杨绵福便利店", "phone": "15280263523", "contact_person": "杨绵福", "contactPerson": "杨绵福", "grade": "B档", "manager": "蔡绸绢", "gis_lng": 118.112968, "gisLng": 118.112968, "gis_lat": 24.509678, "gisLat": 24.509678, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206110150", "code": "350206110150", "name": "厦门市湖里区盛豪惠烟酒商行", "phone": "13606098456", "contact_person": "钟豪杰", "contactPerson": "钟豪杰", "grade": "B档", "manager": "纪君豪", "gis_lng": 118.158309, "gisLng": 118.158309, "gis_lat": 24.52647, "gisLat": 24.52647, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206210825", "code": "350206210825", "name": "厦门欣鸿颜贸易有限公司", "phone": "15959209108", "contact_person": "颜如贵", "contactPerson": "颜如贵", "grade": "B档", "manager": "叶思婕", "gis_lng": 118.124556, "gisLng": 118.124556, "gis_lat": 24.507089, "gisLat": 24.507089, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206200363", "code": "350206200363", "name": "福建海晟连锁营销发展有限公司厦门闽南印象店", "phone": "13400609823", "contact_person": "秦琴", "contactPerson": "秦琴", "grade": "B档", "manager": "侯志育", "gis_lng": 118.138972, "gisLng": 118.138972, "gis_lat": 24.502461, "gisLat": 24.502461, "store_type": "精品店", "storeType": "精品店", "status": "ACTIVE"}, {"id": "350206111785", "code": "350206111785", "name": "厦门市湖里区梦享茄烟酒商行(个体工商户)", "phone": "18020700058", "contact_person": "黄景宏", "contactPerson": "黄景宏", "grade": "C档", "manager": "侯志育", "gis_lng": 118.138704, "gisLng": 118.138704, "gis_lat": 24.506491, "gisLat": 24.506491, "store_type": "专业店", "storeType": "专业店", "status": "ACTIVE"}];
          var _specs = [{"id": "6", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦10号)", "cigar_type": "手工茄", "code": "14200127", "barcode": "6901028218665", "sales": 3.6504, "sales_amount": 113.1624, "purchase_price": 558.0, "wholesale_price": 744.0, "retail_price": 1200.0, "brand": "黄鹤楼"}, {"id": "42", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(盛世6号)", "cigar_type": "手工茄", "code": "15101140", "barcode": "6901028258951", "sales": 3.2952, "sales_amount": 80.7324, "purchase_price": 441.12, "wholesale_price": 588.0, "retail_price": 840.0, "brand": "长城"}, {"id": "41", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(揽胜3号经典)", "cigar_type": "手工茄", "code": "15101124", "barcode": "6901028029292", "sales": 3.191, "sales_amount": 191.46, "purchase_price": 450.5, "wholesale_price": 600.0, "retail_price": 800.0, "brand": "长城"}, {"id": "7", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦9号)25支", "cigar_type": "手工茄", "code": "14200251", "barcode": "6901028183994", "sales": 2.6075, "sales_amount": 73.01, "purchase_price": 525.0, "wholesale_price": 700.0, "retail_price": 1000.0, "brand": "黄鹤楼"}, {"id": "62", "price_category": "06", "sub_price_zone": "0201", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(红色132)", "cigar_type": "手工茄", "code": "15101120", "barcode": "6901028146005", "sales": 2.064, "sales_amount": 61.92, "purchase_price": 112.5, "wholesale_price": 150.0, "retail_price": 200.0, "brand": "长城"}, {"id": "20", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(导师1号)", "cigar_type": "手工茄", "code": "15120171", "barcode": "6901028267526", "sales": 1.7225, "sales_amount": 120.575, "purchase_price": 1312.5, "wholesale_price": 1750.0, "retail_price": 2500.0, "brand": "长城"}, {"id": "32", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(导师7号)", "cigar_type": "手工茄", "code": "15120085", "barcode": "6901028268448", "sales": 1.49, "sales_amount": 52.15, "purchase_price": 656.25, "wholesale_price": 875.0, "retail_price": 1250.0, "brand": "长城"}, {"id": "40", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(盛世3号)", "cigar_type": "手工茄", "code": "15101146", "barcode": "6901028258982", "sales": 1.4592, "sales_amount": 56.1792, "purchase_price": 462.08, "wholesale_price": 616.0, "retail_price": 880.0, "brand": "长城"}, {"id": "30", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(132记忆)", "cigar_type": "手工茄", "code": "15101127", "barcode": "6901028042499", "sales": 1.4325, "sales_amount": 60.165, "purchase_price": 787.5, "wholesale_price": 1050.0, "retail_price": 1500.0, "brand": "长城"}, {"id": "23", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(揽胜2号)", "cigar_type": "手工茄", "code": "15120102", "barcode": "6901028258715", "sales": 1.368, "sales_amount": 114.912, "purchase_price": 1260.0, "wholesale_price": 1680.0, "retail_price": 2400.0, "brand": "长城"}, {"id": "33", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(132奇迹)", "cigar_type": "手工茄", "code": "15101128", "barcode": "6901028042475", "sales": 1.257, "sales_amount": 80.652, "purchase_price": 487.5, "wholesale_price": 650.0, "retail_price": 1000.0, "brand": "长城"}, {"id": "14", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(战神白金)", "cigar_type": "手工茄", "code": "13720078", "barcode": "6901028239608", "sales": 1.096, "sales_amount": 52.608, "purchase_price": 720.0, "wholesale_price": 960.0, "retail_price": 1600.0, "brand": "泰山"}, {"id": "51", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(经典3号)", "cigar_type": "手工茄", "code": "15101133", "barcode": "6901028258074", "sales": 0.894, "sales_amount": 33.972, "purchase_price": 285.0, "wholesale_price": 380.0, "retail_price": 500.0, "brand": "长城"}, {"id": "29", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(导师6号)", "cigar_type": "手工茄", "code": "15120118", "barcode": "6901028268462", "sales": 0.87, "sales_amount": 36.54, "purchase_price": 787.5, "wholesale_price": 1050.0, "retail_price": 1500.0, "brand": "长城"}, {"id": "22", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(导师2号)", "cigar_type": "手工茄", "code": "15101150", "barcode": "6901028258098", "sales": 0.86, "sales_amount": 58.05, "purchase_price": 1265.75, "wholesale_price": 1687.5, "retail_price": 2250.0, "brand": "长城"}, {"id": "17", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(战神6号)", "cigar_type": "手工茄", "code": "13720077", "barcode": "6901028240802", "sales": 0.8208, "sales_amount": 29.5488, "purchase_price": 648.0, "wholesale_price": 864.0, "retail_price": 1440.0, "brand": "泰山"}, {"id": "18", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(蓝色假日)", "cigar_type": "手工茄", "code": "13401144", "barcode": "6901028132695", "sales": 0.805, "sales_amount": 24.311, "purchase_price": 566.25, "wholesale_price": 755.0, "retail_price": 1000.0, "brand": "王冠"}, {"id": "28", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(揽胜1号)", "cigar_type": "手工茄", "code": "15101141", "barcode": "6901028145909", "sales": 0.778, "sales_amount": 87.136, "purchase_price": 735.0, "wholesale_price": 1120.0, "retail_price": 1300.0, "brand": "长城"}, {"id": "35", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(逍遥7号)", "cigar_type": "手工茄", "code": "14220117", "barcode": "6901028242462", "sales": 0.64, "sales_amount": 38.08, "purchase_price": 446.3, "wholesale_price": 595.0, "retail_price": 850.0, "brand": "黄鹤楼"}, {"id": "8", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(逍遥6号)", "cigar_type": "手工茄", "code": "14200121", "barcode": "6901028241434", "sales": 0.579, "sales_amount": 40.53, "purchase_price": 525.0, "wholesale_price": 700.0, "retail_price": 1000.0, "brand": "黄鹤楼"}, {"id": "3", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(公爵)10支", "cigar_type": "手工茄", "code": "14201132", "barcode": "6901028181426", "sales": 0.515, "sales_amount": 103.0, "purchase_price": 1500.0, "wholesale_price": 2000.0, "retail_price": 2600.0, "brand": "黄鹤楼"}, {"id": "43", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦7号)", "cigar_type": "手工茄", "code": "14200122", "barcode": "6901028242493", "sales": 0.506, "sales_amount": 23.276, "purchase_price": 345.0, "wholesale_price": 460.0, "retail_price": 700.0, "brand": "黄鹤楼"}, {"id": "13", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(战神·风林火山)", "cigar_type": "手工茄", "code": "13720198", "barcode": "6901028239516", "sales": 0.462, "sales_amount": 22.638, "purchase_price": 735.0, "wholesale_price": 980.0, "retail_price": 1400.0, "brand": "泰山"}, {"id": "24", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(GL3号)", "cigar_type": "手工茄", "code": "15101138", "barcode": "6901028237055", "sales": 0.398, "sales_amount": 66.864, "purchase_price": 1260.0, "wholesale_price": 1680.0, "retail_price": 2400.0, "brand": "长城"}, {"id": "45", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦8号)5支", "cigar_type": "手工茄", "code": "14200253", "barcode": "6901028183901", "sales": 0.391, "sales_amount": 23.46, "purchase_price": 225.0, "wholesale_price": 300.0, "retail_price": 500.0, "brand": "黄鹤楼"}, {"id": "44", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦100)", "cigar_type": "手工茄", "code": "14200132", "barcode": "6901028242431", "sales": 0.348, "sales_amount": 24.36, "purchase_price": 262.5, "wholesale_price": 350.0, "retail_price": 500.0, "brand": "黄鹤楼"}, {"id": "2", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(逍遥3号)", "cigar_type": "手工茄", "code": "14200133", "barcode": "6901028242080", "sales": 0.314, "sales_amount": 32.97, "purchase_price": 1575.0, "wholesale_price": 2100.0, "retail_price": 3000.0, "brand": "黄鹤楼"}, {"id": "36", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之梦5号)", "cigar_type": "手工茄", "code": "14200119", "barcode": "6901028184632", "sales": 0.275, "sales_amount": 15.4, "purchase_price": 420.0, "wholesale_price": 560.0, "retail_price": 800.0, "brand": "黄鹤楼"}, {"id": "25", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(GJ6号)", "cigar_type": "手工茄", "code": "15101130", "barcode": "6901028238397", "sales": 0.248, "sales_amount": 29.76, "purchase_price": 900.0, "wholesale_price": 1200.0, "retail_price": 2000.0, "brand": "长城"}, {"id": "48", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(国粹风度)", "cigar_type": "手工茄", "code": "13401151", "barcode": "6901028131919", "sales": 0.23, "sales_amount": 11.96, "purchase_price": 390.0, "wholesale_price": 520.0, "retail_price": 700.0, "brand": "王冠"}, {"id": "61", "price_category": "06", "sub_price_zone": "0201", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(假日阳光)", "cigar_type": "手工茄", "code": "13401150", "barcode": "6901028088862", "sales": 0.22, "sales_amount": 7.92, "purchase_price": 0, "wholesale_price": 144.0, "retail_price": 200.0, "brand": "王冠"}, {"id": "11", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(战神黑金)", "cigar_type": "手工茄", "code": "13720079", "barcode": "6901028239578", "sales": 0.206, "sales_amount": 14.832, "purchase_price": 1080.0, "wholesale_price": 1440.0, "retail_price": 2400.0, "brand": "泰山"}, {"id": "15", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(超级战神)", "cigar_type": "手工茄", "code": "13700133", "barcode": "6901028158244", "sales": 0.194, "sales_amount": 17.46, "purchase_price": 675.0, "wholesale_price": 900.0, "retail_price": 1500.0, "brand": "泰山"}, {"id": "56", "price_category": "06", "sub_price_zone": "0104", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(战神5号)", "cigar_type": "手工茄", "code": "13700128", "barcode": "6901028941556", "sales": 0.1712, "sales_amount": 5.564, "purchase_price": 194.96, "wholesale_price": 260.0, "retail_price": 400.0, "brand": "泰山"}, {"id": "39", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(小国粹)", "cigar_type": "手工茄", "code": "13401145", "barcode": "6901028089920", "sales": 0.1625, "sales_amount": 3.6888, "purchase_price": 425.0, "wholesale_price": 567.5, "retail_price": 750.0, "brand": "王冠"}, {"id": "9", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(巅峰2号)", "cigar_type": "手工茄", "code": "13700127", "barcode": "6901028154352", "sales": 0.104, "sales_amount": 24.2663, "purchase_price": 1750.0, "wholesale_price": 2333.3, "retail_price": 4200.0, "brand": "泰山"}, {"id": "37", "price_category": "06", "sub_price_zone": "0102", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(巅峰6号)", "cigar_type": "手工茄", "code": "13700121", "barcode": "6901028154413", "sales": 0.022, "sales_amount": 2.376, "purchase_price": 405.0, "wholesale_price": 540.0, "retail_price": 900.0, "brand": "泰山"}, {"id": "19", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(GL1号)", "cigar_type": "手工茄", "code": "15120092", "barcode": "6901028145695", "sales": 0.0215, "sales_amount": 7.525, "purchase_price": 1312.5, "wholesale_price": 1750.0, "retail_price": 5000.0, "brand": "长城"}, {"id": "12", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "泰山(都市丛林)", "cigar_type": "手工茄", "code": "13700132", "barcode": "6901028941525", "sales": 0.02, "sales_amount": 2.4, "purchase_price": 900.0, "wholesale_price": 1200.0, "retail_price": 2000.0, "brand": "泰山"}, {"id": "1", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(1916兽首)", "cigar_type": "手工茄", "code": "14200130", "barcode": "6901028178662", "sales": 0.012, "sales_amount": 2.52, "purchase_price": 3150.0, "wholesale_price": 4200.0, "retail_price": 6000.0, "brand": "黄鹤楼"}, {"id": "12", "price_category": "06", "sub_price_zone": "0104", "manufacturer": "四川中烟工业有限责任公司", "name": "长城(迷你原味)", "cigar_type": "机制茄", "code": "15101121", "barcode": "6901028146067", "sales": 3.45, "sales_amount": 7.59, "purchase_price": 165.0, "wholesale_price": 220.0, "retail_price": 300.0, "brand": "长城"}, {"id": "4", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(冰咖MIX)", "cigar_type": "机制茄", "code": "13401152", "barcode": "6901028089616", "sales": 2.36, "sales_amount": 3.5872, "purchase_price": 228.0, "wholesale_price": 304.0, "retail_price": 400.0, "brand": "王冠"}, {"id": "2", "price_category": "06", "sub_price_zone": "0103", "manufacturer": "湖北中烟工业有限责任公司", "name": "黄鹤楼(雪之韵6号)", "cigar_type": "机制茄", "code": "14200117", "barcode": "6901028184755", "sales": 2.14, "sales_amount": 10.7, "purchase_price": 375.0, "wholesale_price": 500.0, "retail_price": 700.0, "brand": "黄鹤楼"}, {"id": "10", "price_category": "06", "sub_price_zone": "0104", "manufacturer": "安徽中烟工业有限责任公司", "name": "王冠(20支)", "cigar_type": "机制茄", "code": "13409104", "barcode": "6901028208352", "sales": 2.04, "sales_amount": 2.346, "purchase_price": 172.0, "wholesale_price": 230.0, "retail_price": 300.0, "brand": "王冠"}, {"id": "1", "price_category": "06", "sub_price_zone": "0101", "manufacturer": "山东中烟工业有限责任公司", "name": "将军(战神荣耀)", "cigar_type": "机制茄", "code": "13700122", "barcode": "6901028158039", "sales": 0.42, "sales_amount": 6.048, "purchase_price": 540.0, "wholesale_price": 720.0, "retail_price": 1000.0, "brand": "将军"}];

var SUPABASE_URL = (function(){try{return localStorage.getItem('sb_url')||'https://xbcmbtaprxzszlhdtzza.supabase.co';}catch(e){return 'https://xbcmbtaprxzszlhdtzza.supabase.co';}})();
var SUPABASE_ANON_KEY = (function(){try{return localStorage.getItem('sb_key')||'sb_publishable_NXtaMiM_DLzyn6mEUOfM4Q_ifa7hw0W';}catch(e){return 'sb_publishable_NXtaMiM_DLzyn6mEUOfM4Q_ifa7hw0W';}})();

          function _sbApi(method, table, body, params, callback) {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { if (callback) callback(0, ''); return; }
            try {
              var url = SUPABASE_URL + '/rest/v1/' + table;
              if (params) url += '?' + params;
              var xhr = new XMLHttpRequest();
              _origXhrOpen.call(xhr, method, url, true);
              xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                  if (callback) callback(xhr.status, xhr.responseText);
                }
              };
              xhr.setRequestHeader('Content-Type', 'application/json');
              xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
              xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
              if (method === 'POST') {
                xhr.setRequestHeader('Prefer', body instanceof Array ? 'resolution=merge-duplicates,return=representation' : 'return=representation');
              }
              _origXhrSend.call(xhr, body ? JSON.stringify(body) : null);
            } catch(e) {
              if (callback) callback(0, '');
            }
          }

          function _sbInsert(table, data, callback) { _sbApi('POST', table, data, null, callback); }

          function _sbUpsert(table, data, callback) { _sbApi('POST', table, data, null, callback); }

          window.__sbApi = _sbApi;
          window.__sbInsert = _sbInsert;

          function _findCustomer(id) {
            id = String(id);
            for (var i = 0; i < _customers.length; i++) {
              if (_customers[i].id === id || _customers[i].code === id) return _customers[i];
            }
            return null;
          }

          window.__showCollectionDetail = function(custId) {
            var subKey = 'cigar:submission:' + custId;
            var sub = null;
            try { sub = JSON.parse(localStorage.getItem(subKey)); } catch(e) {}
            if (!sub) { alert('未找到采集记录'); return; }
            var c = _findCustomer(custId);
            var cName = sub.customerName || (c ? c.name : '未知客户');
            var cCode = c ? c.code : '';
            var colDate = sub.collectedAt ? new Date(sub.collectedAt) : new Date();
            var dateStr = colDate.toLocaleString('zh-CN', {hour12:false});
            var collectedBy = sub.collectedBy || '';
            var contactPerson = sub.contactPerson || (c ? c.contactPerson : '') || '';
            var phone = sub.phone || (c ? c.phone : '') || '';
            var specs = sub.details || [];
            var specRows = '';
            for (var si = 0; si < specs.length; si++) {
              var s = specs[si];
              var sName = s.cigarName || '';
              if (!sName) {
                for (var sj = 0; sj < _specs.length; sj++) {
                  if (_specs[sj].id == s.cigarSpecId) { sName = _specs[sj].name; break; }
                }
              }
              specRows += '<tr><td style="padding:4px;border:1px solid #ddd;font-size:12px">' + sName +
                '</td><td style="padding:4px;border:1px solid #ddd;font-size:12px;text-align:center">' + (s.salesQty||'') +
                '</td><td style="padding:4px;border:1px solid #ddd;font-size:12px;text-align:center">' + (s.actualStockLoose||'') +
                '</td><td style="padding:4px;border:1px solid #ddd;font-size:12px;text-align:center">' + (s.countedStockLoose||'') +
                '</td><td style="padding:4px;border:1px solid #ddd;font-size:12px;text-align:center">' + (s.actualStockBoxed||'') +
                '</td><td style="padding:4px;border:1px solid #ddd;font-size:12px;text-align:center">' + (s.countedStockBoxed||'') + '</td></tr>';
            }
            var html = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)this.style.display=\'none\'">' +
              '<div style="background:#fff;border-radius:8px;max-width:95%;max-height:90%;overflow:auto;padding:16px;position:relative;min-width:350px">' +
              '<div style="font-size:16px;font-weight:bold;margin-bottom:4px">' + cName + '</div>' +
              '<div style="font-size:12px;color:#666;margin-bottom:2px">证号: ' + cCode + ' | 负责人: ' + contactPerson + '</div>' +
              '<div style="font-size:12px;color:#666;margin-bottom:2px">电话: ' + phone + '</div>' +
              '<div style="font-size:12px;color:#666;margin-bottom:2px">采集人: ' + collectedBy + ' | 时间: ' + dateStr + '</div>' +
              '<div style="font-size:12px;color:#666;margin-bottom:4px">GPS距离: ' + (sub.gpsLat && sub.gpsLng && c && c.gis_lat && c.gis_lng ? window.__haversineKm(sub.gpsLat, sub.gpsLng, Number(c.gis_lat), Number(c.gis_lng)).toFixed(2) + ' km' : 'N/A') + '</div>' +
              '<table style="width:100%;border-collapse:collapse;min-width:380px"><thead><tr>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">雪茄名称</th>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">销量(支)</th>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">散装实际(支)</th>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">散装盘点(支)</th>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">盒装实际(支)</th>' +
              '<th style="padding:6px;border:1px solid #ddd;background:#f5f6fa;font-size:12px">盒装盘点(支)</th></tr></thead><tbody>' +
              specRows + '</tbody></table>' +
              '<div style="text-align:center;margin-top:12px"><button onclick="this.parentNode.parentNode.parentNode.style.display=\'none\'" style="background:#999;color:#fff;border:none;border-radius:4px;padding:6px 20px;font-size:14px">关闭</button></div>' +
              '</div></div>';
            var div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div);
          };

          window.__startCollection = function(custId) {
            debugLog('startCollection: ' + custId);
            window.__collectCustomerId = custId;
            try { localStorage.removeItem('cigar:draft:' + custId); } catch(e) {}
            if (window.__wrapperProxy) {
              window.__wrapperProxy.pageName = 'pages/collect/index';
              debugLog('startCollection: navigated via __wrapperProxy');
            } else {
              navigateToPage('/pages/collect/index');
            }
            setTimeout(function() {
              window.__collectCustomerId = custId;
              if (window.__collectVm) {
                window.__collectVm.customerId = custId;
                window.__collectVm.customer = null;
                window.__collectVm.formData = {};
                window.__collectVm.currentIndex = 0;
                window.__collectVm.view = 'form';
                window.__collectVm.errorMsg = '';
                window.__collectVm.init();
              }
            }, 400);
          };

          window.__injectCollectedStatus = function() {
            var _retries = 0;
            function _tryInject() {
              try {
                var cards = document.querySelectorAll('.card-code');
                if (!cards || !cards.length) {
                  if (_retries < 5) { _retries++; setTimeout(_tryInject, 400); }
                  return;
                }
                var cUsr = window.__currentUser || {};
                var cRole = cUsr.role || '';
                var cName = cUsr.name || '';
                var now = new Date();
                var thisMonth = now.getMonth();
                var thisYear = now.getFullYear();
                var filterManager = '';
                var filterGrade = '';
                var filterStore = '';
                var filterRow = document.getElementById('__filter_row');
                if (!filterRow) {
                  filterRow = document.createElement('div');
                  filterRow.id = '__filter_row';
                  filterRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 10px 0;background:#fff;border-bottom:1px solid #eee;position:relative;z-index:5';
                  filterRow.innerHTML =
                    '<select id="__filt_manager" style="font-size:12px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;flex:1;min-width:0;background:#fff;color:#333">' +
                    '<option value="">全部客户经理</option>' +
                    '<option value="邬晶晶">邬晶晶</option><option value="蔡绸绢">蔡绸绢</option>' +
                    '<option value="纪君豪">纪君豪</option><option value="林海滨">林海滨</option>' +
                    '<option value="陈善强">陈善强</option><option value="侯志育">侯志育</option>' +
                    '<option value="吴斌">吴斌</option><option value="叶思婕">叶思婕</option>' +
                    '<option value="肖秀春">肖秀春</option><option value="关锐">关锐</option>' +
                    '</select>' +
                    '<select id="__filt_grade" style="font-size:12px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;flex:1;min-width:0;background:#fff;color:#333">' +
                    '<option value="">全部档次</option><option value="A+档">A+档</option><option value="A档">A档</option><option value="B档">B档</option><option value="C档">C档</option>' +
                    '</select>' +
                    '<select id="__filt_store" style="font-size:12px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;flex:1;min-width:0;background:#fff;color:#333">' +
                    '<option value="">全部类型</option><option value="精品店">精品店</option><option value="专业店">专业店</option>' +
                    '</select>';
                  var custPage = document.querySelector('.customers-page');
                  if (custPage) {
                    var cardList = custPage.querySelector('.card-list');
                    if (cardList) {
                      custPage.insertBefore(filterRow, cardList);
                    } else {
                      custPage.insertBefore(filterRow, custPage.firstChild.nextSibling || custPage.firstChild);
                    }
                  } else {
                    var firstCard = cards[0] && (cards[0].closest('[class*="card"]') || cards[0].parentNode);
                    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(filterRow, firstCard);
                  }
                  filterRow.querySelectorAll('select').forEach(function(s) {
                    s.addEventListener('change', function() { window.__injectCollectedStatus(); });
                  });
                }
                filterManager = document.getElementById('__filt_manager') ? document.getElementById('__filt_manager').value : '';
                filterGrade = document.getElementById('__filt_grade') ? document.getElementById('__filt_grade').value : '';
                filterStore = document.getElementById('__filt_store') ? document.getElementById('__filt_store').value : '';
                for (var i = 0; i < cards.length; i++) {
                  (function(idx) {
                    var code = (cards[idx].textContent || '').trim();
                    if (!code) return;
                    var custObj = null;
                    for (var j = 0; j < _customers.length; j++) {
                      if (_customers[j].code === code || _customers[j].id === code) { custObj = _customers[j]; break; }
                    }
                    if (!custObj) return;
                    var cid = custObj.id;
                    var container = cards[idx].parentNode;
                    while (container && container.parentNode && !container.onclick) container = container.parentNode;
                    if (!container || container === document) container = cards[idx].parentNode.parentNode;
                    // Role-based filtering: manager can only see their own customers
                    if (cRole === 'manager' && custObj.manager !== cName) {
                      container.style.display = 'none';
                      return;
                    }
                    // Filter by manager select
                    if (filterManager && custObj.manager !== filterManager) {
                      container.style.display = 'none';
                      return;
                    }
                    // Filter by grade
                    if (filterGrade && custObj.grade !== filterGrade) {
                      container.style.display = 'none';
                      return;
                    }
                    // Filter by store type
                    if (filterStore && custObj.storeType !== filterStore) {
                      container.style.display = 'none';
                      return;
                    }
                    container.style.display = '';
                    var st = custObj.storeType || '';
                    var stTag = container.querySelector('.__store_tag');
                    if (st && !stTag) {
                      stTag = document.createElement('span');
                      stTag.className = '__store_tag';
                      stTag.style.cssText = 'display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px;color:#fff;vertical-align:middle';
                      if (st === '精品店') stTag.style.background = '#e67e22';
                      else if (st === '专业店') stTag.style.background = '#2980b9';
                      else stTag.style.background = '#999';
                      stTag.textContent = st;
                      var codeEl = container.querySelector('.card-row--top') || container.querySelector('.card-code');
                      var target = codeEl || cards[idx].parentNode;
                      target.appendChild(stTag);
                    }
                    // Show manager tag
                    var mgrTag = container.querySelector('.__mgr_tag');
                    if (!mgrTag && custObj.manager) {
                      mgrTag = document.createElement('span');
                      mgrTag.className = '__mgr_tag';
                      mgrTag.style.cssText = 'display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px;color:#fff;vertical-align:middle;background:#8e44ad';
                      mgrTag.textContent = custObj.manager;
                      var codeEl2 = container.querySelector('.card-row--top') || container.querySelector('.card-code');
                      var target2 = codeEl2 || cards[idx].parentNode;
                      target2.appendChild(mgrTag);
                    }
                    // Show grade tag
                    var gradeTag = container.querySelector('.__grade_tag');
                    if (!gradeTag && custObj.grade) {
                      gradeTag = document.createElement('span');
                      gradeTag.className = '__grade_tag';
                      gradeTag.style.cssText = 'display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;margin-left:4px;color:#fff;vertical-align:middle;background:#27ae60';
                      gradeTag.textContent = custObj.grade;
                      var codeEl3 = container.querySelector('.card-row--top') || container.querySelector('.card-code');
                      var target3 = codeEl3 || cards[idx].parentNode;
                      target3.appendChild(gradeTag);
                    }
                    // Lookup GPS distance from server data
                    var gpsDistM = null;
                    var colInfo = '';
                    var subKey = 'cigar:submission:' + cid;
                    var sub = null;
                    var serverCollectedAt = null;
                    var serverCollectedBy = '';
                    try {
                      var _recs = window.__v626_records || [];
                      for (var _ri = 0; _ri < _recs.length; _ri++) {
                        var _r = _recs[_ri];
                        var _matchId = _r.customer_id || _r.customer_code || _r.code || '';
                        if (_matchId == cid || _matchId == custObj.code) {
                          if (_r.distanceToCustomerM != null) gpsDistM = _r.distanceToCustomerM;
                          var _dets = _r.details || _r.specs || [];
                          var _hasReal = false;
                          for (var _di = 0; _di < _dets.length; _di++) {
                            if (_dets[_di].sales_qty > 0 || _dets[_di].actual_stock_loose > 0 || _dets[_di].counted_stock_loose > 0) {
                              _hasReal = true; break;
                            }
                          }
                          if (_hasReal && _r.collectedAt) {
                            serverCollectedAt = new Date(_r.collectedAt);
                            serverCollectedBy = _r.collected_by || _r.collectedBy || '未知';
                          }
                          break;
                        }
                      }
                    } catch(e) {}
                    // Fallback: compute GPS distance from localStorage submission
                    if (gpsDistM === null) {
                      try {
                        var _localGps = JSON.parse(localStorage.getItem(subKey));
                        if (_localGps && _localGps.gpsLat && _localGps.gpsLng && custObj.gis_lat && custObj.gis_lng && window.__haversineKm) {
                          gpsDistM = Math.round(window.__haversineKm(
                            Number(_localGps.gpsLat), Number(_localGps.gpsLng),
                            Number(custObj.gis_lat), Number(custObj.gis_lng)
                          ) * 1000);
                        }
                      } catch(e) {}
                    }
                    try { sub = JSON.parse(localStorage.getItem(subKey)); } catch(e) {}
                    var colHasLocal = sub && sub.collectedAt;
                    var colHasServer = serverCollectedAt !== null;
                    // Pick the best source: prefer localStorage (user's own device), fallback to server
                    var colDate = null;
                    var colBy = '';
                    if (colHasLocal) {
                      colDate = new Date(sub.collectedAt);
                      colBy = sub.collectedBy || '未知';
                    } else if (colHasServer) {
                      colDate = serverCollectedAt;
                      colBy = serverCollectedBy;
                      // Also save to localStorage so __showCollectionDetail works
                      try {
                        localStorage.setItem(subKey, JSON.stringify({
                          collectedAt: colDate.toISOString(), collectedBy: colBy,
                          customerId: _subCid, customerName: custObj.name || ''
                        }));
                      } catch(e) {}
                    }
                    if (colDate) {
                      var dateStr = colDate.toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
                      colInfo = '<span style="color:#888">上次采集: ' + dateStr + ' by ' + colBy + '</span>';
                      if (colDate.getFullYear() === thisYear && colDate.getMonth() === thisMonth) {
                        colInfo = '<span style="color:#090;font-weight:600">✔ 本月已采集 ' + ('0' + colDate.getDate()).slice(-2) + '日</span> | ' + colInfo;
                      }
                    }
                    var existingRow = container.querySelector('.__col_bottom_row');
                    if (!existingRow) {
                      var bottomRow = document.createElement('div');
                      bottomRow.className = '__col_bottom_row';
                      bottomRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 8px 6px';
                      var infoSpan = document.createElement('span');
                      infoSpan.style.cssText = 'flex:1;font-size:10px;line-height:1.3;min-width:0';
                      infoSpan.innerHTML = colInfo || '<span style="color:#ccc">暂未采集</span>';
                      infoSpan.onclick = function(ocid) { return function(e) { if (sub) { e.stopPropagation(); window.__showCollectionDetail(ocid); } }; }(cid);
                      bottomRow.appendChild(infoSpan);
                      var startBtn = document.createElement('button');
                      startBtn.className = '__col_start_btn';
                      startBtn.style.cssText = 'flex:0 0 auto;width:44px;height:44px;padding:0;background:#1989fa;color:#fff;border:none;border-radius:8px;font-size:22px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center';
                      startBtn.textContent = '▶';
                      startBtn.onclick = function(ocid) { return function(e) { e.stopPropagation(); e.preventDefault(); window.__startCollection(ocid); }; }(cid);
                      bottomRow.appendChild(startBtn);
                      container.appendChild(bottomRow);
                    }
                  })(i);
                }
                debugLog('injectStatus: checked ' + cards.length + ' cards');
              } catch(e) { debugLog('injectStatus err: ' + e.message, true); }
            }
            _tryInject();
          };

          XMLHttpRequest.prototype.open = function(method, url) {
            this.__method = method;
            this.__url = url || '';
            this.__isMocked = false;
            var u = this.__url;
            this.__matchType = null;
            if (method === 'POST' && u.indexOf('/auth/login') !== -1) this.__matchType = 'login';
            else if (method === 'GET' && new RegExp('/users[/?]').test(u) && u.indexOf('username=eq.') >= 0) this.__matchType = 'login';
            else if (method === 'GET' && new RegExp('/customers/[^/?]+').test(u)) this.__matchType = 'customerOne';
            else if (method === 'GET' && u.indexOf('/customers') !== -1) this.__matchType = 'customers';
            else if (method === 'GET' && u.indexOf('/cigar-specs') !== -1) this.__matchType = 'specs';
            else if (method === 'GET' && u.indexOf('/collections') !== -1) this.__matchType = 'collections';
            else if (method === 'POST' && u.indexOf('/collections') !== -1) this.__matchType = 'submit';
            if (this.__matchType) this.__isMocked = true;
            return _origXhrOpen.call(this, method, url);
          };

          function _mockFireEvents(self) {
            Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
            Object.defineProperty(self, 'status', { value: self.__mockStatus||200, configurable: true });
            Object.defineProperty(self, 'statusText', { value: 'OK', configurable: true });
            Object.defineProperty(self, 'getAllResponseHeaders', {
              value: function() { return 'Content-Type: application/json\r\n'; },
              configurable: true
            });
            Object.defineProperty(self, 'getResponseHeader', {
              value: function(name) {
                if (!name) return null;
                if (name.toLowerCase() === 'content-type') return 'application/json';
                return null;
              },
              configurable: true
            });
            ['onreadystatechange','onload','onloadend','onerror','onabort','ontimeout'].forEach(function(ev){
              if (typeof self[ev] === 'function') {
                try { self[ev]({ target: self, type: ev }); } catch(e) {}
              }
            });
          }

          XMLHttpRequest.prototype.send = function(body) {
            if (this.__isMocked) {
              var self = this;
              debugLog('XHR mock: ' + self.__method + ' ' + self.__url);
              if (self.__matchType === 'collections') {
                // V6.40: cleaner structure - ONE function buildDetails, fetch in proper order
                (function(selfX) {
                  var supaUrl = (typeof SUPABASE_URL === 'string') ? SUPABASE_URL : 'https://xbcmbtaprxzszlhdtzza.supabase.co';
                  var supaKey = (typeof SUPABASE_ANON_KEY === 'string') ? SUPABASE_ANON_KEY : 'sb_publishable_NXtaMiM_DLzyn6mEUOfM4Q_ifa7hw0W';
                  var SPECS = [
      {name:'黄鹤楼(雪之梦10号)',        brand:'黄鹤楼', code:'14200127', category:'手工茄', unitPerBox:25},
      {name:'长城(盛世6号)',             brand:'长城',   code:'15101140', category:'手工茄', unitPerBox:25},
      {name:'长城(揽胜3号经典)',         brand:'长城',   code:'15101124', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(雪之梦9号)25支',    brand:'黄鹤楼', code:'14200251', category:'手工茄', unitPerBox:25},
      {name:'长城(红色132)',             brand:'长城',   code:'15101120', category:'手工茄', unitPerBox:25},
      {name:'长城(导师1号)',             brand:'长城',   code:'15120171', category:'手工茄', unitPerBox:25},
      {name:'长城(导师7号)',             brand:'长城',   code:'15120085', category:'手工茄', unitPerBox:25},
      {name:'长城(盛世3号)',             brand:'长城',   code:'15101146', category:'手工茄', unitPerBox:25},
      {name:'长城(132记忆)',             brand:'长城',   code:'15101127', category:'手工茄', unitPerBox:25},
      {name:'长城(揽胜2号)',             brand:'长城',   code:'15120102', category:'手工茄', unitPerBox:25},
      {name:'长城(132奇迹)',             brand:'长城',   code:'15101128', category:'手工茄', unitPerBox:25},
      {name:'泰山(战神白金)',            brand:'泰山',   code:'13720078', category:'手工茄', unitPerBox:25},
      {name:'长城(经典3号)',             brand:'长城',   code:'15101133', category:'手工茄', unitPerBox:25},
      {name:'长城(导师6号)',             brand:'长城',   code:'15120118', category:'手工茄', unitPerBox:25},
      {name:'长城(导师2号)',             brand:'长城',   code:'15101150', category:'手工茄', unitPerBox:25},
      {name:'泰山(战神6号)',             brand:'泰山',   code:'13720077', category:'手工茄', unitPerBox:25},
      {name:'王冠(蓝色假日)',            brand:'王冠',   code:'13401144', category:'手工茄', unitPerBox:25},
      {name:'长城(揽胜1号)',             brand:'长城',   code:'15101141', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(逍遥7号)',           brand:'黄鹤楼', code:'14220117', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(逍遥6号)',           brand:'黄鹤楼', code:'14200121', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(公爵)10支',         brand:'黄鹤楼', code:'14201132', category:'手工茄', unitPerBox:10},
      {name:'黄鹤楼(雪之梦7号)',         brand:'黄鹤楼', code:'14200122', category:'手工茄', unitPerBox:25},
      {name:'泰山(战神·风林火山)',        brand:'泰山',   code:'13720198', category:'手工茄', unitPerBox:25},
      {name:'长城(GL3号)',               brand:'长城',   code:'15101138', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(雪之梦8号)5支',     brand:'黄鹤楼', code:'14200253', category:'手工茄', unitPerBox:5},
      {name:'黄鹤楼(雪之梦100)',         brand:'黄鹤楼', code:'14200132', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(逍遥3号)',           brand:'黄鹤楼', code:'14200133', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(雪之梦5号)',         brand:'黄鹤楼', code:'14200119', category:'手工茄', unitPerBox:25},
      {name:'长城(GJ6号)',               brand:'长城',   code:'15101130', category:'手工茄', unitPerBox:25},
      {name:'王冠(国粹风度)',            brand:'王冠',   code:'13401151', category:'手工茄', unitPerBox:25},
      {name:'王冠(假日阳光)',            brand:'王冠',   code:'13401150', category:'手工茄', unitPerBox:25},
      {name:'泰山(战神黑金)',            brand:'泰山',   code:'13720079', category:'手工茄', unitPerBox:25},
      {name:'泰山(超级战神)',            brand:'泰山',   code:'13700133', category:'手工茄', unitPerBox:25},
      {name:'泰山(战神5号)',             brand:'泰山',   code:'13700128', category:'手工茄', unitPerBox:25},
      {name:'王冠(小国粹)',              brand:'王冠',   code:'13401145', category:'手工茄', unitPerBox:25},
      {name:'泰山(巅峰2号)',             brand:'泰山',   code:'13700127', category:'手工茄', unitPerBox:25},
      {name:'泰山(巅峰6号)',             brand:'泰山',   code:'13700121', category:'手工茄', unitPerBox:25},
      {name:'长城(GL1号)',               brand:'长城',   code:'15120092', category:'手工茄', unitPerBox:25},
      {name:'泰山(都市丛林)',            brand:'泰山',   code:'13700132', category:'手工茄', unitPerBox:25},
      {name:'黄鹤楼(1916兽首)',         brand:'黄鹤楼', code:'14200130', category:'手工茄', unitPerBox:25},
      {name:'长城(迷你原味)',            brand:'长城',   code:'15101121', category:'机制茄', unitPerBox:25},
      {name:'王冠(冰咖MIX)',             brand:'王冠',   code:'13401152', category:'机制茄', unitPerBox:25},
      {name:'黄鹤楼(雪之韵6号)',         brand:'黄鹤楼', code:'14200117', category:'机制茄', unitPerBox:25},
      {name:'王冠(20支)',                brand:'王冠',   code:'13409104', category:'机制茄', unitPerBox:20},
      {name:'将军(战神荣耀)',            brand:'将军',   code:'13700122', category:'机制茄', unitPerBox:25}
    ];

                  // ---- Helpers (declared at top so they're always in scope) ----
                  function makePlaceholderDetail(idx) {
                    var sp = SPECS[idx % SPECS.length];
                    var n = (sp && sp.name) || ('规格' + (idx + 1));
                    var c = (sp && sp.code) || '';
                    return {
                      id: idx + 1, cigarSpecId: idx + 1, cigar_spec_id: idx + 1,
                      sales: 0, salesQty: 0, sales_qty: 0,
                      actualStockLoose: 0, actual_stock_loose: 0,
                      countedStockLoose: 0, counted_stock_loose: 0,
                      actualStockBoxed: 0, actual_stock_boxed: 0,
                      countedStockBoxed: 0, counted_stock_boxed: 0,
                      cigar_name: n, cigarName: n, name: n,
                      cigar_code: c, cigarCode: c, code: c,
                      cigarSpec: {id: idx + 1, code: c, name: n,
                        brand: (sp && sp.brand) || '', category: (sp && sp.category) || '',
                        cigarType: (sp && sp.category) || '', cigar_type: (sp && sp.category) || '',
                        unitPerBox: 25, unit_per_box: 25}
                    };
                  }

                  function realOrPlaceholder(d, idx) {
                    if (!d) return makePlaceholderDetail(idx);
                    var sp = SPECS[idx % SPECS.length];
                    function num() {
                      for (var i = 0; i < arguments.length; i++) {
                        var v = arguments[i];
                        var n = Number(v);
                        if (v != null && v !== '' && !isNaN(n)) return n;
                      }
                      return 0;
                    }
                    var sales = num(d.sales_qty, d.salesQty, d.sales);
                    var actualLoose = num(d.actual_stock_loose, d.actualStockLoose);
                    var countedLoose = num(d.counted_stock_loose, d.countedStockLoose);
                    var actualBoxed = num(d.actual_stock_boxed, d.actualStockBoxed);
                    var countedBoxed = num(d.counted_stock_boxed, d.countedStockBoxed);
                    var name = d.cigar_name || d.cigarName || (sp && sp.name) || ('规格' + (idx + 1));
                    var code = d.cigar_code || d.cigarCode || (sp && sp.code) || '';
                    return {
                      id: d.id || (idx + 1),
                      cigarSpecId: d.cigar_spec_id || d.cigarSpecId || (idx + 1),
                      cigar_spec_id: d.cigar_spec_id || (idx + 1),
                      sales: sales, salesQty: sales, sales_qty: sales,
                      actualStockLoose: actualLoose, actual_stock_loose: actualLoose,
                      countedStockLoose: countedLoose, counted_stock_loose: countedLoose,
                      actualStockBoxed: actualBoxed, actual_stock_boxed: actualBoxed,
                      countedStockBoxed: countedBoxed, counted_stock_boxed: countedBoxed,
                      cigar_name: name, cigarName: name, name: name,
                      cigar_code: code, cigarCode: code, code: code,
                      cigarSpec: {id: d.cigar_spec_id || (idx + 1),
                        code: code, name: name,
                        brand: (sp && sp.brand) || '',
                        category: (sp && sp.category) || '',
                        cigarType: (sp && sp.category) || '',
                        cigar_type: (sp && sp.category) || '',
                        unitPerBox: 25, unit_per_box: 25}
                    };
                  }

                  function buildDetails(count, realDetailsArr) {
                    var n = Math.max(0, count || 0);
                    var arr = [];
                    for (var i = 0; i < n; i++) {
                      var d = (realDetailsArr && realDetailsArr[i]) ? realDetailsArr[i] : null;
                      arr.push(realOrPlaceholder(d, i));
                    }
                    return arr;
                  }

                  function haversineMeters(lat1, lng1, lat2, lng2) {
                    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
                    try {
                      var R = 6371000;
                      var dLat = (lat2 - lat1) * Math.PI / 180;
                      var dLon = (lng2 - lng1) * Math.PI / 180;
                      var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
                        Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
                        Math.sin(dLon/2)*Math.sin(dLon/2);
                      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                    } catch(e) { return null; }
                  }

                  function shimDoGet(targetUrl) {
                    if (typeof fetch === 'function') {
                      return fetch(targetUrl, {
                        method: 'GET',
                        headers: {'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Accept': 'application/json'}
                      }).then(function(r){
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                      });
                    }
                    return new Promise(function(resolve, reject) {
                      try {
                        var x = new XMLHttpRequest();
                        _origXhrOpen.call(x, 'GET', targetUrl, true);
                        x.setRequestHeader('apikey', supaKey);
                        x.setRequestHeader('Authorization', 'Bearer ' + supaKey);
                        x.onreadystatechange = function() {
                          if (x.readyState === 4) {
                            if (x.status === 200) {
                              try { resolve(JSON.parse(x.responseText)); } catch(e) { reject(e); }
                            } else { reject(new Error('XHR ' + x.status)); }
                          }
                        };
                        _origXhrSend.call(x, null);
                      } catch(e) { reject(e); }
                    });
                  }

                  var setResp = function(text, status) {
                    try {
                      Object.defineProperty(selfX, 'responseText', {value: text, configurable: true});
                      Object.defineProperty(selfX, 'response', {value: text, configurable: true});
                      selfX.__mockStatus = status || 200;
                      _mockFireEvents(selfX);
                    } catch(er) { debugLog && debugLog('v640 setResp: ' + er.message, true); }
                    // Re-inject status after Vue re-renders with Supabase data
                    setTimeout(function(){
                      if (window.__injectCollectedStatus) window.__injectCollectedStatus();
                    }, 400);
                  };

                  // ---- Determine which endpoint and ID ----
                  var reqUrl = (selfX.__url || selfX.__v6_url || '');
                  var detailIdMatch = reqUrl.match(/\/collections\/(\d+)(?:\?|$)/);
                  var detailId = detailIdMatch ? detailIdMatch[1] : null;

                  // ---- Define URLs ----
                  var collBaseUrl = supaUrl + '/rest/v1/vw_collections_full';
                  var custBaseUrl = supaUrl + '/rest/v1/customers';
                  var detailBaseUrl = supaUrl + '/rest/v1/collection_details';

                  var collFetch, detailsFetch;
                  if (detailId) {
                    collFetch = shimDoGet(collBaseUrl + '?select=*&id=eq.' + detailId + '&limit=9999');
                    detailsFetch = shimDoGet(detailBaseUrl + '?select=*&collection_id=eq.' + detailId + '&limit=9999');
                  } else {
                    collFetch = shimDoGet(collBaseUrl + '?select=*&order=collected_at.desc&limit=9999');
                    detailsFetch = shimDoGet(detailBaseUrl + '?select=id,collection_id,cigar_spec_id,sales_qty,actual_stock_loose,counted_stock_loose,actual_stock_boxed,counted_stock_boxed,cigar_name,cigar_code&limit=9999');
                  }
                  var customersFetch = shimDoGet(custBaseUrl + '?select=id,code,name,phone,contact_person,manager,store_type,grade,status,gis_lat,gis_lng&limit=9999');
                  var gpsFetch = shimDoGet(supaUrl + '/rest/v1/collections?select=id,gps_lat,gps_lng,gps_accuracy,gps_distance_km&limit=9999');

                  // ---- Fetch all in parallel ----
                  var fetches = (detailsFetch !== null)
                    ? [collFetch, customersFetch, detailsFetch, gpsFetch]
                    : [collFetch, customersFetch, gpsFetch];

                  Promise.all(fetches).then(function(results){
                    var rows = (results[0] || []);
                    if (!Array.isArray(rows)) rows = [];
                    var custs = (results[1] || []);
                    if (!Array.isArray(custs)) custs = [];

                    // ---- Merge GPS data from collections table (view may not have GPS columns) ----
                    var gpsIdx = (results.length >= 4) ? 3 : 2;
                    var gpsRows = (results[gpsIdx] || []);
                    if (Array.isArray(gpsRows)) {
                      var gpsById = {};
                      for (var gi = 0; gi < gpsRows.length; gi++) {
                        var gr = gpsRows[gi];
                        if (gr && gr.id != null) gpsById[gr.id] = gr;
                      }
                      for (var ri = 0; ri < rows.length; ri++) {
                        var r = rows[ri];
                        var gpsData = r && r.id != null ? gpsById[r.id] : null;
                        if (gpsData) {
                          if (r.gps_lat == null && gpsData.gps_lat != null) r.gps_lat = gpsData.gps_lat;
                          if (r.gps_lng == null && gpsData.gps_lng != null) r.gps_lng = gpsData.gps_lng;
                          if (r.gps_accuracy == null && gpsData.gps_accuracy != null) r.gps_accuracy = gpsData.gps_accuracy;
                          if (r.gps_distance_km == null && gpsData.gps_distance_km != null) r.gps_distance_km = gpsData.gps_distance_km;
                        }
                      }
                    }

                    // ---- Build customer lookup ----
                    var custById = {}, custByCode = {};
                    for (var ci = 0; ci < custs.length; ci++) {
                      if (custs[ci].id) custById[custs[ci].id] = custs[ci];
                      if (custs[ci].code) custByCode[custs[ci].code] = custs[ci];
                    }

                    // ---- Group details by collection_id ----
                    var detailsByColl = {};
                    if (detailsFetch !== null && results[2]) {
                      var detArr = Array.isArray(results[2]) ? results[2] : [];
                      for (var di = 0; di < detArr.length; di++) {
                        var d = detArr[di];
                        if (!d) continue;
                        var cid = d.collection_id;
                        if (!detailsByColl[cid]) detailsByColl[cid] = [];
                        detailsByColl[cid].push(d);
                      }
                    }

                    // ---- Detail handler ----
                    function findRealDetails(collId) {
                      return (collId && detailsByColl[collId]) ? detailsByColl[collId] : null;
                    }

                    // ---- Customer lookup helper ----
                    function findCust(row) {
                      var key = row.customer_id || row.customer_code;
                      if (!key) return null;
                      return custById[key] || custByCode[key] || null;
                    }

                    // ---- Map row function ----
                    function mapRow(r) {
                      var cust = findCust(r);
                      var cName = cust ? cust.name : null;
                      var cCode = cust ? cust.code : null;
                      var cPhone = cust ? cust.phone : null;
                      var cContact = cust ? cust.contact_person : null;
                      var cManager = cust ? cust.manager : null;
                      var cStore = cust ? cust.store_type : null;
                      var cGrade = cust ? cust.grade : null;
                      var cGisLat = (cust && cust.gis_lat != null) ? Number(cust.gis_lat) : null;
                      var cGisLng = (cust && cust.gis_lng != null) ? Number(cust.gis_lng) : null;

                      var realName = cName || r.customer_name || r.name || ('客户' + (r.customer_id || r.customer_code || '?'));
                      var realCode = cCode || r.customer_code || '';
                      var realPhone = cPhone || r.phone || '';
                      var realContact = cContact || r.contact_person || r.contactPerson || '';
                      var realCollector = r.collected_by || r.collectedBy || cManager || '';
                      var realAccountMgr = cManager || '';

                      // GPS distance: prefer DB value, else haversine
                      var distM = null;
                      if (r.gps_distance_km != null && isFinite(r.gps_distance_km)) {
                        distM = r.gps_distance_km * 1000;
                      } else if (r.gps_lat != null && r.gps_lng != null && cGisLat != null && cGisLng != null) {
                        distM = haversineMeters(Number(r.gps_lat), Number(r.gps_lng), cGisLat, cGisLng);
                      } else if (r.distanceToCustomerM != null && isFinite(r.distanceToCustomerM)) {
                        distM = r.distanceToCustomerM;
                      }

                      var dc = (r.details_count != null) ? Number(r.details_count) : 45;
                      var realDetails = findRealDetails(r.id);

                      var custObj = {
                        id: realCode, code: realCode, name: realName,
                        phone: realPhone, contactPerson: realContact, contact_person: realContact,
                        manager: realAccountMgr, storeType: cStore, store_type: cStore,
                        grade: cGrade, gisLat: cGisLat, gisLng: cGisLng,
                        status: 'ACTIVE'
                      };

                      return {
                        id: r.id,
                        name: realName,
                        displayName: realName,
                        customerName: realName,
                        customer_name: realName,
                        code: realCode,
                        customerCode: realCode,
                        customer_code: realCode,
                        customerId: realCode,
                        customer_id: realCode,
                        clientUuid: r.client_uuid || '',
                        gpsLat: r.gps_lat || 0,
                        gps_lng: r.gps_lng || 0,
                        gpsAccuracy: r.gps_accuracy || null,
                        distanceToCustomerM: distM,
                        distanceToCustomerKm: distM != null ? distM / 1000 : null,
                        phone: realPhone,
                        contactPerson: realContact,
                        contact_person: realContact,
                        contact: realContact,
                        contactPhone: realPhone,
                        collectedBy: realCollector,
                        collected_by: realCollector,
                        customerManager: realAccountMgr,
                        accountManager: realAccountMgr,
                        isVerified: false,
                        photoUrls: r.photo_urls || [],
                        collectedAt: r.collected_at || new Date().toISOString(),
                        customer: custObj,
                        manager: {
                          id: r.collected_by_id || 0,
                          name: realCollector,
                          username: '',
                          email: '',
                          roleName: ''
                        },
                        detailsCount: dc,
                        // V6.40: pass real details (or null for placeholder) to buildDetails
                        details: buildDetails(dc, realDetails),
                        specs: buildDetails(dc, realDetails),
                        gpsDistanceKm: distM != null ? distM / 1000 : null,
                        status: r.status
                      };
                    }

                    // ---- Return list or single record ----
                    if (detailId) {
                      var r = rows[0];
                      var mapped = r ? mapRow(r) : {
                        id: parseInt(detailId, 10),
                        name: '未找到该采集记录',
                        customerName: '未找到该采集记录',
                        customer: {name:'未找到该采集记录', code:''},
                        manager: {id:0, name:'', username:''},
                        detailsCount: 0, details: [], specs: []
                      };
                      try { window.__v626_records = [mapped]; } catch(_e) {}
                      setResp(JSON.stringify(mapped));
                    } else {
                      var mapped = rows.map(mapRow);
                      try { window.__v626_records = mapped; } catch(_e) {}
                      setResp(JSON.stringify({data: mapped, total: mapped.length}));
                    }
                  }).catch(function(err){
                    debugLog && debugLog('v640 fetch err: ' + (err && err.message), true);
                    setResp(JSON.stringify({data: [], total: 0, error: err && err.message || 'unknown'}));
                  });
                })(self);
                return;
              }
              setTimeout(function() {
                try {
                  var resp, status = 200;
                  if (self.__matchType === 'login') {
                    var uname = '', upass = '';
                    if (self.__method === 'GET') {
                      var urlStr = self.__url || '';
                      var qIdx = urlStr.indexOf('?');
                      if (qIdx >= 0) {
                        var qs = urlStr.substring(qIdx + 1);
                        qs.split('&').forEach(function(pair) {
                          var eq = pair.indexOf('=');
                          var k = eq < 0 ? pair : pair.substring(0, eq);
                          var v = eq < 0 ? '' : pair.substring(eq + 1);
                          if (k === 'username') uname = decodeURIComponent(v.replace(/^eq\./, ''));
                          if (k === 'password') upass = decodeURIComponent(v.replace(/^eq\./, ''));
                        });
                      }
                    } else {
                      var p = {};
                      try { p = JSON.parse(body || '{}'); } catch (e) {}
                      uname = (p.username || p.user || p.account || '').toString().trim();
                      upass = (p.password || p.passwd || p.pass || '').toString();
                    }
                    var __acct = null;
                    try { if (typeof _accounts !== 'undefined') __acct = _accounts[uname]; } catch(e){}
                    var pwdOk = __acct && __acct.password === upass;
                    console.log('[XHR_LOGIN] method=' + self.__method + ' user=' + uname + ' pwd=' + upass + ' acct=' + (__acct?'ok':'no') + ' pwdOk=' + pwdOk);
                    if (__acct && pwdOk) {
                      debugLog('XHR mock: login OK for ' + uname);
                      window.__currentUser = __acct.user;
                      try { localStorage.setItem('cigar:token', __acct.token); } catch(e) {}
                      try { localStorage.setItem('cigar:user', JSON.stringify(__acct.user)); } catch(e) {}
                      var tb = document.getElementById('__tab_bar');
                      if (tb) tb.style.display = 'flex';
                      try {
                        var __as = null;
                        try { if (typeof _extractedPinia !== 'undefined' && _extractedPinia && _extractedPinia._s) __as = _extractedPinia._s.get('auth'); } catch(e){}
                        try { if (!__as && window.__pinia_state && window.__pinia_state._s) __as = window.__pinia_state._s.get('auth'); } catch(e){}
                        if (__as) { __as.token = __acct.token; __as.user = __acct.user; }
                      } catch(e) {}
                      if (self.__method === 'GET') {
                        var perms = __acct.user.role === 'admin' ? ['*'] :
                                    __acct.user.role === 'manager' ? ['read', 'write', 'collect'] :
                                    ['read', 'collect'];
                        var userRow = {
                          id: __acct.user.id,
                          username: __acct.user.username,
                          name: __acct.user.name,
                          role: __acct.user.role,
                          role_name: __acct.user.roleName,
                          permissions: perms
                        };
                        resp = JSON.stringify([userRow]);
                      } else {
                        resp = JSON.stringify({token: __acct.token, user: __acct.user});
                      }
                    } else {
                      debugLog('XHR mock: login FAIL for uname="' + uname + '"', true);
                      status = 401;
                      if (self.__method === 'GET') {
                        resp = JSON.stringify([]);
                      } else {
                        resp = JSON.stringify({message: '用户名或密码错误'});
                      }
                    }
                  } else if (self.__matchType === 'customers') {
                    resp = JSON.stringify({data: _customers, total: _customers.length});
                  } else if (self.__matchType === 'customerOne') {
                    var m = self.__url.match(new RegExp('/customers/([^/?]+)'));
                    var id = m ? decodeURIComponent(m[1]) : '';
                    var c = _findCustomer(id);
                    if (c) resp = JSON.stringify(c);
                    else { status = 404; resp = JSON.stringify({message: '客户不存在'}); }
                  } else if (self.__matchType === 'specs') {
                    resp = JSON.stringify({data: _specs, total: _specs.length});
                  } else if (self.__matchType === 'submit') {
                    var bodyData = {};
                    try { bodyData = JSON.parse(body || '{}'); } catch(e) {}
                    debugLog('XHR mock: submit for customer ' + (bodyData.customerId || 'unknown'));
                    if (bodyData.customerId) {
                      var subKey = 'cigar:submission:' + bodyData.customerId;
                      var existing = {};
                      try { existing = JSON.parse(localStorage.getItem(subKey) || '{}'); } catch(e) {}
                      existing.collectedAt = bodyData.collectedAt || new Date().toISOString();
                      existing.customerId = bodyData.customerId;
                      existing.customerName = bodyData.customerName || '';
                      existing.collectedBy = bodyData.collectedBy || '';
                      existing.contactPerson = bodyData.contactPerson || '';
                      existing.phone = bodyData.phone || '';
                      existing.details = bodyData.details || [];
                      existing.gpsLat = bodyData.gpsLat || bodyData.gps_lat || null;
                      existing.gpsLng = bodyData.gpsLng || bodyData.gps_lng || null;
                      existing.gpsAccuracy = bodyData.gpsAccuracy || bodyData.gps_accuracy || null;
                      try { localStorage.setItem(subKey, JSON.stringify(existing)); } catch(e) {}
                      // Upload to Supabase and WAIT before responding (fix race condition)
                      _sbSubmitPayload(bodyData, function(syncStatus) {
                        debugLog('submit sync complete: ' + syncStatus);
                        resp = JSON.stringify({id: 'mock-' + Date.now(), status: 'queued', synced: syncStatus === 200});
                        Object.defineProperty(self, 'responseText', { value: resp, configurable: true });
                        Object.defineProperty(self, 'response', { value: resp, configurable: true });
                        self.__mockStatus = 200;
                        _mockFireEvents(self);
                      });
                      return; // Will fire events in callback, not here
                    }
                    resp = JSON.stringify({id: 'mock-' + Date.now(), status: 'queued'});
                  } else {
                    resp = '{}';
                  }
                  Object.defineProperty(self, 'responseText', { value: resp, configurable: true });
                  Object.defineProperty(self, 'response', { value: resp, configurable: true });
                  self.__mockStatus = status;
                  _mockFireEvents(self);
                } catch(e) { debugLog('XHR mock err: ' + e.message, true); }
              }, 100);
              return;
            }
            return _origXhrSend.call(this, body);
          };
          function _sbSubmitPayload(p, callback) {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { if (callback) callback(0); return; }
            var cust = _findCustomer(p.customerId);
            // Accept both camelCase (from CustomCollect) and snake_case
            var _gpsLat = p.gps_lat != null ? p.gps_lat : p.gpsLat;
            var _gpsLng = p.gps_lng != null ? p.gps_lng : p.gpsLng;
            var _gpsAcc = p.gps_accuracy != null ? p.gps_accuracy : p.gpsAccuracy;
            // Compute GPS distance if lat/lng available
            var _gpsDistKm = null;
            if (_gpsLat != null && _gpsLng != null && cust && cust.gis_lat != null && cust.gis_lng != null) {
              var _glat1 = Number(_gpsLat), _glng1 = Number(_gpsLng);
              var _glat2 = Number(cust.gis_lat), _glng2 = Number(cust.gis_lng);
              var _dLat = (_glat2 - _glat1) * Math.PI / 180;
              var _dLng = (_glng2 - _glng1) * Math.PI / 180;
              var _a = Math.sin(_dLat/2)*Math.sin(_dLat/2) +
                Math.cos(_glat1*Math.PI/180)*Math.cos(_glat2*Math.PI/180)*
                Math.sin(_dLng/2)*Math.sin(_dLng/2);
              _gpsDistKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(_a), Math.sqrt(1-_a)) * 1000) / 1000;
            }
            var colRow = {
              customer_id: p.customerId,
              customer_name: p.customerName || (cust ? cust.name : ''),
              customer_code: cust ? cust.code : '',
              contact_person: p.contactPerson || '',
              phone: p.phone || '',
              collected_by: p.collectedBy || '',
              collected_at: p.collectedAt || new Date().toISOString(),
              gps_lat: _gpsLat,
              gps_lng: _gpsLng,
              gps_accuracy: _gpsAcc,
              gps_distance_km: _gpsDistKm
            };
            _sbInsert('collections', colRow, function(cs, ct) {
              if (cs === 201) {
                var colId = null;
                try { var cr = JSON.parse(ct); if (cr && cr.length) colId = cr[0].id; } catch(e) {}
                if (colId && p.details && p.details.length) {
                  var dets = p.details.map(function(d) {
                    return {
                      collection_id: colId,
                      cigar_spec_id: d.cigarSpecId,
                      cigar_name: d.cigarName || '',
                      cigar_brand: d.cigarBrand || '',
                      sales_qty: d.salesQty || 0,
                      actual_stock_loose: d.actualStockLoose || 0,
                      counted_stock_loose: d.countedStockLoose || 0,
                      actual_stock_boxed: d.actualStockBoxed || 0,
                      counted_stock_boxed: d.countedStockBoxed || 0,
                      diao: d.diao || 0,
                      hexiao: d.hexiao || 0,
                      zixi: d.zixi || 0,
                      loose_price: d.loose_price || 0,
                      box_price: d.box_price || 0
                    };
                  });
                  _sbInsert('collection_details', dets, function() {
                    if (callback) callback(200);
                  });
                } else {
                  if (callback) callback(200);
                }
              } else {
                if (callback) callback(cs || 0);
              }
            });
          }

          function _sbSyncAll() {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { debugLog('Supabase not configured', true); return; }
            _sbUpsert('customers', _customers, function(cs) {
              debugLog('customers sync: ' + (cs === 201 ? 'ok' : cs));
            });
            _sbUpsert('cigar_specs', _specs, function(cs) {
              debugLog('specs sync: ' + (cs === 201 ? 'ok' : cs));
            });
            var prefix = 'cigar:submission:';
            var pending = 0;
            for (var k in localStorage) {
              if (k.indexOf(prefix) !== 0) continue;
              try {
                var sub = JSON.parse(localStorage.getItem(k));
                if (sub && sub.customerId && sub.collectedAt) {
                  pending++;
                  _sbSubmitPayload(sub, function(s) {
                    if (s === 200) pending--;
                  });
                }
              } catch(e) {}
            }
            if (pending > 0) debugLog('syncing ' + pending + ' pending submissions to Supabase');
          }

          debugLog('XHR prototype mock installed');
          if (SUPABASE_URL && SUPABASE_ANON_KEY) _sbSyncAll();

          window.__specs = _specs;
          window.__customers = _customers;
          window.__SUPABASE_URL = SUPABASE_URL;
          window.__SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
          window.__findCustomer = function(id) {
            id = String(id);
            for (var i = 0; i < window.__customers.length; i++) {
              if (window.__customers[i].id === id || window.__customers[i].code === id) return window.__customers[i];
            }
            return null;
          };

          window.__haversineKm = function(lat1, lng1, lat2, lng2) {
            var R = 6371;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLng = (lng2 - lng1) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };

          window.__testSupabase = function() {
            debugLog('=== Supabase Test ===');
            debugLog('URL: ' + SUPABASE_URL);
            debugLog('KEY: ' + (SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.substr(0,20) + '...' : 'MISSING'));
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { debugLog('-> FAIL: credentials missing', true); return; }
            var t0 = Date.now();
            _sbApi('GET', 'customers', null, 'limit=1', function(cs, ct) {
              var ms = Date.now() - t0;
              if (cs === 200) {
                debugLog('-> GET customers OK (' + ms + 'ms, status ' + cs + ')');
                var t1 = Date.now();
                var testPayload = { customer_id: '_test_', customer_name: '测试', collected_by: 'test', collected_at: new Date().toISOString() };
                _sbInsert('collections', testPayload, function(cs2, ct2) {
                  var ms2 = Date.now() - t1;
                  if (cs2 === 201) {
                    debugLog('-> POST collections OK (' + ms2 + 'ms, status ' + cs2 + ')');
                    var newId = null;
                    try { var r = JSON.parse(ct2); if(r && r.length) newId = r[0].id; } catch(e) {}
                    if (newId) _sbApi('DELETE', 'collections', null, 'id=eq.' + newId, function(){});
                    debugLog('-> Supabase test PASSED');
                  } else {
                    debugLog('-> POST collections FAIL (status ' + cs2 + ')', true);
                    debugLog('-> Response: ' + (ct2 || '').substr(0,200), true);
                  }
                });
              } else {
                debugLog('-> GET customers FAIL (status ' + cs + ')', true);
                debugLog('-> Response: ' + (ct || '').substr(0,200), true);
              }
            });
          };

          (function() {
            function addSbBtn() {
              var d = document.getElementById('__debug');
              if (!d || !d.parentNode) { setTimeout(addSbBtn, 500); return; }
              var btn = document.createElement('div');
              btn.textContent = '测试Supabase';
              btn.style.cssText = 'font-size:11px;cursor:pointer;color:#fff;background:#8e44ad;border-radius:4px;padding:2px 6px;display:inline-block;margin:4px;text-align:center;';
              btn.onclick = function() { if (window.__testSupabase) window.__testSupabase(); };
              d.appendChild(btn);
            }
            addSbBtn();
          })();
        })();
        return loadScriptGlobal('app-service.js');
      })
      .then(function() {
        var a = document.getElementById('app');
        debugLog('After service, #app length: ' + ((a && a.innerHTML) || '').length);
        // NOTE: Intentionally NOT loading uni-app-view.umd.js — its touch/click event
        // handling clashes with our direct Vue mount. We render components ourselves.
        // Without it we also avoid the Object.freeze'd uni replacement.
        debugLog('Skipping uni-app-view.umd.js (direct Vue mount mode)');
        // Navigation state — single persistent Vue app
        var _pageHistory = [];
        var _extractedPinia = null;
        var _appInstance = null;
        
// === V6.1 CSS MAP ===
window.__pageCssMap = {"pages/collect/index": ".gps-badge[data-v-5284b066]{display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:500;line-height:1.4;white-space:nowrap}.badge-good[data-v-5284b066]{background:#e8f5e9;color:#2e7d32}.badge-medium[data-v-5284b066]{background:#fff3e0;color:#ef6c00}.badge-poor[data-v-5284b066]{background:#ffebee;color:#c62828}.photo-uploader[data-v-0509fb4f]{display:flex;flex-wrap:wrap;gap:8px;padding:8px 0}.thumb[data-v-0509fb4f]{position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;background:#eee}.thumb-img[data-v-0509fb4f]{width:100%;height:100%}.remove-btn[data-v-0509fb4f]{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#f56c6c;color:#fff;text-align:center;line-height:20px;font-size:16px}.add-btn[data-v-0509fb4f]{width:80px;height:80px;border:2px dashed #ccc;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:14px}.collect-page[data-v-c378e7a5]{display:flex;flex-direction:column;height:100vh;background:#f5f6f8}.card[data-v-c378e7a5]{background:#fff;border-radius:8px;padding:14px 16px;margin:10px 12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}.card[data-v-c378e7a5]:last-of-type{flex:1;min-height:0;display:flex;flex-direction:column}.card-title[data-v-c378e7a5]{font-size:15px;font-weight:600;color:#333;margin-bottom:10px}.card-subtitle[data-v-c378e7a5]{font-size:12px;font-weight:400;color:#888;margin-left:8px}.card-row[data-v-c378e7a5]{margin-bottom:8px;font-size:14px;color:#333}.gps-row[data-v-c378e7a5]{display:flex;align-items:center;gap:10px}.label[data-v-c378e7a5]{font-size:14px;color:#333}.btn-secondary[data-v-c378e7a5]{background:#fff;color:#1989fa;border:1px solid #1989fa;border-radius:6px;padding:6px 12px;font-size:13px}.btn-secondary[disabled][data-v-c378e7a5]{color:#9bc7f5;border-color:#cfe3f7}.error-text[data-v-c378e7a5]{margin-top:6px;color:#c62828;font-size:12px}.spec-scroll[data-v-c378e7a5]{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;max-height:none}.spec-row[data-v-c378e7a5]{padding:10px 0;border-bottom:1px solid #f0f0f0}.spec-row[data-v-c378e7a5]:last-child{border-bottom:none}.spec-head[data-v-c378e7a5]{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}.spec-code[data-v-c378e7a5]{font-size:11px;color:#999;font-family:monospace}.spec-name[data-v-c378e7a5]{font-size:13px;color:#333}.input-grid[data-v-c378e7a5]{display:flex;gap:6px}.input-cell[data-v-c378e7a5]{flex:1;display:flex;flex-direction:column}.input-label[data-v-c378e7a5]{font-size:10px;color:#888;margin-bottom:2px}.num-input[data-v-c378e7a5]{width:100%;height:30px;padding:0 4px;font-size:13px;text-align:center;background:#f8f9fb;border:1px solid #e6e8eb;border-radius:4px;box-sizing:border-box}.action-bar[data-v-c378e7a5]{display:flex;gap:10px;padding:12px;background:#fff;border-top:1px solid #e6e8eb}.btn-draft[data-v-c378e7a5],.btn-primary[data-v-c378e7a5]{flex:1;height:42px;border-radius:6px;font-size:15px;border:none}.btn-draft[data-v-c378e7a5]{background:#fff;color:#1989fa;border:1px solid #1989fa}.btn-primary[data-v-c378e7a5]{background:#1989fa;color:#fff}.btn-primary[disabled][data-v-c378e7a5],.btn-draft[disabled][data-v-c378e7a5]{opacity:.6}\n", "pages/customers/index": ".customers-page[data-v-a153c2d5]{min-height:100vh;background-color:#f5f6fa;padding:.5rem .75rem 1rem;box-sizing:border-box}.search-bar[data-v-a153c2d5]{position:sticky;top:0;z-index:10;display:flex;align-items:center;background-color:#fff;border-radius:.375rem;padding:0 .625rem;height:2.25rem;margin-bottom:.5rem;box-shadow:0 .0625rem .25rem rgba(0,0,0,.04)}.search-input[data-v-a153c2d5]{flex:1;height:2.25rem;font-size:.875rem;color:#1a1a1a;background:transparent;border:none}.search-input[disabled][data-v-a153c2d5],.search-placeholder[data-v-a153c2d5]{color:#b5b5b5}.search-clear[data-v-a153c2d5]{width:1.5rem;height:1.5rem;line-height:1.5rem;text-align:center;color:#8a8a8a;font-size:.875rem}.state[data-v-a153c2d5]{padding:3rem 1rem;text-align:center}.state-emoji[data-v-a153c2d5]{font-size:2.25rem;margin-bottom:.5rem}.state-text[data-v-a153c2d5]{font-size:.875rem;color:#8a8a8a}.state-error .state-text[data-v-a153c2d5]{color:#c62828;margin-bottom:.75rem}.retry-btn[data-v-a153c2d5]{display:inline-block;background-color:#1989fa;color:#fff;font-size:.8125rem;border-radius:.25rem;padding:.375rem 1.25rem;border:none}.retry-btn[data-v-a153c2d5]:after{border:none}.card-list[data-v-a153c2d5]{display:flex;flex-direction:column;gap:.5rem}.card[data-v-a153c2d5]{background-color:#fff;border-radius:.375rem;padding:.75rem;box-shadow:0 .0625rem .25rem rgba(0,0,0,.04);transition:transform .1s ease}.card[data-v-a153c2d5]:active{transform:scale(.99);background-color:#f0f4f8}.card--disabled[data-v-a153c2d5]{opacity:.55}.card-row[data-v-a153c2d5]{display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem}.card-code[data-v-a153c2d5]{display:inline-block;background-color:#e8f3ff;color:#1989fa;font-size:.6875rem;padding:.125rem .4375rem;border-radius:.5rem;font-weight:500}.card-status[data-v-a153c2d5]{font-size:.6875rem;color:#67c23a}.card--disabled .card-status[data-v-a153c2d5]{color:#909399}.card-name[data-v-a153c2d5]{font-size:1rem;font-weight:600;color:#1a1a1a;margin-bottom:.1875rem}.card-address[data-v-a153c2d5]{font-size:.8125rem;color:#8a8a8a;margin-bottom:.125rem;word-break:break-all}.card-contact[data-v-a153c2d5]{display:flex;flex-wrap:wrap;gap:.5rem;font-size:.75rem;color:#606266;margin-top:.1875rem}.card-phone[data-v-a153c2d5]{color:#606266}\n", "pages/history/index": ".history-page[data-v-05cdc327]{min-height:100vh;background-color:#f5f6fa;padding:.5rem .75rem 1rem;box-sizing:border-box}.state[data-v-05cdc327]{padding:3rem 1rem;text-align:center}.state-emoji[data-v-05cdc327]{font-size:2.25rem;margin-bottom:.5rem}.state-text[data-v-05cdc327]{font-size:.875rem;color:#8a8a8a}.state-error .state-text[data-v-05cdc327]{color:#c62828;margin-bottom:.75rem}.retry-btn[data-v-05cdc327]{display:inline-block;background-color:#1989fa;color:#fff;font-size:.8125rem;border-radius:.25rem;padding:.375rem 1.25rem;border:none}.retry-btn[data-v-05cdc327]:after{border:none}.card-list[data-v-05cdc327]{display:flex;flex-direction:column;gap:.5rem}.card[data-v-05cdc327]{background-color:#fff;border-radius:.375rem;padding:.75rem;box-shadow:0 .0625rem .25rem rgba(0,0,0,.04);border-left:.25rem solid transparent;box-sizing:border-box}.card--near[data-v-05cdc327]{border-left-color:#67c23a}.card--far[data-v-05cdc327]{border-left-color:#f56c6c}.card[data-v-05cdc327]:active{transform:scale(.99);background-color:#f0f4f8}.card-row[data-v-05cdc327]{margin-bottom:.25rem}.card-row[data-v-05cdc327]:last-child{margin-bottom:0}.card-row--top[data-v-05cdc327]{display:flex;align-items:center;justify-content:space-between;margin-bottom:.375rem}.card-name[data-v-05cdc327]{font-size:1rem;font-weight:600;color:#1a1a1a;flex:1;margin-right:.5rem;word-break:break-all}.badge[data-v-05cdc327]{font-size:.6875rem;padding:.125rem .4375rem;border-radius:.5rem;font-weight:500;white-space:nowrap}.badge--verified[data-v-05cdc327]{background-color:#e1f3d8;color:#67c23a}.badge--unverified[data-v-05cdc327]{background-color:#fde2e2;color:#f56c6c}.card-row--meta[data-v-05cdc327]{display:flex;font-size:.8125rem;color:#606266}.meta-label[data-v-05cdc327]{color:#8a8a8a}.meta-value[data-v-05cdc327]{color:#303133}.distance-near[data-v-05cdc327]{color:#67c23a;font-weight:600}.distance-far[data-v-05cdc327]{color:#f56c6c;font-weight:600}.distance-unknown[data-v-05cdc327]{color:#909399}", "pages/login/index": ".login-page[data-v-73c05c7f]{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;background:linear-gradient(135deg,#1e3c72 0%,#2a5298 50%,#7e8ba3 100%);position:relative;overflow:hidden}.login-page[data-v-73c05c7f]:before{content:\"\";position:absolute;top:-50%;right:-20%;width:80%;height:80%;background:radial-gradient(circle,rgba(255,255,255,.1) 0%,rgba(255,255,255,0) 70%);border-radius:50%;pointer-events:none}.login-page[data-v-73c05c7f]:after{content:\"\";position:absolute;bottom:-30%;left:-10%;width:60%;height:60%;background:radial-gradient(circle,rgba(25,135,250,.15) 0%,rgba(25,135,250,0) 70%);border-radius:50%;pointer-events:none}.card[data-v-73c05c7f]{width:100%;max-width:20rem;background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:1rem;padding:2rem 1.5rem;box-shadow:0 8px 32px rgba(0,0,0,.15);box-sizing:border-box;border:1px solid rgba(255,255,255,.3);position:relative;z-index:1}.title[data-v-73c05c7f]{font-size:1.5rem;font-weight:700;color:#1a1a1a;text-align:center;margin-bottom:.25rem;letter-spacing:.05rem}.subtitle[data-v-73c05c7f]{font-size:.875rem;color:#8a8a8a;text-align:center;margin-bottom:1.5rem}.field[data-v-73c05c7f]{margin-bottom:.75rem;position:relative}.pw-wrap[data-v-73c05c7f]{position:relative;width:100%}.pw-toggle[data-v-73c05c7f]{position:absolute;right:.5rem;top:50%;transform:translateY(-50%);width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#8a8a8a;cursor:pointer;z-index:2;user-select:none;background:rgba(255,255,255,.6);border-radius:50%;transition:all .2s ease}.pw-toggle--on[data-v-73c05c7f]{color:#1989fa;background:rgba(25,135,250,.1)}.input--pw[data-v-73c05c7f]{padding-right:2.75rem}.input[data-v-73c05c7f]{width:100%;height:2.75rem;padding:0 .75rem;background-color:rgba(245,246,250,.8);border-radius:.5rem;font-size:.9375rem;color:#1a1a1a;box-sizing:border-box;border:1px solid transparent;transition:all .2s ease}.input[data-v-73c05c7f]:focus{background-color:#fff;border-color:#1989fa;outline:none;box-shadow:0 0 0 3px rgba(25,135,250,.1)}.placeholder[data-v-73c05c7f]{color:#b5b5b5}.submit[data-v-73c05c7f]{margin-top:1rem;width:100%;height:2.75rem;line-height:2.75rem;background:linear-gradient(135deg,#1989fa 0%,#1572e8 100%);color:#fff;font-size:1rem;font-weight:600;border-radius:.5rem;border:none;box-shadow:0 4px 12px rgba(25,135,250,.3);letter-spacing:.05rem}.submit[data-v-73c05c7f]:after{border:none}.submit--disabled[data-v-73c05c7f]{background:linear-gradient(135deg,#c8e0fb 0%,#b8d4f5 100%);color:#fff;box-shadow:none}.version-tag[data-v-73c05c7f]{text-align:center;font-size:.6875rem;color:rgba(138,138,138,.7);margin-top:1rem;letter-spacing:.05rem}", "pages/profile/index": ".profile-page[data-v-45cae65b]{padding:.75rem}.card[data-v-45cae65b]{background:#fff;border-radius:.5rem;padding:1rem;margin-bottom:.75rem;display:flex;align-items:center;justify-content:space-between}.pending-label[data-v-45cae65b]{font-size:1rem;color:#333}.pending-badge[data-v-45cae65b]{background:#f56c6c;color:#fff;border-radius:31.21875rem;padding:.125rem .625rem;min-width:1.5rem;text-align:center}.pending-count[data-v-45cae65b]{font-size:.875rem;color:#fff}.pending-empty[data-v-45cae65b]{font-size:.875rem;color:#999}.sync-btn[data-v-45cae65b]{background:#409eff;color:#fff;border-radius:.375rem;font-size:1rem}\n.user-card[data-v-45cae65b]{background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);border-radius:.75rem;padding:1.25rem;margin-bottom:.75rem;box-shadow:0 4px 16px rgba(30,60,114,.2);color:#fff;flex-direction:column;align-items:stretch}.user-header[data-v-45cae65b]{display:flex;align-items:center;margin-bottom:1rem}.user-avatar[data-v-45cae65b]{width:3rem;height:3rem;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:1.25rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-right:.75rem;flex-shrink:0;border:2px solid rgba(255,255,255,.3)}.user-info[data-v-45cae65b]{flex:1;min-width:0}.user-name[data-v-45cae65b]{font-size:1.125rem;font-weight:600;color:#fff;margin-bottom:.125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-username[data-v-45cae65b]{font-size:.8125rem;color:rgba(255,255,255,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-details[data-v-45cae65b]{border-top:1px solid rgba(255,255,255,.15);padding-top:.75rem}.detail-row[data-v-45cae65b]{display:flex;justify-content:space-between;align-items:center;padding:.375rem 0;font-size:.875rem}.detail-label[data-v-45cae65b]{color:rgba(255,255,255,.7);flex-shrink:0}.detail-value[data-v-45cae65b]{color:#fff;font-weight:500;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}.logout-btn[data-v-45cae65b]{background:linear-gradient(135deg,#f56c6c 0%,#e84545 100%);color:#fff;border-radius:.5rem;font-size:1rem;font-weight:600;height:2.75rem;line-height:2.75rem;margin-top:.5rem;box-shadow:0 4px 12px rgba(245,108,108,.25);border:none}.logout-btn[data-v-45cae65b]:after{border:none}.version-tag[data-v-45cae65b]{text-align:center;font-size:.6875rem;color:#b5b5b5;margin-top:1rem;letter-spacing:.05rem}"};
var _pageWrapperEl = null;

        function _parseNavPath(rawPath) {
          var query = {};
          var path = rawPath;
          var qIdx = path.indexOf('?');
          if (qIdx >= 0) {
            var qs = path.substring(qIdx + 1);
            path = path.substring(0, qIdx);
            qs.split('&').forEach(function(pair) {
              if (!pair) return;
              var eq = pair.indexOf('=');
              var k = eq < 0 ? decodeURIComponent(pair) : decodeURIComponent(pair.substring(0, eq));
              var v = eq < 0 ? '' : decodeURIComponent(pair.substring(eq + 1));
              query[k] = v;
            });
          }
          return { path: path.replace(/^\//, ''), query: query };
        }

        // Navigate to a page via dynamic component switching
        function navigateToPage(rawPath) {
          var parsed = _parseNavPath(rawPath);
          var path = parsed.path;
          if (!window.__pages || !window.__pages[path]) {
            debugLog('nav: page not found: ' + path, true); return;
          }
          if (_pageWrapperEl && _pageWrapperEl._currentPage && _pageWrapperEl._currentPage !== path) {
            _pageHistory.push(_pageWrapperEl._currentPage);
          }
          var cssId = 'css_' + path.replace(/[\/\.]/g, '_');
          if (!document.getElementById(cssId) && window.__pageCssMap && window.__pageCssMap[path]) {
            var cssStyle = document.createElement('style');
            cssStyle.id = cssId;
            cssStyle.type = 'text/css';
            cssStyle.textContent = window.__pageCssMap[path];
            document.head.appendChild(cssStyle);
          }
          if (_pageWrapperEl) {
            _pageWrapperEl._currentPage = path;
            _pageWrapperEl._currentQuery = parsed.query;
          }
          debugLog('nav: switched to ' + path + ' query=' + JSON.stringify(parsed.query));
        }

        
        // === V6.1 CSS INJECTION AT STARTUP ===
        (function() {
          try {
            var map = window.__pageCssMap || {};
            var keys = Object.keys(map);
            for (var i = 0; i < keys.length; i++) {
              var k = keys[i];
              var id = 'css_' + k.replace(/[\/\.]/g, '_');
              if (!document.getElementById(id)) {
                var s = document.createElement('style');
                s.id = id;
                s.type = 'text/css';
                s.textContent = map[k];
                document.head.appendChild(s);
                debugLog('V6.1 CSS preloaded: ' + k);
              }
            }
          } catch(e) { debugLog('V6.1 CSS preload error: ' + e.message, true); }
        })();

        

        // V6.16: Runtime scroll-view height fix
        (function(){
          var __v616done = false;
          function __v616fix(){
            try{
              var pm = document.getElementById('_page_mount');
              if(!pm) return;
              if(pm.textContent.indexOf('采集信息') < 0) return;
              // Find all elements with class containing "spec-scroll"
              var els = pm.querySelectorAll('*');
              for(var i=0;i<els.length;i++){
                var el = els[i];
                var cls = el.className || '';
                if(typeof cls === 'string' && cls.indexOf('spec-scroll') >= 0){
                  el.style.maxHeight = 'none';
                  el.style.height = 'auto';
                  el.style.overflow = 'visible';
                }
              }
              if(!__v616done && document.querySelectorAll('[class*="spec-scroll"]').length > 0){
                __v616done = true;
                if(window.debugLog) debugLog('V6.16: spec-scroll height fixed');
              }
            }catch(e){ if(window.debugLog) debugLog('V6.16 err: '+e.message, true); }
          }
          try {
            var mo = new MutationObserver(function(){ __v616fix(); });
            if(document.body) mo.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']});
            else document.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, {childList: true, subtree: true, attributes: true}); });
          } catch(e) {}
          setInterval(__v616fix, 300);
        })();

        // V6.17: Force override CSS - make page scroll naturally, unclip content
        (function(){
          try {
            var s = document.createElement('style');
            s.id = 'css_v617_force';
            s.textContent = 
              '.collect-page[data-v-c378e7a5]{height:auto!important;min-height:100vh!important;overflow:visible!important}' +
              '.card[data-v-c378e7a5]:last-of-type{flex:none!important;height:auto!important;min-height:0!important;overflow:visible!important}' +
              '.spec-scroll[data-v-c378e7a5]{flex:none!important;height:auto!important;min-height:0!important;overflow:visible!important;max-height:none!important}' +
              '.input-grid[data-v-c378e7a5]{flex-wrap:wrap!important}';
            document.head.appendChild(s);
            debugLog('V6.17: Force CSS injected');
          } catch(e) { debugLog('V6.17 CSS err: '+e.message, true); }
        })();

        function startApp() {
          try {
            var appEl = document.getElementById('app');
            if (!appEl) { debugLog('startApp: #app missing', true); return; }
            appEl.innerHTML = '<div id="_page_mount"></div>';
            _pageWrapperEl = document.getElementById('_page_mount');
            _pageWrapperEl._currentPage = '';

            window.__navRef = window.Vue.ref('pages/login/index');

            // NOTE: using render() NOT template — production Vue is runtime-only build
            // Use data + computed + watch (more reliable than setup+ref)
            var mainApp = window.Vue.createApp({
              data: function() {
                return { pageName: 'pages/login/index', query: {} };
              },
              computed: {
                pageComponent: function() {
                  return window.__pages && window.__pages[this.pageName] || null;
                }
              },
              watch: {
                pageName: function(val) {
                  debugLog('Wrapper watcher: pageName -> ' + val);
                  var cssId = 'css_' + val.replace(/[\/\.]/g, '_');
                  if (!document.getElementById(cssId)) {
                    var l = document.createElement('link');
                    l.id = cssId; l.type = 'text/css'; l.rel = 'stylesheet';
                    l.href = val + '.css';
                    document.head.appendChild(l);
                  }
                  _pageWrapperEl._currentPage = val;
                  var self = this;
                  var pendingQuery = self.query || {};
                  setTimeout(function() {
                    try {
                      var root = _appInstance && _appInstance._instance;
                      if (!root || !root.subTree) { debugLog('onLoad: no subTree', true); return; }
                      var comp = root.subTree && root.subTree.component;
                      if (!comp) { debugLog('onLoad: no component', true); return; }
                      if (Array.isArray(comp.onLoad)) {
                        comp.onLoad.forEach(function(h) { h(pendingQuery); });
                        debugLog('Fired onLoad on ' + val);
                      }
                    } catch(e) { debugLog('onLoad err: ' + e.message, true); }
                  }, 100);
                }
              },
              render: function() {
                var comp = this.pageComponent;
                if (!comp) return window.Vue.h('div');
                return window.Vue.h(comp);
              }
            });
            if (_extractedPinia) {
              mainApp.use(_extractedPinia);
            }
            mainApp.config.errorHandler = function(err, instance, info) {
              debugLog('Vue err: ' + (err.message || err) + ' [' + (info||'') + ']', true);
            };
            mainApp.config.warnHandler = function(msg) {
              debugLog('Vue warn: ' + String(msg||'').substr(0, 200), true);
            };
            _appInstance = mainApp;

            navigateToPage = function(rawPath) {
              // Parse the URL: strip query string, strip leading slash
              var parsed = _parseNavPath(rawPath);
              var path = parsed.path;
              var query = parsed.query;
              if (!window.__pages || !window.__pages[path]) {
                debugLog('nav: page not found: ' + path + ' (registered: ' + Object.keys(window.__pages||{}).join(',') + ')', true);
                // Try to recover by scanning for the page component
                if (window.__refreshPageRegistry) {
                  window.__refreshPageRegistry();
                  if (window.__pages[path]) {
                    debugLog('nav: recovered page ' + path + ' via fallback');
                  } else {
                    return;
                  }
                } else {
                  return;
                }
              }
              if (_pageWrapperEl._currentPage && _pageWrapperEl._currentPage !== path) {
                _pageHistory.push(_pageWrapperEl._currentPage);
              }
              _pageWrapperEl._currentQuery = query;
              // Pass query to specific pages via globals
              if (path === 'pages/collect/index' && query.id) {
                window.__collectCustomerId = query.id;
              }
              if (window.__ensureCustomCollect) window.__ensureCustomCollect();
              if (path === 'pages/customers/index' && window.__injectCollectedStatus) {
                window.__injectCollectedStatus();
              }
              // Primary: mutate wrapper's data property via saved proxy reference
              if (window.__wrapperProxy) {
                window.__wrapperProxy.pageName = path;
                window.__wrapperProxy.query = query;
                debugLog('nav: switched to ' + path + ' via __wrapperProxy.pageName query=' + JSON.stringify(query));
                return;
              }
              // Fallback: try direct proxy access
              if (_appInstance && _appInstance._instance && _appInstance._instance.proxy) {
                try {
                  _appInstance._instance.proxy.pageName = path;
                  debugLog('nav: switched to ' + path + ' via proxy.pageName');
                  return;
                } catch(e) { debugLog('nav: proxy.pageName set failed: ' + e.message, true); }
              }
              // Fallback 2: hard reset — replace mount element entirely to clear all DOM
              debugLog('nav: ALL fallbacks failed, hard-resetting wrapper for ' + path, true);
              try {
                if (_appInstance && _appInstance.unmount) {
                  _appInstance.unmount();
                }
                _appInstance = null;
                window.__wrapperProxy = null;
                var oldMount = document.getElementById('_page_mount');
                if (oldMount && oldMount.parentNode) {
                  var newMount = document.createElement('div');
                  newMount.id = '_page_mount';
                  oldMount.parentNode.replaceChild(newMount, oldMount);
                  _pageWrapperEl = newMount;
                }
                // Create a fresh app with the pageName data + computed + watch (matches original wrapper structure)
                var FreshApp = window.Vue.createApp({
                  data: function() { return { pageName: path, query: query }; },
                  computed: {
                    pageComponent: function() {
                      // AGGRESSIVE: ensure CustomCollect is in place before each render
                      if (window.__ensureCustomCollect) {
                        var before = window.__pages && window.__pages['pages/collect/index'];
                        var beforeName = before ? (before.__name || before.name || '?') : 'null';
                        window.__ensureCustomCollect();
                        var after = window.__pages && window.__pages['pages/collect/index'];
                        var afterName = after ? (after.__name || after.name || '?') : 'null';
                        var customName = window._CustomCollect ? (window._CustomCollect.__name || 'set') : 'UNDEFINED';
                        if (this.pageName === 'pages/collect/index' || beforeName !== afterName) {
                          debugLog('CCheck: _CC=' + customName + ' before=' + beforeName + ' after=' + afterName);
                        }
                      }
                      var comp = window.__pages && window.__pages[this.pageName] || null;
                      debugLog('FreshApp computed pageComponent: ' + (comp ? (comp.__name || comp.name || 'unknown') : 'null') + ' for ' + this.pageName);
                      return comp;
                    }
                  },
                  watch: {
                    pageName: function(val) {
                      var cssId = 'css_' + val.replace(/[\/\.]/g, '_');
                      if (!document.getElementById(cssId)) {
                        var l = document.createElement('link');
                        l.id = cssId; l.type = 'text/css'; l.rel = 'stylesheet';
                        l.href = val + '.css';
                        document.head.appendChild(l);
                      }
                      _pageWrapperEl._currentPage = val;
                    }
                  },
                  render: function() { return window.Vue.h(this.pageComponent || 'div'); }
                });
                if (_extractedPinia) FreshApp.use(_extractedPinia);
                FreshApp.config.errorHandler = function(err) { debugLog('Fresh Vue err: ' + err.message, true); };
                _appInstance = FreshApp;
                FreshApp.mount('#_page_mount');
                window.__wrapperProxy = FreshApp._instance && FreshApp._instance.proxy;
                debugLog('nav: re-mounted fresh app for ' + path + ' proxy=' + !!window.__wrapperProxy);
              } catch(e) { debugLog('nav fallback2 err: ' + e.message, true); }
            };

            // mount() returns the root component's public proxy (survives minification unlike _instance)
            var rootProxy = mainApp.mount('#_page_mount');
            window.__wrapperProxy = rootProxy;
            debugLog('startApp: mounted, proxy=' + (!!window.__wrapperProxy));
          } catch(e) {
            debugLog('startApp err: ' + (e.message||e), true);
            debugLog('Stack: ' + (e.stack||''), true);
          }
        }

        if (window.uni) {
          window.uni = Object.assign({}, window.uni, {
            showToast: function(o){var m=(o&&o.title)||(o&&o.message)||'';if(window.UniAppBridge)window.UniAppBridge.showToast(m);},
            showLoading: noop, hideLoading: noop, showActionSheet: noop,
            showModal: function(o){if(o&&o.content&&window.UniAppBridge)window.UniAppBridge.showToast(o.content);},
            getSystemInfoSync: function(){return {platform:'android',version:'14',model:'Android',screenWidth:window.innerWidth,screenHeight:window.innerHeight,windowWidth:window.innerWidth,windowHeight:window.innerHeight,statusBarHeight:24,safeAreaInsets:{top:0,bottom:0,left:0,right:0},safeArea:{top:0,bottom:0,left:0,right:0,width:window.innerWidth,height:window.innerHeight},pixelRatio:DPR,SDKVersion:'14',deviceId:'debug-device'};},
            getSystemInfo: function(s){if(s)s(this.getSystemInfoSync());},
            chooseImage: function(o,s,f){if(f)f({errMsg:'chooseImage not impl'});},
            getLocation: function(o,s,f){if(f)f({errMsg:'getLocation not impl'});},
            request: noop,
            setStorageSync: function(k,v){try{localStorage.setItem(k,v);}catch(e){}},
            getStorageSync: function(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}},
            removeStorageSync: function(k){try{localStorage.removeItem(k);}catch(e){}},
            getStorageInfoSync: function(){return {keys:Object.keys(localStorage||{}),currentSize:0,limitSize:10240};},
            scanCode: function(o,s,f){if(f)f({errMsg:'scan not impl'});},
            uploadFile: function(o,s,f){if(f)f({errMsg:'upload not impl'});},
            chooseLocation: function(o,s,f){if(f)f({errMsg:'chooseLocation not impl'});},
            getLocale: function(){return 'zh-CN';}, setLocale: noop,
            onNetworkStatusChange: noop, offNetworkStatusChange: noop,
            onAppShow: noop, offAppShow: noop, onAppHide: noop, offAppHide: noop,
            createSelectorQuery: noop, createMapContext: noop, pageScrollTo: noop,
            login: function(o){if(o&&o.fail)o.fail({errMsg:'login not impl'});}, checkSession: function(){},
            navigateTo: function(o){if(o&&o.url)navigateToPage(o.url);}, navigateBack: function(){if(_pageHistory.length>0)navigateToPage(_pageHistory.pop());}, redirectTo: function(o){if(o&&o.url)navigateToPage(o.url);}, switchTab: function(o){if(o&&o.url)navigateToPage(o.url);}, reLaunch: function(o){_pageHistory=[];if(o&&o.url)navigateToPage(o.url);}
          });
        }

        firePlusReady();

        // Start the single persistent Vue app
        setTimeout(function() {
          try {
            // Extract Pinia from existing app (created by app-service.js)
            var appEl = document.getElementById('app');
            var existingApp = appEl && appEl.__vue_app__;
            if (!_extractedPinia && existingApp && existingApp.config && existingApp.config.globalProperties) {
              _extractedPinia = existingApp.config.globalProperties.$pinia;
            }
            debugLog('Pinia: ' + (!!_extractedPinia));

            // Set up page metadata
            window.__PAGE_INFO__ = { route: 'pages/login/index' };
            window.__SYSTEM_INFO__ = {
              platform: 'android',
              pixelRatio: window.devicePixelRatio || 1,
              windowWidth: window.innerWidth
            };

            // Add CSS for uni-app custom tags
            var uniStyle = document.createElement('style');
            uniStyle.textContent =
              'view{display:flex;flex-direction:column;box-sizing:border-box}' +
              'text{display:inline}' +
              'button{display:inline-flex;align-items:center;justify-content:center}' +
              'input{display:inline-block;width:auto}' +
              'image{display:inline-block}' +
              'scroll-view{display:flex;flex-direction:column;overflow:auto}' +
              '[hidden]{display:none}' +
              'html{font-size:18px}body{font-size:1rem;margin:0;background:#f5f6fa}';
            document.head.appendChild(uniStyle);

            // Start the single persistent app
            startApp();

            // DIAG after mount
            setTimeout(function() {
              var after = document.getElementById('app');
              var html = (after && after.innerHTML) || '';
              debugLog('Vue mount OK: #app has ' + html.length + ' chars');
              debugLog('innerHTML: ' + html.substr(0, 300).replace(/</g, '[').replace(/>/g, ']'));
              var allEls = after && after.getElementsByTagName('*');
              if (allEls && allEls.length > 0) {
                for (var ei = 0; ei < Math.min(allEls.length, 5); ei++) {
                  var el = allEls[ei];
                  debugLog('  DOM[' + ei + ']: ' + el.tagName + ' w=' + el.offsetWidth + ' h=' + el.offsetHeight + ' text=' + (el.textContent || '').substr(0, 40));
                }
              }
            }, 500);

            function _csvEsc(v) {
              var s = String(v == null ? '' : v);
              if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            }

            // Export functions removed — download handled via Android Java Interface (saveCSV)

            window.__ensureCustomCollect = function() {
            };

            // Custom Collect page with one-spec-per-page, draft save, and review flow
            window.__ensureCustomCollect = function() {
              if (window._CustomCollect && window.__pages) {
                window.__pages['pages/collect/index'] = window._CustomCollect;
              }
            };
            // Set a default _CustomCollect so the safety net always has something valid
            window._CustomCollect = window.Vue.defineComponent({
              template: '<div style="padding:40px;text-align:center;color:#f56c6c;font-size:16px">CustomCollect standby — real component not loaded yet</div>'
            });
            window.__ensureCustomCollect();
            (function() {
              // CSS for the custom collect page
              var ccCss = document.createElement('style');
              ccCss.textContent =
                '.cc-page{padding:12px 12px 120px;background:#f5f6fa;min-height:100vh}' +
                '.cc-card{background:#fff;border-radius:8px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.04)}' +
                '.cc-h1{font-size:18px;font-weight:600;color:#222;margin-bottom:6px}' +
                '.cc-h2{font-size:15px;font-weight:600;color:#222;margin-bottom:10px}' +
                '.cc-progress{font-size:12px;color:#888;margin-bottom:12px}' +
                '.cc-spec-name{font-size:16px;font-weight:600;color:#1989fa;margin:10px 0 14px 0;padding:8px 0;border-bottom:1px solid #eee}' +
                '.cc-input-cell{margin-bottom:14px}' +
                '.cc-input-label{display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:500}' +
                '.cc-input{display:block;width:100%;box-sizing:border-box;padding:12px 14px;font-size:16px;border:1px solid #ddd;border-radius:6px;background:#fafafa}' +
                '.cc-input:focus{border-color:#1989fa;background:#fff;outline:none}' +
                '.cc-actions{display:flex;gap:8px;margin-top:14px}' +
                '.cc-btn{flex:1;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}' +
                '.cc-btn-primary{background:#1989fa;color:#fff}' +
                '.cc-btn-secondary{background:#fff;color:#1989fa;border:1px solid #1989fa}' +
                '.cc-btn-danger{background:#f56c6c;color:#fff}' +
                '.cc-btn[disabled]{opacity:.4}' +
                '.cc-review-item{display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #eee;font-size:13px}' +
                '.cc-review-item .cc-spec-name{flex:1;padding:0;border:none;margin:0;font-size:13px;color:#333;font-weight:500}' +
                '.cc-review-item .cc-data{color:#666;font-size:12px;margin-left:6px;white-space:nowrap}' +
                '.cc-review-item.checked{color:#1989fa}' +
                '.cc-loading,.cc-error{padding:40px;text-align:center;color:#888;font-size:14px}' +
                '.cc-gps-row{display:flex;gap:8px;margin-bottom:10px}' +
                '.cc-gps-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:12px;background:#ffebee;color:#c62828}' +
                '.cc-gps-badge.good{background:#e8f5e9;color:#2e7d32}' +
                '.cc-dist-badge{display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;background:#e8f5e9;color:#2e7d32;font-weight:600}' +
                '.cc-gps-waiting{display:inline-block;padding:4px 10px;border-radius:12px;font-size:12px;background:#fff3e0;color:#e65100}' +
                '.cc-customer-info{font-size:12px;color:#666;line-height:1.6;margin-bottom:8px}' +
                '.cc-empty-check{display:inline-block;width:18px;height:18px;border:1px solid #ddd;border-radius:4px;margin-right:8px;vertical-align:middle}' +
                '.cc-empty-check.checked{background:#1989fa;border-color:#1989fa;position:relative}' +
                '.cc-empty-check.checked:after{content:"\2713";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:12px;font-weight:700}' +
                '.cc-search{width:100%;box-sizing:border-box;padding:10px 14px;font-size:15px;border:1px solid #ddd;border-radius:6px;background:#fafafa;margin-bottom:10px}' +
                '.cc-search:focus{border-color:#1989fa;background:#fff;outline:none}' +
                '.cc-toggles{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
                '.cc-toggle{padding:8px 12px;font-size:13px;border:1px solid #ddd;border-radius:16px;background:#fff;color:#666;cursor:pointer;transition:all .15s}' +
                '.cc-toggle.active{background:#1989fa;color:#fff;border-color:#1989fa;font-weight:600}' +
                '.cc-ratio-row{display:flex;align-items:center;gap:6px}' +
                '.cc-ratio-input{flex:1;min-width:0;box-sizing:border-box;padding:10px 6px;font-size:16px;border:1px solid #ddd;border-radius:6px;background:#fafafa;text-align:center}' +
                '.cc-ratio-input:focus{border-color:#1989fa;background:#fff;outline:none}' +
                '.cc-ratio-sep{font-size:18px;font-weight:700;color:#1989fa}';
              document.head.appendChild(ccCss);

              // Helper: XHR request (uses our mocked XHR prototype)
              window.__apiReq = function(method, url, body) {
                return new Promise(function(resolve, reject) {
                  try {
                    var xhr = new XMLHttpRequest();
                    xhr.open(method, url, true);
                    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.onload = function() {
                      try {
                        var data = null;
                        if (xhr.responseText) {
                          try { data = JSON.parse(xhr.responseText); } catch (e) { data = xhr.responseText; }
                        }
                        if (xhr.status >= 200 && xhr.status < 300) {
                          resolve({ data: data, status: xhr.status });
                        } else {
                          reject({ response: { data: data, status: xhr.status }, message: 'HTTP ' + xhr.status });
                        }
                      } catch (e) { reject(e); }
                    };
                    xhr.onerror = function() { reject(new Error('Network error')); };
                    xhr.send(body ? JSON.stringify(body) : null);
                  } catch (e) { reject(e); }
                });
              };

              // Helper: GPS via navigator.geolocation (high accuracy first)
              window.__getGPS = function() {
                return new Promise(function(resolve, reject) {
                  var done = false;
                  var gpsRes = null;
                  function finish(lat, lng, acc) {
                    if (!done) { done = true; resolve({ latitude: lat, longitude: lng, accuracy: acc || 50 }); }
                  }
                  // Priority 1: navigator.geolocation (high accuracy, fresh fix)
                  function tryNavigator() {
                    if (typeof navigator !== 'undefined' && navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        function(pos) { finish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
                        function() { if (!done) tryPlusGeo(); },
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
                      );
                      setTimeout(function() { if (!done) tryPlusGeo(); }, 15000);
                    } else { tryPlusGeo(); }
                  }
                  function tryPlusGeo() {
                    if (typeof plus !== 'undefined' && plus.geolocation) {
                      plus.geolocation.getCurrentPosition(
                        function(e) { finish(e.coords.latitude, e.coords.longitude, e.coords.accuracy); },
                        function(e) { if (!done) tryNative(); },
                        { enableHighAccuracy: true, timeout: 10000 }
                      );
                      setTimeout(function() { if (!done) tryNative(); }, 10000);
                    } else { tryNative(); }
                  }
                  function tryNative() {
                    try {
                      if (typeof Android !== 'undefined' && Android.getLastKnownLocation) {
                        var nativeLoc = Android.getLastKnownLocation();
                        if (nativeLoc) {
                          var parsed = JSON.parse(nativeLoc);
                          if (parsed && parsed.lat && parsed.lng) {
                            finish(parsed.lat, parsed.lng, parsed.acc || 20);
                            return;
                          }
                        }
                      }
                    } catch(e) { debugLog('native GPS err: ' + e.message, true); }
                    if (!done) reject(new Error('GPS failed'));
                  }
                  tryNavigator();
                });
              };

              // The custom Collect component
              var CustomCollect = window.Vue.defineComponent({
                __name: 'CustomCollect',
                data: function() {
                  return {
                    customerId: '',
                    customer: null,
                    specs: [],
                    currentIndex: 0,
                    view: 'form',
                    formData: {},
                    loading: false,
                    errorMsg: '',
                    gps: null,
                    gpsError: '',
                    gpsLoading: false,
                    savingDraft: false,
                    submitting: false,
                    searchTerm: '',
                    collectMode: 'all',
                    collectPrice: true,
                    collectRatio: true,
                    cigarTypeFilter: 'all'
                  };
                },
                computed: {
                  filteredSpecs: function() {
                    var self = this;
                    var list = this.specs;
                    if (this.collectMode === 'top10') list = list.slice(0, 10);
                    if (this.cigarTypeFilter !== 'all') {
                      list = list.filter(function(s) { return s.cigar_type === self.cigarTypeFilter; });
                    }
                    if (this.searchTerm) {
                      var term = this.searchTerm.toLowerCase();
                      list = list.filter(function(s) {
                        return (s.name || '').toLowerCase().indexOf(term) >= 0 ||
                               (s.brand || '').toLowerCase().indexOf(term) >= 0 ||
                               (s.code || '').toLowerCase().indexOf(term) >= 0 ||
                               String(s.id || '').indexOf(term) >= 0;
                      });
                    }
                    if (this.currentIndex >= list.length) this.currentIndex = 0;
                    return list;
                  },
                  currentSpec: function() { return this.filteredSpecs[this.currentIndex] || null; },
                  isFirst: function() { return this.currentIndex === 0; },
                  isLast: function() { return this.currentIndex >= this.filteredSpecs.length - 1; },
                  formForCurrent: function() {
                    if (!this.currentSpec) return {};
                    var d = this.formData[this.currentSpec.id];
                    return d || { sales: 0, looseActual: 0, looseCounted: 0, boxedActual: 0, boxedCounted: 0, diao: 0, hexiao: 0, zixi: 0, loose_price: 0, box_price: 0 };
                  },
                  isRatioValid: function() {
                    if (!this.collectRatio) return true;
                    var d = this.formForCurrent;
                    var diao = Number(d.diao) || 0;
                    var hexiao = Number(d.hexiao) || 0;
                    var zixi = Number(d.zixi) || 0;
                    if (diao === 0 && hexiao === 0 && zixi === 0) return true;
                    return Math.abs(diao + hexiao + zixi - 10) < 0.05;
                  },
                  isSubmitValid: function() {
                    var self = this;
                    if (self.collectRatio && !self.isRatioValid) return false;
                    return true;
                  },
                  completedCount: function() {
                    var self = this;
                    return self.specs.filter(function(s) {
                      var d = self.formData[s.id];
                      if (!d) return false;
                      return d.sales > 0 || d.looseActual > 0 || d.looseCounted > 0 || d.boxedActual > 0 || d.boxedCounted > 0;
                    }).length;
                  }
                },
                methods: {
                  init: function() {
                    this.customerId = window.__collectCustomerId || '';
                    if (!this.customerId) {
                      this.errorMsg = '缺少客户 ID';
                      return;
                    }
                    this.loadCustomerAndSpecs();
                  },
                  loadCustomerAndSpecs: function() {
                    var self = this;
                    self.loading = true;
                    Promise.all([
                      window.__apiReq('GET', '/customers/' + self.customerId).catch(function(e) { return { data: null }; }),
                      window.__apiReq('GET', '/cigar-specs').catch(function(e) { return { data: { data: [] } }; })
                    ]).then(function(results) {
                      self.customer = (results[0] && results[0].data) || null;
                      var specsData = (results[1] && results[1].data) || {};
                      self.specs = specsData.data || specsData || [];
                      // V6.1: Specs sorted by Excel order from JSON, no sort needed
                      
                      self.loadDraft();
                      self.loading = false;
                    }).catch(function(e) {
                      self.errorMsg = e.message || '加载失败';
                      self.loading = false;
                    });
                  },
                  loadDraft: function() {
                    try {
                      var key = 'cigar:draft:' + this.customerId;
                      var draft = localStorage.getItem(key);
                      if (draft) {
                        var parsed = JSON.parse(draft);
                        if (parsed && typeof parsed === 'object') {
                          // Handle both old format (raw formData) and new format (wrapped)
                          var formData = parsed.formData || parsed;
                          this.formData = formData;
                          debugLog('Custom collect: draft loaded for ' + this.customerId + ' (' + Object.keys(formData).length + ' specs)');
                          var self = this;
                          this.$nextTick(function() {
                            if (!self.filteredSpecs || self.filteredSpecs.length === 0) return;
                            var lastIdx = -1;
                            for (var fi = 0; fi < self.filteredSpecs.length; fi++) {
                              var sid = self.filteredSpecs[fi].id;
                              var d = formData[sid];
                              if (d && (Number(d.sales)>0 || Number(d.looseActual)>0 || Number(d.looseCounted)>0 || Number(d.boxedActual)>0 || Number(d.boxedCounted)>0 || Number(d.diao)>0 || Number(d.hexiao)>0 || Number(d.zixi)>0 || Number(d.loose_price)>0 || Number(d.box_price)>0)) {
                                lastIdx = fi;
                              }
                            }
                            if (lastIdx >= 0) {
                              self.currentIndex = lastIdx;
                              debugLog('Custom collect: jump to last filled spec index ' + lastIdx + ' / ' + self.filteredSpecs.length);
                            }
                          });
                        }
                      }
                    } catch (e) { debugLog('Draft load failed: ' + e.message, true); }
                  },
                  saveDraft: function() {
                    if (this.savingDraft) return;
                    this.savingDraft = true;
                    try {
                      var key = 'cigar:draft:' + this.customerId;
                      var data = { formData: this.formData, customerName: (this.customer && this.customer.name) || '' };
                      localStorage.setItem(key, JSON.stringify(data));
                      debugLog('Custom collect: draft saved');
                    } catch (e) { debugLog('Draft save failed: ' + e.message, true); }
                    finally { this.savingDraft = false; }
                  },
                  updateField: function(field, value) {
                    if (!this.currentSpec) return;
                    var id = this.currentSpec.id;
                    if (!this.formData[id]) {
                      this.formData[id] = { sales: 0, looseActual: 0, looseCounted: 0, boxedActual: 0, boxedCounted: 0, diao: 0, hexiao: 0, zixi: 0, loose_price: 0, box_price: 0 };
                    }
                    var n = parseFloat(value);
                    if (!isNaN(n) && n >= 0) n = Math.round(n * 100) / 100;
                    this.formData[id][field] = isNaN(n) || n < 0 ? 0 : n;
                    this.saveDraft();
                  },
                  onSearchChange: function() {
                    this.currentIndex = 0;
                  },
                  jumpToSpec: function(idx) {
                    if (idx >= 0 && idx < this.filteredSpecs.length) this.currentIndex = idx;
                  },
                  goToSubmit: function() {
                    if (!this.isSubmitValid) {
                      this.showToast('请完成必填项后再提交');
                      return;
                    }
                    this.saveDraft();
                    this.view = 'review';
                  },
                  next: function() {
                    if (this.view === 'form') {
                      if (this.isLast) {
                        this.view = 'review';
                      } else {
                        this.currentIndex++;
                      }
                    }
                  },
                  prev: function() {
                    if (this.view === 'review') {
                      this.view = 'form';
                    } else if (!this.isFirst) {
                      this.currentIndex--;
                    }
                  },
                  jumpTo: function(idx) {
                    this.currentIndex = idx;
                    this.view = 'form';
                  },
                  requestGPS: function() {
                    var self = this;
                    self.gpsLoading = true;
                    self.gpsError = '';
                    window.__getGPS().then(function(gps) {
                      self.gps = gps;
                      self.gpsLoading = false;
                      debugLog('GPS acquired: ' + JSON.stringify(gps));
                    }).catch(function(e) {
                      self.gpsLoading = false;
                      self.gpsError = '定位失败';
                      debugLog('GPS failed: ' + e.message, true);
                    });
                  },
                  computeDistance: function(lat1, lon1, lat2, lon2) {
                    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return '--';
                    var R = 6371000;
                    var dLat = (lat2 - lat1) * Math.PI / 180;
                    var dLon = (lon2 - lon1) * Math.PI / 180;
                    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                            Math.sin(dLon/2) * Math.sin(dLon/2);
                    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    return Math.round(R * c);
                  },
                  submit: function() {
                    if (this.submitting) return;
                    var self = this;
                    // GPS distance check
                    var gpsDistKm = null;
                    if (self.gps && self.customer && self.customer.gisLng && self.customer.gisLat) {
                      gpsDistKm = window.__haversineKm(
                        self.gps.latitude, self.gps.longitude,
                        self.customer.gisLat, self.customer.gisLng
                      );
                      if (gpsDistKm > 1) {
                        if (!confirm('当前定位距目标客户约 ' + gpsDistKm.toFixed(2) + ' km，超过1km。是否确认提交？')) {
                          self.submitting = false;
                          return;
                        }
                      }
                    }
                    this.submitting = true;
                    var details = self.specs.map(function(s) {
                      var d = self.formData[s.id] || {};
                      return {
                        cigarSpecId: s.id,
                        cigarName: s.name || '',
                        cigarBrand: s.brand || '',
                        salesQty: d.sales || 0,
                        actualStockLoose: d.looseActual || 0,
                        countedStockLoose: d.looseCounted || 0,
                        actualStockBoxed: d.boxedActual || 0,
                        countedStockBoxed: d.boxedCounted || 0,
                        diao: d.diao || 0,
                        hexiao: d.hexiao || 0,
                        zixi: d.zixi || 0,
                        loose_price: d.loose_price || 0,
                        box_price: d.box_price || 0
                      };
                    });
                    var cUsr = window.__currentUser || {};
                    var cCust = self.customer || {};
                    var payload = {
                      customerId: self.customerId,
                      customerName: cCust.name || '',
                      collectedBy: cUsr.name || '',
                      contactPerson: cCust.contactPerson || '',
                      phone: cCust.phone || '',
                      details: details,
                      photoUrls: [],
                      gpsLat: self.gps ? self.gps.latitude : 0,
                      gpsLng: self.gps ? self.gps.longitude : 0,
                      gpsDistanceKm: gpsDistKm,
                      gpsDistanceKmTrusted: gpsDistKm !== null && gpsDistKm <= 1,
                      collectedAt: new Date().toISOString()
                    };
                    window.__apiReq('POST', '/collections', payload).then(function() {
                      try { localStorage.removeItem('cigar:draft:' + self.customerId); } catch (e) {}
                      self.submitting = false;
                      self.showToast('提交成功');
                      setTimeout(function() {
                        window.__injectCollectedStatus();
                        if (typeof uni !== 'undefined' && uni.switchTab) {
                          uni.switchTab({ url: '/pages/customers/index' });
                        } else if (window.__wrapperProxy) {
                          window.__wrapperProxy.pageName = 'pages/customers/index';
                        } else if (typeof uni !== 'undefined' && uni.navigateBack) {
                          uni.navigateBack();
                        }
                      }, 600);
                    }).catch(function(e) {
                      self.submitting = false;
                      // Save to draft on failure (offline mode)
                      self.saveDraft();
                      self.showToast('提交失败，已离线保存草稿');
                    });
                  },
                  showToast: function(msg) {
                    try {
                      if (typeof uni !== 'undefined' && uni.showToast) uni.showToast({ title: msg, icon: 'none', duration: 2000 });
                      else if (window.UniAppBridge) window.UniAppBridge.showToast(msg);
                    } catch (e) { debugLog('toast err: ' + e.message, true); }
                  }
                },
                mounted: function() {
                  debugLog('CustomCollect mounted');
                  window.__collectVm = this;
                  this.init();
                  var self = this;
                  setTimeout(function() { self.requestGPS(); }, 500);
                },
                template: [
                  '<div class="cc-page">',
                  '  <div v-if="loading" class="cc-loading">加载中...</div>',
                  '  <div v-else-if="errorMsg" class="cc-error">{{ errorMsg }}</div>',
                  '  <div v-else-if="view === \'review\'" class="cc-card">',
                  '    <div class="cc-h1">采集数据确认</div>',
                  '    <div class="cc-progress">已完成 {{ completedCount }} / {{ specs.length }} 项</div>',
                  '    <div v-for="spec in specs" :key="spec.id" class="cc-review-item">',
                  '      <span class="cc-empty-check" :class="{ checked: formData[spec.id] && (formData[spec.id].sales > 0 || formData[spec.id].looseActual > 0 || formData[spec.id].looseCounted > 0 || formData[spec.id].boxedActual > 0 || formData[spec.id].boxedCounted > 0) }"></span>',
                  '      <span class="cc-spec-name">{{ spec.name }}</span>',
                  '      <span class="cc-data">销:{{ formData[spec.id] ? formData[spec.id].sales : 0 }}</span>',
                  '      <span class="cc-data">裸系:{{ formData[spec.id] ? formData[spec.id].looseActual : 0 }}</span>',
                  '      <span class="cc-data">裸盘:{{ formData[spec.id] ? formData[spec.id].looseCounted : 0 }}</span>',
                  '      <span class="cc-data">盒系:{{ formData[spec.id] ? formData[spec.id].boxedActual : 0 }}</span>',
                  '      <span class="cc-data">盒盘:{{ formData[spec.id] ? formData[spec.id].boxedCounted : 0 }}</span>',
                  '      <span v-if="collectRatio" class="cc-data">单:{{ formData[spec.id] ? formData[spec.id].diao : 0 }}/盒:{{ formData[spec.id] ? formData[spec.id].hexiao : 0 }}/自:{{ formData[spec.id] ? formData[spec.id].zixi : 0 }}</span>',
                  '      <span v-if="collectPrice" class="cc-data">裸价:{{ formData[spec.id] ? formData[spec.id].loose_price : 0 }}</span>',
                  '      <span v-if="collectPrice" class="cc-data">盒价:{{ formData[spec.id] ? formData[spec.id].box_price : 0 }}</span>',
                  '    </div>',
                  '    <div class="cc-actions" style="margin-top:18px">',
                  '      <button class="cc-btn cc-btn-secondary" @click="prev">返回修改</button>',
                  '      <button class="cc-btn cc-btn-primary" @click="submit" :disabled="submitting">{{ submitting ? "提交中..." : "确认提交" }}</button>',
                  '    </div>',
                  '  </div>',
                  '  <div v-else-if="currentSpec" class="cc-card">',
                  '    <div class="cc-h1">采集信息</div>',
                    '    <div class="cc-customer-info" v-if="customer" style="font-size:15px;line-height:1.7;background:#f0f7ff;border-radius:10px;padding:12px 14px;margin-bottom:12px">',
                    '      <div style="font-size:18px;font-weight:700;color:#222">{{ customer.name }}</div>',
                    '      <div style="font-size:13px;color:#888">许可证号: {{ customer.code || customer.id }}</div>',
                    '      <div v-if="customer.grade || customer.storeType" style="display:flex;gap:8px;margin-top:4px">',
                    '        <span v-if="customer.grade" style="font-size:12px;background:#27ae60;color:#fff;padding:2px 8px;border-radius:4px">{{ customer.grade }}</span>',
                    '        <span v-if="customer.storeType" style="font-size:12px;background:#2980b9;color:#fff;padding:2px 8px;border-radius:4px">{{ customer.storeType }}</span>',
                    '      </div>',
                    '      <div v-if="customer.contactPerson" style="font-size:13px;color:#666;margin-top:4px">负责人: {{ customer.contactPerson }} {{ customer.phone ? " / " + customer.phone : "" }}</div>',
                    '    </div>',
                    '    <div class="cc-gps-row">',
                    '      <span v-if="customer && customer.gisLng && customer.gisLat">',
                        '        <span v-if="gps && gps.latitude && gps.longitude" class="cc-dist-badge">',
                        '          与客户实际位置差距 {{ computeDistance(gps.latitude, gps.longitude, customer.gisLat, customer.gisLng) }} 米',
                        '        </span>',
                        '        <span v-else-if="gpsError" class="cc-gps-waiting">{{ gpsError }}</span>',
                        '        <span v-else class="cc-gps-waiting">定位中...</span>',
                    '      </span>',
                    '      <span v-else class="cc-gps-waiting">客户无坐标数据</span>',
                    '    </div>',
                  '    <div class="cc-progress">第 {{ currentIndex + 1 }} / {{ filteredSpecs.length }} 项 — 已完成 {{ completedCount }} 项</div>',
                  '    <input class="cc-search" type="text" v-model="searchTerm" @input="onSearchChange" placeholder="搜索规格名称/品牌/编号（筛选后仅采集匹配项）" />',
                  '    <div v-if="searchTerm" class="cc-search-info" style="font-size:12px;color:#888;margin-bottom:8px">已筛选到 {{ filteredSpecs.length }} 项规格</div>',
                  '    <div class="cc-toggles">',
                  '      <button class="cc-toggle" :class="{active: cigarTypeFilter===\'all\'}" @click="cigarTypeFilter=\'all\'">全部</button>',
                  '      <button class="cc-toggle" :class="{active: cigarTypeFilter===\'手工茄\'}" @click="cigarTypeFilter=\'手工茄\'">仅手工茄</button>',
                  '      <button class="cc-toggle" :class="{active: cigarTypeFilter===\'机制茄\'}" @click="cigarTypeFilter=\'机制茄\'">仅机制茄</button>',
                  '    </div>',
                  '    <div class="cc-toggles" style="margin-top:-4px">',
                  '      <button class="cc-toggle" :class="{active: collectMode===\'all\'}" @click="collectMode=\'all\'">全采</button>',
                  '      <button class="cc-toggle" :class="{active: collectMode===\'top10\'}" @click="collectMode=\'top10\'">前10规格</button>',
                  '      <button class="cc-toggle" :class="{active: collectPrice}" @click="collectPrice=!collectPrice">价格采集</button>',
                  '      <button class="cc-toggle" :class="{active: collectRatio}" @click="collectRatio=!collectRatio">采集销售比例</button>',
                  '    </div>',
                  '    <div class="cc-spec-name">{{ currentSpec.name }}</div>',
                  '    <div class="cc-input-cell">',
                  '      <label class="cc-input-label">本月销量(支)</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.sales || 0" @input="updateField(\'sales\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell">',
                  '      <label class="cc-input-label">系统库存——裸养（支）</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.looseActual || 0" @input="updateField(\'looseActual\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell">',
                  '      <label class="cc-input-label">实际盘点库存——裸养（支）</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.looseCounted || 0" @input="updateField(\'looseCounted\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell">',
                  '      <label class="cc-input-label">系统库存——盒</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.boxedActual || 0" @input="updateField(\'boxedActual\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell">',
                  '      <label class="cc-input-label">实际盘点库存——盒</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.boxedCounted || 0" @input="updateField(\'boxedCounted\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell" v-if="collectRatio">',
                  '      <label class="cc-input-label">单支 : 盒销 : 自吸</label>',
                  '      <div class="cc-ratio-row">',
                  '        <input class="cc-ratio-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.diao || 0" @input="updateField(\'diao\', $event.target.value)" />',
                  '        <span class="cc-ratio-sep">:</span>',
                  '        <input class="cc-ratio-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.hexiao || 0" @input="updateField(\'hexiao\', $event.target.value)" />',
                  '        <span class="cc-ratio-sep">:</span>',
                  '        <input class="cc-ratio-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.zixi || 0" @input="updateField(\'zixi\', $event.target.value)" />',
                  '      </div>',
                  '      <div v-if="!isRatioValid" class="cc-hint" style="color:#c62828;font-size:12px;margin-top:4px">单支、盒销、自吸 三数之和必须为 10</div>',
                  '    </div>',
                  '    <div class="cc-input-cell" v-if="collectPrice">',
                  '      <label class="cc-input-label">裸养支价</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.loose_price || 0" @input="updateField(\'loose_price\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-input-cell" v-if="collectPrice">',
                  '      <label class="cc-input-label">盒销价格</label>',
                  '      <input class="cc-input" type="number" inputmode="decimal" step="0.01" :value="formForCurrent.box_price || 0" @input="updateField(\'box_price\', $event.target.value)" />',
                  '    </div>',
                  '    <div class="cc-actions">',
                  '      <button class="cc-btn cc-btn-secondary" @click="prev" :disabled="isFirst">上一页</button>',
                  '      <button class="cc-btn cc-btn-secondary" @click="saveDraft" :disabled="savingDraft">保存草稿</button>',
                  '      <button class="cc-btn cc-btn-primary" @click="next">{{ isLast ? "完成 →" : "下一页 →" }}</button>',
                  '    </div>',
                  '    <div class="cc-actions" style="margin-top:8px">',
                  '      <button class="cc-btn cc-btn-danger" @click="goToSubmit" :disabled="!isSubmitValid" style="background:#27ae60;color:#fff">去提交页面 →</button>',
                  '    </div>',
                  '  </div>',
                  '  <div v-else class="cc-error">没有规格数据</div>',
                  '</div>'
                ].join('')
              });

              // Store as a regular component options object (NOT using Vue.component — that's an internal API in prod build)
              window._CustomCollect = CustomCollect;

              // Override the collect page in __pages
              if (window.__pages && window.__pages['pages/collect/index']) {
                debugLog('Replacing pages/collect/index with custom component');
                window.__pages['pages/collect/index'] = CustomCollect;
              } else {
                debugLog('CustomCollect: __pages.collect not found, creating fallback entry');
                if (!window.__pages) window.__pages = {};
                window.__pages['pages/collect/index'] = CustomCollect;
              }

              // Re-apply override (outer __ensureCustomCollect does this)
              window.__ensureCustomCollect();
              debugLog('CustomCollect ready, __pages.collect=' + ((window.__pages && window.__pages['pages/collect/index']) ? (window.__pages['pages/collect/index'].__name || window.__pages['pages/collect/index'].name || 'ok') : 'MISSING'));
            })();

            // --- Custom History page: 采集进度 ---
            var CustomHistory = window.Vue.defineComponent({
              __name: 'CustomHistory',
              data: function() {
                return { collections: [], drafts: [], loading: false, errorMsg: '', expandedId: null };
              },
              computed: {
                groupedMonths: function() {
                  var groups = {};
                  for (var i = 0; i < this.collections.length; i++) {
                    var c = this.collections[i];
                    var d = new Date(c.collectedAt);
                    var key = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(c);
                  }
                  var keys = Object.keys(groups).sort().reverse();
                  var arr = [];
                  for (var k = 0; k < keys.length; k++) {
                    arr.push({ month: keys[k], items: groups[keys[k]] });
                  }
                  return arr;
                }
              },
              methods: {
                init: function() {
                  this.loadCollections();
                  this.loadDrafts();
                },
                loadCollections: function() {
                  var self = this;
                  self.loading = true;
                  self.errorMsg = '';
                  window.__apiReq('GET', '/collections').then(function(resp) {
                    var data = resp.data || {};
                    var list = data.data || data || [];
                    list.sort(function(a, b) { return (b.collectedAt || '').localeCompare(a.collectedAt || ''); });
                    self.collections = list;
                    self.loading = false;
                  }).catch(function(e) {
                    self.errorMsg = e.message || '加载失败';
                    self.loading = false;
                  });
                },
                toggleExpand: function(id) {
                  this.expandedId = (this.expandedId === id) ? null : id;
                },
                formatDate: function(iso) {
                  if (!iso) return '-';
                  var d = new Date(iso);
                  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) + ' ' + ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
                },
                totalSales: function(details) {
                  if (!details || !details.length) return 0;
                  var sum = 0;
                  for (var i = 0; i < details.length; i++) { sum += (details[i].salesQty || 0); }
                  return sum;
                },
                loadDrafts: function() {
                  var self = this;
                  var ids = [];
                  try {
                    for (var i = 0; i < localStorage.length; i++) {
                      var k = localStorage.key(i);
                      if (k && k.indexOf('cigar:draft:') === 0) ids.push(k.substring(12));
                    }
                  } catch(e) { debugLog('loadDrafts err: ' + e.message, true); }
                  var drafts = [];
                  for (var j = 0; j < ids.length; j++) {
                    var cid = ids[j];
                    // Try getting customerName from draft data first (new format)
                    var name = '';
                    try {
                      var raw = JSON.parse(localStorage.getItem('cigar:draft:' + cid));
                      if (raw && raw.customerName) name = raw.customerName;
                    } catch(e) {}
                    if (!name) {
                      var c = window._findCustomer ? window._findCustomer(cid) : null;
                      name = c ? c.name : ('客户 #' + cid);
                    }
                    drafts.push({
                      customerId: cid,
                      customerName: name
                    });
                  }
                  self.drafts = drafts;
                  if (drafts.length > 0) debugLog('History: loaded ' + drafts.length + ' drafts');
                },
                continueDraft: function(cid) {
                  try {
                    if (typeof uni !== 'undefined' && uni.navigateTo) {
                      uni.navigateTo({ url: '/pages/collect/index?id=' + cid });
                    }
                  } catch(e) { debugLog('continueDraft err: ' + e.message, true); }
                },
                removeDraft: function(cid) {
                  try { localStorage.removeItem('cigar:draft:' + cid); } catch(e) {}
                  this.loadDrafts();
                }
              },
              mounted: function() {
                debugLog('CustomHistory mounted');
                this.init();
              },
              template: [
                '<div style="min-height:100vh;background:#f5f6fa;padding:12px 12px 8px;box-sizing:border-box">',
                '  <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:4px;padding:4px 0">采集进度</div>',
                '  <div style="font-size:12px;color:#888;margin-bottom:12px">共 {{ collections.length }} 条采集记录</div>',
                '  <div v-if="drafts.length" style="margin-bottom:14px;background:#fff8e1;border-radius:10px;overflow:hidden;border:1px solid #ffe082">',
                '    <div style="padding:12px 16px;font-size:15px;color:#e65100;font-weight:600;border-bottom:1px solid #ffe082;background:#fff3e0">未完成采集 ({{ drafts.length }})</div>',
                '    <div v-for="d in drafts" :key="\'draft_\'+d.customerId" style="padding:12px 16px;border-bottom:1px solid #fff9c4;display:flex;justify-content:space-between;align-items:center;background:#fff">',
                '      <span style="font-size:14px;color:#555;font-weight:500">{{ d.customerName }}</span>',
                '      <div style="display:flex;gap:8px;align-items:center">',
                '        <span style="font-size:13px;color:#1989fa;font-weight:600;padding:6px 14px;border:1px solid #1989fa;border-radius:6px;cursor:pointer" @click="continueDraft(d.customerId)">继续采集</span>',
                '        <span style="font-size:13px;color:#999;padding:4px 8px;cursor:pointer" @click="removeDraft(d.customerId)">忽略</span>',
                '      </div>',
                '    </div>',
                '  </div>',
                '  <div v-if="loading" style="padding:40px;text-align:center;color:#888;font-size:14px">加载中...</div>',
                '  <div v-else-if="errorMsg" style="padding:40px;text-align:center;color:#f56c6c;font-size:14px">{{ errorMsg }}<br><button style="margin-top:12px;padding:8px 20px;background:#1989fa;color:#fff;border:none;border-radius:6px;font-size:14px" @click="loadCollections">重试</button></div>',
                '  <div v-else-if="!collections.length && !drafts.length" style="padding:60px 20px;text-align:center;color:#999;font-size:15px">暂无采集数据<br><span style="font-size:12px;color:#bbb">在雪茄户中选择客户进行采集</span></div>',
                '  <div v-if="collections.length">',
                '    <div v-for="group in groupedMonths" :key="group.month" style="margin-bottom:14px">',
                '      <div style="font-size:13px;font-weight:600;color:#666;padding:6px 4px 8px;border-bottom:1px solid #e0e0e0;margin-bottom:8px">{{ group.month }}</div>',
                '      <div v-for="col in group.items" :key="col.customerId + col.collectedAt" style="background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);cursor:pointer" @click="toggleExpand(col.customerId + col.collectedAt)">',
                '        <div style="display:flex;justify-content:space-between;align-items:center">',
                '          <div style="display:flex;flex-direction:column;flex:1">',
                '            <span style="font-size:16px;font-weight:600;color:#1a1a1a">{{ col.customerName || col.customerId }}</span>',
                '            <span style="font-size:12px;color:#888;margin-top:3px">{{ formatDate(col.collectedAt) }}</span>',
                '          </div>',
                '          <div style="display:flex;align-items:center;gap:6px">',
'            <span style="font-size:12px;color:#1989fa;background:#e8f3ff;padding:2px 8px;border-radius:8px;font-weight:500">{{ (col.details && col.details.length) || 0 }} 项</span>',
'            <span v-if="col.gpsDistanceKm != null" :style="{background:col.gpsDistanceKm<=0.1?\'#27ae60\':col.gpsDistanceKm<=0.5?\'#e67e22\':\'#e74c3c\',color:\'#fff\',fontSize:\'12px\',padding:\'2px 8px\',borderRadius:\'8px\',fontWeight:\'500\'}">偏移{{col.gpsDistanceKm<1?(col.gpsDistanceKm*1000).toFixed(0)+\'m\':col.gpsDistanceKm.toFixed(1)+\'km\'}}</span>',
'            <span style="font-size:12px;color:#67c23a;background:#e1f3d8;padding:2px 8px;border-radius:8px;font-weight:500">已采集</span>',
                '          </div>',
                '        </div>',
                '        <div v-if="expandedId === col.customerId + col.collectedAt" style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">',
                '          <div style="font-size:13px;color:#555;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px 16px">',
                '            <span>采集人: <strong>{{ col.collectedBy || "-" }}</strong></span>',
'            <span>联系人: <strong>{{ col.contactPerson || "-" }}</strong></span>',
'            <span>电话: <strong>{{ col.phone || "-" }}</strong></span>',
                '          </div>',
                '          <div style="font-size:12px;font-weight:600;color:#333;padding:6px 0;border-bottom:1px solid #f0f0f0;margin-bottom:6px">采集明细</div>',
                '          <div v-for="d in (col.details || [])" :key="d.cigarSpecId || d.cigarName" style="display:flex;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;gap:2px">',
                '            <span style="font-weight:600;color:#333;width:100%;margin-bottom:2px">{{ d.cigarName || d.cigarBrand || "-" }}</span>',
                '            <span style="color:#666;margin-right:12px">销量: <strong>{{ d.salesQty || 0 }}</strong></span>',
                '            <span style="color:#666;margin-right:12px">裸系: <strong>{{ d.actualStockLoose || 0 }}</strong></span>',
                '            <span style="color:#666;margin-right:12px">裸盘: <strong>{{ d.countedStockLoose || 0 }}</strong></span>',
                '            <span style="color:#666;margin-right:12px">盒系: <strong>{{ d.actualStockBoxed || 0 }}</strong></span>',
                '            <span style="color:#666">盒盘: <strong>{{ d.countedStockBoxed || 0 }}</strong></span>',
                '          </div>',
                '        </div>',
                '      </div>',
                '    </div>',
                '  </div>',
                '</div>'
              ].join('')
            });
            window.__ensureCustomHistory = function() {
              if (window.__pages) {
                window.__pages['pages/history/index'] = CustomHistory;
              }
            };
            window.__ensureCustomHistory();
            var origNavHistory = navigateToPage;
            navigateToPage = function(rawPath) {
              var parsed = _parseNavPath(rawPath);
              if (parsed.path === 'pages/history/index') {
                window.__pages['pages/history/index'] = CustomHistory;
              }
              return origNavHistory(rawPath);
            };
            debugLog('CustomHistory registered');

            var tabNames = ['雪茄户', '采集进度', '我的'];
            var tabPages = ['pages/customers/index', 'pages/history/index', 'pages/profile/index'];
            var tabIcons = ['📋', '📊', '👤'];
            var tabBar = document.createElement('div');
            tabBar.id = '__tab_bar';
            tabBar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff;border-top:1px solid #ddd;display:none;height:56px;box-shadow:0 -2px 6px rgba(0,0,0,0.08);padding-bottom:env(safe-area-inset-bottom,0)';
            var tabBtns = [];
            for (var ti = 0; ti < tabNames.length; ti++) {
              (function(idx) {
                var btn = document.createElement('div');
                btn.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:#999;padding:4px 0;user-select:none;-webkit-user-select:none';
                btn.innerHTML = '<span style="font-size:20px;line-height:1.2">'+tabIcons[idx]+'</span><span style="margin-top:2px">'+tabNames[idx]+'</span>';
                btn.dataset.page = tabPages[idx];
                btn.dataset.tabIdx = idx;
                btn.onclick = function() {
                  var page = this.dataset.page;
                  if (page === 'pages/profile/index') {
                    // 我的 tab — show profile panel instead of navigating
                    showProfilePanel();
                  } else {
                    setActiveTab(idx);
                    navigateToPage(page);
                  }
                };
                tabBar.appendChild(btn);
                tabBtns.push(btn);
              })(ti);
            }
            document.body.appendChild(tabBar);

            function setActiveTab(idx) {
              for (var i = 0; i < tabBtns.length; i++) {
                tabBtns[i].style.color = (i === idx) ? '#1989fa' : '#999';
                tabBtns[i].querySelector('span:first-child').style.color = (i === idx) ? '#1989fa' : '#999';
              }
            }
            // Set initial active tab to 雪茄户 (index 0)
            setActiveTab(0);

            var tabPadStyle = document.createElement('style');
            tabPadStyle.textContent = 'body{padding-bottom:56px!important}';
            document.head.appendChild(tabPadStyle);
            document.body.style.paddingBottom = '0';

            debugLog('Bottom tab bar created');

            // --- Switch Account Modal (shared) ---
            var switchModal = null;
            function showSwitchAccount() {
              try {
                if (switchModal) { switchModal.style.display = 'flex'; return; }
                var users = Object.keys(_accounts);
                var listHtml = '';
                var curUser = window.__currentUser || {};
                for (var si = 0; si < users.length; si++) {
                  var sName = users[si];
                  var sInfo = _accounts[sName].user;
                  var isActive = sName === curUser.username;
                  listHtml += '<div class="__sw_item" data-uname="'+sName+'" style="padding:14px 16px;border-bottom:1px solid #eee;cursor:pointer;display:flex;align-items:center;gap:10px;background:'+(isActive?'#f0f7ff':'')+'">' +
                    '<span style="font-size:16px;font-weight:'+(isActive?'700':'400')+';">'+sName+'</span>' +
                    '<span style="font-size:12px;color:#888;background:#f0f0f0;padding:2px 8px;border-radius:4px">'+sInfo.roleName+'</span>' +
                    '<span style="font-size:12px;color:#999;margin-left:auto">'+sInfo.name+'</span>' +
                    (isActive ? '<span style="font-size:11px;color:#1989fa;font-weight:600">当前</span>' : '') + '</div>';
                }
                switchModal = document.createElement('div');
                switchModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center';
                switchModal.onclick = function(e) { if (e.target === switchModal) switchModal.style.display = 'none'; };
                switchModal.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:92%;max-height:80%;overflow:auto;padding:0;min-width:300px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">' +
                  '<div style="padding:16px 18px;font-size:17px;font-weight:700;border-bottom:1px solid #eee;background:#f5f6fa;border-radius:12px 12px 0 0;position:sticky;top:0;display:flex;align-items:center;justify-content:space-between">' +
                  '<span>切换账号</span>' +
                  '<button class="__sw_close" style="background:none;border:none;font-size:16px;color:#999;cursor:pointer;padding:4px 8px">✕</button></div>' +
                  listHtml +
                  '<div style="padding:12px 16px;text-align:center;border-top:1px solid #eee">' +
                  '<span style="font-size:12px;color:#aaa">点击账号直接切换</span></div></div>';
                document.body.appendChild(switchModal);
                switchModal.querySelectorAll('.__sw_item').forEach(function(el) {
                  el.addEventListener('click', function() {
                    var uname = el.getAttribute('data-uname');
                    var acct = _accounts[uname];
                    if (!acct) return;
                    window.__currentUser = acct.user;
                    try { localStorage.setItem('cigar:token', acct.token); } catch(e) {}
                    try { localStorage.setItem('cigar:user', JSON.stringify(acct.user)); } catch(e) {}
                    var authStore = null;
                    if (_extractedPinia && _extractedPinia._s) authStore = _extractedPinia._s.get('auth');
                    if (!authStore && window.__pinia_state && window.__pinia_state._s) authStore = window.__pinia_state._s.get('auth');
                    if (authStore) {
                      authStore.token = acct.token;
                      authStore.user = acct.user;
                    }
                    switchModal.style.display = 'none';
                    closeProfilePanel();
                    debugLog('Switched to user: ' + uname + ' role=' + acct.user.role);
                    updateProfilePanel();
                    setActiveTab(0);
                    navigateToPage('/pages/customers/index');
                  });
                });
                switchModal.querySelector('.__sw_close').addEventListener('click', function() { switchModal.style.display = 'none'; });
              } catch(e) { debugLog('Switch account err: ' + e.message, true); }
            }

            // --- Profile Panel (我的) ---
            var profileOverlay = null;
            function showProfilePanel() {
              if (profileOverlay) { profileOverlay.style.display = 'flex'; updateProfilePanel(); return; }
              profileOverlay = document.createElement('div');
              profileOverlay.id = '__profile_overlay';
              profileOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn 0.15s ease';
              profileOverlay.onclick = function(e) { if (e.target === profileOverlay) closeProfilePanel(); };
              profileOverlay.innerHTML = [
                '<div style="background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:500px;padding:20px 24px 32px;box-shadow:0 -4px 20px rgba(0,0,0,0.12);">',
                '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eee">',
                '    <span style="font-size:18px;font-weight:700">我的</span>',
                '    <button id="__profile_close" style="background:none;border:none;font-size:20px;color:#999;cursor:pointer;padding:4px 8px">✕</button>',
                '  </div>',
                '  <div id="__profile_avatar" style="width:60px;height:60px;border-radius:50%;background:#1989fa;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;margin:0 auto 12px">U</div>',
                '  <div id="__profile_name" style="text-align:center;font-size:20px;font-weight:600;color:#222;margin-bottom:4px"></div>',
                '  <div id="__profile_role" style="text-align:center;font-size:14px;color:#888;margin-bottom:20px"></div>',
                '  <div style="background:#f5f6fa;border-radius:12px;padding:16px;margin-bottom:20px;display:flex;flex-direction:column;gap:8px">',
                '    <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#888">用户名</span><span id="__profile_username" style="color:#333;font-weight:500"></span></div>',
                '    <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#888">角色</span><span id="__profile_role2" style="color:#333;font-weight:500"></span></div>',
                '  </div>',
                '  <button id="__profile_switch" style="width:100%;padding:14px;background:#f0f7ff;color:#1989fa;border:1px solid #1989fa;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:6px">切换账号</button>',
                '  <button id="__profile_update" style="width:100%;padding:14px;background:#e8f5e9;color:#2e7d32;border:1px solid #2e7d32;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px">检查更新</button>',
                '  <div id="__profile_version" style="text-align:center;font-size:12px;color:#aaa;margin-bottom:8px">' + (window.__appDisplay || '鹭茄记 V1.0.0') + '</div>',
                '  <button id="__profile_location_guide" style="width:100%;padding:10px;background:#fff8e1;color:#e65100;border:1px solid #ffca28;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:5px">定位未开启？点击跳转系统设置 →</button>',
                '  <button id="__profile_logout" style="width:100%;padding:14px;background:#ffebee;color:#d32f2f;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">退出登录</button>',
                '</div>'
              ].join('');
              document.body.appendChild(profileOverlay);

              // Populate user info
              updateProfilePanel();

              document.getElementById('__profile_close').onclick = closeProfilePanel;
              document.getElementById('__profile_switch').onclick = function() { showSwitchAccount(); };
              document.getElementById('__profile_update').onclick = function() { window.__checkUpdate(false); };
      document.getElementById('__profile_location_guide').onclick = function() { window.__openLocationSettings && window.__openLocationSettings(); };
              document.getElementById('__profile_logout').onclick = function() {
                // Clear auth
                try { localStorage.removeItem('cigar:token'); localStorage.removeItem('cigar:user'); } catch(e) {}
                window.__currentUser = null;
                var authStore = null;
                if (_extractedPinia && _extractedPinia._s) authStore = _extractedPinia._s.get('auth');
                if (!authStore && window.__pinia_state && window.__pinia_state._s) authStore = window.__pinia_state._s.get('auth');
                if (authStore) { authStore.token = null; authStore.user = null; }
                closeProfilePanel();
                debugLog('Logout → navigate to login page');
                window.__currentUser = null;
                navigateToPage('/pages/login/index');
              };
            }

            function updateProfilePanel() {
              var u = window.__currentUser || {};
              var nameEl = document.getElementById('__profile_name');
              var roleEl = document.getElementById('__profile_role');
              var unameEl = document.getElementById('__profile_username');
              var role2El = document.getElementById('__profile_role2');
              var avatarEl = document.getElementById('__profile_avatar');
              if (nameEl) nameEl.textContent = u.name || '未登录';
              if (roleEl) roleEl.textContent = u.roleName || u.role || '';
              if (unameEl) unameEl.textContent = u.username || '-';
              if (role2El) role2El.textContent = u.roleName || u.role || '-';
              if (avatarEl) avatarEl.textContent = (u.name || 'U').charAt(0).toUpperCase();
            }

            function closeProfilePanel() {
              if (profileOverlay) { profileOverlay.style.display = 'none'; }
            }

            // Add fadeIn keyframes
            var fadeStyle = document.createElement('style');
            fadeStyle.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}';
            document.head.appendChild(fadeStyle);

            var origNav = navigateToPage;
            navigateToPage = function(rawPath) {
              origNav(rawPath);
              var parsed = _parseNavPath(rawPath);
              var path = parsed.path;
              if (path === 'pages/login/index') {
                if (tabBar) tabBar.style.display = 'none';
                document.body.style.paddingBottom = '0';
                // 登陆页面底部显示版本号
                setTimeout(function(){
                  var el = document.getElementById('__login_version');
                  if (!el) {
                    el = document.createElement('div');
                    el.id = '__login_version';
                    el.style.cssText = 'position:fixed;bottom:20px;left:0;right:0;text-align:center;font-size:13px;color:#aaa;z-index:99999;pointer-events:none';
                    document.body.appendChild(el);
                  }
                  el.textContent = window.__appDisplay || '鹭茄记 V1.0.0';
                }, 1000);
              } else {
                if (tabBar) tabBar.style.display = 'flex';
                document.body.style.paddingBottom = '56px';
              }
              // Update active tab based on destination
              for (var i = 0; i < tabPages.length; i++) {
                if (tabPages[i] === path) {
                  setActiveTab(i);
                  break;
                }
              }
            };

            debugLog('Profile panel ready');
          } catch (e) {
            debugLog('Page render error: ' + e.message, true);
          }
        }, 200);
      })
      .catch(function(err) {
        debugLog('Loading failed: ' + err.message, true);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  setTimeout(function() { var a=document.getElementById('app'); debugLog('After 1s, #app length: '+((a&&a.innerHTML)||'').length); }, 1000);
  setTimeout(function() { var a=document.getElementById('app'); debugLog('After 3s, #app length: '+((a&&a.innerHTML)||'').length); }, 3000);
  setTimeout(function() { var a=document.getElementById('app'); debugLog('After 5s, #app length: '+((a&&a.innerHTML)||'').length); }, 5000);
})();

