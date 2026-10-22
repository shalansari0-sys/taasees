/* تأسيس — letter games, shared engine.
   This file and every app/games/g_*.js are joined into games.js by build.py, which the app loads
   only when a child opens a game for the first time (keeps the first load small).

   A game registers itself:   TG.register("ت", def)
   def = { title, mascot (key in TG.art), winWord?, winText?(ctx), cue? ("show" | "sound"), start(ctx) }
   Most games are built with TG.choice({...}) or TG.moving({...}) which supply start(ctx).          */
(function () {
  "use strict";
  var TG = window.TG = window.TG || {};
  TG.defs = TG.defs || {};
  TG.art = TG.art || {};
  TG.register = function (ch, def) { TG.defs[ch] = def; };

  /* letters that look or sound alike: the wrong answers in every round come from here first */
  TG.similar = {
    "أ": ["ع", "ل", "ك"], "ب": ["ت", "ث", "ن", "ي"], "ت": ["ب", "ث", "ن", "ي"], "ث": ["ب", "ت", "ن"],
    "ج": ["ح", "خ"], "ح": ["ج", "خ", "ه"], "خ": ["ج", "ح"], "د": ["ذ", "ر", "ز"], "ذ": ["د", "ز", "ر"],
    "ر": ["ز", "د", "و"], "ز": ["ر", "ذ", "ظ"], "س": ["ش", "ص", "ث"], "ش": ["س", "ث", "ض"],
    "ص": ["ض", "س", "ط"], "ض": ["ص", "د", "ظ"], "ط": ["ظ", "ت", "ص"], "ظ": ["ط", "ذ", "ض"],
    "ع": ["غ", "أ", "ح"], "غ": ["ع", "خ", "ق"], "ف": ["ق", "ث", "غ"], "ق": ["ف", "ك", "غ"],
    "ك": ["ق", "ل", "ت"], "ل": ["ك", "أ", "ن"], "م": ["ن", "ه", "و"], "ن": ["ب", "ت", "ي"],
    "ه": ["ح", "م", "ع"], "و": ["ر", "ز", "م"], "ي": ["ن", "ب", "ت"]
  };

  var css = [
    ".p-stage{position:absolute;inset:0;overflow:hidden;overflow:clip;background:linear-gradient(180deg,#DDF3F7 0%,#EEF8FA 62%,var(--meadow) 62%)}",
    ".p-stage svg{display:block}",
    ".p-stage .p-abs,.p-stage .fig{position:absolute;left:0;top:0}",
    ".p-stage .p-item{position:absolute;padding:0;border:0;background:none;display:grid;place-items:center;touch-action:manipulation;cursor:pointer;transition:transform var(--std) var(--ease),opacity var(--std)}",
    ".p-item:active{transform:scale(.94)}",
    ".p-item > svg{width:100%;height:100%;pointer-events:none}",
    ".p-lbl{position:absolute;display:grid;place-items:center;width:var(--s,54px);height:var(--s,54px);border-radius:50%;background:#fff;color:var(--ink);font:700 calc(var(--s,54px)*.62)/1.6 var(--naskh);box-shadow:0 3px 0 rgba(34,51,63,.18);pointer-events:none}",
    ".p-no{animation:pwob .4s ease}",
    "@keyframes pwob{25%{rotate:-8deg}75%{rotate:8deg}}",
    ".p-hint .p-lbl{animation:pglow 1.2s ease-in-out infinite}",
    "@keyframes pglow{50%{box-shadow:0 0 0 9px rgba(255,207,61,.8),0 3px 0 rgba(34,51,63,.18)}}",
    ".p-gone{opacity:0;transform:scale(.5);pointer-events:none}",
    ".p-say{position:absolute;z-index:6;background:var(--paper);border-radius:14px;padding:4px 12px;font-size:.95rem;font-weight:800;box-shadow:var(--shadow);pointer-events:none;white-space:nowrap;transform:translate(-50%,-100%);transition:opacity var(--std)}",
    ".p-burst{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;animation:pburst .7s ease-out forwards}",
    "@keyframes pburst{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(.4);opacity:0}}",
    ".p-bob{animation:pbob 2.4s ease-in-out infinite}",
    "@keyframes pbob{50%{translate:0 -6px}}",
    "@media (prefers-reduced-motion:reduce){.p-bob,.p-hint .p-lbl{animation:none}}"
  ].join("\n");

  var api = null, ctx = null;
  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  TG.rnd = rnd; TG.shuffle = shuffle;
  /* white disc with the letter, used on every tappable thing */
  TG.lbl = function (ch, size, style) { return '<b class="p-lbl" style="--s:' + (size || 54) + 'px;' + (style || "") + '">' + ch + "</b>"; };

  function nameOf(ch) { var L = api.LETTERS; for (var i = 0; i < L.length; i++) if (L[i].ch === ch) return L[i].name; return ch; }

  function stop() {
    if (!ctx) return;
    ctx.alive = false;
    ctx.timers.forEach(clearTimeout);
    if (ctx.raf) cancelAnimationFrame(ctx.raf);
    ctx = null;
  }
  TG.stop = stop;

  function makeCtx(idx, L, def, stage) {
    var c = {
      idx: idx, L: L, ch: L.ch, def: def, stage: stage, api: api, art: TG.art,
      W: stage.clientWidth, H: stage.clientHeight, alive: true, timers: [], raf: 0,
      score: 0, total: 5, miss: 0, T: api.T, sfx: api.sfx, rnd: rnd, shuffle: shuffle, lbl: TG.lbl
    };
    c.add = function (html, cls, style, tag) {
      var d = document.createElement(tag || "div");
      if (tag === "button") d.type = "button";
      if (cls) d.className = cls;
      if (style) d.style.cssText = style;
      d.innerHTML = html || "";
      stage.appendChild(d);
      return d;
    };
    c.later = function (fn, ms) { var t = setTimeout(function () { if (c.alive) fn(); }, ms); c.timers.push(t); return t; };
    c.loop = function (fn) {
      var last = 0;
      function f(ts) { if (!c.alive) return; var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; fn(dt, ts); c.raf = requestAnimationFrame(f); }
      c.raf = requestAnimationFrame(f);
    };
    c.setScore = function (n) { c.score = n; $("pScore").textContent = n + " من " + c.total; };
    c.speak = function () { api.speakLetter(L); };
    c.name = nameOf;
    c.alike = function (n) {
      var pool = shuffle((TG.similar[L.ch] || []).slice()), out = [];
      for (var i = 0; i < pool.length && out.length < n; i++) out.push(pool[i]);
      while (out.length < n) {
        var x = api.LETTERS[Math.floor(Math.random() * api.LETTERS.length)].ch;
        if (x !== L.ch && out.indexOf(x) < 0) out.push(x);
      }
      return out;
    };
    var sayEl = null, sayT = 0;
    c.say = function (text, x, y) {
      if (!sayEl) { sayEl = c.add("", "p-say"); }
      stage.appendChild(sayEl);
      sayEl.textContent = text;
      x = Math.max(70, Math.min(c.W - 70, x == null ? c.W / 2 : x));
      sayEl.style.left = x + "px"; sayEl.style.top = Math.max(40, y == null ? c.H * 0.3 : y) + "px"; sayEl.style.opacity = 1;
      clearTimeout(sayT); sayT = setTimeout(function () { if (sayEl) sayEl.style.opacity = 0; }, 1900);
    };
    /* the standard "not this one" reply: never says wrong, names the letter that was tapped */
    c.wrong = function (el, ch, x, y) {
      if (api.track) api.track("miss", L.id, ch);
      el.classList.remove("p-no"); void el.offsetWidth; el.classList.add("p-no");
      api.sfx.no(); api.tts(nameOf(ch));
      var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
      c.say("هذي " + ch + "، وين " + L.ch + "؟", x != null ? x : r.left - s.left + r.width / 2, y != null ? y : r.top - s.top - 8);
      c.miss++;
      if (c.miss >= 2) c.hint();
    };
    c.hint = function () {
      var ok = stage.querySelector('[data-ok="1"]:not(.p-gone)');
      if (ok) ok.classList.add("p-hint");
    };
    /* move an element (positioned with left/top in px) to x,y with an optional hop */
    c.move = function (el, x, y, ms, arc, cb) {
      var x0 = parseFloat(el.style.left) || 0, y0 = parseFloat(el.style.top) || 0;
      el.style.left = x + "px"; el.style.top = y + "px";
      if (el.animate) {
        var dx = x0 - x, dy = y0 - y, k = [{ transform: "translate(" + dx + "px," + dy + "px)" }];
        if (arc) k.push({ transform: "translate(" + dx / 2 + "px," + (dy / 2 - arc) + "px)", offset: 0.5 });
        k.push({ transform: "translate(0,0)" });
        var a = el.animate(k, { duration: ms || 500, easing: arc ? "ease-in-out" : "cubic-bezier(.22,1,.36,1)" });
        a.onfinish = function () { if (cb && c.alive) cb(); };
      } else if (cb) cb();
    };
    c.burst = function (x, y, colors) {
      colors = colors || ["#FFCF3D", "#F2693B", "#A3C93A", "#11808F", "#F3A6B8"];
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2, d = rnd(40, 80);
        c.add("", "p-burst", "left:" + x + "px;top:" + y + "px;background:" + colors[i % colors.length] + ";--dx:" + Math.cos(a) * d + "px;--dy:" + Math.sin(a) * d + "px");
      }
      c.later(function () { Array.prototype.forEach.call(stage.querySelectorAll(".p-burst"), function (b) { b.remove(); }); }, 800);
    };
    c.win = function () { finish(c); };
    return c;
  }

  function def0(c) { return c.def; }
  function finish(c) {
    if (!c.alive) return;
    Array.prototype.forEach.call(c.stage.querySelectorAll(".p-say"), function (b) { b.style.opacity = 0; });
    if (def0(c).onWin) def0(c).onWin(c); else api.onWin(c.idx);
    if (api.track) api.track(c.key === "vowel" ? "vwin" : "win", c.L.id);
    var w = $("pWin"), def = c.def;
    $("pwMascot").innerHTML = TG.art[def.mascot] || "";
    $("pwWord").textContent = def.winWord || "ممتاز!";
    $("pwText").textContent = def.winText ? def.winText(c) : api.T("عرفت حرف ال" + c.L.name + "، أنت و", "عرفتِ حرف ال" + c.L.name + "، أنتِ و") + api.friendName();
    api.renderFig("pwFig");
    w.hidden = false;
    api.sfx.win();
    c.later(function () { api.speakLetter(c.L); }, 700);
  }

  /* ---------- engine 1: choice rounds (tap the thing that carries the letter) ----------
     cfg: rounds (5), count (3), scene(ctx), slots(ctx,n,round) -> [{x,y}], item(ctx,ch,i,slot,round) -> element,
          right(ctx,el,slot,next,items), clear?(ctx,items,next), enter?(ctx,items), intro?(ctx), cue ("show"|"sound") */
  TG.choice = function (cfg) {
    cfg.start = function (c) {
      c.total = cfg.rounds || 5; c.setScore(0);
      if (cfg.scene) cfg.scene(c);
      var busy = true, items = [], round = 0;
      function next() {
        c.miss = 0; round++;
        var n = cfg.count || 3, letters = shuffle([c.ch].concat(c.alike(n - 1))), slots = cfg.slots(c, n, round);
        items = [];
        letters.forEach(function (ch, i) {
          var el = cfg.item(c, ch, i, slots[i], round);
          el.setAttribute("data-ok", ch === c.ch ? "1" : "0");
          el.setAttribute("data-ch", ch);
          el.setAttribute("aria-label", cfg.cue === "sound" ? "اختيار " + (i + 1) : "حرف ال" + nameOf(ch));
          el.classList.add("p-item");
          el.addEventListener("click", function () { tap(el, ch, slots[i]); });
          items.push(el);
        });
        if (cfg.enter) cfg.enter(c, items);
        busy = false;
        if (cfg.cue === "sound") c.later(c.speak, 450);
      }
      function tap(el, ch, slot) {
        if (busy || !c.alive || el.classList.contains("p-done")) return;
        api.unlock();
        if (ch !== c.ch) { (cfg.wrong || c.wrong)(el, ch); return; }
        busy = true; el.classList.remove("p-hint"); api.sfx.pop();
        cfg.right(c, el, slot, function () {
          c.setScore(c.score + 1);
          if (c.score >= c.total) { c.later(c.win, 600); return; }
          var go = function () { next(); };
          if (cfg.clear) cfg.clear(c, items, go);
          else { items.forEach(function (it) { it.classList.add("p-gone"); }); c.later(function () { items.forEach(function (it) { it.remove(); }); go(); }, 300); }
        }, items);
      }
      c.later(function () { if (cfg.intro) cfg.intro(c); if (cfg.cue !== "sound") c.speak(); next(); }, 350);
    };
    return cfg;
  };

  /* ---------- engine 2: moving targets (tap the letter while it moves) ----------
     cfg: need (5), every (s between spawns), max (alive at once), ratio (share carrying the letter),
          scene(ctx), spawn(ctx,ch) -> {el,x,y,vx,vy,w,h}, step?(ctx,it,dt), out(ctx,it) -> bool, caught(ctx,it,done) */
  TG.moving = function (cfg) {
    cfg.start = function (c) {
      c.total = cfg.need || 5; c.setScore(0);
      if (cfg.scene) cfg.scene(c);
      var list = [], spawnT = 0.3, lock = false;
      function place(it) { it.el.style.transform = "translate(" + Math.round(it.x) + "px," + Math.round(it.y) + "px)"; }
      c.loop(function (dt) {
        spawnT -= dt;
        var live = list.filter(function (it) { return !it.dead; });
        if (spawnT <= 0 && live.length < (cfg.max || 5)) {
          var hasT = live.some(function (it) { return it.ch === c.ch; });
          var isT = !hasT || Math.random() < (cfg.ratio || 0.45);
          var ch = isT ? c.ch : c.alike(1)[0];
          var it = cfg.spawn(c, ch);
          it.ch = ch; it.el.classList.add("p-item"); it.el.setAttribute("data-ok", ch === c.ch ? "1" : "0"); it.el.setAttribute("data-ch", ch);
          it.el.setAttribute("aria-label", "حرف ال" + nameOf(ch));
          it.el.style.left = "0"; it.el.style.top = "0";
          it.el.addEventListener("pointerdown", function (ev) { ev.preventDefault(); tap(it); });
          list.push(it); place(it);
          spawnT = cfg.every || 1.1;
        }
        list.forEach(function (it) {
          if (it.dead || it.held) return;
          it.x += (it.vx || 0) * dt; it.y += (it.vy || 0) * dt;
          if (cfg.step) cfg.step(c, it, dt);
          place(it);
          if (cfg.out(c, it)) { it.dead = true; it.el.remove(); }
        });
        list = list.filter(function (it) { return !it.dead || it.held; });
      });
      function tap(it) {
        if (it.dead || !c.alive || lock) return;
        api.unlock();
        if (it.ch !== c.ch) { c.wrong(it.el, it.ch); return; }
        it.held = true; it.dead = true; api.sfx.pop();
        cfg.caught(c, it, function () {
          it.held = false; it.el.remove();
          c.setScore(c.score + 1);
          if (c.score >= c.total) { lock = true; c.later(c.win, 500); }
        });
      }
      c.later(function () { if (cfg.intro) cfg.intro(c); c.speak(); }, 350);
    };
    return cfg;
  };

  /* entry point from the app */
  TG.init = function (a) {
    api = a;
    if (!document.getElementById("tg-css")) { var s = document.createElement("style"); s.id = "tg-css"; s.textContent = css; document.head.appendChild(s); }
  };
  TG.has = function (ch) { return !!TG.defs[ch]; };
  /* key: which registered game to open for this letter (default: the letter's own game; "vowel" = the vowels game) */
  TG.start = function (idx, key) {
    stop();
    var L = api.LETTERS[idx], def = TG.defs[key || L.ch];
    if (!def) return false;
    api.go("play");
    $("pTitle").textContent = def.title;
    $("pWin").hidden = true;
    var stage = $("pStage");
    stage.innerHTML = ""; stage.className = "p-stage" + (def.cls ? " " + def.cls : "");
    if (def.cue === "sound") {
      $("pGoalTxt").textContent = api.T("اسمع واختار", "اسمعي واختاري"); $("pGoalCh").textContent = "";
    } else {
      $("pGoalTxt").textContent = def.goal ? def.goal(api.T) : api.T("اضغط على", "اضغطي على"); $("pGoalCh").textContent = def.goalCh ? def.goalCh(L) : L.ch;
    }
    ctx = makeCtx(idx, L, def, stage);
    ctx.key = key;
    TG.ctx = ctx;
    def.start(ctx);
    return true;
  };
  TG.again = function () { if (TG.ctx) TG.start(TG.ctx.idx, TG.ctx.key); };
})();

;
/* ع — عصفور: birds sit on a wire; tap the bird that carries ع, it sings and flies home to its nest */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  /* shared storybook backdrop for set-B games: sky, pink hills, scalloped white edge, lime grass, pale meadow */
  TG.meadowB = TG.meadowB || function (w, h, hy) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
    o += '<rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    o += '<ellipse cx="' + w * 0.18 + '" cy="' + (hy + 16) + '" rx="' + w * 0.42 + '" ry="74" fill="#FCE3EA"/>';
    o += '<ellipse cx="' + w * 0.84 + '" cy="' + (hy + 18) + '" rx="' + w * 0.44 + '" ry="62" fill="#F3A6B8"/>';
    for (var x = -10; x < w + 40; x += 36) o += '<circle cx="' + x + '" cy="' + hy + '" r="22" fill="#fff"/>';
    for (var x2 = -10; x2 < w + 40; x2 += 36) o += '<circle cx="' + x2 + '" cy="' + (hy + 3) + '" r="18" fill="#A3C93A"/>';
    o += '<rect x="0" y="' + (hy + 4) + '" width="' + w + '" height="' + (h - hy) + '" fill="#A3C93A"/>';
    o += '<rect x="0" y="' + (hy + 30) + '" width="' + w + '" height="' + (h - hy) + '" fill="#F2F8DF"/>';
    for (var k = 0; k < Math.floor(w / 64); k++) {
      var fx = 26 + k * 64 + (k % 2) * 18, fy = hy + 52 + (k % 3) * 34;
      if (fy < h - 8) o += '<circle cx="' + fx + '" cy="' + fy + '" r="4" fill="#fff"/><circle cx="' + (fx + 8) + '" cy="' + (fy + 4) + '" r="3" fill="#F3A6B8"/>';
    }
    return o + '</svg>';
  };
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var face = '<ellipse cx="40" cy="30" rx="6.5" ry="8" fill="#fff" ' + O + '/><ellipse cx="60" cy="30" rx="6.5" ry="8" fill="#fff" ' + O + '/><circle cx="41" cy="32" r="3.4" fill="#1F1F1F"/><circle cx="61" cy="32" r="3.4" fill="#1F1F1F"/><circle cx="42.4" cy="30.4" r="1.2" fill="#fff"/><circle cx="62.4" cy="30.4" r="1.2" fill="#fff"/>';
  TG.art.bird = function (col) {
    return '<svg viewBox="0 0 100 100"><g ' + O + '>' +
      '<path d="M40 92v6M60 92v6" fill="none"/>' +
      '<path d="M18 60c-10 6-14 16-12 22 8-2 14-8 18-14M82 60c10 6 14 16 12 22-8-2-14-8-18-14" fill="' + col + '"/>' +
      '<ellipse cx="50" cy="58" rx="34" ry="36" fill="' + col + '"/>' +
      '<ellipse cx="50" cy="68" rx="22" ry="22" fill="#FFF6E0" stroke="none"/>' +
      '<path d="M44 40l6 8 6-8z" fill="#FF9F2E"/>' +
      '<path d="M44 16c2-8 8-10 12-8-2 2-2 6 0 8" fill="' + col + '"/></g>' + face +
      '<ellipse cx="30" cy="46" rx="5" ry="3" fill="#FF9BB0" opacity=".8"/><ellipse cx="70" cy="46" rx="5" ry="3" fill="#FF9BB0" opacity=".8"/></svg>';
  };
  TG.art.birdFace = TG.art.bird("#5BC0EB");
  TG.art.nestTree = '<svg viewBox="0 0 150 220"><g ' + O + '><path d="M62 220l6-120h16l6 120z" fill="#B7793A"/>' +
    '<circle cx="75" cy="78" r="62" fill="#fff" stroke="none"/><circle cx="75" cy="80" r="56" fill="#7CC242"/>' +
    '<path d="M38 96c4 18 70 18 74 0-10 6-64 6-74 0z" fill="#C98A4B"/><path d="M40 96c10-8 60-8 70 0" fill="none"/></g>' +
    '<path d="M46 100l10 6M62 102l10 6M80 102l10 6M94 100l8 4" stroke="#8A5A2B" stroke-width="3" stroke-linecap="round"/></svg>';
  var cols = ["#5BC0EB", "#FFCF3D", "#F3A6B8", "#FF9F5A"];
  TG.cssB("tg-ain", ".ain-bird svg{animation:ainbob 2.2s ease-in-out infinite}.ain-bird:nth-of-type(2n) svg{animation-delay:-1.1s}@keyframes ainbob{50%{translate:0 -4px}}@media (prefers-reduced-motion:reduce){.ain-bird svg{animation:none}}");

  var g = {};
  function wireY(t) { return g.y0 + 4 * g.sag * t * (1 - t); }
  function chirp(c) {
    var s = c.api.sweep; if (!s) return;
    s(2100, 2900, 0.09, "sine", 0.07, 0); s(2300, 3100, 0.09, "sine", 0.07, 0.14); s(2900, 2200, 0.12, "sine", 0.06, 0.28);
  }
  TG.register("ع", TG.choice({
    title: "عصافير السلك", mascot: "birdFace", rounds: 5, count: 3, winWord: "غنّت العصافير!",
    winText: function (c) { return c.T("رجّعت كل عصافير الـ ع لعشها، أنت و", "رجّعتِ كل عصافير الـ ع لعشها، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, hy = Math.round(H * 0.6);
      c.add(TG.meadowB(W, H, hy), "p-abs");
      g.left = cx - cw * 0.46; g.right = cx + cw * 0.46; g.y0 = Math.max(130, H * 0.27); g.sag = 26;
      var poles = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><g ' + O + '>' +
        '<rect x="' + (g.left - 7) + '" y="' + (g.y0 - 16) + '" width="14" height="' + (hy - g.y0 + 30) + '" fill="#B7793A"/>' +
        '<rect x="' + (g.right - 7) + '" y="' + (g.y0 - 16) + '" width="14" height="' + (hy - g.y0 + 30) + '" fill="#B7793A"/>' +
        '<path d="M' + (g.left - 16) + ' ' + (g.y0 - 6) + 'h32M' + (g.right - 16) + ' ' + (g.y0 - 6) + 'h32" fill="none"/>' +
        '<path d="M' + g.left + ' ' + g.y0 + 'Q' + cx + ' ' + (g.y0 + 2 * g.sag) + ' ' + g.right + ' ' + g.y0 + '" fill="none" stroke-width="3"/></g></svg>';
      c.add(poles, "p-abs");
      g.nest = { x: cx - cw * 0.3, y: hy - 150 };
      c.add(TG.art.nestTree, "p-abs", "left:" + (g.nest.x - 75) + "px;top:" + (g.nest.y - 60) + "px;width:150px;z-index:1");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (W - 128) + "px;top:" + (H - 176) + "px;width:116px;z-index:2");
    },
    intro: function (c) { c.say(c.T("وين عصفور الـ ع؟", "وين عصفور الـ ع؟"), c.W / 2, c.H * 0.56); },
    slots: function (c, n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var t = 0.18 + i * (0.64 / (n - 1)), x = g.left + (g.right - g.left) * t;
        out.push({ x: x, y: wireY(t) });
      }
      return out;
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.bird(cols[i % cols.length]) + TG.lbl(ch, 46, "top:48px"), "ain-bird", "left:" + (s.x - 47) + "px;top:" + (s.y - 86) + "px;width:94px;height:94px;z-index:3", "button");
    },
    enter: function (c, items) {
      items.forEach(function (el, i) {
        if (el.animate) el.animate([{ transform: "translate(0,-160px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 700, delay: i * 120, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
      });
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none"; chirp(c);
      if (c.score < c.total - 1) c.say("عين!", s.x, s.y - 92);
      c.later(function () {
        c.move(el, g.nest.x - 47, g.nest.y - 76, 1000, 80, function () {
          el.style.transition = "transform .3s"; el.style.transform = "scale(.7)";
          c.burst(g.nest.x, g.nest.y - 20); chirp(c);
          el.removeAttribute("data-ok"); el.classList.add("p-done");
          c.later(next, 600);
        });
      }, 350);
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 340);
    }
  }));
})();

;
/* ض — ضفدع: bugs hover over the pond; tap the bug that carries ض and the frog catches it with its tongue */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.frog = '<svg viewBox="0 0 140 120"><g ' + O + '>' +
    '<path d="M22 104c-14 0-18-10-10-14 6-3 14 0 18 4M118 104c14 0 18-10 10-14-6-3-14 0-18 4" fill="#6DBB3C"/>' +
    '<ellipse cx="70" cy="76" rx="56" ry="38" fill="#6DBB3C"/>' +
    '<ellipse cx="70" cy="90" rx="34" ry="20" fill="#C9EBA0" stroke="none"/>' +
    '<circle cx="44" cy="36" r="20" fill="#6DBB3C"/><circle cx="96" cy="36" r="20" fill="#6DBB3C"/>' +
    '<circle cx="44" cy="34" r="12" fill="#fff"/><circle cx="96" cy="34" r="12" fill="#fff"/>' +
    '<path d="M40 66q30 22 60 0" fill="none"/>' +
    '<path d="M44 108c-6 2-12 0-14-4M96 108c6 2 12 0 14-4" fill="none"/></g>' +
    '<circle cx="46" cy="36" r="6" fill="#1F1F1F"/><circle cx="98" cy="36" r="6" fill="#1F1F1F"/><circle cx="48" cy="33" r="2.2" fill="#fff"/><circle cx="100" cy="33" r="2.2" fill="#fff"/>' +
    '<ellipse cx="32" cy="70" rx="8" ry="5" fill="#FF9BB0" opacity=".85"/><ellipse cx="108" cy="70" rx="8" ry="5" fill="#FF9BB0" opacity=".85"/></svg>';
  TG.art.bug = function (col) {
    return '<svg viewBox="0 0 100 100"><g ' + O + '>' +
      '<ellipse class="dad-wing" cx="30" cy="30" rx="20" ry="13" fill="#E9F7FB" transform="rotate(-30 30 30)"/>' +
      '<ellipse class="dad-wing" cx="70" cy="30" rx="20" ry="13" fill="#E9F7FB" transform="rotate(30 70 30)"/>' +
      '<circle cx="50" cy="60" r="34" fill="' + col + '"/>' +
      '<path d="M40 22c-4-8-10-10-14-8M60 22c4-8 10-10 14-8" fill="none"/>' +
      '<circle cx="50" cy="30" r="14" fill="#2B2B2B"/></g>' +
      '<circle cx="45" cy="28" r="3.6" fill="#fff"/><circle cx="55" cy="28" r="3.6" fill="#fff"/></svg>';
  };
  TG.art.frogFace = TG.art.frog;
  var cols = ["#F0443A", "#FFB547", "#7E57C2", "#3FB6C9"];
  TG.cssB("tg-dad",
    ".dad-bug svg{animation:dadhover 2.6s ease-in-out infinite}.dad-bug:nth-of-type(2n) svg{animation-delay:-1.3s}" +
    "@keyframes dadhover{25%{translate:4px -6px}75%{translate:-4px 4px}}" +
    ".dad-tongue{position:absolute;width:14px;margin-left:-7px;border-radius:7px;background:#F06A8A;border:3px solid #1F1F1F;transform-origin:50% 100%;z-index:4;pointer-events:none}" +
    "@media (prefers-reduced-motion:reduce){.dad-bug svg{animation:none}}");

  var g = {};
  TG.register("ض", TG.choice({
    title: "الضفدع الجوعان", mascot: "frogFace", rounds: 5, count: 3, winWord: "شبع الضفدع!",
    winText: function (c) { return c.T("صدت كل حشرات الـ ض مع الضفدع، أنت و", "صدتِ كل حشرات الـ ض مع الضفدع، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, hy = Math.round(H * 0.52);
      g.cx = cx; g.cw = cw;
      var pond = { y: H * 0.82, rx: Math.min(W * 0.5, 260), ry: H * 0.14 };
      var bg = TG.meadowB(W, H, hy).replace('</svg>',
        '<ellipse cx="' + cx + '" cy="' + pond.y + '" rx="' + (pond.rx + 6) + '" ry="' + (pond.ry + 6) + '" fill="#fff"/>' +
        '<ellipse cx="' + cx + '" cy="' + pond.y + '" rx="' + pond.rx + '" ry="' + pond.ry + '" fill="#A9E0EA"/>' +
        '<path d="M' + (cx - pond.rx * 0.6) + ' ' + (pond.y + 30) + 'q14-8 28 0t28 0M' + (cx + pond.rx * 0.2) + ' ' + (pond.y + 50) + 'q14-8 28 0t28 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="' + cx + '" cy="' + (H * 0.8 + 6) + '" rx="78" ry="22" fill="#4E9A28" stroke="#1F1F1F" stroke-width="4"/>' +
        '<ellipse cx="' + cx + '" cy="' + (H * 0.8) + '" rx="74" ry="19" fill="#6DBB3C"/></svg>');
      c.add(bg, "p-abs");
      g.frog = c.add(TG.art.frog, "p-abs", "left:" + (cx - 70) + "px;top:" + (H * 0.8 - 104) + "px;width:140px;height:120px;z-index:3;transform-origin:50% 100%");
      g.mouth = { x: cx, y: H * 0.8 - 104 + 120 * 0.58 };
      c.add(c.api.figHTML(), "fig p-abs", "left:6px;top:" + (hy - 70) + "px;width:104px;z-index:2");
    },
    intro: function (c) { c.say(c.T("ساعد الضفدع يصيد حشرة الـ ض", "ساعدي الضفدع يصيد حشرة الـ ض"), c.W / 2, c.H * 0.62); },
    slots: function (c, n) {
      var xs = c.shuffle([-0.3, 0, 0.3]), ys = [0.17, 0.27, 0.21];
      return xs.slice(0, n).map(function (fx, i) { return { x: g.cx + g.cw * fx + c.rnd(-10, 10), y: c.H * ys[i] + c.rnd(-10, 10) + 30 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.bug(cols[i % cols.length]) + TG.lbl(ch, 44, "top:36px"), "dad-bug", "left:" + (s.x - 44) + "px;top:" + (s.y - 44) + "px;width:88px;height:88px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var dx = s.x - g.mouth.x, dy = s.y - g.mouth.y, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      var t = c.add("", "dad-tongue", "left:" + g.mouth.x + "px;top:" + (g.mouth.y - len) + "px;height:" + len + "px;transform:rotate(" + ang + "deg) scaleY(0)");
      c.api.sweep && c.api.sweep(300, 900, 0.18, "sine", 0.12);
      if (t.animate) {
        t.animate([{ transform: "rotate(" + ang + "deg) scaleY(0)" }, { transform: "rotate(" + ang + "deg) scaleY(1)" }], { duration: 260, easing: "ease-out", fill: "forwards" }).onfinish = function () {
          if (!c.alive) return;
          c.move(el, g.mouth.x - 44, g.mouth.y - 44, 320);
          el.style.transition = "opacity .32s"; el.style.opacity = "0";
          t.animate([{ transform: "rotate(" + ang + "deg) scaleY(1)" }, { transform: "rotate(" + ang + "deg) scaleY(0)" }], { duration: 320, easing: "ease-in", fill: "forwards" }).onfinish = function () {
            if (!c.alive) return;
            t.remove();
            if (g.frog.animate) g.frog.animate([{ transform: "scale(1)" }, { transform: "scale(1.1,.9)" }, { transform: "scale(1)" }], { duration: 380 });
            c.sfx.pop && c.sfx.pop(); c.burst(g.mouth.x, g.mouth.y - 20);
            if (c.score < c.total - 1) c.say(["يمّ!", "ضاد!", "لذيذة!", "كمان!"][Math.min(3, c.score)], g.mouth.x, g.mouth.y - 70);
            el.removeAttribute("data-ok"); el.classList.add("p-done");
            c.later(next, 650);
          };
        };
      } else { t.remove(); next(); }
    }
  }));
})();

;
/* د — دلة: three finjan cups on the sadu rug, each with a letter. Tap the د cup: the dallah flies over,
   tilts and pours golden gahwa into it. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  function dallah(face) {
    return '<svg viewBox="' + (face ? "-16 0 156 156" : "0 0 124 156") + '"><g ' + O + '>' +
      '<path d="M40 74Q22 62 8 38L16 33Q30 54 46 62Z" fill="#E9B949"/>' +
      '<path d="M86 66Q112 72 104 112Q100 126 88 130" fill="none" stroke-width="7"/>' +
      '<path d="M86 66Q112 72 104 112Q100 126 88 130" fill="none" stroke="#E9B949" stroke-width="3"/>' +
      '<path d="M34 144Q30 102 48 92L78 92Q96 102 90 144Z" fill="#E9B949"/>' +
      '<path d="M48 92Q52 74 47 62L77 62Q72 74 78 92Z" fill="#E9B949"/>' +
      '<path d="M45 62Q62 30 79 62Z" fill="#E9B949"/>' +
      '<path d="M62 36Q57 24 62 12Q67 24 62 36Z" fill="#E9B949"/>' +
      '<path d="M30 146h64" stroke-width="6"/></g>' +
      '<path d="M44 108q18 6 40 0" fill="none" stroke="#C99626" stroke-width="3"/>' +
      '<ellipse cx="50" cy="118" rx="5" ry="14" fill="#fff" opacity=".5"/>' +
      (face ? '<ellipse cx="54" cy="116" rx="5" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="2.5"/><ellipse cx="72" cy="116" rx="5" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="2.5"/><circle cx="55" cy="117.5" r="2.6" fill="#1F1F1F"/><circle cx="73" cy="117.5" r="2.6" fill="#1F1F1F"/><path d="M56 129q7 5 14 0" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/><ellipse cx="46" cy="126" rx="4" ry="2.5" fill="#FF9BB0"/><ellipse cx="80" cy="126" rx="4" ry="2.5" fill="#FF9BB0"/>' : '') +
      '</svg>';
  }
  TG.art.dal_dallah = dallah(false);
  TG.art.dal_dallahFace = dallah(true);
  TG.art.dal_cup = '<svg viewBox="0 0 100 84"><path class="dal-gahwa" d="M18 26Q50 34 82 26L80 34Q50 42 20 34Z" fill="#E8C26A" opacity="0"/>' +
    '<g ' + O + '><path d="M14 20H86Q84 66 50 72Q16 66 14 20Z" fill="#fff"/><ellipse cx="50" cy="20" rx="36" ry="7" fill="#F4FBFC"/></g>' +
    '<path d="M18 40Q50 48 82 40" fill="none" stroke="#11808F" stroke-width="5"/><path d="M24 50Q50 56 76 50" fill="none" stroke="#F2693B" stroke-width="3"/></svg>';
  function room(w, h, g) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#FFF6E5"/>';
    o += '<rect width="' + w + '" height="' + (h * 0.08) + '" fill="#FCE3EA"/>';
    for (var x = 18; x < w; x += 46) o += '<path d="M' + x + ' ' + (h * 0.08) + 'q12 16 24 0" fill="#FCE3EA"/>';
    o += '<rect y="' + g + '" width="' + w + '" height="' + (h - g) + '" fill="#F7E9C6"/>';
    var ry = g + 26, rh = h - g - 40;
    o += '<rect x="10" y="' + ry + '" width="' + (w - 20) + '" height="' + rh + '" rx="12" fill="#E2453C" stroke="#1F1F1F" stroke-width="4"/>';
    o += '<rect x="22" y="' + (ry + 12) + '" width="' + (w - 44) + '" height="' + (rh - 24) + '" rx="6" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 6"/>';
    for (x = 40; x < w - 30; x += 40) o += '<path d="M' + x + ' ' + (ry + 30) + 'l10 12-10 12-10-12z" fill="#FFCF3D"/>';
    for (x = 40; x < w - 30; x += 40) o += '<path d="M' + x + ' ' + (ry + rh - 54) + 'l10 12-10 12-10-12z" fill="#11808F"/>';
    return o + '</svg>';
  }
  var pot = null, home = null;
  TG.register("د", TG.choice({
    title: "دلة القهوة", mascot: "dal_dallahFace", rounds: 5, count: 3, winWord: "تفضلوا القهوة!",
    winText: function (c) { return c.T("صبّيت القهوة في فناجين الـ د، أنت و", "صبّيتِ القهوة في فناجين الـ د، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      c.add(room(c.W, c.H, Math.round(c.H * 0.46)), "p-abs");
      home = { x: c.W / 2 - 62, y: c.H * 0.12 };
      pot = c.add('<div class="dal-flip" style="width:100%;height:100%">' + TG.art.dal_dallah + "</div>", "p-abs p-bob", "left:" + home.x + "px;top:" + home.y + "px;width:124px;height:156px;z-index:4");
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (c.H - 172) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("صب القهوة في فنجان الـ د", "صبّي القهوة في فنجان الـ د"), c.W / 2, c.H * 0.12 + 20); },
    slots: function (c, n) {
      return [0.19, 0.5, 0.81].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.66 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.dal_cup + TG.lbl(ch, 44, "top:30px;left:28px"), "", "left:" + (s.x - 50) + "px;top:" + (s.y - 42) + "px;width:100px;height:84px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      pot.classList.remove("p-bob");
      /* the spout tip (8,38 in the 124x156 pot drawing) lands just above the cup; on the right side the pot is mirrored so it stays on screen */
      var mir = s.x > c.W * 0.62, tipX = mir ? 116 : 8;
      var px = s.x - tipX + (mir ? -4 : 4), py = s.y - 42 - 150;
      var flip = pot.firstChild, svg = flip.firstChild;
      flip.style.transform = mir ? "scaleX(-1)" : "";
      c.move(pot, px, py, 800, 30, function () {
        svg.style.transformOrigin = "6% 24%"; svg.style.transition = "transform .45s ease";
        svg.style.transform = "rotate(-32deg)";
        var stream = c.add("", "p-abs", "left:" + (px + tipX - 3) + "px;top:" + (py + 40) + "px;width:7px;height:0;border-radius:4px;background:#E8C26A;z-index:3;transition:height .5s ease");
        c.later(function () { stream.style.height = (s.y - 42 + 18 - (py + 40)) + "px"; c.sfx.plop && c.sfx.plop(); }, 380);
        c.later(function () {
          var g = el.querySelector(".dal-gahwa"); if (g) { g.style.transition = "opacity .4s"; g.style.opacity = "1"; }
          stream.style.height = "0"; svg.style.transform = "";
          c.burst(s.x, s.y - 30, ["#E8C26A", "#FFCF3D", "#fff", "#F2693B"]);
          c.say(["دال!", "فنجانين!", "ثلاث!", "أربع!", "خمس!"][c.score], s.x, s.y - 60);
        }, 1300);
        c.later(function () {
          stream.remove();
          c.move(pot, home.x, home.y, 700, 20, function () { flip.style.transform = ""; pot.classList.add("p-bob"); next(); });
        }, 2000);
      });
    }
  }));
})();

;
/* ذ — ذرة: corn kernels sit in the pan. Tap the ذ kernel: it pops into popcorn and jumps into the bucket. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.dhal_kernel = '<svg viewBox="0 0 80 92"><g ' + O + '><path d="M40 6Q74 20 72 56Q68 86 40 88Q12 86 8 56Q6 20 40 6Z" fill="#FFC93C"/></g><path d="M24 30Q20 46 24 60" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6" fill="none"/><path d="M40 70Q56 70 62 56" stroke="#E0A800" stroke-width="4" fill="none" stroke-linecap="round"/></svg>';
  TG.art.dhal_pop = '<svg viewBox="0 0 90 84"><g ' + O + '><path d="M22 56a14 14 0 0 1-2-26a16 16 0 0 1 22-18a16 16 0 0 1 26 4a14 14 0 0 1 6 24a14 14 0 0 1-14 20a16 16 0 0 1-24 0a14 14 0 0 1-14-4z" fill="#FFFBF0"/></g><path d="M38 44q6-6 12 0" fill="#FFE07A"/><circle cx="34" cy="30" r="5" fill="#FFE9A8"/><circle cx="56" cy="50" r="4" fill="#FFE9A8"/></svg>';
  TG.art.dhal_cob = '<svg viewBox="-15 0 140 140"><g ' + O + '><path d="M20 120Q8 90 30 76Q14 108 40 128Z" fill="#7CC242"/><path d="M90 120Q102 90 80 76Q96 108 70 128Z" fill="#7CC242"/><path d="M55 8Q86 14 84 70Q82 118 55 130Q28 118 26 70Q24 14 55 8Z" fill="#FFC93C"/><ellipse cx="44" cy="62" rx="7" ry="9" fill="#fff"/><ellipse cx="66" cy="62" rx="7" ry="9" fill="#fff"/><path d="M46 84q9 8 18 0" fill="none"/></g><circle cx="45" cy="64" r="4" fill="#1F1F1F"/><circle cx="67" cy="64" r="4" fill="#1F1F1F"/><ellipse cx="36" cy="78" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="74" cy="78" rx="5" ry="3" fill="#FF9BB0"/><g fill="#E0A800" opacity=".6"><circle cx="44" cy="30" r="4"/><circle cx="58" cy="26" r="4"/><circle cx="66" cy="38" r="4"/><circle cx="40" cy="44" r="4"/><circle cx="54" cy="104" r="4"/><circle cx="66" cy="96" r="4"/></g></svg>';
  TG.art.dhal_bucket = '<svg viewBox="0 0 120 130"><g ' + O + '><path d="M14 30H106L94 124H26Z" fill="#fff"/></g><path d="M34 32l8 90M58 32v90M82 32l-6 90" stroke="#E2453C" stroke-width="12"/><path d="M14 30H106L94 124H26Z" fill="none" ' + O + '/><rect x="8" y="22" width="104" height="14" rx="6" fill="#E2453C" ' + O + '/></svg>';
  function kitchen(w, h, py) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#FFF6E5"/>';
    for (var y = 120; y < py - 30; y += 46) for (var x = (y / 46) % 2 ? 0 : 23; x < w; x += 46) o += '<rect x="' + x + '" y="' + y + '" width="40" height="40" rx="6" fill="#E2F3F5"/>';
    o += '<rect y="' + (py + 70) + '" width="' + w + '" height="' + h + '" fill="#F7E9C6"/><rect y="' + (py + 64) + '" width="' + w + '" height="14" fill="#D9A35F" stroke="#1F1F1F" stroke-width="4"/>';
    return o + '</svg>';
  }
  function pan(w) {
    var o = '<svg viewBox="0 0 ' + w + ' 120" width="' + w + '" height="120" aria-hidden="true">';
    var cx = w / 2;
    o += '<g fill="#F2693B" stroke="#1F1F1F" stroke-width="3" stroke-linejoin="round">';
    for (var x = cx - 70; x <= cx + 70; x += 35) o += '<path d="M' + x + ' 116q-12-14 0-30q4 12 8 6q10 12-8 24z"/>';
    o += '</g><g fill="#FFCF3D">';
    for (x = cx - 70; x <= cx + 70; x += 35) o += '<path d="M' + (x + 2) + ' 112q-6-8 0-16q4 8 6 4q2 8-6 12z"/>';
    o += '</g><g ' + O + '><path d="M16 24H' + (w - 16) + 'Q' + (w - 26) + ' 84 ' + cx + ' 86Q26 84 16 24Z" fill="#7FC6D0"/><path d="M8 24H' + (w - 8) + '" stroke-width="8"/></g>';
    o += '<path d="M40 40Q' + cx + ' 70 ' + (w - 40) + ' 40" fill="none" stroke="#fff" stroke-width="5" opacity=".5" stroke-linecap="round"/>';
    return o + '</svg>';
  }
  var bucket = null, pops = 0, panBox = null;
  TG.register("ذ", TG.choice({
    title: "فشار الذرة", mascot: "dhal_cob", rounds: 5, count: 3, winWord: "فشار كثير!",
    winText: function (c) { return c.T("فقّعت حبات الـ ذ كلها، أنت و", "فقّعتِ حبات الـ ذ كلها، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      pops = 0;
      var py = Math.round(c.H * 0.42), pw = Math.min(c.W - 24, 380);
      c.add(kitchen(c.W, c.H, py), "p-abs");
      panBox = { x: (c.W - pw) / 2, y: py, w: pw };
      c.add(pan(Math.round(pw)), "p-abs", "left:" + panBox.x + "px;top:" + py + "px;z-index:1");
      bucket = c.add(TG.art.dhal_bucket, "p-abs", "left:" + (c.W - 136) + "px;top:" + (c.H - 168) + "px;width:116px;z-index:3");
      c.bucket = { x: c.W - 136, y: c.H - 168 };
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (c.H - 176) + "px;width:116px;z-index:2");
    },
    intro: function (c) { c.say(c.T("فقّع حبة الـ ذ!", "فقّعي حبة الـ ذ!"), c.W / 2, c.H * 0.3); },
    slots: function (c, n) {
      var k = panBox, step = (k.w - 60) / n;
      var out = [];
      for (var i = 0; i < n; i++) out.push({ x: k.x + 30 + step * (i + 0.5), y: k.y - 4 + (i % 2) * 12 });
      return out;
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.dhal_kernel + TG.lbl(ch, 44, "top:28px;left:17px"), "", "left:" + (s.x - 39) + "px;top:" + (s.y - 66) + "px;width:78px;height:90px;z-index:2", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      el.innerHTML = TG.art.dhal_pop;
      el.style.transition = "transform .25s"; el.style.transform = "scale(1.35)";
      c.sfx.pop && c.sfx.pop(); c.burst(s.x, s.y - 30, ["#FFFBF0", "#FFE07A", "#fff", "#FFCF3D"]);
      c.say("ذال!", s.x, s.y - 80);
      c.later(function () {
        el.style.transform = "";
        var b = c.bucket, tx = b.x + 14 + (pops % 3) * 26, ty = b.y - 34 - Math.floor(pops / 3) * 18;
        c.move(el, tx, ty, 800, 120, function () {
          pops++;
          el.style.transition = "width .25s,height .25s"; el.style.width = "56px"; el.style.height = "50px";
          el.removeAttribute("data-ok"); el.classList.add("p-done"); el.style.zIndex = "4";
          c.sfx.plop && c.sfx.plop();
          c.later(next, 400);
        });
      }, 500);
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { if (!it.classList.contains("p-done")) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 300); } });
      c.later(next, 340);
    }
  }));
})();

;
/* ف — فراشة: flowers carry letters; tap the ف flower and the butterfly flies to it */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.butterfly = '<svg viewBox="0 0 120 100"><g ' + O + '>' +
    '<g class="fa-wl"><path d="M58 46C40 6 6 8 8 30c2 16 22 22 50 18z" fill="#B48CE8"/><path d="M58 52C34 54 18 70 26 84c8 12 26 4 32-28z" fill="#F3A6B8"/></g>' +
    '<g class="fa-wr"><path d="M62 46C80 6 114 8 112 30c-2 16-22 22-50 18z" fill="#B48CE8"/><path d="M62 52C86 54 102 70 94 84c-8 12-26 4-32-28z" fill="#F3A6B8"/></g>' +
    '<path d="M54 22c-4-10-10-14-16-14M66 22c4-10 10-14 16-14" fill="none"/>' +
    '<ellipse cx="60" cy="58" rx="8" ry="30" fill="#4A3B6B"/><circle cx="60" cy="28" r="12" fill="#4A3B6B"/></g>' +
    '<circle cx="26" cy="28" r="6" fill="#FFCF3D"/><circle cx="94" cy="28" r="6" fill="#FFCF3D"/><circle cx="36" cy="72" r="4" fill="#fff"/><circle cx="84" cy="72" r="4" fill="#fff"/>' +
    '<circle cx="55.5" cy="27" r="3" fill="#fff"/><circle cx="64.5" cy="27" r="3" fill="#fff"/><circle cx="56" cy="27.6" r="1.6" fill="#1F1F1F"/><circle cx="65" cy="27.6" r="1.6" fill="#1F1F1F"/>' +
    '<path d="M56 33q4 3 8 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  TG.art.flower = function (col) {
    var p = "";
    for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3, x = 50 + Math.cos(a) * 26, y = 50 + Math.sin(a) * 26; p += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="20" fill="' + col + '"/>'; }
    return '<svg viewBox="0 0 100 180"><g ' + O + '><path d="M50 176V80" fill="none" stroke="#4E9A28" stroke-width="7"/><path d="M50 176V80" fill="none" stroke="#7CC242" stroke-width="3"/>' +
      '<path d="M50 140c-14-16-30-14-34-6 10 8 22 10 34 6zM50 120c14-16 30-14 34-6-10 8-22 10-34 6z" fill="#7CC242"/>' + p +
      '<circle cx="50" cy="50" r="24" fill="#FFF3C9"/></g></svg>';
  };
  TG.art.butterflyFace = TG.art.butterfly;
  var cols = ["#FF8FA8", "#FFB547", "#8FD3F4", "#C9A7F5"];
  TG.cssB("tg-fa",
    ".fa-fly svg{overflow:visible}.fa-wl,.fa-wr{transform-box:fill-box;animation:faflap .5s ease-in-out infinite}" +
    ".fa-wl{transform-origin:100% 50%}.fa-wr{transform-origin:0% 50%}@keyframes faflap{50%{scale:.72 1}}" +
    ".fa-fl svg{transform-origin:50% 100%;animation:fasway 3.2s ease-in-out infinite}.fa-fl:nth-of-type(2n) svg{animation-delay:-1.6s}@keyframes fasway{50%{rotate:3deg}}" +
    "@media (prefers-reduced-motion:reduce){.fa-wl,.fa-wr,.fa-fl svg{animation:none}}");

  var g = {};
  TG.register("ف", TG.choice({
    title: "الفراشة والورد", mascot: "butterflyFace", rounds: 5, count: 3, winWord: "ورد وفراشات!",
    winText: function (c) { return c.T("وصّلت الفراشة لكل وردة فيها ف، أنت و", "وصّلتِ الفراشة لكل وردة فيها ف، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, hy = Math.round(H * 0.42);
      g.cx = cx; g.cw = cw;
      c.add(TG.meadowB(W, H, hy), "p-abs");
      g.rest = { x: cx - 55, y: Math.max(96, H * 0.16) };
      g.bf = c.add(TG.art.butterfly, "p-abs fa-fly", "left:" + g.rest.x + "px;top:" + g.rest.y + "px;width:110px;height:92px;z-index:5;pointer-events:none");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (W - 124) + "px;top:" + (H - 168) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("وين وردة الـ ف؟", "وين وردة الـ ف؟"), g.cx, g.rest.y + 110); },
    slots: function (c, n) {
      return [-0.31, 0, 0.31].slice(0, n).map(function (fx) { return { x: g.cx + g.cw * fx, y: c.H * 0.55 + c.rnd(-14, 14) }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.flower(cols[(i + c.score) % cols.length]) + TG.lbl(ch, 46, "top:27px"), "fa-fl", "left:" + (s.x - 50) + "px;top:" + (s.y - 50) + "px;width:100px;height:180px;z-index:3", "button");
    },
    enter: function (c, items) {
      items.forEach(function (el, i) {
        if (el.animate) el.animate([{ transform: "translateY(40px) scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 650, delay: i * 110, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" });
      });
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      c.api.sweep && c.api.sweep(900, 1500, 0.25, "sine", 0.08);
      c.move(g.bf, s.x - 55, s.y - 96, 1000, 60, function () {
        c.burst(s.x, s.y - 40, ["#B48CE8", "#F3A6B8", "#FFCF3D", "#fff"]);
        if (c.score < c.total - 1) c.say("فاء!", s.x, s.y - 100);
        el.removeAttribute("data-ok"); el.classList.add("p-done");
        c.later(function () { c.move(g.bf, g.rest.x, g.rest.y, 800, 30, next); }, 650);
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 340);
    }
  }));
})();

;
/* غ — غوص: pearl diving from a dhow. Shells on the sea floor carry letters; tap the غ shell,
   the diver swims down, the shell opens and its pearl goes into the jar. The sea stays light aqua. */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.diver = '<svg viewBox="0 0 120 110"><g ' + O + '>' +
    '<path d="M18 84l-14 14 20 4 8-12zM36 92l-8 16 20-2 4-12z" fill="#FFCF3D"/>' +
    '<path d="M30 70c4-16 30-24 52-18l-4 30c-16 8-36 8-48-12z" fill="#F2693B"/>' +
    '<path d="M76 56c10-4 18 2 20 10-6 6-14 6-20 2" fill="#F2693B"/>' +
    '<circle cx="84" cy="34" r="22" fill="#F6C9A0"/>' +
    '<path d="M62 30h44v12c0 6-4 9-10 9H72c-6 0-10-3-10-9z" fill="#BFE8EE"/>' +
    '<path d="M64 28c0-14 40-14 40 0" fill="#3FB6C9"/>' +
    '<path d="M108 34v-22" fill="none" stroke-width="5"/></g>' +
    '<circle cx="76" cy="39" r="3.4" fill="#1F1F1F"/><circle cx="94" cy="39" r="3.4" fill="#1F1F1F"/><circle cx="77.2" cy="37.8" r="1.2" fill="#fff"/><circle cx="95.2" cy="37.8" r="1.2" fill="#fff"/>' +
    '<path d="M78 52q6 4 12 0" stroke="#1F1F1F" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M66 32h12" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>';
  TG.art.shellBase = function (col) {
    return '<svg viewBox="0 0 110 80" class="gh-base"><g ' + O + '><path d="M8 40c0 22 20 36 47 36s47-14 47-36z" fill="' + col + '"/>' +
      '<path d="M30 46l6 26M55 44v32M80 46l-6 26" fill="none" stroke-width="3"/></g></svg>';
  };
  TG.art.shellLid = function (col) {
    return '<svg viewBox="0 0 110 50"><g ' + O + '><path d="M8 46C8 18 30 4 55 4s47 14 47 42z" fill="' + col + '"/>' +
      '<path d="M55 8v36M34 12l10 32M76 12l-10 32M16 26l26 18M94 26l-26 18" fill="none" stroke-width="3" opacity=".55"/></g></svg>';
  };
  TG.art.pearl = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#FFFDF6" stroke="#1F1F1F" stroke-width="3"/><circle cx="14" cy="14" r="5" fill="#fff"/><circle cx="24" cy="26" r="6" fill="#F3E7FF" opacity=".8"/></svg>';
  TG.art.dhow = '<svg viewBox="0 0 200 130"><g ' + O + '><path d="M100 96V8" fill="none" stroke-width="5"/><path d="M104 12c40 16 58 46 60 78H104z" fill="#FFF6E0"/>' +
    '<path d="M10 92h180l-22 32H40z" fill="#B7793A"/><path d="M16 100h168" fill="none" stroke="#8A5A2B" stroke-width="3"/></g></svg>';
  TG.art.jar = '<svg viewBox="0 0 120 110"><g ' + O + '><path d="M30 18h60v10c14 8 20 22 20 40 0 26-20 38-50 38S10 94 10 68c0-18 6-32 20-40z" fill="#E9F7FB" fill-opacity=".85"/><path d="M26 10h68v10H26z" fill="#C98A4B"/></g></svg>';
  TG.art.diverFace = TG.art.diver;
  var cols = ["#F7B3C6", "#FFD9A0", "#C7E5A8", "#C9B8F0"];
  TG.cssB("tg-ghain",
    ".gh-shell .gh-lid{position:absolute;left:0;top:-6px;width:100%;transform-origin:12% 92%;transition:transform .5s cubic-bezier(.34,1.56,.64,1)}" +
    ".gh-shell .gh-base{position:absolute;left:0;bottom:0;width:100%;height:auto}" +
    ".gh-shell.open .gh-lid{transform:rotate(-38deg) translate(-6px,-10px)}" +
    ".gh-diver{animation:ghswim 3s ease-in-out infinite}@keyframes ghswim{50%{translate:0 -8px}}" +
    ".gh-bub{position:absolute;border:3px solid #fff;border-radius:50%;opacity:.8;animation:ghbub 6s linear infinite}@keyframes ghbub{from{transform:translateY(0)}to{transform:translateY(-320px);opacity:0}}" +
    ".gh-weed{transform-origin:50% 100%;animation:ghweed 4s ease-in-out infinite}@keyframes ghweed{50%{rotate:5deg}}" +
    "@media (prefers-reduced-motion:reduce){.gh-diver,.gh-bub,.gh-weed{animation:none}}");

  var g = {};
  TG.register("غ", TG.choice({
    title: "الغوص على اللؤلؤ", mascot: "diverFace", rounds: 5, count: 3, winWord: "جرة لؤلؤ!",
    winText: function (c) { return c.T("غصت ولقيت كل لؤلؤ الـ غ، أنت و", "غصتِ ولقيتِ كل لؤلؤ الـ غ، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, sea = Math.round(Math.max(190, H * 0.25)), sand = Math.round(H * 0.8);
      g.cx = cx; g.cw = cw; g.sand = sand; g.n = 0;
      var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><defs><linearGradient id="ghsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDEFF6"/><stop offset="1" stop-color="#A6DFEA"/></linearGradient></defs>' +
        '<rect width="' + W + '" height="' + sea + '" fill="#EAF7F9"/><rect y="' + sea + '" width="' + W + '" height="' + (H - sea) + '" fill="url(#ghsea)"/>';
      for (var x = -10; x < W + 40; x += 40) o += '<path d="M' + x + ' ' + sea + 'q10-10 20 0t20 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
      for (var x2 = -10; x2 < W + 40; x2 += 34) o += '<circle cx="' + x2 + '" cy="' + sand + '" r="22" fill="#F7E9C6"/>';
      o += '<rect y="' + sand + '" width="' + W + '" height="' + (H - sand) + '" fill="#F7E9C6"/>';
      o += '<g fill="#EBD39A"><circle cx="' + W * 0.2 + '" cy="' + (sand + 40) + '" r="4"/><circle cx="' + W * 0.62 + '" cy="' + (sand + 70) + '" r="5"/><circle cx="' + W * 0.84 + '" cy="' + (sand + 30) + '" r="3"/></g></svg>';
      c.add(o, "p-abs");
      [[0.06, 1], [0.94, -1], [0.5, 1]].forEach(function (w, i) {
        var hgt = i === 2 ? 70 : 120;
        c.add('<svg viewBox="0 0 40 120" width="40" height="' + hgt + '" aria-hidden="true"><path d="M20 118C' + (6 * w[1]) + ' 90 34 60 20 30S30 6 22 2" fill="none" stroke="#5FA62E" stroke-width="10" stroke-linecap="round"/></svg>', "p-abs gh-weed", "left:" + (W * w[0] - 20) + "px;top:" + (sand - hgt + 16) + "px;animation-delay:-" + i + "s");
      });
      for (var b = 0; b < 5; b++) c.add("", "gh-bub", "left:" + (W * (0.1 + b * 0.2)) + "px;top:" + (sand - 20) + "px;width:" + (8 + b % 3 * 4) + "px;height:" + (8 + b % 3 * 4) + "px;animation-delay:-" + b * 1.2 + "s");
      var dx = Math.max(4, cx - cw * 0.5);
      c.add(TG.art.dhow, "p-abs", "left:" + dx + "px;top:" + (sea - 96) + "px;width:150px;z-index:2");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (dx + 30) + "px;top:" + (sea - 112) + "px;width:80px;z-index:1");
      g.home = { x: dx + 20, y: sea + 30 };
      g.diver = c.add(TG.art.diver, "p-abs gh-diver", "left:" + g.home.x + "px;top:" + g.home.y + "px;width:118px;z-index:4;pointer-events:none");
      g.jar = { x: cx + cw * 0.5 - 104, y: sea + 24 };
      c.add(TG.art.jar, "p-abs", "left:" + g.jar.x + "px;top:" + g.jar.y + "px;width:96px;z-index:2");
    },
    intro: function (c) { c.say(c.T("وين محارة الـ غ؟", "وين محارة الـ غ؟"), g.cx, g.sand - 140); },
    slots: function (c, n) {
      return [-0.31, 0, 0.31].slice(0, n).map(function (fx) { return { x: g.cx + g.cw * fx, y: g.sand - 20 + c.rnd(-8, 8) }; });
    },
    item: function (c, ch, i, s) {
      var col = cols[(i + c.score) % cols.length];
      return c.add(TG.art.shellBase(col) + '<div class="gh-lid">' + TG.art.shellLid(col) + "</div>" + TG.lbl(ch, 44, "top:6px"), "gh-shell", "left:" + (s.x - 55) + "px;top:" + (s.y - 50) + "px;width:110px;height:86px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      c.move(g.diver, s.x - 30, s.y - 150, 1100, 0, function () {
        el.classList.add("open");
        var lb = el.querySelector(".p-lbl"); if (lb) lb.style.opacity = "0";
        c.api.sweep && c.api.sweep(500, 1300, 0.3, "sine", 0.1);
        var p = c.add(TG.art.pearl, "p-abs", "left:" + (s.x - 18) + "px;top:" + (s.y - 26) + "px;width:36px;z-index:5");
        if (c.score < c.total - 1) c.say("غين!", s.x, s.y - 160);
        c.later(function () {
          g.n++;
          var tx = g.jar.x + 22 + ((g.n - 1) % 3) * 18, ty = g.jar.y + 64 - Math.floor((g.n - 1) / 3) * 16;
          c.move(p, tx, ty, 900, 70, function () {
            p.style.width = "26px"; c.sfx.pop && c.sfx.pop(); c.burst(g.jar.x + 48, g.jar.y + 40, ["#fff", "#F3E7FF", "#FFCF3D"]);
            el.removeAttribute("data-ok"); el.classList.add("p-done");
            c.move(g.diver, g.home.x, g.home.y, 900, 0, next);
          });
        }, 650);
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 340);
    }
  }));
})();

;
/* ح — حصان: listen only. The letter is heard, not shown; the horse gallops to the flag that carries it.
   Trains the ear on ح against its sound-alikes (ه، خ، ج). */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.horse = '<svg viewBox="0 0 140 120"><g ' + O + '>' +
    '<path d="M38 112V84M52 112V86M94 112V84M108 112V84" fill="none" stroke-width="9"/>' +
    '<path d="M38 112V84M52 112V86M94 112V84M108 112V84" fill="none" stroke="#C98A4B" stroke-width="4"/>' +
    '<path d="M30 70c-14 0-22 18-14 30 4-8 10-12 16-14" fill="#5B3A1F"/>' +
    '<ellipse cx="72" cy="72" rx="44" ry="22" fill="#C98A4B"/>' +
    '<path d="M98 66c4-18 6-30 14-40l18 6c6 10 6 18 0 22-6 2-12 0-16-2-2 8-6 14-10 18z" fill="#C98A4B"/>' +
    '<path d="M108 24c-10-2-18 8-20 22 6-6 12-8 18-6M114 22l2-10 8 8" fill="#5B3A1F"/>' +
    '<circle cx="117" cy="37" r="3.6" fill="#1F1F1F" stroke="none"/></g>' +
    '<circle cx="118.3" cy="35.6" r="1.2" fill="#fff"/><ellipse cx="128" cy="49" rx="2" ry="1.4" fill="#1F1F1F"/>' +
    '<ellipse cx="62" cy="64" rx="16" ry="6" fill="#fff" opacity=".25"/></svg>';
  TG.art.flag = function (color) {
    return '<svg viewBox="0 0 80 120"><g ' + O + '><path d="M16 116V8" fill="none" stroke-width="5"/><path d="M18 10h52l-10 22 10 22H18z" fill="' + color + '"/></g></svg>';
  };
  var colors = ["#F2693B", "#11808F", "#7E57C2"];
  var horse = null, home = null;
  TG.register("ح", TG.choice({
    title: "الحصان يسمع", mascot: "horse", cue: "sound", rounds: 5, count: 3, winWord: "سباق حلو!",
    winText: function (c) { return c.T("سمعت الـ ح وعرفتها كل مرة، أنت و", "سمعتِ الـ ح وعرفتيها كل مرة، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var w = c.W, h = c.H;
      c.add('<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
        '<rect width="' + w + '" height="' + h * 0.42 + '" fill="#DDF3F7"/>' +
        '<ellipse cx="' + w * 0.2 + '" cy="' + h * 0.44 + '" rx="' + w * 0.4 + '" ry="' + h * 0.12 + '" fill="#FCE3EA"/>' +
        '<ellipse cx="' + w * 0.85 + '" cy="' + h * 0.45 + '" rx="' + w * 0.42 + '" ry="' + h * 0.1 + '" fill="#F3A6B8"/>' +
        '<rect y="' + h * 0.42 + '" width="' + w + '" height="' + h * 0.58 + '" fill="#A3C93A"/>' +
        '<path d="M0 ' + h * 0.42 + 'H' + w + '" stroke="#fff" stroke-width="6"/>' +
        '<path d="M' + w * 0.5 + ' ' + h * 0.92 + 'C' + w * 0.5 + ' ' + h * 0.7 + ' ' + w * 0.1 + ' ' + h * 0.7 + ' ' + w * 0.18 + ' ' + h * 0.5 + 'M' + w * 0.5 + ' ' + h * 0.92 + 'V' + h * 0.5 + 'M' + w * 0.5 + ' ' + h * 0.92 + 'C' + w * 0.5 + ' ' + h * 0.7 + ' ' + w * 0.9 + ' ' + h * 0.7 + ' ' + w * 0.82 + ' ' + h * 0.5 + '" stroke="#F7E9C6" stroke-width="34" fill="none" stroke-linecap="round"/>' +
        '</svg>', "p-abs");
      home = { x: c.W / 2 - 66, y: c.H * 0.8 - 60 };
      horse = c.add(TG.art.horse, "p-abs", "left:" + home.x + "px;top:" + home.y + "px;width:132px;z-index:3");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 118) + "px;top:" + (c.H - 150) + "px;width:110px;z-index:2");
    },
    intro: function (c) { c.say(c.T("اسمع الحرف، وين يروح الحصان؟", "اسمعي الحرف، وين يروح الحصان؟"), c.W / 2, c.H * 0.75); },
    slots: function (c, n) {
      return [0.18, 0.5, 0.82].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.36 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.flag(colors[i % 3]) + TG.lbl(ch, 42, "top:10px;left:25px"), "", "left:" + (s.x - 40) + "px;top:" + (s.y - 60) + "px;width:80px;height:120px;z-index:2", "button");
    },
    right: function (c, el, s, next) {
      c.sfx.hop && c.sfx.hop();
      var hs = horse.querySelector("svg"); hs.style.transform = s.x < home.x + 66 ? "scaleX(-1)" : "";
      c.move(horse, s.x - 66, s.y + 10, 900, 30, function () {
        c.burst(s.x, s.y - 30); c.say("حاء!", s.x, s.y - 70);
        c.later(function () { c.move(horse, home.x, home.y, 700, 20, function () { hs.style.transform = ""; next(); }); }, 500);
      });
    }
  }));
})();

;
/* ه — هدية: three wrapped gifts; open the one that carries ه and a surprise pops out */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  /* storybook ground used by the set-C games: pink hills, white-edged scalloped bushes, pale meadow */
  TG.art.sceneC = TG.art.sceneC || function (w, h) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
    o += '<ellipse cx="' + w * 0.18 + '" cy="' + h + '" rx="' + w * 0.42 + '" ry="' + h * 0.78 + '" fill="#FCE3EA"/>';
    o += '<ellipse cx="' + w * 0.84 + '" cy="' + h + '" rx="' + w * 0.45 + '" ry="' + h * 0.7 + '" fill="#F3A6B8"/>';
    var yb = h - 44;
    for (var x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + yb + '" r="26" fill="#fff"/>';
    for (var x2 = -10; x2 < w + 40; x2 += 38) o += '<circle cx="' + x2 + '" cy="' + (yb + 3) + '" r="22" fill="#A3C93A"/>';
    o += '<rect x="0" y="' + (yb + 6) + '" width="' + w + '" height="' + (h - yb) + '" fill="#A3C93A"/>';
    o += '<rect x="0" y="' + (h - 28) + '" width="' + w + '" height="28" fill="#E7F2C3"/>';
    for (var k = 0; k < Math.floor(w / 70); k++) { var fx = 30 + k * 70 + (k % 2) * 20; o += '<circle cx="' + fx + '" cy="' + (h - 15) + '" r="4" fill="#fff"/><circle cx="' + (fx + 8) + '" cy="' + (h - 11) + '" r="3" fill="#F3A6B8"/>'; }
    return o + '</svg>';
  };

  function giftBody(fill, rib) {
    return '<svg viewBox="0 0 100 100" class="hg-body"><g ' + O + '><rect x="12" y="40" width="76" height="56" rx="5" fill="' + fill + '"/><rect x="43" y="40" width="14" height="56" fill="' + rib + '"/></g><rect x="18" y="46" width="10" height="40" rx="4" fill="#fff" opacity=".35"/></svg>';
  }
  function giftLid(fill, rib) {
    return '<svg viewBox="0 0 100 50"><g ' + O + '><path d="M50 22c-8-18-30-20-30-8 0 8 16 10 30 8zM50 22c8-18 30-20 30-8 0 8-16 10-30 8z" fill="' + rib + '"/><rect x="6" y="22" width="88" height="24" rx="5" fill="' + fill + '"/><rect x="43" y="22" width="14" height="24" fill="' + rib + '"/></g></svg>';
  }
  TG.art.giftFace = '<svg viewBox="0 0 120 130"><g ' + O + '><path d="M60 34c-10-22-36-24-36-10 0 9 20 12 36 10zM60 34c10-22 36-24 36-10 0 9-20 12-36 10z" fill="#FFCF3D"/><rect x="14" y="54" width="92" height="70" rx="6" fill="#7E57C2"/><rect x="8" y="34" width="104" height="26" rx="6" fill="#7E57C2"/><rect x="52" y="34" width="16" height="90" fill="#FFCF3D"/><ellipse cx="36" cy="84" rx="8" ry="10" fill="#fff"/><ellipse cx="84" cy="84" rx="8" ry="10" fill="#fff"/><path d="M42 104q18 12 36 0" fill="none"/></g><circle cx="37" cy="86" r="4" fill="#1F1F1F"/><circle cx="85" cy="86" r="4" fill="#1F1F1F"/><ellipse cx="26" cy="100" rx="6" ry="3.5" fill="#FF9BB0"/><ellipse cx="94" cy="100" rx="6" ry="3.5" fill="#FF9BB0"/></svg>';
  var SURPRISE = [
    '<svg viewBox="0 0 100 100"><g ' + O + '><path d="M50 6l12 26 28 3-21 19 6 28-25-14-25 14 6-28L10 35l28-3z" fill="#FFCF3D"/></g><circle cx="42" cy="46" r="4" fill="#1F1F1F"/><circle cx="58" cy="46" r="4" fill="#1F1F1F"/><path d="M42 58q8 7 16 0" fill="none" stroke="#1F1F1F" stroke-width="3.5" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 100 120"><g ' + O + '><ellipse cx="50" cy="44" rx="34" ry="40" fill="#F0443A"/><path d="M44 84h12l-6 8z" fill="#F0443A"/><path d="M50 92c-8 10 8 16 0 26" fill="none" stroke-width="3"/></g><ellipse cx="36" cy="30" rx="7" ry="13" fill="#fff" opacity=".5" transform="rotate(20 36 30)"/></svg>',
    '<svg viewBox="0 0 100 110"><g ' + O + '><circle cx="24" cy="22" r="13" fill="#B7793A"/><circle cx="76" cy="22" r="13" fill="#B7793A"/><ellipse cx="50" cy="86" rx="30" ry="22" fill="#B7793A"/><circle cx="50" cy="46" r="32" fill="#B7793A"/><ellipse cx="50" cy="58" rx="14" ry="10" fill="#F2D3A8"/></g><circle cx="38" cy="40" r="4.5" fill="#1F1F1F"/><circle cx="62" cy="40" r="4.5" fill="#1F1F1F"/><ellipse cx="50" cy="54" rx="5" ry="3.5" fill="#1F1F1F"/><path d="M44 62q6 5 12 0" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/></svg>'
  ];
  var COL = [["#F2693B", "#FFCF3D"], ["#11808F", "#F3A6B8"], ["#7E57C2", "#A3C93A"], ["#F3A6B8", "#11808F"], ["#A3C93A", "#F2693B"]];
  var opened = 0;

  TG.register("ه", TG.choice({
    title: "الهدايا", mascot: "giftFace", rounds: 5, count: 3, winWord: "مفاجآت!",
    winText: function (c) { return c.T("فتحت كل هدايا الـ ه، أنت و", "فتحتِ كل هدايا الـ ه، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      opened = 0;
      c.add(TG.art.sceneC(c.W, 140), "p-abs", "left:0;top:" + (c.H - 140) + "px");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 124) + "px;top:" + (c.H - 214) + "px;width:116px;z-index:1");
      /* party table under the gifts and two floating balloons */
      c.add('<svg viewBox="0 0 400 40" preserveAspectRatio="none" width="100%" height="34"><path d="M6 4h388l-14 30H20z" fill="#FCE3EA" stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round"/><path d="M40 4l-8 30M120 4l-4 30M200 4v30M280 4l4 30M360 4l8 30" stroke="#F3A6B8" stroke-width="5"/></svg>', "p-abs", "left:" + (c.W * 0.03) + "px;top:" + (c.H * 0.5 + 52) + "px;width:" + (c.W * 0.94) + "px;z-index:2");
      c.add(SURPRISE[1], "p-abs p-bob", "left:" + (c.W * 0.05) + "px;top:" + (c.H * 0.13) + "px;width:52px;opacity:.9");
      c.add(SURPRISE[1].split("#F0443A").join("#11808F"), "p-abs p-bob", "left:" + (c.W * 0.82) + "px;top:" + (c.H * 0.17) + "px;width:46px;opacity:.9;animation-delay:-1.1s");
    },
    intro: function (c) { c.say(c.T("أي هدية فيها ه؟", "أي هدية فيها ه؟"), c.W / 2, c.H * 0.28); },
    slots: function (c, n) {
      return [0.19, 0.5, 0.81].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.5 }; });
    },
    item: function (c, ch, i, s, round) {
      var col = COL[(round + i) % COL.length];
      var el = c.add(giftBody(col[0], col[1]) + '<div class="hg-lid" style="position:absolute;left:0;top:6px;width:100%;transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .5s">' + giftLid(col[0], col[1]) + '</div>' + TG.lbl(ch, 44, "top:58px"), "",
        "left:" + (s.x - 50) + "px;top:" + (s.y - 55) + "px;width:100px;height:110px;z-index:3", "button");
      el.querySelector(".hg-body").style.cssText = "position:absolute;left:0;bottom:0;width:100px;height:100px";
      return el;
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var lid = el.querySelector(".hg-lid");
      lid.style.transform = "translate(" + (s.x < c.W / 2 ? -34 : 34) + "px,-70px) rotate(" + (s.x < c.W / 2 ? -28 : 28) + "deg)";
      lid.style.opacity = "0";
      var sp = c.add(SURPRISE[opened % SURPRISE.length], "p-abs", "left:" + (s.x - 40) + "px;top:" + (s.y - 50) + "px;width:80px;z-index:4;transform:scale(.2);transition:transform .6s cubic-bezier(.34,1.56,.64,1),top .6s cubic-bezier(.34,1.56,.64,1)");
      opened++;
      c.sfx.ding && c.sfx.ding();
      c.later(function () { sp.style.transform = "scale(1)"; sp.style.top = (s.y - 150) + "px"; c.burst(s.x, s.y - 100); }, 120);
      c.say(["نجمة!", "بالونة!", "دبدوب!", "نجمة ثانية!", "بالونة حمرا!"][opened - 1], s.x, s.y - 160);
      c.later(function () { sp.style.transition = "opacity .3s"; sp.style.opacity = "0"; c.later(function () { sp.remove(); }, 320); next(); }, 1500);
    }
  }));
})();

;
/* ج — جمل: سباق الهجن. The camel runs on the spot while the desert scrolls; golden tokens roll toward it
   in three lanes. Tap the tokens that carry ج before they reach the camel. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.jim_camel = '<svg viewBox="0 0 170 150"><g ' + O + '>' +
    '<path d="M56 144V104M72 144V106M118 144V104M134 144V104" fill="none" stroke-width="10"/>' +
    '<path d="M56 144V104M72 144V106M118 144V104M134 144V104" fill="none" stroke="#D9A35F" stroke-width="4"/>' +
    '<path d="M142 88q14 8 8 26" fill="none"/>' +
    '<path d="M44 104Q38 76 64 70Q80 30 100 62Q114 40 132 66Q150 80 142 104Q132 112 120 110L60 110Q46 110 44 104Z" fill="#D9A35F"/>' +
    '<path d="M50 84Q36 64 32 42L46 38Q54 58 66 74Z" fill="#D9A35F"/>' +
    '<path d="M12 40Q12 26 30 26Q50 26 52 40Q52 50 36 50L18 52Q10 50 12 40Z" fill="#D9A35F"/>' +
    '<path d="M38 26l4-9 5 8" fill="#D9A35F"/>' +
    '<path d="M78 66Q96 50 114 64L116 82L76 82Z" fill="#E2453C"/>' +
    '<path d="M18 46q5 3 10 0" fill="none"/></g>' +
    '<path d="M82 74h30M84 80h28" stroke="#fff" stroke-width="3"/><circle cx="30" cy="36" r="4" fill="#1F1F1F"/><circle cx="31.4" cy="34.6" r="1.4" fill="#fff"/>' +
    '<ellipse cx="88" cy="94" rx="18" ry="6" fill="#fff" opacity=".25"/></svg>';
  TG.art.jim_camelFace = '<svg viewBox="0 0 130 130"><g ' + O + '><path d="M30 126Q26 88 64 84Q102 88 98 126Z" fill="#D9A35F"/><path d="M38 96Q20 70 30 40Q44 18 66 18Q90 18 100 40Q108 70 90 96Q64 108 38 96Z" fill="#D9A35F"/><path d="M36 30l-8-12 14 4M94 30l8-12-14 4" fill="#D9A35F"/><path d="M42 76Q64 66 88 76Q86 96 64 98Q44 96 42 76Z" fill="#F0C98E"/><ellipse cx="50" cy="52" rx="7" ry="9" fill="#fff"/><ellipse cx="80" cy="52" rx="7" ry="9" fill="#fff"/><path d="M54 86q10 7 20 0" fill="none"/><path d="M40 112h48" stroke="#E2453C" stroke-width="10"/></g><circle cx="51" cy="54" r="4" fill="#1F1F1F"/><circle cx="81" cy="54" r="4" fill="#1F1F1F"/><circle cx="56" cy="78" r="2.5" fill="#1F1F1F"/><circle cx="72" cy="78" r="2.5" fill="#1F1F1F"/></svg>';
  TG.art.jim_coin = '<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="35" fill="#FFCF3D" ' + O + '/><circle cx="40" cy="40" r="26" fill="none" stroke="#E0A800" stroke-width="3"/></svg>';

  function desert(w, h, g) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    o += '<circle cx="' + (w * 0.82) + '" cy="' + (h * 0.16) + '" r="34" fill="#FFCF3D"/><circle cx="' + (w * 0.82) + '" cy="' + (h * 0.16) + '" r="46" fill="#FFCF3D" opacity=".25"/>';
    o += '<ellipse cx="' + w * 0.2 + '" cy="' + (h * 0.3) + '" rx="' + w * 0.5 + '" ry="' + h * 0.09 + '" fill="#F7DDA8"/>';
    o += '<ellipse cx="' + w * 0.85 + '" cy="' + (h * 0.31) + '" rx="' + w * 0.45 + '" ry="' + h * 0.07 + '" fill="#F2CF8D"/>';
    o += '<rect y="' + (h * 0.3) + '" width="' + w + '" height="' + h + '" fill="#F7E9C6"/>';
    o += '<path d="M0 ' + g + 'H' + w + '" stroke="#E6CF9C" stroke-width="5" stroke-dasharray="2 22" stroke-linecap="round"/>';
    o += '<g fill="#7CC242" stroke="#1F1F1F" stroke-width="3" stroke-linejoin="round"><path d="M' + (w * 0.1) + ' ' + (h * 0.3 + 6) + 'v-34a8 8 0 0 1 16 0v34zM' + (w * 0.1 - 10) + ' ' + (h * 0.3 - 12) + 'v-10a5 5 0 0 1 10 0v10z"/><path d="M' + (w * 0.62) + ' ' + (h * 0.3 + 4) + 'v-26a7 7 0 0 1 14 0v26z"/></g>';
    return o + '</svg>';
  }
  var css = '.jim-run{position:absolute;left:0;right:0;height:60px;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 60px,#E6CF9C 60px 64px,transparent 64px 130px);animation:jimrun 1.6s linear infinite;opacity:.9}' +
    '@keyframes jimrun{to{background-position:130px 0}}' +
    '.jim-camel{animation:jimgait .5s ease-in-out infinite alternate}@keyframes jimgait{to{translate:0 -6px;rotate:-1.5deg}}' +
    '@media (prefers-reduced-motion:reduce){.jim-run,.jim-camel{animation:none}}';
  var camel = null, lanes = [];
  TG.register("ج", TG.moving({
    title: "سباق الهجن", mascot: "jim_camelFace", need: 5, every: 1.5, max: 4, ratio: 0.5, winWord: "فزت بالسباق!",
    winText: function (c) { return c.T("جمعت جيمات السباق كلها، أنت و", "جمعتِ جيمات السباق كلها، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      c.add('<style>' + css + '</style>', "p-abs");
      var g = Math.round(c.H * 0.8);
      c.add(desert(c.W, c.H, g), "p-abs");
      lanes = [c.H * 0.3, c.H * 0.45, c.H * 0.6];
      lanes.forEach(function (y) { c.add("", "jim-run", "top:" + (y + 18) + "px"); });
      camel = c.add(TG.art.jim_camel, "p-abs jim-camel", "left:" + (c.W - 200) + "px;top:" + (c.H * 0.41) + "px;width:194px;z-index:3");
      c.add(c.api.figHTML(), "fig p-abs", "left:10px;top:" + (c.H - 168) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("الجمل يجري! اضغط على الـ ج", "الجمل يجري! اضغطي على الـ ج"), c.W - 110, c.H * 0.42); },
    spawn: function (c, ch) {
      var el = c.add(TG.art.jim_coin + TG.lbl(ch, 50, "top:13px;left:13px"), "", "width:76px;height:76px;z-index:4", "button");
      var lane = lanes[Math.floor(Math.random() * lanes.length)];
      return { el: el, x: -80, y: lane, vx: c.rnd(46, 62), vy: 0, ph: Math.random() * 6 };
    },
    step: function (c, it, dt) { it.ph += dt * 3; it.y += Math.sin(it.ph) * 6 * dt; },
    out: function (c, it) { return it.x > c.W - 205; },
    caught: function (c, it, done) {
      it.el.style.transform = ""; it.el.style.left = it.x + "px"; it.el.style.top = it.y + "px";
      c.move(it.el, c.W - 120, c.H * 0.43 + 36, 650, 70, function () {
        c.sfx.ding && c.sfx.ding(); c.burst(c.W - 84, c.H * 0.43 + 60);
        c.say(["جيم!", "ثنتين!", "ثلاث!", "أربع!", "خمس!"][Math.min(4, c.score)], c.W - 100, c.H * 0.43);
        done();
      });
    }
  }));
})();

;
/* ك — كرة: three goals, each with a letter on its net; kick the ball into the goal that carries ك */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.ball = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#fff" stroke="#1F1F1F" stroke-width="4"/><path d="M50 32l17 12-6 20H39l-6-20z" fill="#22333F"/><path d="M50 32V8M67 44l20-8M61 64l14 18M39 64L25 82M33 44l-20-8" stroke="#22333F" stroke-width="3" fill="none"/><path d="M40 8a44 44 0 0 1 20 0l-10 8zM88 40a44 44 0 0 1 4 18l-12-4zM70 88a44 44 0 0 1-18 6l4-12zM30 90a44 44 0 0 1-14-12l12-2zM8 56a44 44 0 0 1 4-18l8 10z" fill="#22333F"/><ellipse cx="34" cy="28" rx="10" ry="6" fill="#fff" opacity=".7" transform="rotate(-30 34 28)"/></svg>';
  TG.art.ballFace = '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="#fff" stroke="#1F1F1F" stroke-width="4"/><path d="M60 14l10 8-10 8-10-8zM104 52l-6 12-10-6 4-12zM16 52l6 12 10-6-4-12zM40 100l8-10 8 6-6 10zM80 100l-8-10-8 6 6 10z" fill="#8A1538" stroke="#1F1F1F" stroke-width="3" stroke-linejoin="round"/><ellipse cx="46" cy="58" rx="8" ry="10" fill="#fff" stroke="#1F1F1F" stroke-width="3.5"/><ellipse cx="74" cy="58" rx="8" ry="10" fill="#fff" stroke="#1F1F1F" stroke-width="3.5"/><circle cx="47" cy="60" r="4" fill="#1F1F1F"/><circle cx="75" cy="60" r="4" fill="#1F1F1F"/><path d="M46 78q14 12 28 0" fill="#E8553A" stroke="#1F1F1F" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="34" cy="74" rx="6" ry="3.5" fill="#FF9BB0"/><ellipse cx="86" cy="74" rx="6" ry="3.5" fill="#FF9BB0"/></svg>';
  function goal() {
    var net = "";
    for (var x = 18; x < 112; x += 12) net += '<path d="M' + x + ' 14V80" stroke="#C9D6DC" stroke-width="2"/>';
    for (var y = 24; y < 80; y += 12) net += '<path d="M10 ' + y + 'H112" stroke="#C9D6DC" stroke-width="2"/>';
    return '<svg viewBox="0 0 122 88"><rect x="10" y="12" width="102" height="70" fill="#F4FAFB"/>' + net +
      '<path d="M8 84V10h106v74" fill="none" stroke="#1F1F1F" stroke-width="11" stroke-linejoin="round"/><path d="M8 84V10h106v74" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>';
  }
  function pitch(w, h) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
    o += '<rect width="' + w + '" height="' + h + '" fill="#DDF3F7"/>';
    var top = h * 0.17, n = 7;
    for (var i = 0; i < n; i++) o += '<rect y="' + (top + (h - top) * i / n) + '" width="' + w + '" height="' + ((h - top) / n + 1) + '" fill="' + (i % 2 ? "#CFEAB0" : "#C2E39C") + '"/>';
    o += '<path d="M0 ' + top + 'H' + w + '" stroke="#fff" stroke-width="5"/>';
    o += '<circle cx="' + w / 2 + '" cy="' + h * 0.78 + '" r="' + w * 0.2 + '" fill="none" stroke="#fff" stroke-width="4"/><circle cx="' + w / 2 + '" cy="' + h * 0.78 + '" r="5" fill="#fff"/>';
    o += '<rect x="' + w * 0.06 + '" y="' + top + '" width="' + w * 0.88 + '" height="' + h * 0.3 + '" fill="none" stroke="#fff" stroke-width="4"/>';
    /* maroon-and-white bunting over the stands */
    var y0 = top - 34, step = 30;
    o += '<path d="M0 ' + (y0 - 4) + 'Q' + w / 2 + ' ' + (y0 + 12) + ' ' + w + ' ' + (y0 - 4) + '" fill="none" stroke="#22333F" stroke-width="2"/>';
    for (var k = 0, x = 6; x < w; x += step, k++) {
      var yy = y0 - 4 + 16 * (1 - Math.pow((x - w / 2) / (w / 2), 2)) * 0.5;
      o += '<path d="M' + x + ' ' + yy + 'h20l-10 16z" fill="' + (k % 2 ? "#fff" : "#8A1538") + '" stroke="#22333F" stroke-width="1.5" stroke-linejoin="round"/>';
    }
    return o + '</svg>';
  }
  var ball = null, spot = null, goals = 0;
  TG.register("ك", TG.choice({
    title: "سدّد الكرة", mascot: "ballFace", rounds: 5, count: 3, winWord: "قووول!",
    winText: function (c) { return c.T("سجّلت خمس أهداف بحرف الكاف، أنت و", "سجّلتِ خمس أهداف بحرف الكاف، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      goals = 0;
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      c.add(pitch(c.W, c.H), "p-abs");
      spot = { x: c.W / 2 - 30, y: c.H * 0.78 - 30 };
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W / 2 + 34) + "px;top:" + (c.H * 0.78 - 100) + "px;width:116px;z-index:2");
      ball = c.add(TG.art.ball, "p-abs", "left:" + spot.x + "px;top:" + spot.y + "px;width:60px;height:60px;z-index:4");
    },
    intro: function (c) { c.say(c.T("سدّد على مرمى الكاف!", "سدّدي على مرمى الكاف!"), c.W / 2, c.H * 0.62); },
    slots: function (c, n) {
      var gw = Math.min(118, (c.W - 40) / 3);
      return [0.18, 0.5, 0.82].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.3, w: gw }; });
    },
    item: function (c, ch, i, s) {
      return c.add(goal() + TG.lbl(ch, 46, "top:24px"), "", "left:" + (s.x - s.w / 2) + "px;top:" + (s.y - s.w * 0.36) + "px;width:" + s.w + "px;height:" + (s.w * 0.72) + "px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      c.sfx.hop && c.sfx.hop();
      var spin = ball.querySelector("svg");
      if (spin.animate) spin.animate([{ transform: "rotate(0)" }, { transform: "rotate(-540deg)" }], { duration: 700, easing: "ease-out" });
      c.move(ball, s.x - 22, s.y - 6, 700, 70, function () {
        goals++;
        ball.style.transition = "transform .3s"; ball.style.transform = "scale(.75)";
        el.classList.remove("p-no"); void el.offsetWidth; el.classList.add("p-no");
        c.sfx.ding && c.sfx.ding(); c.burst(s.x, s.y);
        c.say(goals === 5 ? "قووووول!" : "قول!", s.x, s.y - s.w * 0.4);
        c.later(function () {
          ball.style.transform = "";
          c.move(ball, spot.x, spot.y, 600, 0, next);
        }, 900);
      });
    }
  }));
})();

;
/* خ — خروف: three sheep graze, each carries a letter. Tap the خ sheep and it trots into the pen. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  function hills(w, h, g) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    o += '<ellipse cx="' + w * 0.15 + '" cy="' + g + '" rx="' + w * 0.42 + '" ry="' + h * 0.12 + '" fill="#FCE3EA"/><ellipse cx="' + w * 0.86 + '" cy="' + (g + 6) + '" rx="' + w * 0.46 + '" ry="' + h * 0.1 + '" fill="#F3A6B8"/>';
    for (var x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + g + '" r="26" fill="#fff"/>';
    for (x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + (g + 3) + '" r="22" fill="#A3C93A"/>';
    o += '<rect y="' + (g + 3) + '" width="' + w + '" height="' + (h - g) + '" fill="#A3C93A"/><rect y="' + (g + 30) + '" width="' + w + '" height="' + (h - g) + '" fill="#E7F2C3"/>';
    for (x = 24; x < w; x += 58) o += '<path d="M' + x + ' ' + (g + 70 + (x % 4) * 30) + 'l4-10 4 10M' + (x + 10) + ' ' + (g + 72 + (x % 4) * 30) + 'l3-8 3 8" stroke="#8DB832" stroke-width="3" fill="none" stroke-linecap="round"/>';
    return o + '</svg>';
  }
  function sheep(face) {
    var o = '<svg viewBox="0 0 120 104"><g ' + O + '>' +
      '<path d="M40 84v16M54 86v16M78 86v16M92 84v16" fill="none" stroke-width="7"/>' +
      '<path d="M30 62a14 14 0 0 1 8-24a16 16 0 0 1 26-12a16 16 0 0 1 28 4a14 14 0 0 1 14 20a14 14 0 0 1-8 24a16 16 0 0 1-26 6a16 16 0 0 1-28-2a14 14 0 0 1-14-16z" fill="#fff"/>' +
      '<ellipse cx="22" cy="50" rx="15" ry="18" fill="#4A4A4A"/>' +
      '<path d="M10 40q-10 2-8 10 6 2 10-2M34 40q8-2 10 6-6 4-10 0" fill="#4A4A4A"/>' +
      '<path d="M14 38q8-10 16 0" fill="#fff" stroke-width="3"/></g>' +
      '<ellipse cx="16" cy="50" rx="4" ry="5" fill="#fff"/><ellipse cx="28" cy="50" rx="4" ry="5" fill="#fff"/><circle cx="16.5" cy="51" r="2.4" fill="#1F1F1F"/><circle cx="28.5" cy="51" r="2.4" fill="#1F1F1F"/>' +
      (face ? '<path d="M17 60q5 4 10 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="10" cy="58" rx="3.5" ry="2" fill="#FF9BB0"/><ellipse cx="34" cy="58" rx="3.5" ry="2" fill="#FF9BB0"/>' : '') +
      '</svg>';
    return o;
  }
  TG.art.kha_sheep = sheep(false);
  TG.art.kha_sheepFace = sheep(true);
  function pen(w, h) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
    o += '<rect x="6" y="' + (h * 0.3) + '" width="' + (w - 12) + '" height="' + (h * 0.66) + '" rx="10" fill="#E7F2C3"/>';
    o += '<g stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round">';
    for (var x = 8; x <= w - 8; x += (w - 16) / 5) o += '<rect x="' + (x - 6) + '" y="' + (h * 0.22) + '" width="12" height="' + (h * 0.4) + '" rx="3" fill="#C98A4B"/>';
    o += '<rect x="4" y="' + (h * 0.3) + '" width="' + (w - 8) + '" height="9" rx="4" fill="#D9A35F"/><rect x="4" y="' + (h * 0.46) + '" width="' + (w - 8) + '" height="9" rx="4" fill="#D9A35F"/>';
    return o + '</g></svg>';
  }
  var penBox = null, inPen = 0;
  TG.register("خ", TG.choice({
    title: "خرفان الحوش", mascot: "kha_sheepFace", rounds: 5, count: 3, winWord: "دخلوا الحوش!",
    winText: function (c) { return c.T("دخّلت خرفان الـ خ كلها الحوش، أنت و", "دخّلتِ خرفان الـ خ كلها الحوش، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      inPen = 0;
      c.add(hills(c.W, c.H, Math.round(c.H * 0.17)), "p-abs");
      var pw = Math.min(c.W - 24, 360), ph = 150;
      penBox = { x: (c.W - pw) / 2, y: c.H * 0.13, w: pw, h: ph };
      c.add(pen(Math.round(pw), ph), "p-abs", "left:" + penBox.x + "px;top:" + penBox.y + "px;z-index:1");
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (c.H - 168) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("دخّل خروف الـ خ الحوش!", "دخّلي خروف الـ خ الحوش!"), c.W / 2, c.H * 0.5); },
    slots: function (c, n) {
      var pts = [[0.22, 0.52], [0.72, 0.5], [0.5, 0.67], [0.8, 0.72]];
      return c.shuffle(pts.slice()).slice(0, n).map(function (p) { return { x: c.W * p[0] + c.rnd(-10, 10), y: c.H * p[1] + c.rnd(-8, 8) }; });
    },
    item: function (c, ch, i, s) {
      var el = c.add(TG.art.kha_sheep + TG.lbl(ch, 46, "top:26px;left:50px"), "", "left:" + (s.x - 58) + "px;top:" + (s.y - 50) + "px;width:116px;height:100px;z-index:3", "button");
      el.firstChild.style.transform = s.x > c.W / 2 ? "scaleX(-1)" : "";
      return el;
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var k = penBox, tx = k.x + 22 + (inPen % 5) * ((k.w - 90) / 4), ty = k.y + 46 + (inPen % 2) * 10;
      c.sfx.hop && c.sfx.hop();
      c.move(el, tx, ty, 1300, 46, function () {
        inPen++;
        el.style.transition = "width .3s,height .3s"; el.style.width = "80px"; el.style.height = "70px";
        var l = el.querySelector(".p-lbl"); if (l) l.style.display = "none";
        el.removeAttribute("data-ok"); el.classList.add("p-done"); el.style.zIndex = "2";
        c.burst(tx + 40, ty + 30); c.say(["ماع! خاء!", "ثنتين!", "ثلاث!", "أربع!", "خمس!"][inPen - 1], tx + 40, ty);
        c.later(next, 600);
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { if (!it.classList.contains("p-done")) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 300); } });
      c.later(next, 340);
    }
  }));
})();

;
/* ل — ليمون: memory cards. Eight cards with lemons on the back; flip two at a time and find the four pairs (ل ل and three look-alikes) */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.lemon = '<svg viewBox="0 0 100 80"><g ' + O + '><path d="M10 44c0-20 20-34 40-34s40 14 40 34-20 30-40 30S10 64 10 44z" fill="#FFE14D"/><path d="M50 10c4-6 12-8 18-6-4 8-12 10-18 6z" fill="#7CC242"/></g><ellipse cx="34" cy="34" rx="10" ry="6" fill="#fff" opacity=".6" transform="rotate(-20 34 34)"/></svg>';
  TG.art.lemonFace = '<svg viewBox="0 0 120 110"><g ' + O + '><path d="M10 60c0-28 24-46 50-46s50 18 50 46-24 42-50 42S10 88 10 60z" fill="#FFE14D"/><path d="M60 14c6-8 16-10 24-8-6 10-16 12-24 8z" fill="#7CC242"/><ellipse cx="46" cy="56" rx="7" ry="9" fill="#fff"/><ellipse cx="74" cy="56" rx="7" ry="9" fill="#fff"/><path d="M48 74q12 10 24 0" fill="none"/></g><circle cx="47" cy="58" r="3.6" fill="#1F1F1F"/><circle cx="75" cy="58" r="3.6" fill="#1F1F1F"/><ellipse cx="34" cy="70" rx="6" ry="3.5" fill="#FF9BB0"/><ellipse cx="86" cy="70" rx="6" ry="3.5" fill="#FF9BB0"/></svg>';
  var CSS = ".p-stage .lm-card{perspective:700px}" +
    ".lm-in{position:absolute;inset:0;transition:transform .45s cubic-bezier(.22,1,.36,1);transform-style:preserve-3d}" +
    ".lm-card.open .lm-in{transform:rotateY(180deg)}" +
    ".lm-f,.lm-b{position:absolute;inset:0;border-radius:16px;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:grid;place-items:center;border:3px solid #1F1F1F;box-shadow:0 4px 0 rgba(34,51,63,.2)}" +
    ".lm-b{background:#FFF3C9}.lm-b svg{width:72%;height:auto}" +
    ".lm-f{background:#fff;transform:rotateY(180deg)}" +
    ".lm-card.done .lm-f{background:#E7F2C3;border-color:#46831A}" +
    ".lm-card.done.mine .lm-f{background:#FFE14D}";

  TG.register("ل", {
    title: "بطاقات الليمون", mascot: "lemonFace", winWord: "لاقيت الكل!",
    goal: function (T) { return T("دوّر على", "دوّري على"); },
    winText: function (c) { return c.T("لاقيت كل الأزواج، أنت و", "لاقيتِ كل الأزواج، أنتِ و") + c.api.friendName(); },
    start: function (c) {
      c.total = 4; c.setScore(0);
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      var st = document.createElement("style"); st.textContent = CSS; c.stage.appendChild(st);
      c.add(TG.art.sceneC ? TG.art.sceneC(c.W, 130) : "", "p-abs", "left:0;top:" + (c.H - 130) + "px");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 120) + "px;top:" + (c.H - 200) + "px;width:112px;z-index:1");
      var letters = [c.ch].concat(c.alike(3)), deck = c.shuffle(letters.concat(letters));
      var cw = Math.min(84, Math.floor((c.W - 32 - 30) / 4)), chh = Math.round(cw * 1.28);
      var gw = cw * 4 + 30, x0 = (c.W - gw) / 2, y0 = Math.max(96, Math.round(c.H * 0.42 - chh - 7));
      var cards = [], open = [], busy = false;
      deck.forEach(function (ch, i) {
        var col = i % 4, row = Math.floor(i / 4);
        var el = c.add('<div class="lm-in"><div class="lm-b">' + TG.art.lemon + '</div><div class="lm-f">' + TG.lbl(ch, Math.round(cw * 0.72), "box-shadow:none") + '</div></div>', "lm-card p-item",
          "left:" + (x0 + col * (cw + 10)) + "px;top:" + (y0 + row * (chh + 14)) + "px;width:" + cw + "px;height:" + chh + "px;z-index:3", "button");
        el.setAttribute("aria-label", "بطاقة " + (i + 1));
        var card = { el: el, ch: ch, done: false };
        el.addEventListener("click", function () { flip(card); });
        cards.push(card);
      });
      function flip(card) {
        if (busy || card.done || open.indexOf(card) >= 0 || !c.alive) return;
        c.api.unlock();
        card.el.classList.add("open"); c.sfx.tap && c.sfx.tap();
        open.push(card);
        if (open.length < 2) return;
        busy = true;
        var a = open[0], b = open[1];
        if (a.ch === b.ch) {
          c.later(function () {
            a.done = b.done = true;
            a.el.classList.add("done"); b.el.classList.add("done");
            if (a.ch === c.ch) { a.el.classList.add("mine"); b.el.classList.add("mine"); c.speak(); } else c.api.tts(c.name(a.ch));
            var r = b.el.getBoundingClientRect(), s = c.stage.getBoundingClientRect();
            c.burst(r.left - s.left + r.width / 2, r.top - s.top + r.height / 2);
            c.sfx.ding && c.sfx.ding();
            c.say(a.ch === c.ch ? "لام ولام!" : c.T("نفس الحرف!", "نفس الحرف!"), r.left - s.left + r.width / 2, r.top - s.top - 8);
            c.setScore(c.score + 1);
            open = []; busy = false;
            if (c.score >= c.total) c.later(c.win, 900);
          }, 450);
        } else {
          c.later(function () {
            c.sfx.no && c.sfx.no();
            c.say(c.T("مو نفس الحرف، جرّب مرة ثانية", "مو نفس الحرف، جرّبي مرة ثانية"), c.W / 2, y0 - 8);
            c.later(function () { a.el.classList.remove("open"); b.el.classList.remove("open"); open = []; busy = false; }, 650);
          }, 650);
        }
      }
      /* test hook: flip one matching pair */
      c.def.auto = function (cx) {
        if (busy || !cx.alive || cx.score >= cx.total) return;
        var first = open[0] || cards.filter(function (k) { return !k.done; })[0];
        if (!first) return;
        var mate = cards.filter(function (k) { return k !== first && !k.done && k.ch === first.ch; })[0];
        if (!open.length) flip(first);
        if (mate) flip(mate);
      };
      c.later(function () { c.speak(); c.say(c.T("اقلب بطاقتين ولاقِ الشبيه", "اقلبي بطاقتين ولاقي الشبيه"), c.W / 2, y0 - 8); }, 350);
    }
  });
})();

;
/* م — متاهة الميم: a hedge maze; at each of five junctions three paths end at signs, and the friend walks the path whose sign carries م */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  var SIGN = '<svg viewBox="0 0 90 110"><g ' + O + '><path d="M45 50v58" stroke-width="9"/><path d="M45 50v58" stroke="#B7793A" stroke-width="4"/><rect x="6" y="4" width="78" height="56" rx="10" fill="#D9984A"/></g><rect x="12" y="10" width="20" height="8" rx="4" fill="#fff" opacity=".35"/></svg>';
  TG.art.bushFace = '<svg viewBox="0 0 130 110"><g ' + O + '><path d="M18 100c-16-2-16-30 2-32-8-20 14-34 28-22 4-22 34-22 40 0 14-12 34 2 26 22 18 2 18 30 2 32z" fill="#7CC242"/><ellipse cx="50" cy="66" rx="8" ry="10" fill="#fff"/><ellipse cx="80" cy="66" rx="8" ry="10" fill="#fff"/><path d="M52 84q13 10 26 0" fill="none"/></g><circle cx="51" cy="68" r="4" fill="#1F1F1F"/><circle cx="81" cy="68" r="4" fill="#1F1F1F"/><ellipse cx="38" cy="80" rx="6" ry="3.5" fill="#FF9BB0"/><ellipse cx="92" cy="80" rx="6" ry="3.5" fill="#FF9BB0"/><circle cx="34" cy="44" r="5" fill="#F3A6B8"/><circle cx="98" cy="40" r="5" fill="#FFCF3D"/></svg>';
  var GATE = '<svg viewBox="0 -24 160 174"><g ' + O + '><path d="M20 146V60a60 60 0 0 1 120 0v86h-24V62a36 36 0 0 0-72 0v84z" fill="#F2693B"/><path d="M80 8V-14" /><path d="M80 -14h34l-8 10 8 10H80" fill="#FFCF3D"/></g><path d="M30 120V64a50 50 0 0 1 26-42" stroke="#fff" stroke-width="5" fill="none" opacity=".4" stroke-linecap="round"/></svg>';

  var maze = null, walker = null, start = null, ends = null, step = 0;
  function drawMaze(c) {
    var w = c.W, h = c.H, sx = w / 2, sy = h * 0.86;
    ends = [{ x: w * 0.17, y: h * 0.4 }, { x: w * 0.5, y: h * 0.33 }, { x: w * 0.83, y: h * 0.4 }];
    var paths = [
      "M" + sx + " " + sy + "Q" + w * 0.16 + " " + h * 0.76 + " " + ends[0].x + " " + ends[0].y,
      "M" + sx + " " + sy + "C" + w * 0.62 + " " + h * 0.68 + " " + w * 0.38 + " " + h * 0.5 + " " + ends[1].x + " " + ends[1].y,
      "M" + sx + " " + sy + "Q" + w * 0.84 + " " + h * 0.76 + " " + ends[2].x + " " + ends[2].y
    ];
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
    /* the hedge block, scalloped on top, then the paths carved through it */
    var ht = h * 0.3;
    o += '<rect x="0" y="' + (ht + 10) + '" width="' + w + '" height="' + (h - ht) + '" fill="#7CC242"/>';
    for (var x = -6; x < w + 30; x += 34) o += '<circle cx="' + x + '" cy="' + (ht + 12) + '" r="22" fill="#fff"/>';
    for (var x2 = -6; x2 < w + 30; x2 += 34) o += '<circle cx="' + x2 + '" cy="' + (ht + 15) + '" r="18" fill="#7CC242"/>';
    for (var k = 0; k < 26; k++) o += '<circle cx="' + ((k * 73) % w) + '" cy="' + (ht + 40 + (k * 47) % (h - ht - 60)) + '" r="' + (10 + (k % 3) * 4) + '" fill="#5FA62E" opacity=".45"/>';
    paths.forEach(function (d) { o += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="62" stroke-linecap="round"/>'; });
    paths.forEach(function (d) { o += '<path d="' + d + '" fill="none" stroke="#F7E9C6" stroke-width="50" stroke-linecap="round"/>'; });
    paths.forEach(function (d) { o += '<path d="' + d + '" fill="none" stroke="#E8CF94" stroke-width="3" stroke-dasharray="2 16" stroke-linecap="round"/>'; });
    o += '<circle cx="' + sx + '" cy="' + sy + '" r="38" fill="#F7E9C6"/>';
    return o + '</svg>';
  }

  TG.register("م", TG.choice({
    title: "متاهة الميم", mascot: "bushFace", rounds: 5, count: 3, winWord: "طلعنا!",
    goal: function (T) { return T("امشِ ورا", "امشي ورا"); },
    winText: function (c) { return c.T("طلعت من متاهة الميم، أنت و", "طلعتِ من متاهة الميم، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      step = 0;
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      maze = c.add(drawMaze(c), "p-abs", "transition:opacity .35s");
      start = { x: c.W / 2 - 50, y: c.H * 0.86 - 104 };
      walker = c.add(c.api.figHTML(), "fig p-abs", "left:" + start.x + "px;top:" + start.y + "px;width:100px;z-index:4");
    },
    intro: function (c) { c.say(c.T("أي طريق فيه م؟", "أي طريق فيه م؟"), c.W / 2, c.H * 0.86 - 112); },
    slots: function (c, n) { return ends.slice(0, n); },
    item: function (c, ch, i, s) {
      return c.add(SIGN + TG.lbl(ch, 44, "top:9px"), "", "left:" + (s.x - 45) + "px;top:" + (s.y - 104) + "px;width:90px;height:110px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      step++;
      walker.classList.add("p-bob");
      c.sfx.hop && c.sfx.hop();
      /* walk along the path in two legs so the friend follows the curve */
      var mid = { x: (start.x + s.x - 50) / 2 + (s.x < c.W / 2 ? -30 : s.x > c.W / 2 ? 30 : 0), y: (start.y + s.y - 100) / 2 + 30 };
      c.move(walker, mid.x, mid.y, 700, 0, function () {
        c.move(walker, s.x - 50, s.y - 100, 700, 0, function () {
          walker.classList.remove("p-bob");
          c.burst(s.x, s.y - 50); c.sfx.ding && c.sfx.ding();
          c.say(step < 5 ? ["ميم!", "كمل!", "قربنا!", "باقي وحدة!"][step - 1] : "الباب!", s.x, s.y - 112);
          if (step < 5) {
            c.later(function () {
              maze.style.opacity = "0";
              Array.prototype.forEach.call(c.stage.querySelectorAll(".p-item"), function (it) { it.classList.add("p-gone"); });
              c.later(function () {
                walker.style.left = start.x + "px"; walker.style.top = start.y + "px";
                maze.style.opacity = "1"; next();
              }, 380);
            }, 700);
            return;
          }
          /* fifth junction: the exit gate rises at the top and the friend walks out through it */
          c.later(function () {
            Array.prototype.forEach.call(c.stage.querySelectorAll(".p-item"), function (it) { it.classList.add("p-gone"); });
            var gate = c.add(GATE, "p-abs", "left:" + (c.W / 2 - 80) + "px;top:" + (c.H * 0.12) + "px;width:160px;z-index:3;transform:scale(.3);transition:transform .6s cubic-bezier(.34,1.56,.64,1)");
            c.later(function () { gate.style.transform = "scale(1)"; }, 30);
            c.later(function () {
              walker.classList.add("p-bob");
              c.move(walker, c.W / 2 - 50, c.H * 0.12 + 50, 1000, 0, function () {
                walker.classList.remove("p-bob"); c.burst(c.W / 2, c.H * 0.12 + 80); next();
              });
            }, 700);
          }, 600);
        });
      });
    },
    clear: function (c, items, go) {
      items.forEach(function (it) { it.remove(); });
      go();
    }
  }));
})();

;
/* ن — نخلة: dates fall from the palm; catch the ones that carry ن into the basket */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.date = '<svg viewBox="0 0 80 100"><g ' + O + '><ellipse cx="40" cy="54" rx="30" ry="40" fill="#8A4B22"/><path d="M40 14c-2-6 0-10 4-12" fill="none"/></g><ellipse cx="28" cy="40" rx="6" ry="14" fill="#fff" opacity=".3"/></svg>';
  TG.art.palm = function (w, h) {
    var cx = w / 2, o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><g ' + O + '>';
    o += '<path d="M' + (cx - 14) + ' ' + h + 'C' + (cx - 8) + ' ' + h * 0.6 + ' ' + (cx - 10) + ' ' + h * 0.4 + ' ' + (cx - 6) + ' ' + h * 0.22 + 'h14C' + (cx + 6) + ' ' + h * 0.4 + ' ' + (cx + 12) + ' ' + h * 0.6 + ' ' + (cx + 16) + ' ' + h + 'z" fill="#B7793A"/>';
    for (var y = h * 0.3; y < h; y += 26) o += '<path d="M' + (cx - 12) + ' ' + y + 'q12 8 26 0" fill="none" stroke-width="3"/>';
    var fr = [[-1, -0.1], [-0.9, 0.25], [-0.55, 0.45], [1, -0.1], [0.9, 0.25], [0.55, 0.45], [-0.2, -0.35], [0.25, -0.35]];
    fr.forEach(function (f) {
      var ex = cx + f[0] * w * 0.46, ey = h * 0.2 + f[1] * h * 0.3;
      o += '<path d="M' + cx + ' ' + h * 0.2 + 'Q' + (cx + (ex - cx) * 0.5) + ' ' + (Math.min(ey, h * 0.2) - 40) + ' ' + ex + ' ' + ey + 'Q' + (cx + (ex - cx) * 0.55) + ' ' + (Math.min(ey, h * 0.2) - 12) + ' ' + cx + ' ' + h * 0.2 + 'z" fill="#5FA62E"/>';
    });
    o += '<circle cx="' + (cx - 16) + '" cy="' + (h * 0.25) + '" r="9" fill="#8A4B22"/><circle cx="' + (cx + 4) + '" cy="' + (h * 0.27) + '" r="9" fill="#8A4B22"/><circle cx="' + (cx + 20) + '" cy="' + (h * 0.24) + '" r="9" fill="#8A4B22"/>';
    return o + '</g></svg>';
  };
  TG.art.palmFace = '<svg viewBox="0 0 120 130"><g ' + O + '><path d="M50 128c4-30 2-56 6-80h12c4 24 2 50 6 80z" fill="#B7793A"/><path d="M62 46Q30 6 4 30Q34 24 62 46zM62 46Q94 6 118 30Q90 24 62 46zM62 46Q40 20 30 4Q56 14 62 46zM62 46Q84 20 94 4Q68 14 62 46z" fill="#5FA62E"/><circle cx="50" cy="52" r="8" fill="#8A4B22"/><circle cx="74" cy="52" r="8" fill="#8A4B22"/><ellipse cx="54" cy="84" rx="5" ry="7" fill="#fff"/><ellipse cx="70" cy="84" rx="5" ry="7" fill="#fff"/><path d="M54 100q8 7 16 0" fill="none"/></g><circle cx="55" cy="86" r="3" fill="#1F1F1F"/><circle cx="71" cy="86" r="3" fill="#1F1F1F"/></svg>';

  var bx = 0;
  TG.register("ن", TG.moving({
    title: "رطب النخلة", mascot: "palmFace", need: 5, every: 1.15, max: 5, ratio: 0.45, winWord: "رطب لذيذ!",
    winText: function (c) { return c.T("جمعت رطب الـ ن كله، أنت و", "جمعتِ رطب الـ ن كله، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var pw = Math.min(c.W * 0.95, 420), ph = Math.min(c.H * 0.55, 420);
      c.add(TG.art.palm(Math.round(pw), Math.round(ph)), "p-abs", "left:" + (c.W - pw) / 2 + "px;top:" + (c.H * 0.08) + "px;z-index:0");
      c.top = c.H * 0.08 + ph * 0.24;
      bx = c.W / 2 - 70;
      c.basket = c.add(TG.art.basket || "", "p-abs", "left:" + bx + "px;top:" + (c.H - 120) + "px;width:140px;z-index:4");
      c.add(c.api.figHTML(), "fig p-abs", "left:12px;top:" + (c.H - 180) + "px;width:110px;z-index:3");
    },
    spawn: function (c, ch) {
      var el = c.add(TG.art.date + TG.lbl(ch, 42, "top:26px"), "", "width:70px;height:88px;z-index:5", "button");
      return { el: el, x: c.rnd(c.W * 0.12, c.W * 0.88 - 70), y: c.top, vx: 0, vy: c.rnd(62, 92), ph: Math.random() * 6 };
    },
    step: function (c, it, dt) { it.ph += dt * 2; it.x += Math.sin(it.ph) * 14 * dt; },
    out: function (c, it) { return it.y > c.H + 10; },
    caught: function (c, it, done) {
      it.el.style.transform = "";
      it.el.style.left = it.x + "px"; it.el.style.top = it.y + "px";
      c.move(it.el, c.W / 2 - 35 + c.rnd(-24, 24), c.H - 150, 520, 40, function () {
        c.sfx.plop && c.sfx.plop(); c.burst(c.W / 2, c.H - 110);
        c.say(["رطبة!", "ثنتين!", "ثلاث!", "أربع!", "خمس!"][Math.min(4, c.score)], c.W / 2, c.H - 140);
        done();
      });
    }
  }));
})();

;
/* ق — قطار: crates wait on the platform; load the ones that carry ق into the wagon, then the train toots and leaves */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.crate = '<svg viewBox="0 0 100 100"><g ' + O + '><rect x="8" y="8" width="84" height="84" rx="6" fill="#D9984A"/></g><path d="M8 36h84M8 64h84" stroke="#A86B2D" stroke-width="3"/><path d="M14 14l72 72M86 14L14 86" stroke="#C07F3C" stroke-width="5" opacity=".55"/><rect x="8" y="8" width="84" height="84" rx="6" fill="none" stroke="#1F1F1F" stroke-width="4"/><rect x="14" y="14" width="10" height="16" rx="3" fill="#fff" opacity=".35"/></svg>';
  TG.art.engine = '<svg viewBox="0 0 150 112"><g ' + O + '>' +
    '<path d="M6 92l14-18h10v18z" fill="#F0443A"/>' +
    '<rect x="24" y="22" width="18" height="30" rx="3" fill="#22333F"/><path d="M18 22h30" stroke-width="6"/>' +
    '<rect x="16" y="46" width="78" height="38" rx="18" fill="#11808F"/>' +
    '<rect x="84" y="18" width="58" height="68" rx="6" fill="#F2693B"/><path d="M78 16h70" stroke-width="7"/>' +
    '<rect x="96" y="30" width="34" height="26" rx="4" fill="#DDF3F7"/>' +
    '<circle cx="34" cy="92" r="14" fill="#22333F"/><circle cx="68" cy="92" r="14" fill="#22333F"/><circle cx="114" cy="90" r="17" fill="#22333F"/></g>' +
    '<circle cx="34" cy="92" r="4" fill="#fff"/><circle cx="68" cy="92" r="4" fill="#fff"/><circle cx="114" cy="90" r="5" fill="#fff"/>' +
    '<ellipse cx="34" cy="62" rx="5" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="3"/><circle cx="33" cy="63" r="3" fill="#1F1F1F"/>' +
    '<path d="M26 74q8 5 16 0" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/><rect x="22" y="52" width="34" height="6" rx="3" fill="#fff" opacity=".35"/></svg>';
  TG.art.wagon = '<svg viewBox="0 0 210 80"><g ' + O + '><path d="M2 50h10" /><rect x="10" y="24" width="192" height="38" rx="6" fill="#FFCF3D"/><circle cx="44" cy="66" r="12" fill="#22333F"/><circle cx="168" cy="66" r="12" fill="#22333F"/></g><circle cx="44" cy="66" r="4" fill="#fff"/><circle cx="168" cy="66" r="4" fill="#fff"/><path d="M18 36h176" stroke="#E2A800" stroke-width="3"/></svg>';
  TG.art.trainFace = '<svg viewBox="0 0 150 120"><g ' + O + '><rect x="24" y="22" width="18" height="30" rx="3" fill="#22333F"/><rect x="16" y="46" width="78" height="40" rx="18" fill="#11808F"/><rect x="84" y="18" width="58" height="70" rx="6" fill="#F2693B"/><rect x="96" y="30" width="34" height="26" rx="4" fill="#DDF3F7"/><circle cx="34" cy="96" r="14" fill="#22333F"/><circle cx="68" cy="96" r="14" fill="#22333F"/><circle cx="114" cy="94" r="17" fill="#22333F"/><ellipse cx="102" cy="68" rx="6" ry="8" fill="#fff"/><ellipse cx="124" cy="68" rx="6" ry="8" fill="#fff"/><path d="M104 80q9 7 18 0" fill="none"/></g><circle cx="103" cy="70" r="3.5" fill="#1F1F1F"/><circle cx="125" cy="70" r="3.5" fill="#1F1F1F"/><circle cx="30" cy="12" r="8" fill="#fff" opacity=".9"/><circle cx="44" cy="6" r="6" fill="#fff" opacity=".8"/></svg>';

  var train = null, loaded = 0, trackY = 0;
  function toot(c) {
    var t = c.api.tone; if (!t) return;
    t(392, 0, 0.35, "square", 0.05); t(494, 0, 0.35, "square", 0.04);
    t(392, 0.45, 0.5, "square", 0.05); t(494, 0.45, 0.5, "square", 0.04);
  }
  TG.register("ق", TG.choice({
    title: "قطار القاف", mascot: "trainFace", rounds: 5, count: 3, winWord: "طوط طوط!",
    winText: function (c) { return c.T("حمّلت كل صناديق الـ ق، أنت و", "حمّلتِ كل صناديق الـ ق، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      loaded = 0;
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      var w = c.W, h = c.H; trackY = Math.round(h * 0.4);
      var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
      o += '<ellipse cx="' + w * 0.15 + '" cy="' + trackY + '" rx="' + w * 0.42 + '" ry="' + h * 0.13 + '" fill="#FCE3EA"/>';
      o += '<ellipse cx="' + w * 0.82 + '" cy="' + trackY + '" rx="' + w * 0.46 + '" ry="' + h * 0.1 + '" fill="#F3A6B8"/>';
      o += '<rect y="' + trackY + '" width="' + w + '" height="' + (h - trackY) + '" fill="#E7F2C3"/>';
      for (var x = 4; x < w; x += 22) o += '<rect x="' + x + '" y="' + (trackY - 4) + '" width="12" height="12" rx="2" fill="#B7793A"/>';
      o += '<path d="M0 ' + (trackY - 2) + 'H' + w + 'M0 ' + (trackY + 5) + 'H' + w + '" stroke="#5D6F7C" stroke-width="3"/>';
      /* the platform the crates wait on */
      var py = Math.round(h * 0.6);
      o += '<rect x="0" y="' + py + '" width="' + w + '" height="' + Math.round(h * 0.26) + '" fill="#F7E9C6"/>';
      o += '<path d="M0 ' + py + 'H' + w + '" stroke="#fff" stroke-width="8"/><path d="M0 ' + (py + 6) + 'H' + w + '" stroke="#E8CF94" stroke-width="3"/>';
      for (var k = 0; k < w; k += 36) o += '<path d="M' + k + ' ' + (py + 20) + 'v' + Math.round(h * 0.24) + '" stroke="#EEDDB0" stroke-width="2"/>';
      o += '</svg>';
      c.add(o, "p-abs");
      train = c.add('<div style="position:absolute;left:0;top:0;width:130px">' + TG.art.engine + '</div><div class="qw" style="position:absolute;left:126px;top:16px;width:200px">' + TG.art.wagon + '</div>', "p-abs",
        "left:" + Math.max(10, (c.W - 330) / 2) + "px;top:" + (trackY - 92) + "px;width:330px;height:100px;z-index:2");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 116) + "px;top:" + (c.H - 112) + "px;width:104px;z-index:2");
    },
    intro: function (c) { c.say(c.T("حمّل صناديق القاف في القطار", "حمّلي صناديق القاف في القطار"), c.W / 2, c.H * 0.56); },
    slots: function (c, n) {
      return [0.19, 0.5, 0.81].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.72 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.crate + TG.lbl(ch, 46, ""), "", "left:" + (s.x - 44) + "px;top:" + (s.y - 44) + "px;width:88px;height:88px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var tl = parseFloat(train.style.left), tt = parseFloat(train.style.top);
      var slotX = 140 + loaded * 37, slotY = 12;
      c.sfx.hop && c.sfx.hop();
      el.style.transition = "width .6s,height .6s"; el.style.width = "36px"; el.style.height = "36px";
      var lb = el.querySelector(".p-lbl"); if (lb) { lb.style.transition = "transform .6s"; lb.style.transform = "scale(.45)"; }
      c.move(el, tl + slotX, tt + slotY, 700, 60, function () {
        var small = document.createElement("div");
        small.style.cssText = "position:absolute;left:" + slotX + "px;top:" + slotY + "px;width:36px;height:36px";
        small.innerHTML = TG.art.crate + '<b class="p-lbl" style="--s:24px;left:6px;top:6px">' + c.ch + "</b>";
        train.insertBefore(small, train.querySelector(".qw")); el.remove();
        loaded++;
        c.sfx.plop && c.sfx.plop(); c.burst(tl + slotX + 18, tt + slotY + 18);
        c.say(["صندوق!", "ثنين!", "ثلاثة!", "أربعة!", "خمسة!"][loaded - 1], tl + slotX + 18, tt - 6);
        if (loaded < 5) { c.later(next, 400); return; }
        /* all loaded: toot and roll away to the left, then the win screen */
        c.later(function () {
          toot(c);
          c.say("طوط طوط!", tl + 60, tt - 6);
          c.move(train, -380, tt, 2000, 0, next);
        }, 500);
      });
    }
  }));
})();

;
/* ر — روبوت: build a robot one part per round (legs, body, arms, head, antenna). Each round offers three
   versions of the next part, each with a letter; the ر part flies onto the robot. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  /* part boxes in robot units (robot = 180 x 300) */
  var PARTS = [
    { key: "legs", x: 45, y: 208, w: 90, h: 92 },
    { key: "body", x: 30, y: 112, w: 120, h: 100 },
    { key: "arms", x: 0, y: 118, w: 180, h: 84 },
    { key: "head", x: 45, y: 34, w: 90, h: 82 },
    { key: "ant", x: 72, y: 0, w: 36, h: 40 }
  ];
  function part(key, col) {
    var p = PARTS.filter(function (q) { return q.key === key; })[0], o = '<svg viewBox="0 0 ' + p.w + ' ' + p.h + '" width="100%" height="100%"><g ' + O + '>';
    if (key === "legs") o += '<rect x="12" y="4" width="22" height="66" rx="8" fill="' + col + '"/><rect x="56" y="4" width="22" height="66" rx="8" fill="' + col + '"/><path d="M4 86Q4 70 24 70Q40 70 40 86Z" fill="#5D6F7C"/><path d="M50 86Q50 70 66 70Q86 70 86 86Z" fill="#5D6F7C"/>';
    if (key === "body") o += '<rect x="4" y="4" width="112" height="92" rx="18" fill="' + col + '"/><rect x="26" y="22" width="68" height="44" rx="10" fill="#fff"/><circle cx="42" cy="44" r="7" fill="#F2693B"/><circle cx="60" cy="44" r="7" fill="#FFCF3D"/><circle cx="78" cy="44" r="7" fill="#A3C93A"/><path d="M34 80h52" stroke-width="5"/>';
    if (key === "arms") o += '<rect x="6" y="6" width="30" height="58" rx="12" fill="' + col + '"/><rect x="144" y="6" width="30" height="58" rx="12" fill="' + col + '"/><circle cx="21" cy="70" r="11" fill="#5D6F7C"/><circle cx="159" cy="70" r="11" fill="#5D6F7C"/>';
    if (key === "head") o += '<rect x="4" y="8" width="82" height="70" rx="20" fill="' + col + '"/><rect x="16" y="22" width="58" height="34" rx="14" fill="#fff"/><circle cx="34" cy="39" r="7" fill="#1F1F1F" stroke="none"/><circle cx="56" cy="39" r="7" fill="#1F1F1F" stroke="none"/><path d="M34 64q11 8 22 0" fill="none"/>';
    if (key === "ant") o += '<path d="M18 40V14" stroke-width="5"/><circle cx="18" cy="12" r="9" fill="' + col + '"/>';
    o += '</g>';
    if (key === "head") o += '<circle cx="36.5" cy="36.5" r="2.4" fill="#fff"/><circle cx="58.5" cy="36.5" r="2.4" fill="#fff"/>';
    if (key === "body") o += '<ellipse cx="22" cy="60" rx="5" ry="16" fill="#fff" opacity=".35"/>';
    return o + '</svg>';
  }
  TG.art.ra_robot = (function () {
    var o = '<svg viewBox="-66 -6 312 312">', cols = { legs: "#11808F", body: "#F2693B", arms: "#7E57C2", head: "#A3C93A", ant: "#FFCF3D" };
    ["arms", "legs", "body", "head", "ant"].forEach(function (k) {
      var p = PARTS.filter(function (q) { return q.key === k; })[0];
      /* plain groups, not nested <svg>: the win screen styles every svg inside the mascot box */
      o += '<g transform="translate(' + p.x + ' ' + p.y + ')">' + part(k, cols[k]).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") + '</g>';
    });
    return o + '<ellipse cx="57" cy="98" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="123" cy="98" rx="5" ry="3" fill="#FF9BB0"/></svg>';
  })();
  var COLS = ["#11808F", "#F2693B", "#7E57C2", "#A3C93A", "#FFCF3D", "#F3A6B8"];
  var R = null, built = null;
  function scene(w, h, g) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    for (var x = 20; x < w; x += 70) o += '<circle cx="' + x + '" cy="' + (h * 0.2 + (x % 3) * 30) + '" r="3" fill="#BFE8EE"/>';
    o += '<rect y="' + g + '" width="' + w + '" height="' + (h - g) + '" fill="#F2F8DF"/><path d="M0 ' + g + 'H' + w + '" stroke="#fff" stroke-width="8"/>';
    o += '<rect x="' + (w / 2 - 110) + '" y="' + (g - 14) + '" width="220" height="22" rx="11" fill="#BFE8EE" stroke="#1F1F1F" stroke-width="4"/>';
    return o + '</svg>';
  }
  TG.register("ر", TG.choice({
    title: "ركّب الروبوت", mascot: "ra_robot", rounds: 5, count: 3, winWord: "روبوت جاهز!",
    winText: function (c) { return c.T("ركّبت الروبوت بقطع الـ ر، أنت و", "ركّبتِ الروبوت بقطع الـ ر، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      built = [];
      var s = Math.min(1, (c.H * 0.46) / 300, (c.W * 0.55) / 180), rw = 180 * s, rh = 300 * s;
      R = { s: s, x: (c.W - rw) / 2, y: c.H * 0.1, w: rw, h: rh };
      c.add(scene(c.W, c.H, Math.round(R.y + rh + 6)), "p-abs");
      var ghost = '<svg viewBox="0 0 180 300" width="' + rw + '" height="' + rh + '">';
      PARTS.forEach(function (p) { ghost += '<rect x="' + (p.x + 3) + '" y="' + (p.y + 3) + '" width="' + (p.w - 6) + '" height="' + (p.h - 6) + '" rx="14" fill="#fff" fill-opacity=".6" stroke="#9FC9D0" stroke-width="3" stroke-dasharray="8 7"/>'; });
      c.add(ghost + "</svg>", "p-abs", "left:" + R.x + "px;top:" + R.y + "px;z-index:1");
      c.robot = c.add("", "p-abs", "left:" + R.x + "px;top:" + R.y + "px;width:" + rw + "px;height:" + rh + "px;z-index:2");
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (c.H - 172) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("اختار قطعة الـ ر للروبوت", "اختاري قطعة الـ ر للروبوت"), c.W / 2, c.H * 0.1 + 20); },
    slots: function (c, n) {
      return [0.19, 0.5, 0.81].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.66 }; });
    },
    item: function (c, ch, i, s, round) {
      var p = PARTS[round - 1], col = COLS[(round + i * 2) % COLS.length];
      var fit = Math.min(76 / p.w, 62 / p.h), pw = p.w * fit, ph = p.h * fit;
      var el = c.add('<div style="position:absolute;left:' + (54 - pw / 2) + 'px;top:' + (52 - ph / 2) + 'px;width:' + pw + 'px;height:' + ph + 'px">' + part(p.key, col) + '</div>' + TG.lbl(ch, 40, "top:-12px;right:-10px"),
        "", "left:" + (s.x - 54) + "px;top:" + (s.y - 48) + "px;width:108px;height:96px;background:#fff;border-radius:22px;box-shadow:0 5px 0 var(--line);z-index:3", "button");
      el.setAttribute("data-col", col);
      return el;
    },
    right: function (c, el, s, next) {
      var round = built.length + 1, p = PARTS[round - 1], k = R;
      var pe = c.add(part(p.key, el.getAttribute("data-col")), "p-abs", "left:" + (s.x - p.w * k.s / 2) + "px;top:" + (s.y - p.h * k.s / 2) + "px;width:" + p.w * k.s + "px;height:" + p.h * k.s + "px;z-index:" + (p.key === "arms" ? 1 : 3));
      el.style.opacity = ".3"; el.style.pointerEvents = "none";
      c.sfx.hop && c.sfx.hop();
      c.move(pe, k.x + p.x * k.s, k.y + p.y * k.s, 850, 70, function () {
        built.push(pe);
        c.sfx.ding && c.sfx.ding(); c.burst(k.x + (p.x + p.w / 2) * k.s, k.y + (p.y + p.h / 2) * k.s);
        c.say(round < 5 ? "راء!" : c.T("شغّال! راء!", "شغّال! راء!"), c.W / 2, k.y + p.y * k.s - 6);
        if (round === 5) built.forEach(function (b) { b.classList.add("p-bob"); });
        c.later(next, 700);
      });
    }
  }));
})();

;
/* ص — صقر: three rings drift in over the desert; tap the ring that carries ص and the falcon flies through it */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.falconFly = '<svg viewBox="0 0 150 110"><g ' + O + '>' +
    '<path d="M30 62L4 52l6 22 22 2z" fill="#8A5A2B"/>' +
    '<path d="M60 52C46 18 28 6 18 8c10 16 14 34 26 50z" fill="#A86B3C"/>' +
    '<ellipse cx="68" cy="66" rx="42" ry="22" fill="#B98250"/>' +
    '<path d="M48 70c10 10 34 12 50 2" fill="#FFF1DA"/>' +
    '<path d="M76 54C88 18 108 4 122 6c-8 18-20 38-34 54z" fill="#C98A4B"/>' +
    '<circle cx="114" cy="56" r="20" fill="#B98250"/>' +
    '<path d="M128 52c10-2 16 4 14 12-4-2-8-2-12 0z" fill="#FFCF3D"/></g>' +
    '<ellipse cx="117" cy="51" rx="6" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="3"/><circle cx="119" cy="52" r="3.2" fill="#1F1F1F"/><circle cx="120" cy="50.6" r="1.1" fill="#fff"/>' +
    '<path d="M60 76l4 4M70 78l4 4M80 76l4 4" stroke="#C98A4B" stroke-width="3" stroke-linecap="round"/></svg>';
  TG.art.falconFace = '<svg viewBox="0 0 120 130"><g ' + O + '>' +
    '<path d="M46 118l-6 8M54 118v8M66 118v8M74 118l6 8" fill="none" stroke="#E0A400"/>' +
    '<path d="M24 70c-8 20-4 40 10 50l10-30zM96 70c8 20 4 40-10 50l-10-30z" fill="#A86B3C"/>' +
    '<ellipse cx="60" cy="82" rx="36" ry="38" fill="#B98250"/>' +
    '<ellipse cx="60" cy="92" rx="22" ry="24" fill="#FFF1DA"/>' +
    '<circle cx="60" cy="40" r="30" fill="#B98250"/>' +
    '<ellipse cx="48" cy="38" rx="9" ry="10" fill="#fff"/><ellipse cx="72" cy="38" rx="9" ry="10" fill="#fff"/>' +
    '<path d="M54 50c0-6 12-6 12 0l-6 12z" fill="#FFCF3D"/></g>' +
    '<circle cx="49" cy="40" r="4.5" fill="#1F1F1F"/><circle cx="73" cy="40" r="4.5" fill="#1F1F1F"/><circle cx="50.5" cy="38.2" r="1.6" fill="#fff"/><circle cx="74.5" cy="38.2" r="1.6" fill="#fff"/>' +
    '<path d="M52 86l4 4M60 92l4 4M66 84l4 4" stroke="#C98A4B" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="36" cy="54" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="84" cy="54" rx="5" ry="3" fill="#FF9BB0"/></svg>';
  TG.art.ring = function (col) {
    return '<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="42" fill="none" stroke="#1F1F1F" stroke-width="22"/><circle cx="55" cy="55" r="42" fill="none" stroke="' + col + '" stroke-width="14"/>' +
      '<path d="M30 30a36 36 0 0 1 22-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';
  };
  var cols = ["#F2693B", "#11808F", "#7E57C2"];
  TG.cssB("tg-sad", ".sad-cloud{position:absolute;height:30px;border-radius:999px;background:#fff;box-shadow:0 4px 0 #BFE8EE;animation:saddrift 26s linear infinite}" +
    ".sad-cloud::before{content:'';position:absolute;bottom:10px;left:18%;width:46%;aspect-ratio:1;border-radius:50%;background:#fff}" +
    "@keyframes saddrift{from{translate:-40px 0}to{translate:40px 0}}.sad-wing{animation:sadglide 2.8s ease-in-out infinite}@keyframes sadglide{50%{translate:0 -10px}}" +
    "@media (prefers-reduced-motion:reduce){.sad-cloud,.sad-wing{animation:none}}");

  var g = {};
  function whoosh(c) { c.api.noise && c.api.noise(0.4, 1600, 0.05); c.api.sweep && c.api.sweep(300, 700, 0.35, "sine", 0.06); }
  TG.register("ص", TG.choice({
    title: "الصقر الطيّار", mascot: "falconFace", rounds: 5, count: 3, winWord: "طيران عالي!",
    winText: function (c) { return c.T("طيّرت الصقر من كل حلقة فيها ص، أنت و", "طيّرتِ الصقر من كل حلقة فيها ص، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, dune = Math.round(H * 0.8);
      g.cx = cx; g.cw = cw;
      var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><defs><linearGradient id="sadsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D4F0F6"/><stop offset="1" stop-color="#F3FBFC"/></linearGradient></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#sadsky)"/>' +
        '<circle cx="' + (cx - cw * 0.36) + '" cy="' + (H * 0.16) + '" r="34" fill="#FFCF3D"/><circle cx="' + (cx - cw * 0.36) + '" cy="' + (H * 0.16) + '" r="46" fill="#FFCF3D" opacity=".25"/>' +
        '<path d="M0 ' + dune + 'C' + W * 0.25 + ' ' + (dune - 50) + ' ' + W * 0.45 + ' ' + (dune - 10) + ' ' + W * 0.62 + ' ' + (dune - 30) + 'S' + W * 0.9 + ' ' + (dune - 60) + ' ' + W + ' ' + (dune - 20) + 'V' + H + 'H0z" fill="#EBD39A" stroke="#fff" stroke-width="6"/>' +
        '<path d="M0 ' + (dune + 40) + 'C' + W * 0.3 + ' ' + (dune + 10) + ' ' + W * 0.6 + ' ' + (dune + 50) + ' ' + W + ' ' + (dune + 20) + 'V' + H + 'H0z" fill="#F7E9C6"/></svg>';
      c.add(o, "p-abs");
      c.add("", "sad-cloud", "left:" + (cx + cw * 0.05) + "px;top:" + (H * 0.12) + "px;width:110px");
      c.add("", "sad-cloud", "left:" + (cx - cw * 0.2) + "px;top:" + (H * 0.6) + "px;width:80px;animation-direction:reverse");
      g.home = { x: cx - cw * 0.5 + 6, y: H * 0.42 };
      g.f = c.add('<div class="sad-wing">' + TG.art.falconFly + "</div>", "p-abs", "left:" + g.home.x + "px;top:" + g.home.y + "px;width:130px;z-index:5;pointer-events:none");
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (H - 170) + "px;width:110px;z-index:2");
    },
    intro: function (c) { c.say(c.T("طيّر الصقر من حلقة الـ ص", "طيّري الصقر من حلقة الـ ص"), g.cx, c.H * 0.36); },
    slots: function (c, n) {
      var ys = c.shuffle([0.2, 0.42, 0.63]);
      return [0.12, 0.32, 0.2].slice(0, n).map(function (fx, i) { return { x: g.cx + g.cw * fx + c.rnd(-10, 10), y: c.H * ys[i] + 20 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.ring(cols[i % 3]) + TG.lbl(ch, 48, "top:31px"), "", "left:" + (s.x - 55) + "px;top:" + (s.y - 55) + "px;width:110px;height:110px;z-index:3", "button");
    },
    enter: function (c, items) {
      items.forEach(function (el, i) {
        if (el.animate) el.animate([{ transform: "translateX(" + (c.W * 0.6) + "px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 1100, delay: i * 180, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
      });
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none"; whoosh(c);
      c.move(g.f, s.x - 65, s.y - 60, 950, 30, function () {
        c.burst(s.x, s.y, ["#FFCF3D", "#fff", "#F2693B"]); if (c.score < c.total - 1) c.say("صاد!", s.x, s.y - 70);
        el.removeAttribute("data-ok"); el.classList.add("p-done");
        c.move(g.f, c.W + 40, s.y - 90, 650, 0, function () {
          g.f.style.left = (-140) + "px"; g.f.style.top = g.home.y + "px";
          c.move(g.f, g.home.x, g.home.y, 900, 0, next);
        });
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 340);
    }
  }));
})();

;
/* ش — شمس: "لوّن تطلع الصورة". A grid of tiles; colour every tile that carries ش (they make the sun's shape),
   and when all are found the whole sun comes out from behind the grid. */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.sunFace = (function () {
    var rays = "";
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, x1 = 60 + Math.cos(a) * 44, y1 = 60 + Math.sin(a) * 44, x2 = 60 + Math.cos(a) * 58, y2 = 60 + Math.sin(a) * 58;
      rays += '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '"/>';
    }
    return '<svg viewBox="0 0 120 120"><g stroke="#1F1F1F" stroke-width="10" stroke-linecap="round">' + rays + '</g><g stroke="#FFB800" stroke-width="5" stroke-linecap="round">' + rays + '</g>' +
      '<g ' + O + '><circle cx="60" cy="60" r="38" fill="#FFCF3D"/><ellipse cx="47" cy="54" rx="6" ry="8" fill="#fff"/><ellipse cx="73" cy="54" rx="6" ry="8" fill="#fff"/><path d="M44 72q16 14 32 0" fill="none"/></g>' +
      '<circle cx="48" cy="56" r="3.4" fill="#1F1F1F"/><circle cx="74" cy="56" r="3.4" fill="#1F1F1F"/><ellipse cx="36" cy="68" rx="6" ry="4" fill="#FF9BB0"/><ellipse cx="84" cy="68" rx="6" ry="4" fill="#FF9BB0"/></svg>';
  })();
  TG.cssB("tg-shin",
    ".p-stage .sh-tile{border-radius:18px;background:#fff;box-shadow:0 5px 0 #CFE3E7;font:700 2.3rem/1.6 var(--naskh);color:var(--ink);transition:background .35s,box-shadow .35s,transform .25s var(--ease),opacity .6s}" +
    ".p-stage .sh-tile.p-done{background:#FFCF3D;box-shadow:0 5px 0 #D49B00;color:#8a5a00;cursor:default}" +
    ".p-stage .sh-tile.p-hint{animation:shglow 1.2s ease-in-out infinite}@keyframes shglow{50%{box-shadow:0 0 0 8px rgba(255,207,61,.8),0 5px 0 #CFE3E7}}" +
    ".sh-sun{transition:opacity .8s,transform 1s cubic-bezier(.34,1.56,.64,1);opacity:0;transform:scale(.4) rotate(-30deg)}.sh-sun.on{opacity:1;transform:none}" +
    ".p-stage .sh-grid.out .sh-tile{opacity:0;transform:scale(.6)}" +
    "@media (prefers-reduced-motion:reduce){.sh-tile.p-hint{animation:none}}");

  /* 4×4 grid; the ش tiles sit where the sun is: the middle 2×2 plus two rays */
  var SUN = [[1, 1], [1, 2], [2, 1], [2, 2], [0, 0], [3, 3]];
  TG.register("ش", {
    title: "لوّن الشمس", mascot: "sunFace", winWord: "شمس حلوة!",
    winText: function (c) { return c.T("لوّنت كل ش وطلّعت الشمس، أنت و", "لوّنتِ كل ش وطلّعتِ الشمس، أنتِ و") + c.api.friendName(); },
    start: function (c) {
      var W = c.W, H = c.H, gw = Math.min(W - 32, 380), gap = 10, tile = Math.floor((gw - gap * 3) / 4), x0 = (W - (tile * 4 + gap * 3)) / 2, y0 = Math.max(88, H * 0.12);
      var hy = Math.round(Math.min(H - 150, y0 + tile * 4 + gap * 3 + 40));
      c.add(TG.meadowB ? TG.meadowB(W, H, hy) : "", "p-abs");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (W - 124) + "px;top:" + (H - 168) + "px;width:112px;z-index:2");
      var size = tile * 4 + gap * 3;
      var sun = c.add(TG.art.sunFace, "p-abs sh-sun", "left:" + (x0 + size * 0.1) + "px;top:" + (y0 + size * 0.1) + "px;width:" + size * 0.8 + "px;z-index:1");
      var grid = c.add("", "p-abs sh-grid", "left:0;top:0;width:100%;height:100%;z-index:3;pointer-events:none");
      var isSun = {}; SUN.forEach(function (p) { isSun[p[0] + "," + p[1]] = 1; });
      c.total = SUN.length; c.setScore(0);
      var tiles = [];
      for (var r = 0; r < 4; r++) for (var col = 0; col < 4; col++) {
        var ok = !!isSun[r + "," + col], ch = ok ? c.ch : c.alike(1)[0];
        var b = document.createElement("button"); b.type = "button";
        b.className = "p-item sh-tile"; b.textContent = ch;
        b.style.cssText = "left:" + (x0 + col * (tile + gap)) + "px;top:" + (y0 + r * (tile + gap)) + "px;width:" + tile + "px;height:" + tile + "px;pointer-events:auto";
        b.setAttribute("data-ok", ok ? "1" : "0"); b.setAttribute("data-ch", ch); b.setAttribute("aria-label", "حرف ال" + c.name(ch));
        grid.appendChild(b); tiles.push(b);
        (function (b, ok, ch) { b.addEventListener("click", function () { tap(b, ok, ch); }); })(b, ok, ch);
      }
      var done = false;
      function tap(b, ok, ch) {
        if (!c.alive || done || b.classList.contains("p-done")) return;
        c.api.unlock();
        if (!ok) { c.wrong(b, ch); return; }
        b.classList.remove("p-hint"); b.classList.add("p-done"); b.removeAttribute("data-ok");
        c.sfx.pop && c.sfx.pop(); c.api.sweep && c.api.sweep(700 + c.score * 120, 1100 + c.score * 120, 0.15, "sine", 0.08);
        var r = b.getBoundingClientRect(), s = c.stage.getBoundingClientRect();
        c.burst(r.left - s.left + r.width / 2, r.top - s.top + r.height / 2, ["#FFCF3D", "#FFB800", "#fff"]);
        c.miss = 0; c.setScore(c.score + 1);
        if (c.score >= c.total) {
          done = true;
          c.later(function () {
            grid.classList.add("out"); sun.classList.add("on");
            c.say(c.T("شوف الشمس!", "شوفي الشمس!"), W / 2, y0 + 30);
            c.later(function () { var sy = c.stage.querySelector(".p-say"); if (sy) sy.style.opacity = "0"; c.win(); }, 1700);
          }, 500);
        }
      }
      c.later(function () { c.speak(); c.say(c.T("لوّن كل مربع فيه ش", "لوّني كل مربع فيه ش"), W / 2, hy + 40); }, 350);
    },
    auto: function (c) { var t = c.stage.querySelector('.sh-tile[data-ok="1"]'); if (t) t.click(); }
  });
})();

;
/* س — سمكة: fish swim across the sea, each with a letter. Tap a س fish: the line drops, hooks it,
   and lifts it into the bucket on the pier. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  var FC = ["#FF8A3D", "#F3A6B8", "#FFCF3D", "#7FC6D0", "#B39DDB"];
  function fish(col, face) {
    return '<svg viewBox="0 0 120 84"><g ' + O + '><path d="M14 42L0 22V62Z" fill="' + col + '"/>' +
      '<path d="M12 42Q36 6 74 10Q112 16 116 42Q112 68 74 74Q36 78 12 42Z" fill="' + col + '"/>' +
      '<path d="M58 12Q66 0 80 4Q78 12 76 12" fill="' + col + '"/><path d="M86 58q8 6 16 0" fill="none"/></g>' +
      '<circle cx="94" cy="34" r="7" fill="#fff" stroke="#1F1F1F" stroke-width="3"/><circle cx="96" cy="35" r="3.4" fill="#1F1F1F"/>' +
      '<path d="M36 30q8 12 0 24M48 26q8 16 0 32" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>' +
      (face ? '<ellipse cx="84" cy="50" rx="5" ry="3" fill="#FF6F91" opacity=".8"/>' : '') + '</svg>';
  }
  TG.art.sin_fishFace = fish("#FF8A3D", true);
  TG.art.sin_bucket = '<svg viewBox="0 0 100 96"><g ' + O + '><path d="M18 26Q50 -6 82 26" fill="none" stroke-width="5"/><path d="M12 28H88L80 90H20Z" fill="#7FC6D0"/><ellipse cx="50" cy="28" rx="38" ry="8" fill="#BFE8EE"/></g><path d="M24 44H76" stroke="#fff" stroke-width="5" opacity=".6"/></svg>';
  function sea(w, h, wy) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + wy + '" fill="#E4F5F8"/>';
    o += '<circle cx="' + w * 0.82 + '" cy="' + h * 0.13 + '" r="30" fill="#FFCF3D"/>';
    o += '<defs><linearGradient id="sinwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BDE9F2"/><stop offset="1" stop-color="#8FD3E2"/></linearGradient></defs>';
    o += '<rect y="' + wy + '" width="' + w + '" height="' + (h - wy) + '" fill="url(#sinwater)"/>';
    for (var x = -20; x < w + 40; x += 40) o += '<path d="M' + x + ' ' + wy + 'q10-10 20 0t20 0" fill="#BDE9F2" stroke="#fff" stroke-width="4"/>';
    for (var y = wy + 70; y < h - 40; y += 90) for (x = (y / 90) % 2 ? 30 : 80; x < w; x += 120) o += '<path d="M' + x + ' ' + y + 'q10-8 20 0t20 0" fill="none" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>';
    o += '<g fill="#7CC242" stroke="#1F1F1F" stroke-width="3"><path d="M' + w * 0.08 + ' ' + h + 'q-10-40 6-70q4 30 8 70z"/><path d="M' + w * 0.9 + ' ' + h + 'q-14-50 4-90q8 40 10 90z"/></g>';
    /* pier on the left */
    o += '<g stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round"><rect x="-6" y="' + (wy - 18) + '" width="' + (w * 0.5) + '" height="18" rx="4" fill="#C98A4B"/><rect x="' + (w * 0.12) + '" y="' + wy + '" width="12" height="54" fill="#B7793A"/><rect x="' + (w * 0.38) + '" y="' + wy + '" width="12" height="54" fill="#B7793A"/></g>';
    return o + '</svg>';
  }
  var wy = 0;
  TG.register("س", TG.moving({
    title: "صيد السمك", mascot: "sin_fishFace", need: 5, every: 1.6, max: 4, ratio: 0.5, winWord: "صيد حلو!",
    winText: function (c) { return c.T("صدت سمك الـ س كله، أنت و", "صدتِ سمك الـ س كله، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      wy = Math.round(c.H * 0.3);
      c.add(sea(c.W, c.H, wy), "p-abs");
      c.add(c.api.figHTML(), "fig p-abs", "left:4px;top:" + (wy - 128) + "px;width:112px;z-index:3");
      c.bucket = { x: 124, y: wy - 18 - 80 };
      c.add(TG.art.sin_bucket, "p-abs", "left:" + c.bucket.x + "px;top:" + c.bucket.y + "px;width:84px;z-index:4");
      c.tip = { x: c.W * 0.62, y: wy - 120 };
      c.add('<svg viewBox="0 0 160 140" width="160" height="140"><path d="M8 136L150 6" stroke="#1F1F1F" stroke-width="7" stroke-linecap="round"/><path d="M8 136L150 6" stroke="#C98A4B" stroke-width="3" stroke-linecap="round"/></svg>', "p-abs", "left:" + (c.tip.x - 150) + "px;top:" + (c.tip.y - 6) + "px;z-index:2");
    },
    intro: function (c) { c.say(c.T("صيد سمكة الـ س!", "صيدي سمكة الـ س!"), c.W * 0.55, wy - 30); },
    spawn: function (c, ch) {
      var dir = Math.random() < 0.5 ? 1 : -1, col = FC[Math.floor(Math.random() * FC.length)];
      var el = c.add('<div style="position:absolute;inset:0;transform:' + (dir < 0 ? "scaleX(-1)" : "none") + '">' + (TG.art.sinFish ? TG.art.sinFish(col) : fish(col, false)) + "</div>" + TG.lbl(ch, 44, "top:20px;left:34px"), "", "width:108px;height:76px;z-index:5", "button");
      var lane = wy + 50 + Math.random() * (c.H - wy - 170);
      return { el: el, x: dir > 0 ? -110 : c.W + 4, y: lane, vx: dir * c.rnd(40, 56), vy: 0, ph: Math.random() * 6 };
    },
    step: function (c, it, dt) { it.ph += dt * 2.2; it.y += Math.sin(it.ph) * 10 * dt; },
    out: function (c, it) { return it.x < -120 || it.x > c.W + 10; },
    caught: function (c, it, done) {
      it.el.style.transform = ""; it.el.style.left = it.x + "px"; it.el.style.top = it.y + "px";
      var fx = it.x + 54, fy = it.y + 10;
      var line = c.add("", "p-abs", "left:" + c.tip.x + "px;top:" + c.tip.y + "px;width:3px;height:0;background:#1F1F1F;transform-origin:top;z-index:4;transition:height .45s ease");
      var ang = Math.atan2(fx - c.tip.x, fy - c.tip.y), len = Math.hypot(fx - c.tip.x, fy - c.tip.y);
      line.style.transform = "rotate(" + (-ang) + "rad)";
      c.later(function () { line.style.height = len + "px"; }, 30);
      c.later(function () {
        c.sfx.plop && c.sfx.plop();
        line.style.transition = "opacity .3s"; line.style.opacity = "0";
        c.move(it.el, c.bucket.x - 10, c.bucket.y - 60, 850, 80, function () {
          line.remove();
          c.sfx.ding && c.sfx.ding(); c.burst(c.bucket.x + 42, c.bucket.y + 10);
          c.say(["سين!", "ثنتين!", "ثلاث!", "أربع!", "خمس!"][Math.min(4, c.score)], c.bucket.x + 42, c.bucket.y - 40);
          done();
        });
      }, 520);
    }
  }));
})();

;
/* ت — تفاحة: pick the apples that carry ت into the basket */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.apple = '<svg viewBox="0 0 100 100"><g ' + O + '><path d="M50 30c-10-8-34-8-38 16-4 22 12 46 26 46 6 0 8-3 12-3s6 3 12 3c14 0 30-24 26-46C84 22 60 22 50 30z" fill="#F0443A"/><path d="M50 30c0-8 2-14 6-20" fill="none"/><path d="M56 18c6-8 18-10 24-6-4 8-14 12-24 6z" fill="#7CC242"/></g><ellipse cx="30" cy="48" rx="6" ry="11" fill="#fff" opacity=".55" transform="rotate(20 30 48)"/></svg>';
  TG.art.appleFace = '<svg viewBox="0 0 100 100"><g ' + O + '><path d="M50 30c-10-8-34-8-38 16-4 22 12 46 26 46 6 0 8-3 12-3s6 3 12 3c14 0 30-24 26-46C84 22 60 22 50 30z" fill="#F0443A"/><path d="M50 30c0-8 2-14 6-20" fill="none"/><path d="M56 18c6-8 18-10 24-6-4 8-14 12-24 6z" fill="#7CC242"/><ellipse cx="38" cy="54" rx="6" ry="8" fill="#fff"/><ellipse cx="62" cy="54" rx="6" ry="8" fill="#fff"/><path d="M38 70q12 10 24 0" fill="none"/></g><circle cx="39" cy="56" r="3.5" fill="#1F1F1F"/><circle cx="63" cy="56" r="3.5" fill="#1F1F1F"/><ellipse cx="28" cy="66" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="72" cy="66" rx="5" ry="3" fill="#FF9BB0"/></svg>';
  TG.art.basket = '<svg viewBox="0 0 120 84"><g ' + O + '><path d="M14 34c0-26 92-26 92 0" fill="none" stroke-width="6"/><path d="M8 34h104l-12 44H20z" fill="#D9984A"/></g><path d="M30 36l6 40M50 36l2 40M70 36l-2 40M90 36l-6 40M12 50h96M16 64h88" fill="none" stroke="#A86B2D" stroke-width="3"/><path d="M8 34h104l-12 44H20z" fill="none" stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round"/></svg>';
  TG.art.tree = function (w, h) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><g stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round">';
    o += '<path d="M' + (w * 0.44) + ' ' + h + 'L' + (w * 0.46) + ' ' + (h * 0.55) + 'L' + (w * 0.54) + ' ' + (h * 0.55) + 'L' + (w * 0.56) + ' ' + h + 'z" fill="#B7793A"/></g>';
    var blobs = [[0.5, 0.3, 0.42], [0.22, 0.38, 0.24], [0.78, 0.38, 0.24], [0.32, 0.16, 0.22], [0.68, 0.16, 0.22], [0.5, 0.52, 0.3]];
    blobs.forEach(function (b) { o += '<circle cx="' + w * b[0] + '" cy="' + h * b[1] + '" r="' + w * b[2] * 0.56 + '" fill="#fff"/>'; });
    blobs.forEach(function (b) { o += '<circle cx="' + w * b[0] + '" cy="' + (h * b[1] + 3) + '" r="' + (w * b[2] * 0.56 - 5) + '" fill="#7CC242"/>'; });
    o += '<g fill="#5FA62E" opacity=".55"><circle cx="' + w * 0.3 + '" cy="' + h * 0.42 + '" r="' + w * 0.06 + '"/><circle cx="' + w * 0.66 + '" cy="' + h * 0.28 + '" r="' + w * 0.05 + '"/><circle cx="' + w * 0.52 + '" cy="' + h * 0.5 + '" r="' + w * 0.07 + '"/></g>';
    return o + '</svg>';
  };

  var basket = null, caught = 0;
  TG.register("ت", TG.choice({
    title: "قطف التفاح", mascot: "appleFace", winWord: "سلة مليانة!", rounds: 5, count: 4,
    winText: function (c) { return c.T("قطفت كل تفاح الـ ت، أنت و", "قطفتِ كل تفاح الـ ت، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      caught = 0;
      var tw = Math.min(c.W * 1.05, 460), th = Math.min(c.H * 0.62, 470);
      c.add(TG.art.tree(Math.round(tw), Math.round(th)), "p-abs", "left:" + (c.W - tw) / 2 + "px;top:" + (c.H * 0.06) + "px");
      c.crown = { x: (c.W - tw) / 2, y: c.H * 0.06, w: tw, h: th };
      basket = c.add(TG.art.basket, "p-abs", "left:" + (c.W / 2 - 70) + "px;top:" + (c.H - 128) + "px;width:140px;z-index:2");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 128) + "px;top:" + (c.H - 190) + "px;width:120px;z-index:1");
    },
    slots: function (c, n) {
      var k = c.crown, pts = c.shuffle([[0.24, 0.3], [0.5, 0.18], [0.76, 0.3], [0.36, 0.5], [0.66, 0.52]]).slice(0, n);
      return pts.map(function (p) { return { x: k.x + k.w * p[0] + c.rnd(-8, 8), y: k.y + k.h * p[1] + c.rnd(-6, 6) }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.apple + TG.lbl(ch, 44, "top:30px"), "", "left:" + (s.x - 42) + "px;top:" + (s.y - 40) + "px;width:84px;height:84px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      c.move(el, c.W / 2 - 42 + c.rnd(-26, 26), c.H - 150, 650, 0, function () {
        c.sfx.plop ? c.sfx.plop() : 0;
        el.style.transition = "transform .25s"; el.style.transform = "scale(.55)";
        caught++;
        c.burst(c.W / 2, c.H - 120);
        c.say(["تفاحة!", "ثنتين!", "ثلاث!", "أربع!", "خمس!"][caught - 1], c.W / 2, c.H - 150);
        el.removeAttribute("data-ok"); el.classList.add("p-done");
        c.later(next, 450);
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { if (!it.classList.contains("p-done")) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 300); } });
      c.later(next, 320);
    }
  }));
})();

;
/* ط — طبل: three Gulf drums on a Sadu rug; tap the drum that carries ط, it booms and bounces */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.drum = function (col) {
    var zig = "";
    for (var i = 0; i < 5; i++) { var x = 18 + i * 17; zig += "M" + x + " 34L" + (x + 8.5) + " 104L" + (x + 17) + " 34"; }
    return '<svg viewBox="0 0 120 130"><g ' + O + '>' +
      '<path d="M14 30v76c0 10 20 18 46 18s46-8 46-18V30z" fill="' + col + '"/>' +
      '<path d="' + zig + '" fill="none" stroke="#FFF1DA" stroke-width="3"/>' +
      '<path d="M14 104c0 10 20 18 46 18s46-8 46-18" fill="none" stroke-width="10"/><path d="M14 104c0 10 20 18 46 18s46-8 46-18" fill="none" stroke="#C98A4B" stroke-width="4"/>' +
      '<ellipse cx="60" cy="30" rx="46" ry="16" fill="#FFF1DA"/><ellipse cx="60" cy="30" rx="46" ry="16" fill="none" stroke-width="9"/><ellipse cx="60" cy="30" rx="46" ry="16" fill="none" stroke="#C98A4B" stroke-width="3"/></g>' +
      '<ellipse cx="44" cy="26" rx="12" ry="4" fill="#fff" opacity=".8"/></svg>';
  };
  TG.art.drumFace = TG.art.drum("#E5533F").replace('</svg>',
    '<ellipse cx="46" cy="64" rx="8" ry="10" fill="#fff" stroke="#1F1F1F" stroke-width="3"/><ellipse cx="74" cy="64" rx="8" ry="10" fill="#fff" stroke="#1F1F1F" stroke-width="3"/>' +
    '<circle cx="47" cy="66" r="4" fill="#1F1F1F"/><circle cx="75" cy="66" r="4" fill="#1F1F1F"/><path d="M48 84q12 10 24 0" fill="none" stroke="#1F1F1F" stroke-width="3.5" stroke-linecap="round"/></svg>');
  TG.art.note = '<svg viewBox="0 0 40 50"><path d="M14 40V8l20-6v30" fill="none" stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round"/><ellipse cx="10" cy="40" rx="9" ry="7" fill="#7E57C2" stroke="#1F1F1F" stroke-width="3"/><ellipse cx="30" cy="34" rx="9" ry="7" fill="#7E57C2" stroke="#1F1F1F" stroke-width="3"/></svg>';
  var cols = ["#E5533F", "#11808F", "#7E57C2", "#F2A93B"];
  TG.cssB("tg-tah", ".tah-note{position:absolute;width:30px;pointer-events:none;z-index:6;animation:tahnote 1.1s ease-out forwards}@keyframes tahnote{from{transform:translate(0,0) scale(.6);opacity:1}to{transform:translate(var(--dx),-120px) scale(1);opacity:0}}");

  function boom(c) {
    var a = c.api;
    a.sweep && a.sweep(150, 52, 0.5, "sine", 0.4);
    a.noise && a.noise(0.14, 380, 0.14);
    a.sweep && a.sweep(190, 70, 0.4, "sine", 0.28, 0.26);
  }
  var g = {};
  TG.register("ط", TG.choice({
    title: "طبل الفرح", mascot: "drumFace", rounds: 5, count: 3, winWord: "دُم دُم دُم!",
    winText: function (c) { return c.T("ضربت كل طبول الـ ط، أنت و", "ضربتِ كل طبول الـ ط، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, hy = Math.round(H * 0.42);
      g.cx = cx; g.cw = cw; g.y = H * 0.56;
      var rugW = Math.min(W - 24, 420), rx = (W - rugW) / 2, ry = g.y + 20, rh = 92;
      var rug = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><g stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round">' +
        '<rect x="' + rx + '" y="' + ry + '" width="' + rugW + '" height="' + rh + '" rx="10" fill="#C8382E"/></g>' +
        '<rect x="' + (rx + 8) + '" y="' + (ry + 8) + '" width="' + (rugW - 16) + '" height="14" fill="#FFF1DA"/>' +
        '<rect x="' + (rx + 8) + '" y="' + (ry + rh - 22) + '" width="' + (rugW - 16) + '" height="14" fill="#FFF1DA"/>';
      for (var x = rx + 14; x < rx + rugW - 20; x += 28) rug += '<path d="M' + x + ' ' + (ry + 46) + 'l10-12 10 12-10 12z" fill="#1F1F1F"/><path d="M' + (x + 4) + ' ' + (ry + 46) + 'l6-7 6 7-6 7z" fill="#FFCF3D"/>';
      rug += '</svg>';
      c.add(TG.meadowB(W, H, hy), "p-abs");
      c.add(rug, "p-abs");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (W - 124) + "px;top:" + (H - 168) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("اضرب طبل الـ ط", "اضربي طبل الـ ط"), g.cx, g.y - 110); },
    slots: function (c, n) { return [-0.3, 0, 0.3].slice(0, n).map(function (fx) { return { x: g.cx + g.cw * fx, y: g.y }; }); },
    item: function (c, ch, i, s) {
      return c.add(TG.art.drum(cols[(i + c.score) % cols.length]) + TG.lbl(ch, 46, "top:52px"), "", "left:" + (s.x - 54) + "px;top:" + (s.y - 66) + "px;width:108px;height:118px;z-index:3;transform-origin:50% 100%", "button");
    },
    enter: function (c, items) {
      items.forEach(function (el, i) {
        if (el.animate) el.animate([{ transform: "translateY(-60px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 600, delay: i * 120, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" });
      });
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none"; boom(c);
      if (el.animate) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.14,.86)" }, { transform: "scale(.94,1.08)" }, { transform: "scale(1)" }], { duration: 520, easing: "ease-out" });
      [-34, 0, 34].forEach(function (dx, k) { c.later(function () { c.add(TG.art.note, "tah-note", "left:" + (s.x - 15) + "px;top:" + (s.y - 80) + "px;--dx:" + dx + "px"); }, k * 140); });
      if (c.score < c.total - 1) c.say(["دُم!", "طاء!", "دُم دُم!", "طاء!"][Math.min(3, c.score)], s.x, s.y - 100);
      el.removeAttribute("data-ok"); el.classList.add("p-done");
      c.later(function () { Array.prototype.forEach.call(c.stage.querySelectorAll(".tah-note"), function (n) { n.remove(); }); next(); }, 1300);
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 360);
    }
  }));
})();

;
/* ث — ثعلب: the fox's letter lost its dots. Pick the right dots (three above) to finish ث.
   Options show only dot patterns around a faint letter body, so the child learns ث by its three dots. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  function hills(w, h, g) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    o += '<ellipse cx="' + w * 0.15 + '" cy="' + g + '" rx="' + w * 0.42 + '" ry="' + h * 0.13 + '" fill="#FCE3EA"/><ellipse cx="' + w * 0.86 + '" cy="' + (g + 6) + '" rx="' + w * 0.46 + '" ry="' + h * 0.11 + '" fill="#F3A6B8"/>';
    for (var x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + g + '" r="26" fill="#fff"/>';
    for (x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + (g + 3) + '" r="22" fill="#A3C93A"/>';
    o += '<rect y="' + (g + 3) + '" width="' + w + '" height="' + (h - g) + '" fill="#A3C93A"/><rect y="' + (g + 34) + '" width="' + w + '" height="' + (h - g) + '" fill="#F2F8DF"/>';
    for (x = 30; x < w; x += 74) o += '<circle cx="' + x + '" cy="' + (g + 56 + (x % 3) * 20) + '" r="4" fill="#fff"/><circle cx="' + (x + 8) + '" cy="' + (g + 60 + (x % 3) * 20) + '" r="3" fill="#F3A6B8"/>';
    return o + '</svg>';
  }
  TG.art.tha_fox = '<svg viewBox="0 0 120 132"><g ' + O + '>' +
    '<path d="M84 116Q120 122 112 84Q104 98 90 98" fill="#F28A2E"/><path d="M106 92Q110 104 104 112Q98 112 96 106" fill="#fff"/>' +
    '<path d="M36 124Q30 86 60 80Q90 86 84 124Z" fill="#F28A2E"/><path d="M48 124Q46 96 60 92Q74 96 72 124Z" fill="#fff"/>' +
    '<path d="M24 14L44 34Q60 28 76 34L96 14L98 48Q98 72 60 82Q22 72 22 48Z" fill="#F28A2E"/>' +
    '<path d="M36 58Q60 50 84 58Q78 76 60 82Q42 76 36 58Z" fill="#fff"/>' +
    '<ellipse cx="46" cy="48" rx="6" ry="8" fill="#fff"/><ellipse cx="74" cy="48" rx="6" ry="8" fill="#fff"/>' +
    '<path d="M54 72q6 5 12 0" fill="none"/></g>' +
    '<path d="M30 22L42 34L32 38Z" fill="#7A3E12"/><path d="M90 22L78 34L88 38Z" fill="#7A3E12"/>' +
    '<circle cx="47" cy="50" r="3.6" fill="#1F1F1F"/><circle cx="75" cy="50" r="3.6" fill="#1F1F1F"/><circle cx="48.4" cy="48.4" r="1.3" fill="#fff"/><circle cx="76.4" cy="48.4" r="1.3" fill="#fff"/>' +
    '<ellipse cx="60" cy="64" rx="5.5" ry="4" fill="#1F1F1F"/><ellipse cx="34" cy="62" rx="5" ry="3" fill="#FF9BB0" opacity=".8"/><ellipse cx="86" cy="62" rx="5" ry="3" fill="#FF9BB0" opacity=".8"/></svg>';
  /* dot patterns drawn around a faint letter body: where the dots sit is the whole lesson */
  var DOTS = { "ب": [[50, 76]], "ت": [[41, 26], [59, 26]], "ث": [[41, 30], [59, 30], [50, 15]], "ن": [[50, 26]] };
  function dotsSVG(ch) {
    var o = '<svg viewBox="0 0 100 90"><path d="M14 44Q14 66 50 66Q86 66 86 44" fill="none" stroke="#BFD9DE" stroke-width="9" stroke-linecap="round"/>';
    (DOTS[ch] || DOTS["ب"]).forEach(function (d) { o += '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="7" fill="#F2693B" stroke="#1F1F1F" stroke-width="3"/>'; });
    return o + '</svg>';
  }
  var card = null, glyph = null;
  TG.register("ث", TG.choice({
    title: "نقاط الثعلب", mascot: "tha_fox", rounds: 5, count: 3, winWord: "كملت الثاء!",
    goal: function (T) { return T("كمّل حرف", "كمّلي حرف"); },
    winText: function (c) { return c.T("عرفت نقاط الـ ث الثلاث، أنت و", "عرفتِ نقاط الـ ث الثلاث، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      c.add(hills(c.W, c.H, Math.round(c.H * 0.72)), "p-abs");
      var cw = Math.min(240, c.W * 0.62), ch = Math.min(250, c.H * 0.32);
      card = c.add('<b style="display:block;font:700 ' + Math.round(ch * 0.62) + 'px/1.5 var(--naskh);color:var(--teal-d);text-align:center;transition:color .3s">ٮ</b>', "p-abs",
        "left:" + (c.W - cw) / 2 + "px;top:" + (c.H * 0.11) + "px;width:" + cw + "px;height:" + ch + "px;display:grid;place-items:center;background:#fff;border-radius:28px;box-shadow:0 6px 0 var(--teal-l),0 12px 24px rgba(17,128,143,.12);z-index:1");
      glyph = card.firstChild;
      c.card = { x: (c.W - cw) / 2, y: c.H * 0.11, w: cw, h: ch };
      c.fox = c.add(TG.art.tha_fox, "p-abs p-bob", "left:6px;top:" + (c.H * 0.72 - 96) + "px;width:110px;z-index:2");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 124) + "px;top:" + (c.H - 172) + "px;width:116px;z-index:2");
    },
    intro: function (c) { c.say(c.T("الثاء ضاعت نقاطها! ساعدني", "الثاء ضاعت نقاطها! ساعديني"), 110, c.H * 0.72 - 100); },
    slots: function (c, n) {
      return [0.2, 0.5, 0.8].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.52 }; });
    },
    item: function (c, ch, i, s) {
      return c.add(dotsSVG(ch), "", "left:" + (s.x - 52) + "px;top:" + (s.y - 46) + "px;width:104px;height:92px;background:#fff;border-radius:22px;box-shadow:0 5px 0 var(--line);z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var k = c.card, cx = k.x + k.w / 2, sc = 104 / 100, ex = s.x - 52, ey = s.y - 46;
      var targets = [[cx - 20, k.y + k.h * 0.26], [cx + 20, k.y + k.h * 0.26], [cx, k.y + k.h * 0.13]];
      var dots = DOTS["ث"].map(function (d, i) {
        var dot = c.add("", "p-abs", "left:" + (ex + d[0] * sc - 9) + "px;top:" + (ey + d[1] * sc - 9) + "px;width:18px;height:18px;border-radius:50%;background:#F2693B;border:3px solid #1F1F1F;z-index:5");
        c.later(function () { c.move(dot, targets[i][0] - 9, targets[i][1] - 9, 700, 50); }, i * 160);
        return dot;
      });
      el.style.opacity = ".35";
      c.later(function () {
        dots.forEach(function (d) { d.remove(); });
        glyph.textContent = "ث"; glyph.style.color = "#F2693B";
        c.sfx.ding && c.sfx.ding(); c.burst(cx, k.y + k.h * 0.45);
        c.say("ثاء!", 110, c.H * 0.72 - 100);
        c.later(function () { glyph.textContent = "ٮ"; glyph.style.color = ""; next(); }, 1100);
      }, 1100);
    }
  }));
})();

;
/* الحركات game: three balloons carry بَ بُ بِ (for the chosen letter); the child hears one and pops it.
   Six rounds, each vowel heard twice in shuffled order. Opened with TG.start(idx, "vowel"). */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.balloon = function (fill) {
    return '<svg viewBox="0 0 100 150"><path d="M50 112c-4 12 6 18 0 36" fill="none" stroke="#1F1F1F" stroke-width="2.5"/><g ' + O + '><path d="M50 6C24 6 8 28 8 52c0 30 24 52 42 58 18-6 42-28 42-58C92 28 76 6 50 6z" fill="' + fill + '"/><path d="M44 110h12l-4 8h-4z" fill="' + fill + '"/></g><ellipse cx="32" cy="34" rx="8" ry="14" fill="#fff" opacity=".5" transform="rotate(25 32 34)"/></svg>';
  };
  TG.art.balloonFace = '<svg viewBox="0 0 100 150"><path d="M50 112c-4 12 6 18 0 36" fill="none" stroke="#1F1F1F" stroke-width="2.5"/><g ' + O + '><path d="M50 6C24 6 8 28 8 52c0 30 24 52 42 58 18-6 42-28 42-58C92 28 76 6 50 6z" fill="#FFCF3D"/><path d="M44 110h12l-4 8h-4z" fill="#FFCF3D"/><ellipse cx="38" cy="50" rx="6" ry="8" fill="#fff"/><ellipse cx="62" cy="50" rx="6" ry="8" fill="#fff"/><path d="M36 70q14 12 28 0" fill="none"/></g><circle cx="39" cy="52" r="3.5" fill="#1F1F1F"/><circle cx="63" cy="52" r="3.5" fill="#1F1F1F"/><ellipse cx="28" cy="64" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="72" cy="64" rx="5" ry="3" fill="#FF9BB0"/></svg>';
  var fills = ["#F3A6B8", "#BFE8EE", "#FFE29A", "#C9F0A6", "#E3D5FA"];

  TG.register("vowel", {
    title: "بالونات الحركات", mascot: "balloonFace", cue: "sound", winWord: "سمعك ذهب!",
    winText: function (c) { return c.T("عرفت الفتحة والضمة والكسرة، أنت و", "عرفتِ الفتحة والضمة والكسرة، أنتِ و") + c.api.friendName(); },
    replay: function (c) { if (c.cur) c.api.speakSyl(c.L, c.cur); },
    onWin: function (c) { var S = c.api.S(), p = S.progress[c.L.id] = S.progress[c.L.id] || {}; p.vgame = true; c.api.save(); },
    start: function (c) {
      var api = c.api, L = c.L, V = api.VOWELS, order = c.shuffle(["f", "d", "k", "f", "d", "k"]), r = -1, busy = true;
      c.total = order.length; c.setScore(0);
      c.add('<svg viewBox="0 0 ' + c.W + ' ' + c.H + '" width="' + c.W + '" height="' + c.H + '" aria-hidden="true"><rect width="' + c.W + '" height="' + c.H + '" fill="#DDF3F7"/>' +
        '<ellipse cx="' + c.W * 0.15 + '" cy="' + c.H * 0.92 + '" rx="' + c.W * 0.45 + '" ry="' + c.H * 0.16 + '" fill="#FCE3EA"/><ellipse cx="' + c.W * 0.85 + '" cy="' + c.H * 0.95 + '" rx="' + c.W * 0.45 + '" ry="' + c.H * 0.14 + '" fill="#F3A6B8"/>' +
        '<rect y="' + (c.H - 70) + '" width="' + c.W + '" height="70" fill="#A3C93A"/><rect y="' + (c.H - 40) + '" width="' + c.W + '" height="40" fill="#E7F2C3"/></svg>', "p-abs");
      c.add(api.figHTML(), "fig p-abs", "left:" + (c.W / 2 - 60) + "px;top:" + (c.H - 175) + "px;width:120px;z-index:2");
      var items = [];
      function next() {
        r++; c.miss = 0; c.cur = order[r]; items = [];
        var ks = c.shuffle(["f", "d", "k"]), xs = [0.2, 0.5, 0.8];
        ks.forEach(function (k, i) {
          var x = c.W * xs[i] - 48, y = c.H * 0.2 + (i === 1 ? -14 : 14);
          var el = c.add(TG.art.balloon(fills[(r + i) % fills.length]) + '<b class="p-lbl" style="--s:66px;top:22px;font-size:2.4rem">' + api.sylHTML(L, k) + "</b>", "p-bob", "left:" + x + "px;top:" + y + "px;width:96px;height:144px;z-index:3;animation-delay:" + (i * 0.4) + "s", "button");
          el.classList.add("p-item"); el.setAttribute("data-ok", k === c.cur ? "1" : "0"); el.setAttribute("data-ch", k);
          el.setAttribute("aria-label", "بالون " + (i + 1));
          el.addEventListener("click", function () { tap(el, k); });
          items.push(el);
        });
        busy = false;
        c.later(function () { api.speakSyl(L, c.cur); }, 500);
      }
      function vname(k) { for (var i = 0; i < V.length; i++) if (V[i].k === k) return V[i].name; return ""; }
      function tap(el, k) {
        if (busy || !c.alive) return;
        api.unlock();
        if (k !== c.cur) {
          el.classList.remove("p-no"); void el.offsetWidth; el.classList.add("p-no");
          api.sfx.no(); api.speakSyl(L, k);
          var rr = el.getBoundingClientRect(), ss = c.stage.getBoundingClientRect();
          c.say("هذي " + vname(k) + "، " + c.T("اسمع مرة ثانية", "اسمعي مرة ثانية"), rr.left - ss.left + rr.width / 2, rr.top - ss.top - 6);
          c.miss++; if (c.miss >= 2) c.hint();
          c.later(function () { api.speakSyl(L, c.cur); }, 1300);
          return;
        }
        busy = true; el.classList.remove("p-hint"); api.sfx.pop();
        var rr2 = el.getBoundingClientRect(), ss2 = c.stage.getBoundingClientRect();
        c.burst(rr2.left - ss2.left + rr2.width / 2, rr2.top - ss2.top + 50);
        el.style.transition = "transform .25s, opacity .25s"; el.style.transform = "scale(1.3)"; el.style.opacity = "0";
        c.say(vname(k) + "!", c.W / 2, c.H * 0.62);
        c.later(function () {
          c.setScore(c.score + 1);
          if (c.score >= c.total) { c.later(c.win, 400); return; }
          items.forEach(function (it) { it.classList.add("p-gone"); });
          c.later(function () { items.forEach(function (it) { it.remove(); }); next(); }, 350);
        }, 500);
      }
      c.later(function () { c.say(c.T("اسمع الصوت واضغط بالونه", "اسمعي الصوت واضغطي بالونه"), c.W / 2, c.H * 0.62); next(); }, 350);
    }
  });
})();

;
/* و — وردة: three pots with little sprouts; water the one that carries و and it grows into a flower */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  var POT = '<svg viewBox="0 0 100 74" class="ww-pot"><g ' + O + '><path d="M16 22h68l-9 48H25z" fill="#D96A3C"/><rect x="8" y="8" width="84" height="18" rx="5" fill="#E9875A"/></g><ellipse cx="50" cy="12" rx="36" ry="4" fill="#6B3E1F"/><rect x="24" y="30" width="7" height="30" rx="3" fill="#fff" opacity=".3"/></svg>';
  var SPROUT = '<svg viewBox="0 0 60 50" class="ww-sprout"><g ' + O + '><path d="M30 48V24" fill="none" stroke="#3F7A12"/><path d="M30 30c-4-12-18-14-22-8 4 8 14 10 22 8zM30 26c4-12 18-14 22-8-4 8-14 10-22 8z" fill="#7CC242"/></g></svg>';
  function flower(petal) {
    var p = "";
    for (var i = 0; i < 6; i++) p += '<ellipse cx="50" cy="26" rx="11" ry="17" fill="' + petal + '" stroke="#1F1F1F" stroke-width="3.5" transform="rotate(' + i * 60 + ' 50 42)"/>';
    return '<svg viewBox="0 0 100 150" class="ww-flower"><g ' + O + '><path d="M50 150V58" fill="none" stroke="#3F7A12" stroke-width="6"/><path d="M50 116c-8-16-30-18-34-8 6 10 22 12 34 8zM50 100c8-16 30-18 34-8-6 10-22 12-34 8z" fill="#7CC242"/></g>' +
      '<g class="ww-head">' + p + '<circle cx="50" cy="42" r="13" fill="#FFCF3D" stroke="#1F1F1F" stroke-width="3.5"/><circle cx="46" cy="40" r="2.4" fill="#1F1F1F"/><circle cx="55" cy="40" r="2.4" fill="#1F1F1F"/><path d="M45 47q5 4 10 0" fill="none" stroke="#1F1F1F" stroke-width="2.5" stroke-linecap="round"/></g></svg>';
  }
  TG.art.can = '<svg viewBox="0 0 130 100"><g ' + O + '><path d="M88 46l34-24 6 8-30 30" fill="#11808F"/><path d="M118 18l12 10" stroke-width="7"/><path d="M30 34h58v52a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8z" fill="#11808F"/><path d="M30 46c-20 0-24 30 0 30" fill="none" stroke-width="7"/><path d="M40 34c0-18 38-18 38 0" fill="none" stroke-width="7"/></g><rect x="38" y="42" width="10" height="40" rx="4" fill="#fff" opacity=".3"/></svg>';
  TG.art.flowerFace = '<svg viewBox="0 0 120 140">' + '<g ' + O + '><path d="M60 140V76" fill="none" stroke="#3F7A12" stroke-width="7"/><path d="M60 118c-10-18-34-20-38-10 6 11 24 14 38 10zM60 106c10-18 34-20 38-10-6 11-24 14-38 10z" fill="#7CC242"/></g>' +
    (function () { var p = ""; for (var i = 0; i < 6; i++) p += '<ellipse cx="60" cy="18" rx="15" ry="22" fill="#F3A6B8" stroke="#1F1F1F" stroke-width="4" transform="rotate(' + i * 60 + ' 60 42)"/>'; return p; })() +
    '<circle cx="60" cy="42" r="19" fill="#FFCF3D" stroke="#1F1F1F" stroke-width="4"/><circle cx="53" cy="40" r="3.4" fill="#1F1F1F"/><circle cx="67" cy="40" r="3.4" fill="#1F1F1F"/><path d="M52 49q8 7 16 0" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/><ellipse cx="46" cy="48" rx="4" ry="2.6" fill="#FF9BB0"/><ellipse cx="74" cy="48" rx="4" ry="2.6" fill="#FF9BB0"/></svg>';

  var PETALS = ["#F3A6B8", "#B39DDB", "#FFB36B", "#FF8A80", "#90CAF9"];
  var can = null, canHome = null, bloomed = 0;
  TG.register("و", TG.choice({
    title: "اسقِ الوردة", mascot: "flowerFace", rounds: 5, count: 3, winWord: "حديقة حلوة!",
    goal: function (T) { return T("اسقِ", "اسقي"); },
    winText: function (c) { return c.T("سقيت ورود الـ و كلها، أنت و", "سقيتِ ورود الـ و كلها، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      bloomed = 0;
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      c.add(TG.art.sceneC ? TG.art.sceneC(c.W, 140) : "", "p-abs", "left:0;top:" + (c.H - 140) + "px");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 124) + "px;top:" + (c.H - 214) + "px;width:116px;z-index:1");
      canHome = { x: 14, y: c.H * 0.13 };
      can = c.add(TG.art.can, "p-abs", "left:" + canHome.x + "px;top:" + canHome.y + "px;width:110px;z-index:5;pointer-events:none");
      if (!document.getElementById("ww-css")) {
        var st = document.createElement("style"); st.id = "ww-css";
        st.textContent = ".p-stage .ww-flower{position:absolute;left:4px;bottom:52px;width:88px;height:132px;transform:scaleY(0);transform-origin:50% 100%;transition:transform .9s cubic-bezier(.34,1.56,.64,1)}" +
          ".p-stage .ww-flower .ww-head{transform:scale(0);transform-origin:50px 42px;transition:transform .6s cubic-bezier(.34,1.56,.64,1) .7s}" +
          ".p-stage .ww-grow .ww-flower{transform:scaleY(1)}.p-stage .ww-grow .ww-flower .ww-head{transform:scale(1)}" +
          ".p-stage .ww-sprout{position:absolute;left:24px;bottom:58px;width:48px;height:40px;transition:opacity .4s}.p-stage .ww-grow .ww-sprout{opacity:0}" +
          ".p-stage .ww-pot{position:absolute;left:0;bottom:0;width:96px;height:72px}" +
          ".ww-drop{position:absolute;width:9px;height:13px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#4FC3F7;border:2px solid #1F1F1F;animation:wwdrop .6s ease-in forwards}" +
          "@keyframes wwdrop{from{transform:translateY(0);opacity:1}to{transform:translateY(70px);opacity:0}}";
        document.head.appendChild(st);
      }
    },
    intro: function (c) { c.say(c.T("أي وردة فيها و؟ اسقها!", "أي وردة فيها و؟ اسقيها!"), c.W / 2, c.H * 0.36); },
    slots: function (c, n) {
      return [0.19, 0.5, 0.81].slice(0, n).map(function (p) { return { x: c.W * p, y: c.H * 0.62 }; });
    },
    item: function (c, ch, i, s, round) {
      return c.add(flower(PETALS[(round + i) % PETALS.length]) + SPROUT + POT + TG.lbl(ch, 42, "bottom:12px;top:auto"), "",
        "left:" + (s.x - 48) + "px;top:" + (s.y - 186) + "px;width:96px;height:190px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var tx = s.x - 120, ty = s.y - 210;
      c.move(can, tx, ty, 700, 30, function () {
        var svg = can.querySelector("svg"); svg.style.transition = "transform .35s"; svg.style.transformOrigin = "40% 60%"; svg.style.transform = "rotate(24deg)";
        c.sfx.plop && c.sfx.plop();
        for (var d = 0; d < 6; d++) (function (d) {
          c.later(function () { c.add("", "ww-drop", "left:" + (s.x - 18 + (d % 3) * 10) + "px;top:" + (s.y - 140) + "px;z-index:4;animation-delay:0s"); }, 150 + d * 110);
        })(d);
        c.later(function () {
          Array.prototype.forEach.call(c.stage.querySelectorAll(".ww-drop"), function (x) { x.remove(); });
          svg.style.transform = "";
          el.classList.add("ww-grow"); bloomed++;
          c.sfx.ding && c.sfx.ding();
          c.later(function () { c.burst(s.x, s.y - 150, ["#FFCF3D", "#F3A6B8", "#A3C93A"]); c.say(["وردة!", "وردتين!", "ثلاث ورود!", "أربع ورود!", "خمس ورود!"][bloomed - 1], s.x, s.y - 190); }, 900);
          c.move(can, canHome.x, canHome.y, 700, 20);
          c.later(next, 1900);
        }, 950);
      });
    }
  }));
})();

;
/* ي — يد: trace the isolated ي with a finger along a thick light track; it fills in colour, then its two dots drop in. Three traces. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.handFace = '<svg viewBox="0 0 120 140"><g ' + O + '>' +
    '<rect x="28" y="10" width="16" height="56" rx="8" fill="#F6C9A0"/><rect x="46" y="4" width="16" height="60" rx="8" fill="#F6C9A0"/><rect x="64" y="8" width="16" height="58" rx="8" fill="#F6C9A0"/><rect x="82" y="20" width="15" height="48" rx="7.5" fill="#F6C9A0"/>' +
    '<path d="M24 56c0-8 6-10 10-10h52c8 0 12 4 12 12v30c0 26-18 44-40 44S22 116 22 92z" fill="#F6C9A0"/>' +
    '<path d="M26 82c-10-10-20-18-14-26 6-6 14 2 20 10" fill="#F6C9A0"/>' +
    '<ellipse cx="48" cy="84" rx="6" ry="8" fill="#fff"/><ellipse cx="72" cy="84" rx="6" ry="8" fill="#fff"/><path d="M50 102q10 8 20 0" fill="none"/></g>' +
    '<circle cx="49" cy="86" r="3.4" fill="#1F1F1F"/><circle cx="73" cy="86" r="3.4" fill="#1F1F1F"/><ellipse cx="38" cy="98" rx="5" ry="3" fill="#FF9BB0"/><ellipse cx="82" cy="98" rx="5" ry="3" fill="#FF9BB0"/></svg>';

  /* the isolated ي (Naskh shape): small head at the top right, belly to the right, wide bowl sweeping left, tail turning up */
  var D = "M206 30C168 28 142 62 170 90C196 112 254 104 256 144C260 198 152 216 92 206C56 200 34 182 40 148";
  var COLORS = ["#F2693B", "#11808F", "#7E57C2"];

  TG.register("ي", {
    title: "ارسم الياء", mascot: "handFace", winWord: "رسم حلو!",
    goal: function (T) { return T("ارسم", "ارسمي"); },
    winText: function (c) { return c.T("رسمت الياء بإصبعك ثلاث مرات، أنت و", "رسمتِ الياء بإصبعك ثلاث مرات، أنتِ و") + c.api.friendName(); },
    start: function (c) {
      c.total = 3; c.setScore(0);
      var w0 = c.win; c.win = function () { var ps = c.stage.querySelector(".p-say"); if (ps) ps.style.display = "none"; w0(); };
      c.add(TG.art.sceneC ? TG.art.sceneC(c.W, 120) : "", "p-abs", "left:0;top:" + (c.H - 120) + "px");
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 112) + "px;top:" + (c.H - 180) + "px;width:104px;z-index:1");
      var sc = Math.min((c.W - 24) / 300, (c.H * 0.62) / 270), sw = Math.round(300 * sc), sh = Math.round(270 * sc);
      var box = c.add('<svg viewBox="0 0 300 270" width="' + sw + '" height="' + sh + '" style="touch-action:none;overflow:visible">' +
        '<path d="' + D + '" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"/>' +
        '<path d="' + D + '" fill="none" stroke="#E2EEF1" stroke-width="36" stroke-linecap="round"/>' +
        '<path d="' + D + '" fill="none" stroke="#B9CDD4" stroke-width="3" stroke-dasharray="1 12" stroke-linecap="round"/>' +
        '<path class="yp" d="' + D + '" fill="none" stroke="#F2693B" stroke-width="28" stroke-linecap="round"/>' +
        '<g class="ycp"></g>' +
        '<g class="ydots" style="transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .5s cubic-bezier(.34,1.56,.64,1)"><circle cx="124" cy="246" r="12" fill="#F2693B" stroke="#1F1F1F" stroke-width="4"/><circle cx="160" cy="246" r="12" fill="#F2693B" stroke="#1F1F1F" stroke-width="4"/></g>' +
        '<g class="ypen"><circle r="21" fill="#FFCF3D" opacity=".45"/><circle r="13" fill="#FFCF3D" stroke="#1F1F1F" stroke-width="4"/></g>' +
        '</svg>', "p-abs", "left:" + Math.round((c.W - sw) / 2) + "px;top:" + Math.max(84, Math.round(c.H * 0.13)) + "px;z-index:3");
      var sayY = Math.max(84, Math.round(c.H * 0.13)) + sh + 36;
      var svg = box.querySelector("svg"), prog = box.querySelector(".yp"), pen = box.querySelector(".ypen"), dots = box.querySelector(".ydots"), cp = box.querySelector(".ycp");
      var L = prog.getTotalLength(), pts = [];
      for (var s = 0; s <= L; s += 3) { var p = prog.getPointAtLength(s); pts.push({ s: s, x: p.x, y: p.y }); }
      var done = 0, busy = false, tracking = false, demo = 0, color = 0, marks = [];
      prog.style.strokeDasharray = L + " " + (L + 40);
      function at(s) { return prog.getPointAtLength(Math.max(0, Math.min(L, s))); }
      function paint() {
        prog.style.strokeDashoffset = String(L - done);
        if (!demo) { var q = at(done); pen.setAttribute("transform", "translate(" + q.x + " " + q.y + ")"); }
        marks.forEach(function (m) { m.el.style.opacity = done >= m.s - 4 ? "0" : "1"; });
      }
      function checkpoints() {
        cp.innerHTML = ""; marks = [];
        [[0.0, "1"], [0.36, "2"], [0.68, "3"], [1.0, "★"]].forEach(function (k, i) {
          var q = at(L * k[0]);
          var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("transform", "translate(" + q.x + " " + (q.y - (i === 0 ? 0 : 0)) + ")");
          g.style.transition = "opacity .3s";
          g.innerHTML = '<circle r="15" fill="' + (i === 0 ? "#A3C93A" : i === 3 ? "#FFCF3D" : "#fff") + '" stroke="#1F1F1F" stroke-width="3"/><text y="6" text-anchor="middle" font-size="17" font-weight="800" fill="#22333F" font-family="Baloo Bhaijaan 2, sans-serif">' + k[1] + "</text>";
          cp.appendChild(g);
          if (i > 0) marks.push({ s: L * k[0], el: g });
        });
      }
      function fresh() {
        done = 0; busy = false; tracking = false;
        prog.setAttribute("stroke", COLORS[color % 3]);
        Array.prototype.forEach.call(dots.querySelectorAll("circle"), function (d) { d.setAttribute("fill", COLORS[color % 3]); });
        dots.style.transform = "scale(0)";
        checkpoints(); paint();
        demo = 0.001; /* the pen shows the way once, then waits at the start */
      }
      function toSvg(ev) {
        var m = svg.getScreenCTM(); if (!m) return null;
        var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
        return pt.matrixTransform(m.inverse());
      }
      function follow(ev) {
        var p = toSvg(ev); if (!p) return;
        var best = -1, bd = 1e9;
        for (var i = 0; i < pts.length; i++) {
          var q = pts[i]; if (q.s < done - 6 || q.s > done + 46) continue;
          var d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) { bd = d; best = q.s; }
        }
        if (best >= 0 && bd < 34 && best > done) { done = best; paint(); if (done >= L - 9) complete(); }
      }
      svg.addEventListener("pointerdown", function (ev) {
        if (busy || !c.alive) return;
        c.api.unlock();
        var p = toSvg(ev), q = at(done);
        if (p && Math.hypot(p.x - q.x, p.y - q.y) < 46) {
          tracking = true; demo = 0; paint();
          try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
          ev.preventDefault();
        } else {
          c.say(c.T("ابدأ من النقطة الصفرا", "ابدئي من النقطة الصفرا"), c.W / 2, sayY);
        }
      });
      svg.addEventListener("pointermove", function (ev) { if (tracking && !busy) { ev.preventDefault(); follow(ev); } });
      function up() { tracking = false; }
      svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
      function complete() {
        if (busy) return;
        busy = true; tracking = false; done = L; paint();
        dots.style.transform = "scale(1)";
        c.sfx.ding && c.sfx.ding();
        var r = box.getBoundingClientRect(), s0 = c.stage.getBoundingClientRect();
        c.burst(r.left - s0.left + r.width / 2, r.top - s0.top + r.height * 0.6);
        c.say(["ياء!", "ياء مرة ثانية!", "ثلاث مرات!"][Math.min(2, c.score)], c.W / 2, sayY);
        c.speak();
        c.setScore(c.score + 1);
        if (c.score >= c.total) { c.later(c.win, 1500); return; }
        c.later(function () { color++; fresh(); }, 1700);
      }
      c.loop(function (dt) {
        if (!demo) return;
        demo += dt * L / 1.8;
        var q = at(demo > L ? 0 : demo);
        pen.setAttribute("transform", "translate(" + q.x + " " + q.y + ")");
        if (demo > L + 60) { demo = 0; paint(); }
      });
      c.def.auto = function (cx) { if (!busy && cx.alive) { done = L - 1; paint(); complete(); } };
      fresh();
      c.later(function () { c.speak(); c.say(c.T("امشِ بإصبعك على الخط", "امشي بإصبعك على الخط"), c.W / 2, sayY); }, 400);
    }
  });
})();

;
/* ظ — ظرف: envelopes carry letters; tap the ظ envelope and it flies into the mailbox, whose flag pops up */
(function () {
  TG.cssB = TG.cssB || function (id, t) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = t; document.head.appendChild(s);
  };
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  TG.art.envelope = function (col) {
    return '<svg viewBox="0 0 110 80"><g ' + O + '><rect x="6" y="8" width="98" height="66" rx="8" fill="' + col + '"/>' +
      '<path d="M8 12l47 36 47-36" fill="none"/><path d="M8 72l34-28M102 72l-34-28" fill="none" stroke-width="3"/></g>' +
      '<path d="M16 18h20" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';
  };
  TG.art.envelopeFace = TG.art.envelope("#FFE0A3").replace("</svg>",
    '<ellipse cx="40" cy="54" rx="5" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="2.5"/><ellipse cx="70" cy="54" rx="5" ry="6.5" fill="#fff" stroke="#1F1F1F" stroke-width="2.5"/>' +
    '<circle cx="41" cy="55" r="2.6" fill="#1F1F1F"/><circle cx="71" cy="55" r="2.6" fill="#1F1F1F"/><path d="M48 64q7 6 14 0" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/>' +
    '<ellipse cx="30" cy="62" rx="4" ry="2.6" fill="#FF9BB0"/><ellipse cx="80" cy="62" rx="4" ry="2.6" fill="#FF9BB0"/></svg>');
  TG.art.mailbox = '<svg viewBox="0 0 120 200"><g ' + O + '><rect x="52" y="84" width="16" height="114" fill="#B7793A"/>' +
    '<path d="M14 92V44c0-22 16-34 36-34h20c22 0 36 12 36 34v48z" fill="#E5533F"/>' +
    '<path d="M50 10c-20 0-36 12-36 34v48h36z" fill="#C8382E"/>' +
    '<rect x="64" y="40" width="34" height="9" rx="4" fill="#1F1F1F"/></g>' +
    '<path d="M22 40c2-12 10-20 22-22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/></svg>';
  TG.art.mailFlag = '<svg viewBox="0 0 30 70"><g ' + O + '><path d="M10 68V8" fill="none" stroke-width="6"/><path d="M10 68V8" fill="none" stroke="#FFCF3D" stroke-width="2"/><path d="M10 8h18v16H10z" fill="#FFCF3D"/></g></svg>';
  var cols = ["#FFE0A3", "#BFE8EE", "#FCE3EA", "#E7DCFA"];
  var g = {};
  TG.register("ظ", TG.choice({
    title: "صندوق البريد", mascot: "envelopeFace", rounds: 5, count: 3, winWord: "وصل البريد!",
    winText: function (c) { return c.T("وصّلت كل ظروف الـ ظ للصندوق، أنت و", "وصّلتِ كل ظروف الـ ظ للصندوق، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var W = c.W, H = c.H, cw = Math.min(W, 460), cx = W / 2, hy = Math.round(H * 0.58);
      g.cx = cx; g.cw = cw;
      c.add(TG.meadowB(W, H, hy), "p-abs");
      var mx = cx + cw * 0.5 - 132, my = hy - 168;
      g.box = c.add(TG.art.mailbox, "p-abs", "left:" + mx + "px;top:" + my + "px;width:120px;height:200px;z-index:2");
      g.flag = c.add(TG.art.mailFlag, "p-abs", "left:" + (mx + 4) + "px;top:" + (my + 22) + "px;width:24px;height:56px;z-index:1;transform-origin:40% 95%;transform:rotate(-90deg);transition:transform .45s cubic-bezier(.34,1.56,.64,1)");
      g.slot = { x: mx + 81, y: my + 44 };
      c.add(c.api.figHTML(), "fig p-abs", "left:8px;top:" + (H - 168) + "px;width:112px;z-index:2");
    },
    intro: function (c) { c.say(c.T("وين ظرف الـ ظ؟", "وين ظرف الـ ظ؟"), g.cx - g.cw * 0.12, c.H * 0.62); },
    slots: function (c, n) {
      var pts = c.shuffle([[-0.27, 0.19], [0.0, 0.32], [-0.24, 0.46]]).slice(0, n);
      return pts.map(function (p) { return { x: g.cx + g.cw * p[0] + c.rnd(-8, 8), y: c.H * p[1] + 30 + c.rnd(-8, 8) }; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.envelope(cols[(i + c.score) % cols.length]) + TG.lbl(ch, 46, "top:19px"), "", "left:" + (s.x - 55) + "px;top:" + (s.y - 40) + "px;width:110px;height:80px;z-index:3;rotate:" + c.rnd(-8, 8).toFixed(1) + "deg", "button");
    },
    enter: function (c, items) {
      items.forEach(function (el, i) {
        if (el.animate) el.animate([{ transform: "translateY(-50px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 650, delay: i * 120, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" });
      });
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      c.api.sweep && c.api.sweep(500, 1200, 0.4, "sine", 0.08);
      el.style.rotate = "0deg";
      c.move(el, g.slot.x - 55, g.slot.y - 40, 1000, 90, function () {
        el.style.transition = "transform .35s ease-in, opacity .35s"; el.style.transform = "scale(.25)"; el.style.opacity = "0";
        g.flag.style.transform = "rotate(0deg)";
        c.sfx.pop && c.sfx.pop(); c.burst(g.slot.x, g.slot.y);
        if (c.score < c.total - 1) c.say("ظاء!", g.slot.x - 20, g.slot.y - 30);
        el.removeAttribute("data-ok"); el.classList.add("p-done");
        c.later(function () { g.flag.style.transform = "rotate(-90deg)"; next(); }, 900);
      });
    },
    clear: function (c, items, next) {
      items.forEach(function (it) { it.classList.add("p-gone"); c.later(function () { it.remove(); }, 320); });
      c.later(next, 340);
    }
  }));
})();

;
/* ز — زرافة: three leaves hang at different heights, each with a letter. Tap the ز leaf and the giraffe
   stretches its neck up to eat it. */
(function () {
  var O = 'stroke="#1F1F1F" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  var SPOT = "#C9782F", SKIN = "#F5B942";
  TG.art.zay_body = '<svg viewBox="0 0 160 130"><g ' + O + '>' +
    '<path d="M30 124V84M50 124V88M108 124V88M128 124V84" fill="none" stroke-width="10"/>' +
    '<path d="M30 124V84M50 124V88M108 124V88M128 124V84" fill="none" stroke="' + SKIN + '" stroke-width="4"/>' +
    '<path d="M24 64q-16 6-14 26" fill="none"/><path d="M8 88l4 10 6-8z" fill="' + SPOT + '"/>' +
    '<path d="M22 70Q20 40 56 38L118 30Q146 32 142 64Q140 92 112 94L48 94Q22 94 22 70Z" fill="' + SKIN + '"/></g>' +
    '<g fill="' + SPOT + '"><circle cx="48" cy="58" r="9"/><circle cx="74" cy="72" r="10"/><circle cx="96" cy="50" r="9"/><circle cx="120" cy="72" r="8"/><circle cx="60" cy="82" r="6"/></g></svg>';
  function head(face) {
    return '<svg viewBox="0 0 100 80"><g ' + O + '><path d="M30 14V2M44 12V0" fill="none"/><circle cx="30" cy="4" r="5" fill="' + SPOT + '"/><circle cx="44" cy="2" r="5" fill="' + SPOT + '"/>' +
      '<path d="M16 22l-12-8 4 16z" fill="' + SKIN + '"/>' +
      '<path d="M14 40Q12 14 44 14Q70 14 84 30Q98 44 92 56Q84 68 62 66L36 64Q16 62 14 40Z" fill="' + SKIN + '"/>' +
      '<path d="M66 50q10 8 20 0" fill="none"/></g><circle cx="46" cy="34" r="5" fill="#1F1F1F"/><circle cx="47.6" cy="32.4" r="1.8" fill="#fff"/>' +
      '<circle cx="86" cy="44" r="2.5" fill="#1F1F1F"/><circle cx="30" cy="48" r="6" fill="' + SPOT + '"/>' +
      (face ? '<ellipse cx="60" cy="52" rx="5" ry="3" fill="#FF9BB0"/>' : '') + '</svg>';
  }
  TG.art.zay_head = head(false);
  TG.art.zay_giraffe = '<svg viewBox="-25 0 230 230"><g transform="translate(0 100)">' + TG.art.zay_body.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") + '</g>' +
    '<rect x="100" y="44" width="28" height="82" rx="12" fill="' + SKIN + '" stroke="#1F1F1F" stroke-width="4"/><circle cx="112" cy="70" r="5" fill="' + SPOT + '"/><circle cx="118" cy="96" r="5" fill="' + SPOT + '"/>' +
    '<g transform="translate(72 0)">' + head(true).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") + '</g></svg>';
  TG.art.zay_leaf = '<svg viewBox="0 0 92 78"><g ' + O + '><path d="M84 8L70 18" fill="none"/><path d="M8 42Q30 6 74 14Q80 62 32 70Q12 66 8 42Z" fill="#7CC242"/><path d="M20 52Q44 40 70 18" fill="none" stroke="#4E9A28" stroke-width="3"/></g></svg>';
  function scene(w, h, g, tx, levels) {
    var o = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><rect width="' + w + '" height="' + h + '" fill="#E4F5F8"/>';
    o += '<ellipse cx="' + w * 0.2 + '" cy="' + g + '" rx="' + w * 0.45 + '" ry="' + h * 0.1 + '" fill="#FCE3EA"/>';
    o += '<rect y="' + g + '" width="' + w + '" height="' + (h - g) + '" fill="#A3C93A"/><rect y="' + (g + 26) + '" width="' + w + '" height="' + h + '" fill="#F2F8DF"/>';
    for (var x = -10; x < w + 40; x += 38) o += '<circle cx="' + x + '" cy="' + g + '" r="18" fill="#A3C93A"/>';
    o += '<g ' + O + '><path d="M' + (tx - 16) + ' ' + (g + 10) + 'L' + (tx - 10) + ' ' + (h * 0.12) + 'H' + (tx + 14) + 'L' + (tx + 20) + ' ' + (g + 10) + 'Z" fill="#B7793A"/>';
    levels.forEach(function (y) { o += '<path d="M' + (tx - 8) + ' ' + (y + 6) + 'Q' + (tx - 50) + ' ' + (y - 14) + ' ' + (w * 0.6 + 30) + ' ' + (y - 30) + '" fill="none" stroke="#8C5A2B" stroke-width="7"/>'; });
    o += '</g>';
    [[0.8, 0.1, 70], [0.98, 0.18, 56], [0.66, 0.08, 50]].forEach(function (b) { o += '<circle cx="' + w * b[0] + '" cy="' + h * b[1] + '" r="' + (b[2] + 5) + '" fill="#fff"/>'; });
    [[0.8, 0.1, 70], [0.98, 0.18, 56], [0.66, 0.08, 50]].forEach(function (b) { o += '<circle cx="' + w * b[0] + '" cy="' + (h * b[1] + 3) + '" r="' + b[2] + '" fill="#7CC242"/>'; });
    return o + '</svg>';
  }
  var G = null;
  function setNeck(c, nh, ms) {
    G.neck.style.transition = G.head.style.transition = "top " + ms + "ms cubic-bezier(.34,1.2,.64,1),height " + ms + "ms cubic-bezier(.34,1.2,.64,1)";
    G.neck.style.top = (G.sy - nh) + "px"; G.neck.style.height = (nh + 12) + "px";
    G.head.style.top = (G.sy - nh - 52) + "px";
  }
  TG.register("ز", TG.choice({
    title: "الزرافة الجوعانة", mascot: "zay_giraffe", rounds: 5, count: 3, winWord: "الزرافة شبعت!",
    winText: function (c) { return c.T("أكّلت الزرافة أوراق الـ ز، أنت و", "أكّلتِ الزرافة أوراق الـ ز، أنتِ و") + c.api.friendName(); },
    scene: function (c) {
      var g = Math.round(c.H * 0.84);
      c.levels = [c.H * 0.2, c.H * 0.35, c.H * 0.5];
      c.add(scene(c.W, c.H, g, c.W * 0.86, c.levels), "p-abs");
      var bx = 6, by = g - 112, sx = bx + 114;          /* shoulder: where the neck leaves the body */
      G = { sx: sx, sy: by + 46 };
      G.neck = c.add("", "p-abs", "left:" + (sx - 16) + "px;width:32px;border:4px solid #1F1F1F;border-radius:14px;z-index:2;" +
        "background:radial-gradient(circle at 40% 30%," + SPOT + " 0 6px,transparent 7px) 0 0/30px 40px," + SKIN);
      G.body = c.add(TG.art.zay_body, "p-abs", "left:" + bx + "px;top:" + by + "px;width:160px;z-index:3");
      G.head = c.add(TG.art.zay_head, "p-abs", "left:" + (sx - 30) + "px;width:100px;z-index:4");
      setNeck(c, 100, 0);
      c.add(c.api.figHTML(), "fig p-abs", "left:" + (c.W - 120) + "px;top:" + (c.H - 168) + "px;width:110px;z-index:5");
    },
    intro: function (c) { c.say(c.T("الزرافة جوعانة! وين ورقة الـ ز؟", "الزرافة جوعانة! وين ورقة الـ ز؟"), G.sx + 30, G.sy - 200); },
    slots: function (c, n) {
      return c.shuffle(c.levels.slice()).slice(0, n).map(function (y, i) { return { x: G.sx + 104 + c.rnd(-6, 10), y: y }; }).sort(function (a, b) { return a.y - b.y; });
    },
    item: function (c, ch, i, s) {
      return c.add(TG.art.zay_leaf + TG.lbl(ch, 42, "top:18px;left:22px"), "", "left:" + (s.x - 46) + "px;top:" + (s.y - 39) + "px;width:92px;height:78px;z-index:3", "button");
    },
    right: function (c, el, s, next) {
      el.style.pointerEvents = "none";
      var nh = Math.max(60, G.sy - s.y - 12);
      c.sfx.hop && c.sfx.hop();
      setNeck(c, nh, 900);
      c.later(function () {
        c.move(el, G.sx + 40, s.y - 30, 420, 0, function () {
          el.style.transition = "transform .3s, opacity .3s"; el.style.transform = "scale(.2)"; el.style.opacity = "0";
          c.sfx.pop && c.sfx.pop(); c.later(function () { c.sfx.pop && c.sfx.pop(); }, 180);
          c.burst(G.sx + 70, s.y, ["#7CC242", "#A3C93A", "#FFCF3D"]);
          c.say(["زاي! يم!", "لذيذة!", "ثلاث!", "أربع!", "خمس!"][c.score], G.sx + 60, s.y - 60);
          el.classList.add("p-done"); el.removeAttribute("data-ok");
          c.later(function () { setNeck(c, 100, 800); c.later(next, 700); }, 600);
        });
      }, 950);
    }
  }));
})();

;
/* تأسيس — the drawn art (Gemini stickers in app/art/*.webp) replaces the first flat SVG drawings.
   Every sticker is wrapped in an <svg> with the SAME viewBox the old drawing had, so each game keeps
   its sizes, positions and its querySelector("svg") tricks (flip, spin, tilt) without changes.
   Drawings that are part of a mechanism (shell lid, mailbox flag, wagon slots, nest spot, giraffe neck)
   stay as they were. New games can use any sticker with TG.pic(name, "0 0 w h"). */
(function () {
  "use strict";
  var TG = window.TG, A = TG.art;
  var BASE = "art/";
  function hueOf(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
    var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (!d) return null;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  /* recolour a sticker towards a colour the game asked for (balloons per vowel, birds on the wire…) */
  function tint(col, baseHue) {
    var h = hueOf(col); if (h == null || baseHue == null) return "";
    var d = Math.round(h - baseHue); if (Math.abs(d) < 12) return "";
    return "filter:hue-rotate(" + d + "deg) saturate(1.25)";
  }
  TG.pic = function (name, vb, opt) {
    opt = opt || {};
    var p = vb.split(" ").map(Number), wh = opt.w ? ' width="' + opt.w + '" height="' + opt.h + '"' : "";
    return '<svg viewBox="' + vb + '"' + wh + ' aria-hidden="true"><image href="' + BASE + name + '.webp" x="' + p[0] + '" y="' + p[1] + '" width="' + p[2] + '" height="' + p[3] +
      '" preserveAspectRatio="' + (opt.align || "xMidYMid") + ' meet"' + (opt.style ? ' style="' + opt.style + '"' : "") + "/></svg>";
  };
  var P = TG.pic;
  /* plain swaps: same name, same box */
  var SWAP = {
    apple: ["apple", "0 0 100 100"], appleFace: ["appleFace", "0 0 100 100"], basket: ["basket", "0 0 120 84"],
    date: ["date", "0 0 80 100"], palmFace: ["palmFace", "0 0 120 130"],
    falconFly: ["falconFly", "0 0 150 110"], falconFace: ["falconFace", "0 0 120 130"],
    horse: ["horse", "0 0 140 120"], lemon: ["lemon", "0 0 100 80"], lemonFace: ["lemonFace", "0 0 120 110"],
    ra_robot: ["robot", "-66 -6 312 312"], giftFace: ["giftFace", "0 0 120 130"],
    ball: ["ball", "0 0 100 100"], ballFace: ["ballFace", "0 0 120 120"], birdFace: ["birdFace", "0 0 100 100"],
    kha_sheep: ["sheep", "0 0 120 104"], kha_sheepFace: ["sheepFace", "0 0 120 104"],
    sin_fishFace: ["fishFace", "0 0 120 84"], sin_bucket: ["bucket", "0 0 100 96"],
    butterfly: ["butterfly", "0 0 120 100"], butterflyFace: ["butterflyFace", "0 0 120 100"],
    jim_camel: ["camel", "0 0 170 150"], jim_camelFace: ["camelFace", "0 0 130 130"], jim_coin: ["coin", "0 0 80 80"],
    dal_dallah: ["dallah", "0 0 124 156"], dal_dallahFace: ["dallahFace", "-16 0 156 156"], dal_cup: ["cup", "0 0 100 84"],
    envelopeFace: ["envelopeFace", "0 0 110 80"],
    dhal_kernel: ["kernel", "0 0 80 92"], dhal_pop: ["popcorn", "0 0 90 84"], dhal_cob: ["cob", "-15 0 140 140"],
    zay_giraffe: ["giraffe", "-25 0 230 230"], tha_fox: ["fox", "0 0 120 132"],
    can: ["can", "0 0 130 100"], flowerFace: ["flowerFace", "0 0 120 140"], bushFace: ["bushFace", "0 0 130 110"],
    handFace: ["handFace", "0 0 120 140"], frog: ["frog", "0 0 140 120"], frogFace: ["frogFace", "0 0 140 120"],
    sunFace: ["sunFace", "0 0 120 120"], diver: ["diver", "0 0 120 110"], diverFace: ["diverFace", "0 0 120 110"],
    dhow: ["dhow", "0 0 200 130"], jar: ["jar", "0 0 120 110"], balloonFace: ["balloonFace", "0 0 100 150"],
    crate: ["crate", "0 0 100 100"], engine: ["engine", "0 0 150 112"], trainFace: ["trainFace", "0 0 150 120"],
    drumFace: ["drumFace", "0 0 120 130"]
  };
  Object.keys(SWAP).forEach(function (k) { if (k in A) A[k] = P(SWAP[k][0], SWAP[k][1]); });
  /* coloured families: the game passes a colour, the sticker is turned towards it */
  if (A.bird) A.bird = function (col) { return P("bird", "0 0 100 100", { style: tint(col, 28) }); };
  if (A.bug) A.bug = function (col) { return P("bug", "0 0 100 100", { style: tint(col, 2) }); };
  if (A.flower) A.flower = function (col) { return P("flower", "0 0 100 180", { align: "xMidYMax", style: tint(col, 345) }); };
  if (A.envelope) A.envelope = function (col) { return P("envelope", "0 0 110 80", { style: tint(col, 42) }); };
  if (A.balloon) A.balloon = function (fill) { return P("balloon", "0 0 100 150", { style: tint(fill, 356) }); };
  if (A.drum) A.drum = function (col) { return P("drum", "0 0 120 130", { style: tint(col, 28) }); };
  TG.art.sinFish = function (col) { return P("fish", "0 0 120 84", { style: tint(col, 28) }); };
  /* scenery drawn to a size */
  if (A.tree) A.tree = function (w, h) { return P("tree", "0 0 " + w + " " + h, { w: w, h: h, align: "xMidYMax" }); };
  if (A.palm) A.palm = function (w, h) { return P("palm", "0 0 " + w + " " + h, { w: w, h: h, align: "xMidYMax" }); };
  /* warm the browser cache so nothing pops in mid-game */
  TG.preloadArt = function () {
    ["apple", "appleFace", "basket", "tree", "date", "palm", "palmFace", "falconFly", "falconFace", "horse", "lemon", "lemonFace", "robot", "giftFace",
      "ball", "ballFace", "bird", "birdFace", "sheep", "sheepFace", "fish", "fishFace", "bucket", "butterfly", "butterflyFace", "flower", "camel", "camelFace",
      "coin", "dallah", "dallahFace", "cup", "envelope", "envelopeFace", "kernel", "popcorn", "cob", "giraffe", "fox", "can", "flowerFace", "bushFace",
      "handFace", "frog", "frogFace", "bug", "sunFace", "diver", "diverFace", "dhow", "jar", "balloon", "balloonFace", "crate", "engine", "trainFace",
      "drum", "drumFace"].forEach(function (n) { var i = new Image(); i.src = BASE + n + ".webp"; });
  };
  TG.preloadArt();
})();
