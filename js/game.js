/* Núcleo do jogo: níveis, entidades, colisões e desenho no canvas.
   Não toca no DOM (exceto para criar canvases fora da tela), então dá para simular sem interface. */
(function (A) {
  'use strict';

  var W = 450;                 // largura lógica; a altura (H) varia com a tela, entre 800 e 1000
  var LEVEL_TIME = 30, LAST = 20, MAX_HP = 5;
  var BIOMES = ['campos', 'floresta', 'deserto', 'tundra', 'vulcao'];
  var BIOME_NAMES = {
    campos: 'Campos e rios', floresta: 'Floresta densa', deserto: 'Deserto e cânions',
    tundra: 'Tundra e geleiras', vulcao: 'Vulcões e meteoros'
  };
  var NEWS = {
    1: 'Colete joias e cace coelhos', 3: 'Nuvens de tempestade!', 4: 'Gaviões à vista!',
    6: 'Raios mais rápidos', 9: 'Gaviões em bando', 13: 'Chuva de meteoros!', 17: 'Rajadas de meteoros!'
  };
  var EAGLE_R = 13;
  var FONT = '700 26px "Barlow Condensed","Arial Narrow",Arial,sans-serif';

  function biome(level) { return BIOMES[Math.min(Math.floor((level - 1) / 4), 4)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* Dificuldade por nível: intervalos de aparição (s) e velocidades. */
  function cfg(l) {
    return {
      speed: Math.min(140 + 14 * l, 430),
      mount: Math.max(2.2 - 0.07 * l, 0.95),
      storm: l < 3 ? null : Math.max(6 - 0.22 * l, 2.2),
      hawk: l < 4 ? null : Math.max(6.5 - 0.25 * l, 1.5),
      meteor: l < 13 ? null : Math.max(3.2 - 0.13 * (l - 12), 1.1),
      ring: Math.max(1.25 - 0.03 * l, 0.75),
      gem: 1.5,
      rabbit: Math.max(10 - 0.2 * l, 6)
    };
  }

  /* ---------------- assets ---------------- */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
      img.src = src;
    });
  }

  /* Sprite pré-escalado para 2x do tamanho lógico (nítido em telas de alta densidade). */
  function sprite(img, w, h) {
    var c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return { c: c, w: w, h: h, sh: null };
  }

  /* Silhueta escura em 1/4 da resolução; ao ampliar vira uma sombra suave (funciona em qualquer navegador). */
  function shadowOf(s) {
    if (!s.sh) {
      var sw = Math.max(4, Math.round(s.w / 4)), sh = Math.max(4, Math.round(s.h / 4));
      var c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      var g = c.getContext('2d');
      g.drawImage(s.c, 0, 0, sw, sh);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, sw, sh);
      s.sh = c;
    }
    return s.sh;
  }

  var FILES = {
    eagle1: 'eagle1.png', eagle2: 'eagle2.png', hawk1: 'hawk1.png', hawk2: 'hawk2.png',
    mount: 'mount.png', storm: 'storm.png', cloud: 'cloud.png',
    gem0: 'gem0.png', gem1: 'gem1.png', gem2: 'gem2.png',
    rabbit: 'rabbit.png', meteor: 'meteor.png', heart: 'heart.png', haze: 'haze.png'
  };

  function loadAssets(onProgress) {
    var names = Object.keys(FILES);
    var total = names.length + BIOMES.length, done = 0;
    function ld(src) {
      return loadImage(src).then(function (i) {
        done++;
        if (onProgress) onProgress(done / total);
        return i;
      });
    }
    var all = names.map(function (n) { return ld('assets/' + FILES[n]); })
      .concat(BIOMES.map(function (b) { return ld('assets/tile_' + b + '.jpg'); }));
    return Promise.all(all).then(function (imgs) {
      var I = {};
      names.forEach(function (n, i) { I[n] = imgs[i]; });
      var S = {
        eagle: [sprite(I.eagle1, 108, 88), sprite(I.eagle2, 108, 88)],
        hawk: [sprite(I.hawk1, 92, 75), sprite(I.hawk2, 92, 75)],
        mount: { 120: sprite(I.mount, 120, 120), 150: sprite(I.mount, 150, 150), 185: sprite(I.mount, 185, 185) },
        storm: sprite(I.storm, 190, 143),
        cloud: sprite(I.cloud, 190, 143),
        gem: [sprite(I.gem0, 30, 30), sprite(I.gem1, 30, 30), sprite(I.gem2, 30, 30)],
        rabbit: sprite(I.rabbit, 36, 59),
        meteor: sprite(I.meteor, 60, 100),
        haze: I.haze,
        tile: {}
      };
      BIOMES.forEach(function (b, i) { S.tile[b] = imgs[names.length + i]; });
      return S;
    });
  }

  function put(ctx, s, x, y, ang, ox, oy) {
    if (ox !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.translate(x + ox, y + oy);
      if (ang) ctx.rotate(ang);
      ctx.drawImage(shadowOf(s), -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    if (ang) ctx.rotate(ang);
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  /* ---------------- mundo ---------------- */
  function World(assets, o) {
    o = o || {};
    this.A = assets;
    this.H = o.H || 800;
    this.level = o.level || 1;
    this.lt = o.t || 0;
    this.score = o.score || 0;
    this.hp = o.hp || 4;
    this.px = o.px || W / 2;
    this.py = o.py || 650;
    this.vx = 0; this.vy = 0;
    this.ents = []; this.texts = []; this.bolts = [];
    this.ground = 0; this.inv = 1.8; this.shake = 0; this.flash = 0; this.white = 0; this.anim = 0;
    this.over = null;
    this.prev = null; this.fade = 1;
    this.c = cfg(this.level);
    this.timers = { mount: 1.2, gem: 0.5, storm: 3, hawk: 4, meteor: 2, rabbit: 5 };
    this.emit = function () {};
    this.demoT = 0;
    this.hclouds = [];
    for (var i = 0; i < 4; i++) this.hclouds.push({ x: rnd(0, W), y: rnd(-200, this.H), f: rnd(0.9, 1.6) });
  }

  World.prototype.snapshot = function () {
    return { level: this.level, t: Math.round(this.lt * 10) / 10, score: this.score, hp: this.hp, px: Math.round(this.px), py: Math.round(this.py) };
  };

  World.prototype.hurt = function () {
    if (this.inv > 0 || this.over) return;
    this.hp--;
    this.inv = 1.6; this.shake = 0.35; this.flash = 1;
    this.emit('hurt');
    if (this.hp <= 0) { this.over = 'dead'; this.emit('dead'); }
  };

  World.prototype.pop = function (s, x, y, col) {
    this.texts.push({ s: s, x: x, y: y, life: 1, col: col || '#fff' });
  };

  /* ---- posicionamento justo: nunca fecha a passagem nem cobre joias ---- */
  World.prototype.laneOK = function (x, r, y) {
    var iv = [[x - r, x + r]], i, e;
    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if ((e.k === 'mount' || e.k === 'storm') && Math.abs(e.y - y) < 190) iv.push([e.x - e.r, e.x + e.r]);
    }
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var cur = 40, gap = 0;
    for (i = 0; i < iv.length; i++) {
      if (iv[i][0] > cur) gap = Math.max(gap, iv[i][0] - cur);
      cur = Math.max(cur, iv[i][1]);
    }
    gap = Math.max(gap, W - 40 - cur);
    return gap >= 64;
  };

  World.prototype.nearPickup = function (x, y, rad) {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if ((e.k === 'gem' || e.k === 'rabbit') && Math.abs(e.x - x) < rad && Math.abs(e.y - y) < rad) return true;
    }
    return false;
  };

  World.prototype.nearBlocker = function (x, y0, y1, pad) {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if ((e.k === 'mount' || e.k === 'storm') && Math.abs(e.x - x) < e.r + pad && e.y > y0 - e.r && e.y < y1 + e.r) return true;
    }
    return false;
  };

  World.prototype.addMount = function (x, sz) { this.ents.push({ k: 'mount', x: x, y: -sz, r: sz * 0.34, sz: sz, t: 0 }); };

  World.prototype.spawn = function (k) {
    var c = this.c, L = this.level, i, x, tries, sz, ok = false, retry = null;
    if (k === 'mount') {
      for (tries = 0; tries < 8 && !ok; tries++) {
        x = rnd(50, W - 50); sz = pick([120, 150, 185]);
        ok = this.laneOK(x, sz * 0.34, -sz) && !this.nearPickup(x, -sz, sz * 0.34 + 40);
      }
      if (ok) {
        this.addMount(x, sz);
        if (Math.random() < Math.min(0.15 + 0.03 * L, 0.6)) {
          var x2 = x + pick([-1, 1]) * rnd(215, 290), sz2 = pick([120, 150]);
          if (x2 > 40 && x2 < W - 40 && this.laneOK(x2, sz2 * 0.34, -sz2) && !this.nearPickup(x2, -sz2, sz2 * 0.34 + 40)) this.addMount(x2, sz2);
        }
      } else retry = 0.3;
    } else if (k === 'gem') {
      var n = rint(3, 5), kind = pick([0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
      for (tries = 0; tries < 8 && !ok; tries++) {
        x = rnd(60, W - 60);
        ok = !this.nearBlocker(x, -330, 40, 52);
      }
      if (ok) for (i = 0; i < n; i++) this.ents.push({ k: 'gem', x: x + Math.sin(i * 0.9) * 26, y: -30 - i * 38, r: 13, g: kind, t: 0 });
      else retry = 0.3;
    } else if (k === 'rabbit') {
      for (tries = 0; tries < 8 && !ok; tries++) {
        x = rnd(50, W - 50);
        ok = !this.nearBlocker(x, -140, 60, 34);
      }
      if (ok) this.ents.push({ k: 'rabbit', x: x, y: -40, r: 18, rx: 0, ry: 0, ang: 0, t: 0 });
      else retry = 0.3;
    } else if (k === 'storm') {
      for (tries = 0; tries < 8 && !ok; tries++) {
        x = rnd(90, W - 90);
        ok = this.laneOK(x, 50, -90);
      }
      if (ok) this.ents.push({ k: 'storm', x: x, y: -90, r: 50, cd: rnd(1.2, 2.2), st: 0, tx: 0, ty: 0, t: 0 });
      else retry = 0.4;
    } else if (k === 'hawk') {
      var cnt = L >= 9 && Math.random() < 0.5 ? 2 : 1;
      for (i = 0; i < cnt; i++) this.ents.push({ k: 'hawk', x: rnd(50, W - 50), y: -50 - i * 70, r: 20, ph: Math.random() * 3, vx: 0, t: 0 });
    } else if (k === 'meteor') {
      var m = L >= 17 ? rint(2, 3) : 1;
      for (i = 0; i < m; i++) {
        x = rnd(30, W - 30);
        this.ents.push({ k: 'meteor', x: x, y: -110, r: 15, vx: rnd(-150, 150), vy: 330 + 12 * (L - 12), warn: 0.9, wx: x, t: 0, warned: false });
      }
    }
    this.timers[k] = retry !== null ? retry : c[k] * rnd(0.8, 1.25);
  };

  World.prototype.nextLevel = function () {
    this.score += 200 * this.level;
    if (this.level >= LAST) {
      this.score += 2000;
      this.over = 'win';
      this.emit('win');
      return;
    }
    this.prev = biome(this.level);
    this.fade = 0;
    this.level++;
    this.lt = 0;
    this.c = cfg(this.level);
    this.inv = Math.max(this.inv, 1);
    this.pop('+' + 200 * (this.level - 1), W / 2, 300, '#ffdc5a');
    this.emit('level');
  };

  /* tx, ty: posição que a águia persegue (o controle fica em app.js). */
  World.prototype.update = function (dt, tx, ty) {
    this.anim += dt;
    this.ground += this.c.speed * 0.55 * dt;
    this.fade = Math.min(1, this.fade + dt / 2);
    this.inv = Math.max(0, this.inv - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.white = Math.max(0, this.white - dt * 6);
    var sp = this.c.speed, i, e, k;

    var ax = (tx - this.px) * 9, ay = (ty - this.py) * 9, m = Math.sqrt(ax * ax + ay * ay);
    if (m > 560) { ax *= 560 / m; ay *= 560 / m; }
    k = Math.min(1, dt * 14);
    this.vx += (ax - this.vx) * k;
    this.vy += (ay - this.vy) * k;
    this.px = clamp(this.px + this.vx * dt, 40, W - 40);
    this.py = clamp(this.py + this.vy * dt, 130, this.H - 70);

    for (k in this.timers) {
      if (this.c[k] === null || this.c[k] === undefined) continue;
      this.timers[k] -= dt;
      if (this.timers[k] <= 0) this.spawn(k);
    }

    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      e.t += dt;
      if (e.k === 'mount') {
        e.y += sp * dt;
      } else if (e.k === 'gem') {
        e.y += sp * dt;
        e.x += Math.sin(e.t * 3) * 10 * dt;
      } else if (e.k === 'rabbit') {
        var dx = e.x - this.px, dy = e.y - this.py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 170 && d > 1) { e.rx += dx / d * 520 * dt; e.ry += dy / d * 520 * dt; }
        var fr = 1 - dt * 1.4;
        e.rx = clamp(e.rx * fr, -150, 150);
        e.ry = clamp(e.ry * fr, -150, 60);
        e.x = clamp(e.x + e.rx * dt, 20, W - 20);
        e.y += (sp + e.ry) * dt;
        if (Math.abs(e.rx) + Math.abs(e.ry) > 12) e.ang = Math.atan2(e.rx, -e.ry);
      } else if (e.k === 'storm') {
        e.y += sp * 0.85 * dt;
        this.stormAI(e, dt);
      } else if (e.k === 'hawk') {
        var lim = 70 + 4 * this.level;
        e.vx = clamp((this.px - e.x) * 1.4, -lim, lim);
        e.x += e.vx * dt;
        e.y += (sp * 0.6 + 150 + 5 * this.level) * dt;
      } else if (e.k === 'meteor') {
        if (e.warn > 0) {
          if (!e.warned) { e.warned = true; this.emit('warn'); }
          e.warn -= dt;
          e.x = e.wx;
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        }
      }
      if (e.y > this.H + 220 || e.x < -250 || e.x > W + 250) e.dead = true;
    }
    this.collide();
    var j = 0;
    for (i = 0; i < this.ents.length; i++) if (!this.ents[i].dead) this.ents[j++] = this.ents[i];
    this.ents.length = j;

    for (i = 0; i < this.bolts.length; i++) this.bolts[i].t -= dt;
    this.bolts = this.bolts.filter(function (b) { return b.t > 0; });
    for (i = 0; i < this.texts.length; i++) { this.texts[i].y -= 40 * dt; this.texts[i].life -= dt; }
    this.texts = this.texts.filter(function (t) { return t.life > 0; });
    for (i = 0; i < this.hclouds.length; i++) {
      var hc = this.hclouds[i];
      hc.y += sp * hc.f * dt;
      if (hc.y > this.H + 120) { hc.x = rnd(0, W); hc.y = -140; }
    }

    this.lt += dt;
    if (this.lt >= LEVEL_TIME && !this.over) this.nextLevel();
  };

  World.prototype.stormAI = function (e, dt) {
    if (e.y < 20 || e.y > this.H * 0.62) return;
    e.cd -= dt;
    if (e.st === 0 && e.cd <= 0) {
      e.st = 1; e.cd = this.c.ring;
      e.tx = clamp(this.px + this.vx * 0.25, 40, W - 40);
      e.ty = clamp(this.py + this.vy * 0.25, 140, this.H - 60);
    } else if (e.st === 1 && e.cd <= 0) {
      e.st = 0; e.cd = Math.max(3.4 - 0.08 * this.level, 1.7);
      var pts = [[e.x, e.y]], n = 7, i, f;
      for (i = 1; i <= n; i++) {
        f = i / n;
        pts.push([e.x + (e.tx - e.x) * f + (i < n ? rnd(-16, 16) : 0), e.y + (e.ty - e.y) * f]);
      }
      this.bolts.push({ pts: pts, t: 0.28 });
      this.white = 1;
      this.emit('thunder');
      var dx = e.tx - this.px, dy = e.ty - this.py;
      if (Math.sqrt(dx * dx + dy * dy) < 50) this.hurt();
    }
  };

  World.prototype.collide = function () {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e.dead) continue;
      var dx = e.x - this.px, dy = e.y - this.py, d = Math.sqrt(dx * dx + dy * dy);
      if (e.k === 'gem' && d < e.r + 22) {
        e.dead = true;
        var v = [10, 25, 50][e.g];
        this.score += v;
        this.pop('+' + v, e.x, e.y, ['#8ce6ff', '#ff9cc8', '#8cf0b0'][e.g]);
        this.emit('gem', e.g);
      } else if (e.k === 'rabbit' && d < e.r + 22) {
        e.dead = true;
        this.score += 150;
        if (this.hp < MAX_HP) this.hp++;
        this.pop('+1 vida  +150', e.x, e.y, '#ff8aa4');
        this.emit('rabbit');
      } else if ((e.k === 'mount' || e.k === 'storm') && d < e.r + EAGLE_R) {
        this.hurt();
        if (d > 1) {
          var nn = e.r + EAGLE_R + 2;
          this.px = clamp(e.x - dx / d * nn, 40, W - 40);
          this.py = clamp(e.y - dy / d * nn, 130, this.H - 70);
        }
      } else if ((e.k === 'hawk' || e.k === 'meteor') && d < e.r + EAGLE_R && !(e.warn > 0)) {
        this.hurt();
        e.dead = true;
      }
    }
  };

  /* ---------------- desenho ---------------- */
  World.prototype.drawGround = function (ctx) {
    var off = ((this.ground % 512) + 512) % 512, H = this.H, A = this.A;
    function layer(img, alpha) {
      ctx.globalAlpha = alpha;
      for (var y = off - 512; y < H; y += 512) ctx.drawImage(img, 0, y, W, 513);
    }
    var cur = biome(this.level);
    if (this.prev && this.fade < 1) { layer(A.tile[this.prev], 1); layer(A.tile[cur], this.fade); }
    else { layer(A.tile[cur], 1); this.prev = null; }
    ctx.globalAlpha = 1;
  };

  World.prototype.drawEagle = function (ctx, x, y, bank, frame) {
    put(ctx, this.A.eagle[frame], x, y, bank * Math.PI / 180, 26, 44);
  };

  World.prototype.drawHigh = function (ctx) {
    var A = this.A, i;
    ctx.globalAlpha = 0.27;
    for (i = 0; i < this.hclouds.length; i++) {
      var hc = this.hclouds[i];
      ctx.drawImage(A.cloud.c, hc.x - 95, hc.y - 70, A.cloud.w, A.cloud.h);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(A.haze, 0, 0, W, this.H);
  };

  World.prototype.draw = function (ctx) {
    var A = this.A, i, e, H = this.H;
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.sin(this.anim * 90) * 6 * Math.min(1, this.shake * 3), Math.cos(this.anim * 70) * 6 * Math.min(1, this.shake * 3));
    this.drawGround(ctx);

    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if (e.k === 'mount') put(ctx, A.mount[e.sz], e.x, e.y, 0, 16, 20);
      else if (e.k === 'rabbit') put(ctx, A.rabbit, e.x, e.y, e.ang, 8, 10);
      else if (e.k === 'gem') put(ctx, A.gem[e.g], e.x, e.y, 0);
    }
    var fr = Math.floor(this.anim * 8) % 2;
    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if (e.k === 'hawk') put(ctx, A.hawk[(fr + Math.floor(e.ph)) % 2], e.x, e.y, Math.PI + e.vx / 400, 20, 34);
    }
    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if (e.k === 'storm') put(ctx, A.storm, e.x, e.y, 0, 36, 60);
    }

    if (this.inv <= 0 || Math.floor(this.anim * 16) % 2) {
      this.drawEagle(ctx, this.px, this.py, clamp(this.vx / 28, -16, 16), Math.floor(this.anim * 9) % 2);
    }

    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if (e.k === 'storm' && e.st === 1) this.drawTarget(ctx, e);
      else if (e.k === 'meteor') this.drawMeteor(ctx, e);
    }

    if (this.bolts.length) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (i = 0; i < this.bolts.length; i++) {
        var b = this.bolts[i], q, passes = [[11, 'rgba(140,184,255,0.35)'], [5, 'rgba(219,233,255,0.85)'], [2, '#fff']];
        for (q = 0; q < 3; q++) {
          ctx.strokeStyle = passes[q][1]; ctx.lineWidth = passes[q][0];
          ctx.beginPath();
          ctx.moveTo(b.pts[0][0], b.pts[0][1]);
          for (var z = 1; z < b.pts.length; z++) ctx.lineTo(b.pts[z][0], b.pts[z][1]);
          ctx.stroke();
        }
      }
    }

    this.drawHigh(ctx);

    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,18,40,0.85)';
    for (i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.flash > 0 || this.white > 0) {
      if (this.flash > 0) {
        var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(255,40,40,0)');
        g.addColorStop(1, 'rgba(255,40,40,' + (0.5 * this.flash).toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (this.white > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.28 * this.white).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    }
  };

  World.prototype.drawTarget = function (ctx, e) {
    var p = 1 - e.cd / this.c.ring, g = ctx.createRadialGradient(e.tx, e.ty, 0, e.tx, e.ty, 60);
    g.addColorStop(0, 'rgba(200,220,255,0.45)'); g.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = g; ctx.fillRect(e.tx - 60, e.ty - 60, 120, 120);
    ctx.save();
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(e.tx, e.ty, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.tx, e.ty, 10 + 36 * p, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  World.prototype.drawMeteor = function (ctx, e) {
    if (e.warn > 0) {
      var len = this.H + 200, n = Math.sqrt(e.vx * e.vx + e.vy * e.vy), dx = e.vx / n, dy = e.vy / n;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,90,70,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([4, 9]);
      ctx.beginPath(); ctx.moveTo(e.wx, 0); ctx.lineTo(e.wx + dx * len * 1.0, dy * len); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ff4636';
      ctx.beginPath(); ctx.moveTo(e.wx, 36); ctx.lineTo(e.wx - 15, 8); ctx.lineTo(e.wx + 15, 8); ctx.closePath(); ctx.fill();
      ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText('!', e.wx, 21);
    } else {
      put(ctx, this.A.meteor, e.x, e.y, -Math.atan2(e.vx, e.vy));
    }
  };

  /* ---- modo vitrine (menu): chão rolando, águia planando, biomas alternando ---- */
  World.prototype.demoUpdate = function (dt) {
    this.anim += dt;
    this.c = cfg(1);
    this.c.speed = 150;
    this.ground += 70 * dt;
    this.fade = Math.min(1, this.fade + dt / 2);
    this.demoT += dt;
    if (this.demoT > 7) {
      this.demoT = 0;
      this.prev = biome(this.level);
      this.level = this.level >= 17 ? 1 : this.level + 4;
      this.fade = 0;
    }
    for (var i = 0; i < this.hclouds.length; i++) {
      var hc = this.hclouds[i];
      hc.y += 150 * hc.f * dt;
      if (hc.y > this.H + 120) { hc.x = rnd(0, W); hc.y = -140; }
    }
  };

  World.prototype.demoDraw = function (ctx) {
    this.drawGround(ctx);
    var x = W / 2 + Math.sin(this.anim * 0.9) * 40, y = this.H * 0.845 + Math.sin(this.anim * 1.7) * 6;
    this.drawEagle(ctx, x, y, Math.cos(this.anim * 0.9) * 9, Math.floor(this.anim * 5) % 2);
    this.drawHigh(ctx);
  };

  A.Game = {
    W: W, LEVEL_TIME: LEVEL_TIME, LAST: LAST, MAX_HP: MAX_HP,
    BIOMES: BIOMES, BIOME_NAMES: BIOME_NAMES, NEWS: NEWS,
    biome: biome, cfg: cfg, loadAssets: loadAssets, World: World
  };
})(window.Aguia = window.Aguia || {});
