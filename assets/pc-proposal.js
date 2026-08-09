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

  const escape = s => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const he = d => d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
  const n0 = v => Math.round(v).toLocaleString('en-US');

  /* The rationale is the part the client actually argues with, so it has to
     match the method the price came from. A value number pasted under a
     cost-based price invites "so why is it not just your hours?" */
  function rationaleFor(m, ils) {
    if (m.method === 'value' && m.annualValue) {
      return `<div class="rationale"><b>מאיפה המחיר.</b> התהליך עולה כ-${ils(m.annualValue)} בשנה.
        המחיר הוא ${Math.round(m.price / m.annualValue * 100)}% מהערך של השנה הראשונה,
        וההשקעה מחזירה את עצמה תוך כ-${m.payback.toFixed(1)} שבועות.
        משנה שנייה ואילך זה חיסכון מלא.</div>`;
    }
    if (m.method === 'market' && m.M.market) {
      return `<div class="rationale"><b>מאיפה המחיר.</b> ${m.M.market.basis} לעבודה בהיקף הזה.
        המחיר בטווח המקובל${m.annualValue ? `, והתהליך עולה לך כ-${ils(m.annualValue)} בשנה` : ''}.</div>`;
    }
    if (m.method === 'cost') {
      // The hour breakdown stays out of the client's copy on purpose. Justifying a
      // price with hours invites a negotiation about hours, and the anchor is
      // supposed to be what the work is worth, not what it costs to produce.
      return `<div class="rationale"><b>מאיפה המחיר.</b> ${m.annualValue
        ? `התהליך עולה לך כ-${ils(m.annualValue)} בשנה. המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל".`
        : 'המחיר נגזר מההיקף שמפורט בסעיף "מה נכלל" ומהגבולות שמפורטים תחתיו.'}</div>`;
    }
    if (m.method === 'comparable' && m.M.comparable) {
      return `<div class="rationale"><b>מאיפה המחיר.</b> עבודה דומה שביצעתי, מותאמת להיקף כאן${
        m.annualValue ? `. התהליך עולה לך כ-${ils(m.annualValue)} בשנה` : ''}.</div>`;
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

  const DEFAULT_TERMS = 'תשלום חד-פעמי, לא כולל מע"מ. 50% בהתחלה, 50% במסירה.';

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
  <div class="doc-empty-t">כאן תיכתב ההצעה</div>
  <p>היא נבנית תוך כדי המילוי, ומתעדכנת אחרי כל שינוי. אין שלב נפרד של כתיבה.</p>
  ${next ? `<p class="doc-empty-n"><b>הדבר הבא:</b> ${escape(next)}</p>` : ''}
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
    const client = f.client || 'הלקוח';
    const successLine = f.success ||
      (m.hours ? 'החזרת כ-' + Math.round(m.hours / 52) + ' שעות עבודה בשבוע' : 'התהליך רץ בלי מגע יד');
    const title = titleFrom(f.process);

    /* The letterhead. Absent for the whole life of the product until
       somebody finally looked at the document instead of at the tool —
       every automated check passed on a proposal that did not say who it
       was from. Printed only when there is a name: a header carrying just
       a phone number reads worse than none at all. */
    const sender = (root.PC && root.PC.senderBlock) ? root.PC.senderBlock(ctx.sender) : null;
    const from = sender ? `
<div class="from">
  <div class="from-n">${escape(sender.name)}${sender.business ? ' · <span class="from-b">' + escape(sender.business) + '</span>' : ''}</div>
  ${sender.contact.length ? `<div class="from-c">${sender.contact.map(escape).join(' · ')}</div>` : ''}
</div>` : '';

    /* The one place this product travels on its own. The document goes
       from the operator to their client, and sometimes to two or three
       people who have to agree — the widest circulation anything here
       has, and it carried nothing. Discreet by intent, and switchable
       off, because a line the operator resents is a line they will paste
       the document somewhere else to remove. */
    const attribution = (ctx.sender && ctx.sender.attribution === false) ? '' : `
<div class="madewith">נבנה עם PRE-CALL · מהשיחה להצעה מתומחרת</div>`;

    return `
${from}
<h3>הצעה · אוטומציה של ${escape(title || 'התהליך')}</h3>
<div class="meta">${escape(client)} · ${dstr} · בתוקף עד ${vstr}</div>

${f.trigger ? `<h4>למה עכשיו</h4><p>${escape(f.trigger)}</p>` : ''}

<h4>מה קורה היום</h4>
<p>${escape(f.process || 'התהליך מתבצע ידנית.')}</p>
${m.annualValue && !a.suppressRoi ? `<p><b>העלות של זה:</b> ${m.runs ? 'התהליך רץ כ-' + n0(m.runs) + ' פעמים בשנה, ' : ''}${m.hours ? n0(m.hours) + ' שעות עבודה' : ''}${m.errValue ? ', ובנוסף ' + ils(m.errValue) + ' בשנה בתקלות' : ''}. סה"כ כ-<b>${ils(m.annualValue)} בשנה</b>.</p>` : ''}

${scope.in.length ? `<h4>מה נכלל</h4>
<!-- This is what the client is buying, so it carries the weight the
     exclusions used to take. -->
<ul class="incl">${scope.in.map((i, ix) =>
  `<li>${escape(i.t)}${ix === 0 && systems.length ? ', כולל החיבורים בין ' + escape(systems.join(', ')) : ''}</li>`).join('')}</ul>` : ''}

${scope.out.length ? `<h4>מה לא נכלל</h4>
<!-- These used to be red, and there were nine of them against six plain
     lines of what the client does get — which made the largest, loudest
     block on the page the list of what they are not buying. Red is the
     colour this document uses for alarm, and a boundary is not an alarm;
     it is the sentence underneath, that each of these is available and
     priced separately. Quieted to a neutral tone with its own marker, so
     the emphasis matches the meaning and the distinction survives without
     colour (WCAG 1.4.1). -->
<ul class="excl">${scope.out.map(i => `<li>${escape(i.t)}</li>`).join('')}</ul>
<p class="fine">כל אחד מהסעיפים האלה ניתן לביצוע, ויתומחר בנפרד לפי אותו תעריף.</p>` : ''}

${scope.extra.length ? `<h4>זמין בתוספת תשלום</h4>
<!-- The third of three lists, and it was the only one left on a default
     bullet once the other two got markers. Three categories, three
     marks — a plus, because that is exactly what this one is. -->
<ul class="plus">${scope.extra.map(i => `<li>${escape(i.t)}</li>`).join('')}</ul>` : ''}

<h4>המחיר</h4>
<div class="pricebox">
  <div class="amt">${ils(m.price)}</div>
  <div class="fine mt4">${escape(terms)}</div>
</div>
${a.suppressRoi ? '' : rationaleFor(m, ils)}

<h4>לוח זמנים</h4>
<table>
  <tr><th>שלב</th><th>מה קורה</th><th>משך</th></tr>
  <tr><td>מיפוי</td><td>ישיבה אחת, ואני חוזר עם תרשים התהליך לאישור</td><td>שבוע</td></tr>
  <!-- No hour count here. rationaleFor() above states the rule plainly —
       justifying a price with hours invites a negotiation about hours, and
       the anchor is meant to be what the work is worth rather than what it
       costs to produce — and then this row printed the hours anyway, in the
       client's copy, three sections below. The estimate stays on the
       operator's screen and in the ledger, where it is theirs. What the
       client is owed here is how long it takes, which is the column beside
       it and is unchanged. -->
  <tr><td>בנייה</td><td>פיתוח והטמעה של התהליך</td><td>${Math.max(1, Math.ceil(m.effort/12))} עד ${Math.max(2, Math.ceil(m.effort/8))} שבועות</td></tr>
  <tr><td>בדיקה</td><td>הרצה על נתונים אמיתיים במקביל לתהליך הקיים</td><td>שבוע</td></tr>
  <tr><td>מסירה</td><td>הדרכה, תיעוד, ואז שבועיים ליווי</td><td>שבועיים</td></tr>
</table>
${f.deadline ? `<p class="mt8">היעד שהגדרת: <b>${escape(f.deadline)}</b>.</p>` : ''}

<h4>איך נדע שזה הצליח</h4>
<p>${escape(successLine)}. נמדוד את זה 30 יום אחרי המסירה.
אם לא הגענו לשם בגלל משהו בבנייה, אני מכוונן ללא תוספת תשלום, עד ${tuneCap} שעות עבודה.
מעבר לזה, או אם נדרש שינוי בתהליך עצמו או במערכות, נתמחר בנפרד לפי אותו תעריף.</p>

${clauses.map(c => `<h4>${escape(c.h)}</h4><p>${escape(c.p)}</p>`).join('\n')}

${f.prev ? `<h4>מה שונה הפעם</h4><p>ניסיתם כבר: ${escape(f.prev)}. ההצעה הזו נבדלת בכך שהמסירה כוללת תיעוד והדרכה, והאחריות על ההטמעה היא שלי ולא שלכם.</p>` : ''}

<h4>ההחלטה</h4>
<p>ההצעה בתוקף עד ${vstr}.${f.decider ? ' מי שצריך לאשר: ' + escape(f.decider) + '.' : ''}
כדי להתחיל, אישור בכתב על ההצעה הזו והתשלום הראשון.</p>
${sender ? `<p class="signoff">${escape(sender.name)}${sender.contact.length ? ' · ' + escape(sender.contact[0]) : ''}</p>` : ''}
${attribution}
`;
  }

  root.PC = root.PC || {};
  root.PC.proposal = { build, blank, rationaleFor, titleFrom, escape, DEFAULT_TERMS };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.proposal;
})(typeof window !== 'undefined' ? window : globalThis);
