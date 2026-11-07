// 이름 · 전화번호 · 학번을 [이름] [전화번호] [학번] 으로 바꾼다.
// 분류는 가린 문장으로 한다.
(function () {
  var SURNAME = "김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용";
  var RE_PHONE = /(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;
  var RE_STUDENT_LABELED = /(학번\s*[:：]?\s*)\d{5,10}/g;
  var RE_STUDENT_BARE = /(?<!\d)(?:19|20)\d{6,8}(?!\d)/g;
  // 성씨로 시작하는 2~3글자 + (입니다 | 학생 | 학부모)
  var RE_NAME = new RegExp("(?<![가-힣])[" + SURNAME + "][가-힣]{1,2}(?=\\s?(?:입니다|학생|학부모))", "g");

  function mask(text) {
    var found = [];
    var out = String(text);
    out = out.replace(RE_PHONE, function () { found.push("전화번호"); return "[전화번호]"; });
    out = out.replace(RE_STUDENT_LABELED, function (_, head) { found.push("학번"); return head + "[학번]"; });
    out = out.replace(RE_STUDENT_BARE, function () { found.push("학번"); return "[학번]"; });
    out = out.replace(RE_NAME, function () { found.push("이름"); return "[이름]"; });
    return { masked: out, found: found };
  }

  window.Mask = { mask: mask };
})();
