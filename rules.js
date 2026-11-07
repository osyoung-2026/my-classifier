// 규칙으로 가른다. 낱말 · 점수 비중은 keywords.json, 칸 · 긴급도 이름과 순서는 criteria.json 에서 읽는다.
// 칸: 낱말이 걸린 글자 수의 합이 가장 큰 칸. 같으면 앞 칸. 걸린 낱말이 없으면 마지막 칸(기타).
// 긴급도: 걸린 낱말 수 × 비중이 가장 큰 것. 같으면 높은 쪽. 걸린 낱말이 없으면 마지막(낮음).
// 안전긴급은 보통 이상 (criteria.json 의 추가 기준 3).
(function () {
  function strip(s) { return String(s).replace(/\s+/g, ""); }

  function hits(text, list) {
    var t = strip(text);
    return (list || []).filter(function (k) { return t.indexOf(strip(k.w)) !== -1; });
  }

  function quote(list) {
    return list.map(function (k) { return "'" + k.w + "'"; }).join(" · ");
  }

  function classify(text, kw, criteria) {
    var cats = criteria.categories.slice().sort(function (a, b) { return a.order - b.order; })
      .map(function (c) { return c.name; });
    var urgs = criteria.urgency.map(function (u) { return u.name; }); // 높음, 보통, 낮음 순

    var category = null, bestScore = 0, catHits = [];
    cats.forEach(function (name) {
      var h = hits(text, kw.categories[name]);
      var score = h.reduce(function (a, k) { return a + strip(k.w).length; }, 0);
      if (score > bestScore) { bestScore = score; category = name; catHits = h; }
    });
    var catByDefault = category === null;
    if (catByDefault) category = cats[cats.length - 1];

    var urgency = null, bestU = 0, urgHits = [];
    urgs.forEach(function (name) {
      var h = hits(text, kw.urgency[name]);
      var score = h.length * (kw.urgency_weight[name] || 1);
      if (score > bestU) { bestU = score; urgency = name; urgHits = h; }
    });
    var urgByDefault = urgency === null;
    if (urgByDefault) urgency = urgs[urgs.length - 1];

    var floored = false;
    if (category === cats[0] && urgs.indexOf(urgency) > 1) {
      urgency = urgs[1];
      floored = true;
    }

    var reasonCat = catByDefault
      ? "걸린 칸 낱말이 없어 " + category
      : quote(catHits) + " → " + category;
    var reasonUrg = urgByDefault
      ? "걸린 긴급도 낱말이 없어 " + urgency
      : quote(urgHits) + " → " + urgency;
    if (floored) reasonUrg += " (안전긴급은 보통 이상)";

    return {
      category: category,
      urgency: urgency,
      reason: "칸: " + reasonCat + " / 긴급도: " + reasonUrg
    };
  }

  window.Rules = { classify: classify };
})();
