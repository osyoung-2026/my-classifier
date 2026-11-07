// 화면. criteria.json · keywords.json 은 열 때, data/answer.json 은 채점 단추를 누를 때만 읽는다.
// AI(Gemini)는 서버 함수 /api/classify 로만 부른다. 열쇠는 이 파일에 없다.
(function () {
  var state = { criteria: null, kw: null, lastAi: null };
  var CHUNK = 10;
  var classifyToken = 0;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function row(label, valueNode) {
    var r = el("p", "row");
    r.appendChild(el("span", "k", label));
    var v = el("span", "v");
    if (typeof valueNode === "string") v.textContent = valueNode; else v.appendChild(valueNode);
    r.appendChild(v);
    return r;
  }

  function badge(text) { return el("span", "badge", text); }

  function showStatus(msg) {
    var s = $("status");
    s.textContent = msg;
    s.hidden = !msg;
  }

  function loadJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " 을(를) 읽지 못했습니다 (" + r.status + ")");
      return r.json();
    });
  }

  function safetyName() {
    return state.criteria.categories.slice().sort(function (a, b) { return a.order - b.order; })[0].name;
  }

  // ---------- AI 호출 (서버 함수) ----------
  // 가린 문장 목록 → { model, results:[{i, category, urgency, reason} | {i, error}] }. 실패하면 이유와 함께 던진다.
  function callAI(maskedSentences) {
    return fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: maskedSentences })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !Array.isArray(j.results)) {
          throw new Error(j.error || ("서버 함수가 답하지 않았습니다 (" + r.status + ")"));
        }
        return j;
      });
    }, function () {
      throw new Error("서버 함수에 연결하지 못했습니다");
    });
  }

  function validAi(item) {
    if (!item || item.error) return false;
    var cats = state.criteria.categories.map(function (c) { return c.name; });
    var urgs = state.criteria.urgency.map(function (u) { return u.name; });
    return cats.indexOf(item.category) !== -1 && urgs.indexOf(item.urgency) !== -1;
  }

  // ---------- 탭 ----------
  function selectTab(name) {
    ["classify", "score"].forEach(function (n) {
      var on = n === name;
      $("tab-" + n).setAttribute("aria-selected", on ? "true" : "false");
      $("panel-" + n).hidden = !on;
    });
  }

  // ---------- 분류 ----------
  function renderCard(m, res, source, notice) {
    var box = $("result");
    box.textContent = "";
    box.className = "card";

    var maskedNode = el("span");
    maskedNode.appendChild(document.createTextNode(m.masked));
    var uniq = m.found.filter(function (x, i) { return m.found.indexOf(x) === i; });
    uniq.forEach(function (f) { maskedNode.appendChild(el("span", "tag", f + " 가림")); });
    box.appendChild(row("가린 문장", maskedNode));

    if (notice) box.appendChild(el("p", "notice", notice));
    box.appendChild(row("판정 방식", source));
    var pair = el("div", "pair");
    var catBadge = badge(res.category);
    if (res.category === safetyName()) catBadge.className += " sos";
    var urgBadge = badge(res.urgency);
    var urgs = state.criteria.urgency.map(function (u) { return u.name; });
    var ui = urgs.indexOf(res.urgency);
    if (urgs.length === 3 && ui !== -1) urgBadge.className += [" hot", " mid", " low"][ui];
    pair.appendChild(row("칸", catBadge));
    pair.appendChild(row("긴급도", urgBadge));
    box.appendChild(pair);
    box.appendChild(row("이유", res.reason));
    box.hidden = false;
  }

  function classifyOne(rawText) {
    var token = ++classifyToken;
    var m = window.Mask.mask(rawText);
    var btn = $("classify-btn");
    btn.disabled = true;
    var box = $("result");
    box.className = "card";
    box.textContent = "AI 분석 중…";
    box.hidden = false;

    callAI([m.masked]).then(function (j) {
      if (token !== classifyToken) return;
      var item = j.results[0];
      if (!validAi(item)) throw new Error((item && item.error) || "AI 답을 받지 못했습니다");
      renderCard(m, item, "AI (" + (j.model || "Gemini") + ")", null);
    }).catch(function (e) {
      if (token !== classifyToken) return;
      var res = window.Rules.classify(m.masked, state.kw, state.criteria);
      renderCard(m, res, "규칙", "AI 없이 규칙으로 갈랐습니다 (AI 실패 이유: " + e.message + ")");
    }).then(function () {
      if (token === classifyToken) btn.disabled = false;
    });
  }

  function renderWords() {
    var host = $("words");
    host.textContent = "";
    var kw = state.kw;
    host.appendChild(el("p", "ex", "규칙은 아래 낱말을 씁니다. 낱말은 " + kw.source + " 에서만 뽑았습니다."));
    state.criteria.categories.forEach(function (c) {
      host.appendChild(el("h3", null, "칸 · " + c.name));
      host.appendChild(el("p", null, (kw.categories[c.name] || []).map(function (k) { return k.w; }).join(" · ")));
      (kw.examples[c.name] || []).forEach(function (e) {
        host.appendChild(el("p", "ex", "예) '" + e.w + "' ← " + e.from + ": " + e.text));
      });
    });
    state.criteria.urgency.forEach(function (u) {
      host.appendChild(el("h3", null, "긴급도 · " + u.name + " (비중 " + kw.urgency_weight[u.name] + ")"));
      host.appendChild(el("p", null, (kw.urgency[u.name] || []).map(function (k) { return k.w; }).join(" · ")));
    });
  }

  // ---------- 채점 공통 ----------
  function pct(x, n) { return Math.round(x / n * 1000) / 10 + "%"; }

  // preds[i] 가 null 이면 답을 못 받은 것 → 오답
  function stats(answers, preds) {
    var safety = safetyName();
    var s = { n: answers.length, cat: 0, urg: 0, both: 0, safetyMiss: 0, noAnswer: 0 };
    answers.forEach(function (a, i) {
      var p = preds[i];
      if (!p) { s.noAnswer++; if (a.category === safety) s.safetyMiss++; return; }
      var c = p.category === a.category, u = p.urgency === a.urgency;
      if (c) s.cat++;
      if (u) s.urg++;
      if (c && u) s.both++;
      if (a.category === safety && !c) s.safetyMiss++;
    });
    return s;
  }

  function ruleFor(a) {
    return window.Rules.classify(window.Mask.mask(a.text).masked, state.kw, state.criteria);
  }

  // 큰 숫자 카드. s 가 null 이면 아직 안 잰 빈 카드.
  function statCard(label, big, of, sub, cls) {
    var c = el("div", "stat" + (cls ? " " + cls : ""));
    c.appendChild(el("div", "stat-l", label));
    var v = el("div", "stat-v");
    v.appendChild(el("span", "big", big));
    if (of) v.appendChild(el("span", "of", "/ " + of));
    c.appendChild(v);
    c.appendChild(el("div", "stat-s", sub));
    return c;
  }

  function renderStats(hostId, s) {
    var host = $(hostId);
    host.textContent = "";
    if (!s) {
      ["칸 맞음", "긴급도 맞음", "둘 다 맞음", "안전긴급 놓친 수"].forEach(function (l) {
        host.appendChild(statCard(l, "—", null, "아직 안 쟀음", "empty-v"));
      });
      return;
    }
    var n = s.n;
    host.appendChild(statCard("칸 맞음", String(s.cat), n, pct(s.cat, n)));
    host.appendChild(statCard("긴급도 맞음", String(s.urg), n, pct(s.urg, n)));
    host.appendChild(statCard("둘 다 맞음", String(s.both), n, pct(s.both, n)));
    host.appendChild(statCard("안전긴급 놓친 수", String(s.safetyMiss), null,
      s.safetyMiss > 0 ? "놓친 문장 있음" : "놓친 문장 없음", s.safetyMiss > 0 ? "danger" : ""));
  }

  // ---------- 규칙으로 채점 ----------
  function runScore() {
    var btn = $("score-btn"), btn2 = $("ai-score-btn");
    var cond = $("rule-cond"), list = $("wrong-list");
    btn.disabled = true; btn2.disabled = true;
    cond.textContent = "채점 중…";
    list.textContent = "";
    loadJson("data/answer.json").then(function (answers) {
      var n = answers.length, wrong = [];
      var preds = answers.map(ruleFor);
      var s = stats(answers, preds);
      answers.forEach(function (a, i) {
        var p = preds[i];
        var cOk = p.category === a.category, uOk = p.urgency === a.urgency;
        if (!(cOk && uOk)) wrong.push({ a: a, p: p, cOk: cOk, uOk: uOk });
      });

      renderStats("rule-stats", s);
      $("rule-src").textContent = "낱말 keywords.json (version " + state.kw.version + ")";
      cond.textContent =
        "잰 조건: 규칙만 사용 · 정답 " + n + "개(data/answer.json) · 이름·전화번호·학번을 가린 문장으로 분류 · 낱말 keywords.json (version " + state.kw.version + ") · 한 번 잰 값";
      btn.textContent = "다시 채점";

      var h = el("h3", null, "규칙이 틀린 문장 " + wrong.length + "개");
      h.appendChild(el("span", "small", "(정답 → 판정)"));
      list.appendChild(h);
      var grid = el("div", "wrong-grid");
      wrong.forEach(function (w) {
        var item = el("div", "item");
        item.appendChild(el("p", null, w.a.text));
        var d = el("div", "diff");
        function part(label, ok, a, p) {
          var sp = el("span");
          sp.appendChild(document.createTextNode(label + " "));
          if (ok) { sp.appendChild(el("span", "ok", a)); }
          else {
            sp.appendChild(el("span", "ans", a));
            sp.appendChild(document.createTextNode(" → "));
            sp.appendChild(el("span", "bad", p));
          }
          return sp;
        }
        d.appendChild(part("칸", w.cOk, w.a.category, w.p.category));
        d.appendChild(part("긴급도", w.uOk, w.a.urgency, w.p.urgency));
        if (w.a.note) d.appendChild(el("span", "tag", w.a.note));
        item.appendChild(d);
        grid.appendChild(item);
      });
      list.appendChild(grid);
    }).catch(function (e) {
      cond.textContent = "";
      showStatus(e.message);
    }).then(function () { btn.disabled = false; btn2.disabled = false; });
  }

  // ---------- AI로 채점 ----------
  function runAiScore() {
    var btn = $("score-btn"), btn2 = $("ai-score-btn"), dl = $("download-btn");
    var out = $("ai-cond");
    btn.disabled = true; btn2.disabled = true; dl.hidden = true;
    showStatus("");
    out.className = "cond";
    out.textContent = "AI 채점 중… 0/?";
    state.lastAi = null;

    loadJson("data/answer.json").then(function (answers) {
      var n = answers.length;
      var masked = answers.map(function (a) { return window.Mask.mask(a.text).masked; });
      var aiPreds = new Array(n).fill(null);
      var aiErrors = new Array(n).fill("");
      var model = null, done = 0;
      out.textContent = "AI 채점 중… 0/" + n;

      var chain = Promise.resolve();
      for (var start = 0; start < n; start += CHUNK) {
        (function (s) {
          chain = chain.then(function () {
            var part = masked.slice(s, s + CHUNK);
            return callAI(part).then(function (j) {
              if (j.model) model = j.model;
              part.forEach(function (_, k) {
                var item = j.results[k];
                if (validAi(item)) aiPreds[s + k] = item;
                else aiErrors[s + k] = (item && item.error) || "AI 답 없음";
              });
            }).catch(function (e) {
              part.forEach(function (_, k) { aiErrors[s + k] = e.message; });
            }).then(function () {
              done = Math.min(s + CHUNK, n);
              out.textContent = "AI 채점 중… " + done + "/" + n;
            });
          });
        })(start);
      }
      return chain.then(function () {
        var rulePreds = answers.map(ruleFor);
        var rs = stats(answers, rulePreds), as = stats(answers, aiPreds);
        renderCompare(rs, as, model, aiErrors);
        state.lastAi = buildDownload(answers, rulePreds, aiPreds, aiErrors, rs, as, model);
        dl.hidden = false;
      });
    }).catch(function (e) {
      out.textContent = "";
      showStatus(e.message);
    }).then(function () { btn.disabled = false; btn2.disabled = false; });
  }

  function renderCompare(rs, as, model, aiErrors) {
    var n = rs.n;
    renderStats("rule-stats", rs);
    renderStats("ai-stats", as);
    var cond = $("ai-cond");
    cond.className = "cond";
    var text =
      "잰 조건: 같은 정답 " + n + "개(data/answer.json) · 가린 문장으로 분류 · AI는 10개씩 세 번 보냄 · 모델 " + (model || "응답 없음") +
      " · 규칙 낱말 keywords.json (version " + state.kw.version + ") · 한 번 잰 값 · 답을 못 받은 문장 " + as.noAnswer + "건 (오답으로 셈)";
    var firstErr = aiErrors.filter(function (x) { return x; })[0];
    if (firstErr) text += " · AI 실패 이유 예: " + firstErr;
    cond.textContent = text;
    if (firstErr) cond.className = "cond bad";
  }

  function buildDownload(answers, rulePreds, aiPreds, aiErrors, rs, as, model) {
    return {
      measured_at: new Date().toISOString(),
      model: model,
      conditions: "같은 정답 " + answers.length + "개 · 가린 문장으로 분류 · AI는 10개씩 세 번 · 한 번 잰 값 · 답을 못 받은 문장은 오답",
      summary: { rule: rs, ai: as },
      items: answers.map(function (a, i) {
        var r = rulePreds[i], p = aiPreds[i];
        return {
          id: a.id,
          text: a.text,
          answer: { category: a.category, urgency: a.urgency },
          rule: { category: r.category, urgency: r.urgency },
          ai: p ? { category: p.category, urgency: p.urgency, reason: p.reason } : null,
          ai_error: p ? "" : aiErrors[i],
          rule_ok: { category: r.category === a.category, urgency: r.urgency === a.urgency },
          ai_ok: { category: !!p && p.category === a.category, urgency: !!p && p.urgency === a.urgency }
        };
      })
    };
  }

  function download() {
    if (!state.lastAi) return;
    var blob = new Blob([JSON.stringify(state.lastAi, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ai_채점결과.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- 시작 ----------
  function init() {
    renderStats("rule-stats", null);
    renderStats("ai-stats", null);
    $("tab-classify").addEventListener("click", function () { selectTab("classify"); });
    $("tab-score").addEventListener("click", function () { selectTab("score"); });
    $("classify-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = $("q").value.trim();
      if (!t || !state.kw) return;
      classifyOne(t);
    });
    $("score-btn").addEventListener("click", function () { if (state.kw) runScore(); });
    $("ai-score-btn").addEventListener("click", function () { if (state.kw) runAiScore(); });
    $("download-btn").addEventListener("click", download);

    Promise.all([loadJson("criteria.json"), loadJson("keywords.json")]).then(function (r) {
      state.criteria = r[0];
      state.kw = r[1];
      renderWords();
    }).catch(function () {
      showStatus("기준 파일을 읽지 못했습니다. 파일을 직접 열지 말고, 이 폴더에서 'python -m http.server 8000' 을 실행한 뒤 http://localhost:8000 으로 열어 주세요.");
    });
  }

  init();
})();
