/* ============================================================
   POST-CALL · the document.

   Pure: takes a context object and returns HTML. It touches no inputs and no
   elements, which is the point — the proposal is the product, and until now
   the only way to check what it said was to fill a form in a browser and read
   it. Now it has tests.

   ctx = {
     m,        the computed model (assets/model.js)
     scope,    { in: [item], out: [item], extra: [item] }
     systems,  array of system names
     f,        { client, process, trigger, prev, decider, deadline, success }
     now       Date, injected so the output is deterministic under test
   }
   ============================================================ */
(function (root) {
  'use strict';

  var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
    : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

  const escape = s => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const he = d => d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
  const n0 = v => Math.round(v).toLocaleString('en-US');

  /* The rationale is the part the client actually argues with, so it has to
     match the method the price came from. A value number pasted under a
     cost-based price invites "so why is it not just your hours?" */
  /* ---------- the payback, drawn ----------

     Fifty-two cells, one per week of the first year, filled to the point the
     investment is back. The README argues for exactly this and then aimed it at
     the wrong person: visual aids are easier to grasp and faster to process, and
     the benefit is largest for people with low numerical literacy — which is the
     audience — so it rendered into the tool, for the operator. The operator
     computed the number. The client is the one who has to believe it, and they
     were handed "31.4 שבועות" as text.

     Not decoration, on the rule pc-viz.js sets out: the whole is meaningful
     because 52 is the denominator being argued about, and the hue only ever
     repeats a claim that is also written in words. One role="img" with the
     label as its name, and the cells hidden — fifty-two divs with no accessible
     name would otherwise be fifty-two announcements of nothing. */
  function paybackGrid(v) {
    if (!v || !v.payback || v.payback.beyond) return '';
    const p = v.payback;
    const cells = Array.from({ length: p.cells }, (_, i) =>
      `<i class="pbk-c${i < p.filled ? ' on' : ''}" aria-hidden="true"></i>`).join('');
    return `<div class="pbk" role="img" aria-label="${escape(p.label)}">
        <div class="pbk-g">${cells}</div>
        <div class="pbk-l">${escape(p.label)}</div>
      </div>`;
  }

  function rationaleFor(m, ils, viz) {
    const heading = tr('מאיפה המחיר.');
    if (m.method === 'value' && m.annualValue) {
      return `<div class="rationale"><b>${heading}</b> ` +
        tr('התהליך עולה כ-{annual} בשנה. המחיר הוא {pct}% מהערך של השנה הראשונה, וההשקעה מחזירה את עצמה תוך כ-{payback} שבועות. משנה שנייה ואילך זה חיסכון מלא.', {
          annual: ils(m.annualValue),
          pct: Math.round(m.price / m.annualValue * 100),
          payback: m.payback.toFixed(1)
        }) + paybackGrid(viz) + `</div>`;
    }
    if (m.method === 'market' && m.M.market) {
      const annualPart = m.annualValue
        ? tr(', והתהליך עולה לך כ-{annual} בשנה', { annual: ils(m.annualValue) }) : '';
      return `<div class="rationale"><b>${heading}</b> ` +
        tr('{basis} לעבודה בהיקף הזה. המחיר בטווח המקובל{annualPart}.',
           { basis: m.M.market.basis, annualPart: annualPart }) + `</div>`;
    }
    if (m.method === 'cost') {
      // The hour breakdown stays out of the client's copy on purpose. Justifying a
      // price with hours invites a negotiation about hours, and the anchor is
      // supposed to be what the work is worth, not what it costs to produce.
      const costText = m.annualValue
        ? tr('התהליך עולה לך כ-{annual} בשנה. המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל".', { annual: ils(m.annualValue) })
        : tr('המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל" ומהגבולות שמפורטים תחתיו.');
      return `<div class="rationale"><b>${heading}</b> ${costText}</div>`;
    }
    if (m.method === 'comparable' && m.M.comparable) {
      const annualPart = m.annualValue
        ? tr('. התהליך עולה לך כ-{annual} בשנה', { annual: ils(m.annualValue) }) : '';
      return `<div class="rationale"><b>${heading}</b> ` +
        tr('עבודה דומה שביצעתי, מותאמת להיקף כאן{annualPart}.', { annualPart: annualPart }) + `</div>`;
    }
    return '';
  }

  /* The first line of the client's document, and it used to be the process
     description guillotined at 55 characters: "אוטומציה של כל הזמנה שנכנסת
     בוואטסאפ מוקלדת ידנית לגיליון, ואז…". A sentence cut mid-thought is the
     first thing the reader sees, and it reads as carelessness before they
     have got to anything that matters.

     A title is not a shortened paragraph, it is the first clause. Process
     descriptions are written as sequences — this happens, then that, then
     the other — so the first clause is almost always the thing itself, and
     it ends where the writer already put a break. Cutting there yields a
     complete thought with no ellipsis at all.

     The rest of the description is not lost: it is printed in full, three
     lines below, under "מה קורה היום". */
  const CLAUSE_BREAK = /[,.;:]|\s(?:ואז|ואחר כך|ולאחר מכן|ובסוף|ואחריו|ואחרי זה)\s/;

  function titleFrom(process) {
    const first = (process || '').split('\n')[0].trim();
    if (!first) return '';

    const cut = first.split(CLAUSE_BREAK)[0].trim();
    // A clause is only a good title if it is long enough to say something;
    // "כל הזמנה" alone is worse than the fuller line it came from.
    let t = cut.length >= 12 ? cut : first;

    // Only now, and only if that clause is itself enormous, fall back to a
    // hard cut — and keep it on a word boundary.
    if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, '') + '…';
    return t;
  }

  const DEFAULT_TERMS = tr('תשלום חד-פעמי, לא כולל מע"מ. 50% בהתחלה, 50% במסירה.');

  /* What stands where the document goes before there is a document.
     The page used to render a complete, official-looking proposal for a
     client called "הלקוח" with no price in it — which teaches a first-time
     reader two wrong things at once: that the tool already finished, and
     that a proposal is a form letter. Worse, it is sendable by accident.
     This says plainly that nothing has been written yet, and what the one
     next thing is. */
  function blank(next) {
    return `
<div class="doc-empty">
  <div class="doc-empty-t">${tr('כאן תיכתב ההצעה')}</div>
  <p>${tr('היא נבנית תוך כדי המילוי, ומתעדכנת אחרי כל שינוי. אין שלב נפרד של כתיבה.')}</p>
  ${next ? `<p class="doc-empty-n"><b>${tr('הדבר הבא:')}</b> ${escape(next)}</p>` : ''}
</div>`;
  }

  function build(ctx) {
    const { m, scope, systems, f } = ctx;
    const ils = ctx.ils || (root.PC && root.PC.model && root.PC.model.ils) || String;
    const now = ctx.now || new Date();
    /* What the read of this particular client changed. Absent means the
       document behaves exactly as it did before any of this existed, which
       is what keeps the adaptation optional rather than load-bearing. */
    const a = ctx.adapt || {};
    const validityDays = a.validityDays || 14;
    const terms = a.terms || DEFAULT_TERMS;
    const clauses = a.clauses || [];
    const valid = new Date(now.getTime() + validityDays * 864e5);
    const dstr = he(now), vstr = he(valid);

    // hours ceiling on the tuning commitment. Without it the clause was open-ended
    // against a criterion the client wrote, which can be absolute ("nothing ever
    // slips") — an unbounded obligation for someone who won't spot it.
    const tuneCap = Math.max(4, Math.round(m.effort * 0.15));
    const client = f.client || tr('הלקוח');
    const successLine = f.success ||
      (m.hours ? tr('החזרת כ-{h} שעות עבודה בשבוע', { h: Math.round(m.hours / 52) }) : tr('התהליך רץ בלי מגע יד'));
    const title = titleFrom(f.process);

    /* The letterhead. Absent for the whole life of the product until
       somebody finally looked at the document instead of at the tool —
       every automated check passed on a proposal that did not say who it
       was from. Printed only when there is a name: a header carrying just
       a phone number reads worse than none at all. */
    const sender = (root.PC && root.PC.senderBlock) ? root.PC.senderBlock(ctx.sender) : null;
    /* alt="" on purpose: the name text right beside it already says who
       this is from, so a screen reader announcing the image too would say
       the same thing twice.

       escape(), not a raw interpolation — block()'s LOGO_RE already
       restricts this string to `data:image/<allowed type>;base64,` plus
       the base64 alphabet, none of which escape() touches (that alphabet
       contains no `< > &`), so this is a no-op for every value that was
       ever going to reach here. It stays anyway: a prefix check alone
       once let `data:image/"><script>…` through block() and into this
       exact template unescaped (found in review), and the fix for that
       belongs in the validator, not in trusting the validator forever
       from the render side too. Two independent layers, so a future bug
       in one is not also a bug in the other. */
    const logoImg = sender && sender.logo ? `<img class="from-logo" src="${escape(sender.logo)}" alt="">` : '';
    const from = sender ? `
<div class="from">
  ${logoImg}
  <div class="from-t"><div class="from-n">${escape(sender.name)}${sender.business ? ' · <span class="from-b">' + escape(sender.business) + '</span>' : ''}</div>
  ${sender.contact.length ? `<div class="from-c">${sender.contact.map(escape).join(' · ')}</div>` : ''}</div>
</div>` : '';

    /* The one place this product travels on its own. The document goes
       from the operator to their client, and sometimes to two or three
       people who have to agree — the widest circulation anything here
       has, and it carried nothing. Discreet by intent, and switchable
       off, because a line the operator resents is a line they will paste
       the document somewhere else to remove. */
    /* The URL is visible text, not only an href, and that is the whole point of
       this edit. This document travels two ways: copyProposal() emits
       el('proposal').innerText, and the print sheet makes a PDF. An anchor
       carries its target in neither — innerText drops the href, and a reader of
       a printed page cannot see one. So the line said a product name to every
       client who ever received a proposal and gave them no way to reach it.

       It is also an anchor, for the on-screen document and because PDF
       generators preserve links, but the text is what makes it work.

       Named POST-CALL because that is what builds this document. The line used
       to say PRE-CALL, which is the other tool — the one this project's own
       README describes as structurally empty for somebody who has not closed a
       deal yet, i.e. exactly the reader most likely to follow it. The link goes
       to the entry page rather than to either tool, because that page asks one
       question and routes, which is what a stranger needs. */
    const attribution = (ctx.sender && ctx.sender.attribution === false) ? '' : `
<div class="madewith">${tr('נבנה עם POST-CALL')} · <a href="https://pre-call-swart.vercel.app/">pre-call-swart.vercel.app</a></div>`;

    /* Each fragment below is translated on its own, then spliced into the
       document as an already-resolved string — never as a Hebrew literal
       sitting inside a tr() call next to a ${}. Optional blocks (trigger,
       deadline, decider, previous attempt) resolve to '' when absent, so
       the surrounding layout does not have to know which language is
       showing through it. */
    const titleLine = tr('הצעה · אוטומציה של {title}', { title: escape(title || tr('התהליך')) });
    const metaLine = tr('{client} · {date} · בתוקף עד {valid}', { client: escape(client), date: dstr, valid: vstr });
    const triggerBlock = f.trigger ? `<h4>${tr('למה עכשיו')}</h4><p>${escape(f.trigger)}</p>` : '';
    const processText = escape(f.process || tr('התהליך מתבצע ידנית.'));

    const runsPart = m.runs ? tr('התהליך רץ כ-{n} פעמים בשנה, ', { n: n0(m.runs) }) : '';
    const hoursPart = m.hours ? tr('{n} שעות עבודה', { n: n0(m.hours) }) : '';
    const errPart = m.errValue ? tr(', ובנוסף {v} בשנה בתקלות', { v: ils(m.errValue) }) : '';
    const roiLine = (m.annualValue && !a.suppressRoi)
      ? `<p><b>${tr('העלות של זה:')}</b> ${runsPart}${hoursPart}${errPart}. ` +
        tr('סה"כ כ-<b>{total} בשנה</b>.', { total: ils(m.annualValue) }) + `</p>`
      : '';

    const inclList = scope.in.length ? `<h4>${tr('מה נכלל')}</h4>
<!-- This is what the client is buying, so it carries the weight the
     exclusions used to take. -->
<ul class="incl">${scope.in.map((i, ix) =>
  `<li>${escape(i.t)}${ix === 0 && systems.length ? tr(', כולל החיבורים בין {systems}', { systems: escape(systems.join(', ')) }) : ''}</li>`).join('')}</ul>` : '';

    const exclList = scope.out.length ? `<h4>${tr('מה לא נכלל')}</h4>
<!-- These used to be red, and there were nine of them against six plain
     lines of what the client does get — which made the largest, loudest
     block on the page the list of what they are not buying. Red is the
     colour this document uses for alarm, and a boundary is not an alarm;
     it is the sentence underneath, that each of these is available and
     priced separately. Quieted to a neutral tone with its own marker, so
     the emphasis matches the meaning and the distinction survives without
     colour (WCAG 1.4.1). -->
<ul class="excl">${scope.out.map(i => `<li>${escape(i.t)}</li>`).join('')}</ul>
<p class="fine">${tr('כל אחד מהסעיפים האלה ניתן לביצוע, ויתומחר בנפרד לפי אותו תעריף.')}</p>` : '';

    const extraList = scope.extra.length ? `<h4>${tr('זמין בתוספת תשלום')}</h4>
<!-- The third of three lists, and it was the only one left on a default
     bullet once the other two got markers. Three categories, three
     marks — a plus, because that is exactly what this one is. -->
<ul class="plus">${scope.extra.map(i => `<li>${escape(i.t)}</li>`).join('')}</ul>` : '';

    const timelineTable = `<table>
  <tr><th>${tr('שלב')}</th><th>${tr('מה קורה')}</th><th>${tr('משך')}</th></tr>
  <tr><td>${tr('מיפוי')}</td><td>${tr('ישיבה אחת, ואני חוזר עם תרשים התהליך לאישור')}</td><td>${tr('שבוע')}</td></tr>
  <!-- No hour count here. rationaleFor() above states the rule plainly —
       justifying a price with hours invites a negotiation about hours, and
       the anchor is meant to be what the work is worth rather than what it
       costs to produce — and then this row printed the hours anyway, in the
       client's copy, three sections below. The estimate stays on the
       operator's screen and in the ledger, where it is theirs. What the
       client is owed here is how long it takes, which is the column beside
       it and is unchanged. -->
  <tr><td>${tr('בנייה')}</td><td>${tr('פיתוח והטמעה של התהליך')}</td><td>${
    tr('{lo} עד {hi} שבועות', { lo: Math.max(1, Math.ceil(m.effort/12)), hi: Math.max(2, Math.ceil(m.effort/8)) })}</td></tr>
  <tr><td>${tr('בדיקה')}</td><td>${tr('הרצה על נתונים אמיתיים במקביל לתהליך הקיים')}</td><td>${tr('שבוע')}</td></tr>
  <tr><td>${tr('מסירה')}</td><td>${tr('הדרכה, תיעוד, ואז שבועיים ליווי')}</td><td>${tr('שבועיים')}</td></tr>
</table>`;
    const deadlineBlock = f.deadline
      ? `<p class="mt8">${tr('היעד שהגדרת:')} <b>${escape(f.deadline)}</b>.</p>` : '';

    const howPara = `<p>${escape(successLine)}. ` +
      tr('נמדוד את זה 30 יום אחרי המסירה. אם לא הגענו לשם בגלל משהו בבנייה, אני מכוונן ללא תוספת תשלום, עד {cap} שעות עבודה. מעבר לזה, או אם נדרש שינוי בתהליך עצמו או במערכות, נתמחר בנפרד לפי אותו תעריף.',
        { cap: tuneCap }) + `</p>`;

    const clausesBlock = clauses.map(c => `<h4>${escape(c.h)}</h4><p>${escape(c.p)}</p>`).join('\n');

    const prevBlock = f.prev ? `<h4>${tr('מה שונה הפעם')}</h4><p>` +
      tr('ניסיתם כבר: {prev}. ההצעה הזו נבדלת בכך שהמסירה כוללת תיעוד והדרכה, והאחריות על ההטמעה היא שלי ולא שלכם.',
         { prev: escape(f.prev) }) + `</p>` : '';

    const deciderPart = f.decider ? tr(' מי שצריך לאשר: {decider}.', { decider: escape(f.decider) }) : '';
    const decisionPara = `<p>` + tr('ההצעה בתוקף עד {valid}.{decider}\nכדי להתחיל, אישור בכתב על ההצעה הזו והתשלום הראשון.',
      { valid: vstr, decider: deciderPart }) + `</p>`;

    return `
${from}
<h3>${titleLine}</h3>
<div class="meta">${metaLine}</div>

${triggerBlock}

<h4>${tr('מה קורה היום')}</h4>
<p>${processText}</p>
${roiLine}

${inclList}

${exclList}

${extraList}

<h4 class="moment">${tr('המחיר')}</h4>
<div class="pricebox">
  <div class="amt">${ils(m.price)}</div>
  <div class="fine mt4">${escape(terms)}</div>
</div>
${a.suppressRoi ? '' : rationaleFor(m, ils, ctx.viz)}

<h4 class="moment">${tr('לוח זמנים')}</h4>
${timelineTable}
${deadlineBlock}

<h4>${tr('איך נדע שזה הצליח')}</h4>
${howPara}

${clausesBlock}

${prevBlock}

<h4 class="moment">${tr('ההחלטה')}</h4>
${decisionPara}
${sender ? `<p class="signoff">${escape(sender.name)}${sender.contact.length ? ' · ' + escape(sender.contact[0]) : ''}</p>` : ''}
${attribution}
`;
  }

  root.PC = root.PC || {};
  root.PC.proposal = { build, blank, rationaleFor, titleFrom, escape, DEFAULT_TERMS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.proposal;
})(typeof window !== 'undefined' ? window : globalThis);
