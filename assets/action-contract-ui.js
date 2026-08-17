/* ============================================================
   Product-wide action contract.

   FIELD feedback exposed a failure ordinary feature tests do not catch:
   the feature can work and the control can still lie about what happens next.

   Rule:
     - name an action for the user's task, not the implementation mechanism
     - if a click changes channel, name the destination before the click

   This layer is intentionally small and cross-product. It does not change
   pricing, proposal, transcript, scope or payment logic. It only keeps the
   visible contract aligned with the action the existing code performs.
   ============================================================ */
(function () {
  'use strict';

  function he() {
    return (document.documentElement.lang || 'he').toLowerCase().indexOf('he') === 0;
  }

  function one(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function setButton(act, label) {
    all('[data-act="' + act + '"]').forEach(function (b) { b.textContent = label; });
  }

  function replaceExact(from, to) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').trim() === from) n.nodeValue = n.nodeValue.replace(from, to);
    }
  }

  function replaceContaining(from, to) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').indexOf(from) !== -1) n.nodeValue = n.nodeValue.split(from).join(to);
    }
  }

  function contactChannel() {
    var addr = one('#buyContact');
    var t = addr ? (addr.textContent || '').trim() : '';
    if (/^\+?\d[\d\s-]+$/.test(t)) return 'WhatsApp';
    if (/@/.test(t)) return 'אימייל';
    return '';
  }

  function makeExternalRouteExplicit() {
    var channel = contactChannel();
    if (!channel) return;

    var pay = one('#payBtn');
    if (pay && /מפתח|הודעה/.test(pay.textContent || '')) {
      pay.textContent = channel === 'WhatsApp'
        ? 'פתח WhatsApp לבקשת מפתח'
        : 'פתח ' + channel + ' לבקשת מפתח';
    }

    var early = one('[data-act="askkey"]');
    if (early) {
      early.textContent = channel === 'WhatsApp'
        ? 'פתח WhatsApp לבקשת מפתח'
        : 'פתח ' + channel + ' לבקשת מפתח';
    }
  }

  function applyHebrewContract() {
    if (!he() || !document.body) return;

    /* POST-CALL: the user wants to know what matters for the proposal.
       Extraction is the mechanism, not the task. */
    setButton('trlocal', 'מצא מה חשוב להצעה');
    setButton('trprompt', 'מצא עוד פרטים עם AI');

    /* PRE-CALL: parsing fields is implementation language. */
    all('[data-act="parse"]').forEach(function (b) {
      if (/חלץ|שדות|הדבקה/.test(b.textContent || '')) b.textContent = 'מלא את הפרופיל מהטקסט';
    });

    all('[data-act="go2"]').forEach(function (b) {
      if ((b.textContent || '').trim() === 'המשך לצד השני') b.textContent = 'המשך להכנת השיחה';
    });

    replaceExact('שלב 2 · הצד השני', 'שלב 2 · מי מולכם');
    replaceExact('מסלול מעמיק · פרומפט ל-Deep Research', 'מחקר מעמיק על הלקוח');

    /* Transcript review: describe the commitment the user is making. */
    replaceExact('3 · עבור על מה שנמצא ואשר', 'בדוק מה ייכנס להצעה');
    all('[data-act="trapply"]').forEach(function (b) {
      b.textContent = 'השתמש בפרטים שאישרתי';
    });
    replaceExact('מאיפה הגיעו המספרים:', 'על מה המחיר נשען:');
    replaceContaining('הטופס מולא מהשיחה', 'הפרטים שאישרת נכנסו להצעה');

    makeExternalRouteExplicit();
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () {
      scheduled = false;
      applyHebrewContract();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyHebrewContract();
      new MutationObserver(schedule).observe(document.body, {
        subtree: true, childList: true, characterData: true
      });
    }, { once: true });
  } else {
    applyHebrewContract();
    new MutationObserver(schedule).observe(document.body, {
      subtree: true, childList: true, characterData: true
    });
  }
})();
