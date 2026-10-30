/* Interface e laço principal: layout responsivo, controles, menus, HUD, autosave e ranking. */
(function (A) {
  'use strict';

  var G = A.Game, Store = A.Store, Snd = A.Sound, Rank = A.Ranking, W = G.W;
  var STEP = 1 / 60, GAIN = 1.3, SAVE_EVERY = 4;

  function $(id) { return document.getElementById(id); }
  var app = $('app'), stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d', { alpha: false });
  var el = {
    hud: $('hud'), hearts: $('hearts'), score: $('score'), levelPill: $('levelPill'), bar: $('bar'), banner: $('banner'),
    loadBar: $('loadBar'), loadMsg: $('loadMsg'), btnRetry: $('btnRetry'),
    btnContinue: $('btnContinue'), btnNew: $('btnNew'), btnRank: $('btnRank'), btnHow: $('btnHow'),
    btnSound: $('btnSound'), btnSound2: $('btnSound2'), btnPause: $('btnPause'),
    btnResume: $('btnResume'), btnMenu: $('btnMenu'),
    rankTabs: $('rankTabs'), tabGlobal: $('tabGlobal'), tabLocal: $('tabLocal'), rankSrc: $('rankSrc'), rankRows: $('rankRows'),
    overTitle: $('overTitle'), overScore: $('overScore'), overLevel: $('overLevel'), nameForm: $('nameForm'),
    nameIn: $('nameIn'), btnSave: $('btnSave'), overMsg: $('overMsg'),
    btnAgain: $('btnAgain'), btnRank2: $('btnRank2'), btnMenu2: $('btnMenu2'), rotate: $('rotate')
  };
  var SCREENS = ['sc-loading', 'sc-menu', 'sc-how', 'sc-rank', 'sc-pause', 'sc-over'];

  var assets = null, world = null, demo = null;
  var state = 'boot';           // boot | menu | play | pause | over
  var H = 800, scale = 1, cssScale = 1, landscape = false;
  var drag = null, keys = { left: false, right: false, up: false, down: false };
  var tgt = { x: 0, y: 0 };
  var acc = 0, last = 0, saveT = 0;
  var maxDpr = 2, frameMs = 16.7, slowFrames = 0;   /* resolução adaptativa: desce se o aparelho não acompanha */
  var backTo = 'sc-menu', pending = null, lastEntry = null, rankReq = 0, rankTab = 'global';
  var newArmed = false, newTimer = 0;
  var hudCache = { hp: -1, score: -1, level: -1 };

  function fmt(n) { return Number(n).toLocaleString('pt-BR'); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* opcional */ } }

  /* ---------------- layout ---------------- */
  function layout() {
    var r = app.getBoundingClientRect(), vw = r.width || window.innerWidth, vh = r.height || window.innerHeight;
    var ratio = vw / vh;
    var nh = ratio >= W / 800 ? 800 : Math.min(1000, W / ratio);
    nh = Math.round(nh);
    var sw = Math.min(vw, vh * W / nh), sh = sw * nh / W;
    stage.style.width = sw + 'px';
    stage.style.height = sh + 'px';
    stage.style.setProperty('--u', (sw / W) + 'px');
    stage.classList.toggle('fill', sw >= vw - 1 && sh >= vh - 1);
    cssScale = sw / W;
    H = nh;

    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr), s = dpr;
    while (sw * sh * s * s > 2.4e6 && s > 1) s -= 0.25;
    cv.width = Math.max(1, Math.round(sw * s));
    cv.height = Math.max(1, Math.round(sh * s));
    scale = cv.width / W;
    if (world) world.H = H;
    if (demo) demo.H = H;

    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* sem matchMedia */ }
    landscape = coarse && vw > vh * 1.15 && vh < 520;
    el.rotate.hidden = !landscape;
    if (landscape && state === 'play') pause();
  }

  /* ---------------- telas ---------------- */
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    if (id && id !== 'sc-over' && id !== 'sc-loading') {
      var b = $(id).querySelector('.btn.primary:not([hidden])') || $(id).querySelector('.btn:not([hidden])');
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
    }
  }

  function syncSound() {
    var m = Snd.isMuted(), t = 'Som: ' + (m ? 'desligado' : 'ligado');
    [el.btnSound, el.btnSound2].forEach(function (b) { b.textContent = t; b.setAttribute('aria-pressed', m ? 'true' : 'false'); });
  }

  function refreshMenu() {
    var sv = Store.loadSave();
    el.btnContinue.hidden = !sv;
    if (sv) el.btnContinue.textContent = 'Continuar · Nível ' + sv.level;
    el.btnNew.classList.toggle('primary', !sv);
    disarmNew();
    syncSound();
  }
  function disarmNew() {
    newArmed = false;
    clearTimeout(newTimer);
    el.btnNew.textContent = 'Novo jogo';
  }

  function toMenu() {
    state = 'menu';
    el.hud.hidden = true;
    world = null;
    refreshMenu();
    show('sc-menu');
  }

  /* ---------------- jogo ---------------- */
  function onEvent(ev, arg) {
    switch (ev) {
      case 'gem': Snd.play('gem', arg); break;
      case 'rabbit': Snd.play('rabbit'); break;
      case 'hurt': Snd.play('hurt'); vibrate(45); break;
      case 'thunder': Snd.play('thunder'); break;
      case 'warn': Snd.play('warn'); break;
      case 'level': Snd.play('level'); showBanner(); Store.save(world.snapshot()); break;
      default: break;
    }
  }

  function showBanner() {
    var l = world.level, b = el.banner;
    while (b.firstChild) b.removeChild(b.firstChild);
    var t = document.createElement('b'); t.textContent = 'Nível ' + l; b.appendChild(t);
    var n = document.createElement('span'); n.className = 'news'; n.textContent = G.NEWS[l] || 'Mais rápido'; b.appendChild(n);
    if (l === 1 || (l - 1) % 4 === 0) {
      var s = document.createElement('small'); s.className = 'biome'; s.textContent = G.BIOME_NAMES[G.biome(l)]; b.appendChild(s);
    }
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  function syncHud(force) {
    if (force || hudCache.hp !== world.hp) {
      for (var i = 0; i < el.hearts.children.length; i++) el.hearts.children[i].classList.toggle('off', i >= world.hp);
      hudCache.hp = world.hp;
    }
    if (force || hudCache.score !== world.score) { el.score.textContent = fmt(world.score); hudCache.score = world.score; }
    if (force || hudCache.level !== world.level) { el.levelPill.textContent = 'Nível ' + world.level + '/' + G.LAST; hudCache.level = world.level; }
    el.bar.style.transform = 'scaleX(' + Math.min(1, world.lt / G.LEVEL_TIME).toFixed(3) + ')';
  }

  function startGame(save) {
    Snd.unlock();
    var o = { H: H };
    if (save) { o.level = save.level; o.t = save.t; o.score = save.score; o.hp = save.hp; o.px = save.px; o.py = Math.min(save.py, H - 70); }
    else Store.clearSave();
    world = new G.World(assets, o);
    world.emit = onEvent;
    state = 'play';
    acc = 0; saveT = 0; drag = null;
    keys.left = keys.right = keys.up = keys.down = false;
    tgt.x = world.px; tgt.y = world.py;
    el.hud.hidden = false;
    show(null);
    syncHud(true);
    showBanner();
  }

  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    drag = null;
    keys.left = keys.right = keys.up = keys.down = false;
    Store.save(world.snapshot());
    syncSound();
    show('sc-pause');
  }
  function resume() {
    if (state !== 'pause' || landscape) return;
    state = 'play';
    show(null);
    world.inv = Math.max(world.inv, 0.8);
    acc = 0;
  }

  function finish() {
    var win = world.over === 'win';
    state = 'over';
    drag = null;
    Store.clearSave();
    Snd.play(win ? 'win' : 'dead');
    el.hud.hidden = true;
    el.overTitle.textContent = win ? 'Vitória!' : 'Fim de jogo';
    el.overScore.textContent = fmt(world.score);
    el.overLevel.textContent = win ? 'Você zerou os ' + G.LAST + ' níveis!' : 'Nível ' + world.level + ' de ' + G.LAST;
    pending = world.score > 0 ? { score: world.score, level: world.level, saved: false, busy: false } : null;
    el.nameForm.hidden = !pending;
    el.nameIn.value = Store.getName();
    el.nameIn.disabled = false;
    el.btnSave.disabled = false;
    el.overMsg.className = 'msg';
    el.overMsg.textContent = '';
    show('sc-over');
  }

  /* Grava a pontuação (local + online). Seguro chamar mais de uma vez. */
  function submitPending() {
    if (!pending || pending.saved || pending.busy) return Promise.resolve(null);
    var name = Store.cleanName(el.nameIn.value) || 'Jogador';
    Store.setName(name);
    pending.busy = true;
    el.btnSave.disabled = true;
    el.overMsg.className = 'msg';
    el.overMsg.textContent = 'Salvando…';
    var p = pending;
    return Rank.submit(name, p.score, p.level).then(function (r) {
      p.saved = true; p.busy = false;
      lastEntry = { name: name, score: p.score };
      var msg = r.local ? 'Nº ' + r.local + ' neste aparelho' : 'Fora do top 10 deste aparelho';
      var warn = false;
      if (r.online === true) msg += ' · enviado ao ranking online';
      else if (r.online === false) { msg += ' · ranking online indisponível'; warn = true; }
      if (state === 'over') {
        el.overMsg.className = 'msg' + (warn ? ' warn' : '');
        el.overMsg.textContent = msg;
        el.nameIn.disabled = true;
      }
      return r;
    });
  }

  /* ---------------- ranking ---------------- */
  function drawRows(rows) {
    var ul = el.rankRows;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    if (!rows.length) {
      var e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Nenhuma pontuação ainda. Seja o primeiro!';
      ul.appendChild(e); return;
    }
    rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (lastEntry && lastEntry.name === r.name && lastEntry.score === r.score) li.className = 'me';
      [['pos', (i + 1) + '.'], ['nm', r.name], ['lv', 'Nv ' + r.level], ['sc', fmt(r.score)]].forEach(function (c) {
        var s = document.createElement('span'); s.className = c[0]; s.textContent = c[1]; li.appendChild(s);
      });
      ul.appendChild(li);
    });
  }

  function setTab(tab) {
    rankTab = tab;
    el.tabGlobal.setAttribute('aria-selected', tab === 'global' ? 'true' : 'false');
    el.tabLocal.setAttribute('aria-selected', tab === 'local' ? 'true' : 'false');
  }

  function loadRank(tab, backend) {
    var req = ++rankReq;
    setTab(tab);
    if (tab === 'local') {
      el.rankSrc.textContent = 'Neste aparelho';
      drawRows(Store.localTop());
      return;
    }
    el.rankSrc.textContent = 'Carregando…';
    drawRows([]);
    el.rankRows.firstChild.textContent = '…';
    Rank.onlineTop().then(function (rows) {
      if (req !== rankReq) return;
      el.rankSrc.textContent = backend === 'supabase' ? 'Ranking online · todos os jogadores' : 'Ranking online · quem tem acesso a esta página';
      drawRows(rows);
    }, function () {
      if (req !== rankReq) return;
      setTab('local');
      el.rankSrc.textContent = 'Ranking online indisponível. Mostrando este aparelho.';
      drawRows(Store.localTop());
    });
  }

  var rankBackend = 'local', openReq = 0;
  function reloadRank() { loadRank(rankTab, rankBackend); }

  function openRank(from) {
    backTo = from;
    var req = ++openReq;
    show('sc-rank');
    el.rankTabs.hidden = true;
    el.rankSrc.textContent = 'Carregando…';
    Rank.backend().then(function (b) {
      if (req !== openReq) return;
      rankBackend = b;
      var online = b !== 'local';
      el.rankTabs.hidden = !online;
      el.tabGlobal.onclick = function () { loadRank('global', b); };
      el.tabLocal.onclick = function () { loadRank('local', b); };
      loadRank(online ? 'global' : 'local', b);
    });
  }

  /* ---------------- entrada ---------------- */
  cv.addEventListener('pointerdown', function (e) {
    Snd.unlock();
    if (state !== 'play' || drag) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, ex: world.px, ey: world.py };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (drag && e.pointerId === drag.id) { drag.cx = e.clientX; drag.cy = e.clientY; }
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('lostpointercapture', endDrag);
  document.addEventListener('pointerdown', Snd.unlock, { passive: true });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  document.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.key];
    if (k && state === 'play') { keys[k] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state === 'play') { pause(); e.preventDefault(); }
      else if (state === 'pause') { resume(); e.preventDefault(); }
      else if (e.key === 'Escape' && (!$('sc-how').hidden || !$('sc-rank').hidden)) { goBack(); }
    }
  });
  document.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) keys[k] = false; });

  function computeTarget() {
    var dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) { tgt.x = world.px + dx * 220; tgt.y = world.py + dy * 220; }
    else if (drag) {
      tgt.x = drag.ex + (drag.cx - drag.sx) * GAIN / cssScale;
      tgt.y = drag.ey + (drag.cy - drag.sy) * GAIN / cssScale;
    } else { tgt.x = world.px; tgt.y = world.py; }
  }

  /* ---------------- botões ---------------- */
  function click(node, fn) {
    node.addEventListener('click', function (e) { Snd.unlock(); Snd.play('click'); fn(e); });
  }
  function goBack() { if (backTo === 'sc-menu') { refreshMenu(); } show(backTo); }

  click(el.btnContinue, function () { var sv = Store.loadSave(); if (sv) startGame(sv); else startGame(null); });
  click(el.btnNew, function () {
    if (!el.btnContinue.hidden && !newArmed) {
      newArmed = true;
      el.btnNew.textContent = 'Apagar progresso?';
      clearTimeout(newTimer);
      newTimer = setTimeout(disarmNew, 3500);
      return;
    }
    disarmNew();
    startGame(null);
  });
  click(el.btnRank, function () { openRank('sc-menu'); });
  click(el.btnHow, function () { backTo = 'sc-menu'; show('sc-how'); });
  click(el.btnSound, function () { Snd.setMuted(!Snd.isMuted()); syncSound(); });
  click(el.btnSound2, function () { Snd.setMuted(!Snd.isMuted()); syncSound(); });
  click(el.btnPause, pause);
  click(el.btnResume, resume);
  click(el.btnMenu, function () { Store.save(world.snapshot()); toMenu(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) { click(b, goBack); });

  el.nameForm.addEventListener('submit', function (e) { e.preventDefault(); Snd.unlock(); submitPending(); });
  click(el.btnAgain, function () { submitPending(); startGame(null); });
  click(el.btnMenu2, function () { submitPending(); toMenu(); });
  click(el.btnRank2, function () {
    var p = submitPending();
    openRank('sc-over');
    p.then(function (r) { if (r && !$('sc-rank').hidden) reloadRank(); });
  });
  click(el.btnRetry, boot);

  /* ---------------- laço principal ---------------- */
  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!assets) { ctx.fillStyle = '#0b1a2e'; ctx.fillRect(0, 0, W, H); return; }
    if (world && (state === 'play' || state === 'pause' || state === 'over')) world.draw(ctx);
    else demo.demoDraw(ctx);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    last = ts;
    if (state === 'play') {
      computeTarget();
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 6 && !world.over) { world.update(STEP, tgt.x, tgt.y); acc -= STEP; n++; }
      if (n >= 6) acc = 0;
      frameMs += (dt * 1000 - frameMs) * 0.05;
      slowFrames = frameMs > 27 ? slowFrames + 1 : 0;
      if (slowFrames > 120 && maxDpr > 1) { maxDpr = Math.max(1, maxDpr - 0.5); slowFrames = 0; frameMs = 16.7; layout(); }
      syncHud(false);
      saveT += dt;
      if (saveT >= SAVE_EVERY) { saveT = 0; Store.save(world.snapshot()); }
      if (world.over) finish();
    } else if (state === 'menu' || state === 'boot') {
      if (demo) demo.demoUpdate(dt);
    }
    render();
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(); });
  window.addEventListener('blur', function () { if (state === 'play') pause(); });
  window.addEventListener('pagehide', function () { if (world && (state === 'play' || state === 'pause')) Store.save(world.snapshot()); });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 120); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

  function boot() {
    state = 'boot';
    try { if (document.fonts && document.fonts.load) document.fonts.load('700 26px "Barlow Condensed"'); } catch (e) { /* usa a fonte reserva */ }
    show('sc-loading');
    el.btnRetry.hidden = true;
    el.loadMsg.textContent = 'Preparando o voo…';
    G.loadAssets(function (p) { el.loadBar.style.transform = 'scaleX(' + Math.max(0.04, p).toFixed(2) + ')'; }).then(function (a) {
      assets = a;
      demo = new G.World(a, { H: H });
      demo.level = 1;
      state = 'menu';
      refreshMenu();
      show('sc-menu');
    }, function () {
      el.loadMsg.textContent = 'Não foi possível carregar o jogo. Verifique a conexão.';
      el.btnRetry.hidden = false;
    });
  }

  layout();
  boot();
  requestAnimationFrame(frame);

  /* Ganchos usados nos testes automatizados. */
  A.app = {
    startGame: startGame, pause: pause, resume: resume, finish: finish, toMenu: toMenu,
    get world() { return world; }, get state() { return state; }, get H() { return H; },
    get scale() { return scale; }, get cssScale() { return cssScale; }
  };
})(window.Aguia = window.Aguia || {});
