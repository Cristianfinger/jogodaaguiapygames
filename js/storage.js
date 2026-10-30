/* Autosave, nome do jogador, ranking local e preferência de som.
   Usa localStorage com reserva em memória (modo privado, dados bloqueados, etc.). */
(function (A) {
  'use strict';

  var KEY = { save: 'aguia.save.v1', name: 'aguia.name', rank: 'aguia.rank.v1', mute: 'aguia.mute' };
  var mem = {};

  function get(k) {
    try {
      var v = window.localStorage.getItem(k);
      if (v !== null) return v;
    } catch (e) { /* sem acesso ao armazenamento */ }
    return mem[k] === undefined ? null : mem[k];
  }
  function set(k, v) {
    mem[k] = v;
    try { window.localStorage.setItem(k, v); } catch (e) { /* mantém só em memória */ }
  }
  function del(k) {
    delete mem[k];
    try { window.localStorage.removeItem(k); } catch (e) { /* ignora */ }
  }
  function num(v, a, b, d) {
    v = Number(v);
    return isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
  }
  function parse(s, d) {
    try {
      var v = JSON.parse(s);
      return v === null || v === undefined ? d : v;
    } catch (e) { return d; }
  }

  function cleanName(n) {
    n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return n.slice(0, 12).trim();
  }

  A.Store = {
    cleanName: cleanName,

    loadSave: function () {
      var d = parse(get(KEY.save), null);
      if (!d || typeof d !== 'object') return null;
      var level = Math.floor(Number(d.level));
      if (!(level >= 1 && level <= 20)) return null;
      return {
        level: level,
        t: num(d.t, 0, 29.5, 0),
        score: Math.floor(num(d.score, 0, 1e6, 0)),
        hp: Math.floor(num(d.hp, 1, 5, 3)),
        px: num(d.px, 40, 410, 225),
        py: num(d.py, 130, 900, 650)
      };
    },
    save: function (s) { set(KEY.save, JSON.stringify(s)); },
    clearSave: function () { del(KEY.save); },

    getName: function () { return cleanName(get(KEY.name)); },
    setName: function (n) { set(KEY.name, cleanName(n)); },

    isMuted: function () { return get(KEY.mute) === '1'; },
    setMuted: function (m) { set(KEY.mute, m ? '1' : '0'); },

    localTop: function () {
      var d = parse(get(KEY.rank), []);
      if (!Array.isArray(d)) return [];
      return d.filter(function (x) {
        return x && typeof x === 'object' && isFinite(Number(x.score));
      }).map(function (x) {
        return { name: cleanName(x.name) || 'Jogador', score: Math.floor(Number(x.score)), level: Math.floor(num(x.level, 1, 20, 1)) };
      }).sort(function (a, b) { return b.score - a.score; }).slice(0, 10);
    },
    /* Devolve a posição (1 a 10) no ranking do aparelho, ou 0 se ficou fora do top 10. */
    addLocal: function (name, score, level) {
      var entry = { name: cleanName(name) || 'Jogador', score: Math.floor(score), level: Math.floor(level) };
      var list = A.Store.localTop();
      list.push(entry);
      list.sort(function (a, b) { return b.score - a.score; });
      var pos = list.indexOf(entry) + 1;
      list = list.slice(0, 10);
      set(KEY.rank, JSON.stringify(list));
      return pos >= 1 && pos <= 10 ? pos : 0;
    }
  };
})(window.Aguia = window.Aguia || {});
