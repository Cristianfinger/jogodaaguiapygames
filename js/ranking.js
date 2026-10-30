/* Ranking.
   Ordem de preferência (a primeira que estiver disponível):
     1. Supabase, configurado em ranking-config.js  -> ranking público, compartilhado por todos.
     2. Banco do Claude (somente quando a página roda como artifact) -> compartilhado com quem pode editar.
     3. Apenas local (localStorage) -> sempre mantido, mesmo com os outros ativos. */
(function (A) {
  'use strict';

  var cfg = window.AGUIA_CONFIG || {};
  var SB_URL = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var SB_KEY = String(cfg.supabaseKey || '');
  var TABLE = String(cfg.table || 'ranking');
  var hasSupabase = /^https:\/\//.test(SB_URL) && SB_KEY.length > 20;

  var claudeDb = null; // promessa do banco do artifact (ou null)
  function getClaudeDb() {
    if (claudeDb) return claudeDb;
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        claudeDb = Promise.resolve(window.claude.use('db')).then(function (d) { return d || null; }, function () { return null; });
      }
    } catch (e) { /* sem artifact */ }
    return claudeDb || (claudeDb = Promise.resolve(null));
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('tempo esgotado')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function sbHeaders(extra) {
    var h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  function normalize(rows) {
    return (rows || []).filter(function (r) { return r && isFinite(Number(r.score)); }).map(function (r) {
      return { name: A.Store.cleanName(r.name) || 'Jogador', score: Math.floor(Number(r.score)), level: Math.floor(Number(r.level)) || 1 };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 10);
  }

  var Ranking = {
    /* 'supabase' | 'claude' | 'local' */
    backend: function () {
      if (hasSupabase) return Promise.resolve('supabase');
      return getClaudeDb().then(function (d) { return d ? 'claude' : 'local'; });
    },

    /* Top 10 online. Rejeita se não houver backend online ou se ele falhar. */
    onlineTop: function () {
      if (hasSupabase) {
        var url = SB_URL + '/rest/v1/' + encodeURIComponent(TABLE) + '?select=name,score,level&order=score.desc&limit=10';
        return withTimeout(fetch(url, { headers: sbHeaders({}) }), 7000).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(normalize);
      }
      return getClaudeDb().then(function (db) {
        if (!db) throw new Error('sem ranking online');
        return withTimeout(db.collection('ranking').orderBy('score', 'desc').limit(10).get(), 7000).then(function (snap) {
          return normalize(snap.docs.map(function (d) { return d.data(); }));
        });
      });
    },

    /* Grava em todos os lugares possíveis.
       Devolve { local: posição (0 = fora do top 10), online: true | false | null (null = sem backend) }. */
    submit: function (name, score, level) {
      name = A.Store.cleanName(name) || 'Jogador';
      var local = A.Store.addLocal(name, score, level);
      var body = { name: name, score: Math.floor(score), level: Math.floor(level) };
      var online;
      if (hasSupabase) {
        online = withTimeout(fetch(SB_URL + '/rest/v1/' + encodeURIComponent(TABLE), {
          method: 'POST',
          headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(body)
        }), 7000).then(function (r) { return r.ok; }, function () { return false; });
      } else {
        online = getClaudeDb().then(function (db) {
          if (!db) return null;
          body.ts = Date.now();
          return withTimeout(db.collection('ranking').add(body), 7000).then(function () { return true; }, function () { return false; });
        });
      }
      return online.then(function (ok) { return { local: local, online: ok }; });
    }
  };

  A.Ranking = Ranking;
})(window.Aguia = window.Aguia || {});
