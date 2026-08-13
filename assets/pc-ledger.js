/* ============================================================
   POST-CALL · stage 4, the deal ledger in the page.

   The estimate is locked when a deal is saved; hours reported after delivery
   are compared against that locked number. That comparison is the only thing
   that can turn the effort table from fitted-backwards into measured, so the
   "not calibrated" marker is removed by evidence here rather than by editing
   a label.

   Storage and the arithmetic live in assets/deals.js, which has no DOM and
   its own tests. This file is only what the ledger looks like.
   ============================================================ */

var tr = (typeof PC !== 'undefined' && PC.i18n) ? PC.i18n.tr
  : function (s, p) { if (p) for (var k in p) s = s.split('{' + k + '}').join(p[k]); return s; };

let currentDealId = null;

function dealSnapshot(){
  const m = model();
  return {
    id: currentDealId || undefined,
    client: txt('q_client') || tr('ללא שם'),
    process: txt('q_process').slice(0, 120),
    estimatedHours: m.effort,      // locked at save time — see deals.js
    priceQuoted: m.price,
    method: m.method,
    /* Which method actually produced this price, which is not always the
       one the operator clicked — ask for "comparable" with no previous
       deal and the number quietly comes out of cost. Stored separately
       and never conflated, because the track record below reads it to
       say which method holds up, and a claim assembled from mislabelled
       rows would be worse than no claim. */
    pricedBy: m.pricedBy,
    /* The number of days the document itself promised. It is 14 by
       default and 21 when more than one person has to agree, and until
       now it was computed, printed for the client, and thrown away — so
       nothing on this side could tell when a proposal was about to lapse.
       Stored with the deal because it is a property of the document that
       was sent, not of the form as it stands today. */
    validityDays: (PC.client.adapt(clientProfile()) || {}).validityDays || 14,
    /* The date the client named, when they named one that can be read. Question
       12's own help text promises the answer becomes "a decision date", and it
       had never become anything but a line in the document — measured: it reached
       the document and one confidence counter, out of eleven layers that could
       have used it.

       Stored as a date rather than re-parsed on every read, for the same reason
       validityDays above is stored: it is a property of the conversation that
       happened, and the form may say something else next week. Absent when the
       answer was "as soon as possible" — most answers will be, and a date nobody
       named is worse here than no date at all. */
    clientDeadline: (function () {
      const d = PC.followup && PC.followup.deadlineDate
        ? PC.followup.deadlineDate(txt('q_deadline')) : null;
      return d ? d.toISOString().slice(0, 10) : undefined;
    })(),
    systems: [...chosenSystems],
    /* The full form, so a saved deal can be opened again.
       Without this the ledger stored a summary and nothing else, which meant
       saving a proposal was a one-way door: the client comes back asking for
       one change and the whole thing has to be re-entered from the call
       notes. The summary fields above stay as they are — the ledger's
       reporting reads them, and estimatedHours in particular must keep
       meaning "the estimate at the moment it was quoted". */
    form: collectDraft()
  };
}

/* Puts a saved deal back on the form. Announced, because a page that silently
   repopulates itself is indistinguishable from one showing the wrong client
   — and the operator is about to send whatever is on it. */
function loadDeal(id){
  const d = PC.deals.get(id);
  if (!d || !d.form) { flashDoc(tr('העסקה הזאת נשמרה לפני שהיה אפשר לפתוח מחדש')); return; }
  applyDraft(d.form);
  currentDealId = d.id;
  renderScope(); renderLedger(); recompute(); renderGuide();
  saveDraft();
  const note = el('draftNote');
  if (note) {
    note.innerHTML = tr('נפתחה לעריכה: {client} · נשמרה {date}',
        { client: esc(d.client), date: (d.created || '').slice(0, 10) }) +
      ' <button type="button" class="ghost" data-act="newdeal">' + tr('הצעה חדשה במקום') + '</button>';
    show('draftNote', true);
  }
  scrollToEl('proposal', 'start');
}

/* `announce` exists for markSent below, which saves and then writes its own offer
   to the same bar. Announcing here would put the news above the offer and then be
   overwritten by it; markSent defers to the end instead. */
function saveCurrentDeal(announce){
  const before = announce === false ? null : reportNow();
  const rec = PC.deals.save(dealSnapshot());
  if (!rec) { flashDoc(tr('השמירה נכשלה — ייתכן שאחסון הדפדפן חסום')); return; }
  currentDealId = rec.id;
  renderLedger(); flashDoc(tr('נשמר')); track('deal_saved');
  if (announce !== false) announceCrossings(before);
}

/* The emotional peak of the whole product is the moment a proposal worth
   real money leaves the building, and the entire acknowledgement used to
   be a two-second grey toast. Worse than thin: it is the one moment the
   operator is willing to do one more thing, and the one thing worth doing
   is the thing that makes them come back. */
function markSent(){
  const before = reportNow();
  if (!currentDealId) saveCurrentDeal(false);
  if (!currentDealId) return;
  PC.deals.setStatus(currentDealId, 'sent');
  renderLedger(); track('deal_sent');
  offerFollowup(currentDealId);
  // last, so the offer headlines and the news sits under it rather than instead
  announceCrossings(before);
}

/* No server here means the product cannot notify anybody, ever. What it
   can do is hand over a trigger that lives somewhere which does — the
   operator's own calendar. One file, no account, no permission prompt,
   and it still fires on a phone with this tab long closed. */
function offerFollowup(id){
  const d = PC.deals.get(id);
  const due = d && PC.followup.dueState(d);
  const bar = el('draftNote');
  if (!d || !due || !bar) { flashDoc(tr('סומנה כנשלחה')); return; }
  const when = new Date(Math.max(
    new Date(d.sentAt).getTime() + PC.followup.NUDGE_AFTER_DAYS * 864e5,
    due.expires.getTime() - PC.followup.CLOSING_WINDOW_DAYS * 864e5));
  const loc = (typeof PC !== 'undefined' && PC.i18n ? PC.i18n.locale() : 'he-IL');
  bar.innerHTML = '<b>' + tr('נשלחה.') + '</b> ' +
    tr('התוקף שכתוב במסמך הוא {date}.', { date: due.expires.toLocaleDateString(loc) }) + ' ' +
    tr('רוצה תזכורת ל-{date} לבדוק מה קרה?', { date: when.toLocaleDateString(loc) }) + ' ' +
    '<button type="button" class="ghost" data-deal="' + esc(id) + '" data-status="__ics">' +
    tr('הוסף ליומן') + '</button>';
  show('draftNote', true);
}

function downloadFollowup(id){
  const d = PC.deals.get(id);
  if (!d) return;
  const text = PC.followup.icsFor(d, { ils });
  if (!text) { flashDoc(tr('אין תאריך שליחה להצעה הזאת')); return; }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = PC.followup.filenameFor(d);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  flashDoc(tr('התזכורת ירדה — פתח את הקובץ כדי להוסיף אותה ליומן'));
  track('followup_added');
}

function flashDoc(msg){
  const f = el('cpFlag'); if (!f) return;
  f.textContent = msg;
  f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2000);
}

/* Marking one sent from the ledger is the same event as sending it from
   the document, and has to behave the same. Found by trying to walk the
   send path in a browser: markSent() sits behind requireKey, so the
   follow-up offer was reachable only past the export gate — which would
   have put the one mechanism that feeds calibration behind the paywall,
   while calibration is the thing the product argues it is for. */
function setDealStatus(id, s){
  const before = PC.deals.get(id);
  const wasSayable = reportNow();
  PC.deals.setStatus(id, s);
  renderLedger();
  if (s === 'sent' && (!before || before.status !== 'sent')) offerFollowup(id);
  /* Marking one won or lost can be the sixth DECIDED proposal, which is what makes
     the ceiling question answerable. Missing this path meant the commonest way a
     crossing happens was the one that never said so. Raised in review. */
  announceCrossings(wasSayable);
}

/* No crossing check here, and that is by construction rather than by oversight:
   deleting a deal can only ADD to the cannot-say list, and crossed() is a
   one-directional difference, so it would return nothing every time. */
function removeDeal(id){
  if (currentDealId === id) currentDealId = null;
  PC.deals.remove(id); renderLedger();
}

/* Entering a deal that already happened. `lost` is a separate button rather than
   a status dropdown, because a lost deal has no closing price and a form that
   asks for one and then ignores it teaches the operator that the fields are
   decoration.

   Reports refusals in words. addPast() returns null for a missing quote and for a
   closing price above it, and a button that silently does nothing is how somebody
   concludes the feature is broken and stops. */
function addPastDeal(lost){
  const flag = el('retroFlag');
  const before = reportNow();
  const say = m => { if (flag) flag.textContent = m; };
  const rec = PC.deals.addPast({
    client: txt('rp_client'),
    quoted: el('rp_quoted').value,
    closed: el('rp_closed').value,
    lost: !!lost,
    concession: el('rp_conc').value
  });
  if (!rec) {
    const q = parseFloat(el('rp_quoted').value), c = parseFloat(el('rp_closed').value);
    say(!(q > 0) ? tr('צריך את המחיר שנקבת')
      : (!lost && c > q) ? tr('המחיר שנסגר גבוה מהמחיר שנקבת — שווה לבדוק את המספרים')
      : !lost ? tr('צריך את המחיר שנסגר, או ללחוץ "לא נסגרה"')
      : tr('לא הצלחתי לשמור — ייתכן שאחסון הדפדפן חסום'));
    return;
  }
  ['rp_client', 'rp_quoted', 'rp_closed'].forEach(id => { el(id).value = ''; });
  el('rp_conc').value = 'unknown';
  say(tr('נוספה: {client} · {result}',
    { client: rec.client, result: lost ? tr('לא נסגרה') : ils(rec.outcome.closedPrice) }));
  el('rp_client').focus();
  renderLedger(); recompute();
  track('past_deal_added');
  announceCrossings(before);
}

/* The one trigger in this product that needs no channel.

   There is no server, so nothing can be pushed. But a threshold crossing is
   CAUSED by an action in the tool — an outcome recorded, a past deal entered — so
   the tool is already open at the moment it happens, and the whole trigger is to
   say it there. Once.

   Snapshot before, mutate, snapshot after. Nothing is stored between sessions: the
   crossing is a property of the action, not a flag to keep and risk announcing
   twice.

   It lands in draftNote, which is aria-live and persists, rather than in the 2s
   toast — this is news, and news that vanishes before it is read was not
   delivered. Precision over recall: it fires only on a real set difference, and
   never on a ledger that moved backwards, because one alarm that turns out to be
   nothing costs more than two good ones earn. */
function reportNow(){
  return PC.history.report(PC.deals.list(), PC.model.METHOD_LABEL,
                           PC.PROVENANCE_LABEL, PC.deals.priceHold());
}
function announceCrossings(before){
  const gained = PC.history.crossed(before, reportNow());
  if (!gained.length) return;
  const bar = el('draftNote'); if (!bar) return;
  /* Its own block, and APPENDED rather than written over. The follow-up offer
     claims this same bar and it carries a button and a deadline, so it outranks a
     piece of news — but clobbering one with the other would leave telemetry
     counting an announcement nobody could read. Both stand, the offer first. */
  const line = '<div><b>' + (gained.length === 1
      ? tr('עכשיו אפשר לומר משהו נוסף:')
      : tr('עכשיו אפשר לומר עוד {n} דברים:', { n: gained.length })) + '</b> ' +
    gained.map(esc).join(' · ') +
    '<span class="ledger-act-n">' + tr('הפאנל "כמה הייעוץ הזה היה שווה לך" עודכן.') + '</span></div>';
  const claimed = !bar.classList.contains('hidden') && bar.innerHTML.trim();
  bar.innerHTML = claimed ? bar.innerHTML + line : line;
  show('draftNote', true);
  track('finding_unlocked');
}

function saveOutcome(id){
  /* The concession control only exists once a lower closing price has been
     saved, so on the first save there is nothing to read. recordOutcome keeps
     the previous answer when none is sent, so reading it as absent here is
     safe rather than destructive. */
  const conc = el('oc_conc_' + id);
  const before = reportNow();
  PC.deals.recordOutcome(id, {
    closedPrice: el('oc_price_' + id).value,
    actualHours: el('oc_hours_' + id).value,
    concession: conc ? conc.value : undefined
  });
  renderLedger(); recompute(); track('outcome_recorded');
  announceCrossings(before);
}

/* ---------- what moved, per deal ----------

   The only thing in a deal row that the deal itself cannot supply. A saved
   deal holds one price and one scope — the current ones — because every save
   overwrites the record whole. So a price that was 12,000 last week and is
   10,000 today looks, from the row, exactly like a price that was always
   10,000, and those are different facts about how this operator sells.

   Two of them are worth a line. A price that dropped before the quote was
   ever sent is a discount nobody asked for. A scope that grew after it was
   sent is work that was added at the old price.

   Silent when nothing moved, and silent for every deal saved before the
   journal existed. A row that says "the price did not move" under all of them
   trains the eye to skip the line where it does. */
function movementLine(id, rows){
  if (!PC.journal || !PC.journal.movement) return '';
  const m = PC.journal.movement(id, rows);
  const bits = [];
  if (m.droppedBeforeSending)
    bits.push(tr('המחיר ירד מ־{from} ל־{to} <b>לפני</b> שההצעה יצאה — הנחה שאף אחד לא ביקש',
      { from: ils(m.priceFrom), to: ils(m.priceTo) }));
  else if (m.priceMoves > 0)
    bits.push(tr('המחיר זז {times}, מ־{from} ל־{to}', {
      times: m.priceMoves === 1 ? tr('פעם אחת') : tr('{n} פעמים', { n: m.priceMoves }),
      from: ils(m.priceFrom), to: ils(m.priceTo)
    }));
  if (m.grewAfterSending)
    bits.push(tr('ההיקף גדל אחרי שההצעה נשלחה, והמחיר לא'));
  return bits.length ? `<div class="deal-mv">${bits.join('. ')}.</div>` : '';
}

const renderLedger = guard('ledger', function (){
  const box = el('ledgerBox'); if (!box) return;
  const list = PC.deals.list();
  const cal = PC.deals.calibration();
  const win = PC.deals.winRate();
  /* Read the log once for the whole render, not once per row: every row asks
     what moved, and each ask would otherwise re-parse the entire log. */
  const moves = PC.journal && PC.journal.list ? PC.journal.list() : null;

  /* What is actually waiting, above the counts. The counts describe the
     past; this is the only line here that asks for something. */
  const waiting = PC.followup.summary(list);

  const summary = list.length ? `
    ${waiting ? `<div class="ledger-act">
      <b>${waiting.count === 1 ? 'הצעה אחת מחכה לך' : waiting.count + ' הצעות מחכות לך'}:</b>
      ${esc(waiting.text)}.
      <span class="ledger-act-n">תשובה שלא הגיעה היא עדיין מידע — סמנו אותה, כדי שהאומדן יתחיל להימדד.</span>
    </div>` : ''}
    <div class="ledger-sum">
      <span>${list.length} הצעות</span>
      <span>${win.won} נסגרו · ${win.lost} נדחו · ${win.undecided} פתוחות</span>
      ${win.rate !== null ? `<span>שיעור סגירה ${Math.round(win.rate*100)}%</span>` : ''}
    </div>
    ${cal.enough
      ? `<div class="ok"><b>הכיול נמדד על ${cal.n} מסירות.</b> ${cal.suggestion}.
           אומדן מצטבר ${cal.estimatedTotal} שעות מול ${cal.actualTotal} בפועל.
           אפשר לעדכן את התעריף או את האומדן בהתאם.</div>`
      : `<div class="tri-warn">כיול האומדן דורש ${5 - cal.n} מסירות נוספות עם שעות מדווחות.
           עד אז טבלת האומדן נשארת מסומנת כלא-מכוילת — היא הותאמה אחורה למחיר, ולא נמדדה.</div>`}` : '';

  box.innerHTML = summary + (list.length ? list.map(d => {
    const o = d.outcome || {};
    const done = o.actualHours > 0;
    /* Where this one stands in time. sentAt has been written on every
       deal since this file existed and was never once read, so a proposal
       sent three weeks ago and a proposal sent this morning looked
       identical in here. */
    const due = PC.followup.dueState(d);
    return `<div class="deal${due && due.needsAction ? ' deal-act' : ''}">
      <div class="deal-h">
        <b>${esc(d.client)}</b>
        <span class="deal-st st-${d.status}">${PC.STATUS_LABEL[d.status]}</span>
        ${due ? `<span class="deal-due due-${due.state}">${esc(due.label)}</span>` : ''}
        <span class="deal-meta">${d.priceQuoted ? ils(d.priceQuoted) : '—'} · אומדן ${d.estimatedHours || '—'} ש׳ · ${d.created.slice(0,10)}</span>
      </div>
      ${movementLine(d.id, moves)}
      ${d.process ? `<div class="deal-p">${esc(d.process)}</div>` : ''}
      <div class="deal-acts">
        ${['sent','won','lost','no_answer'].map(s =>
          `<button type="button" class="sbtn${d.status===s?' on s-in':''}" aria-pressed="${d.status===s}"
            data-deal="${d.id}" data-status="${s}">${PC.STATUS_LABEL[s]}</button>`).join('')}
        <button type="button" class="sbtn s-open" data-deal="${d.id}" data-status="__open"${
          d.form ? '' : ' disabled title="נשמרה לפני שהיה אפשר לפתוח מחדש"'}>פתח לעריכה</button>
        <button type="button" class="sbtn" data-deal="${d.id}" data-status="__remove">מחק</button>
        ${due ? `<button type="button" class="sbtn s-cal" data-deal="${d.id}" data-status="__ics"
          title="מוריד קובץ יומן עם תזכורת לבדוק מה קרה">תזכורת ליומן</button>` : ''}
      </div>
      ${d.status === 'won' || done ? `
        <div class="deal-out">
          <div><label for="oc_price_${d.id}">מחיר שנסגר בפועל</label>
            <input type="number" id="oc_price_${d.id}" value="${o.closedPrice || ''}" placeholder="${d.priceQuoted || ''}"></div>
          <div><label for="oc_hours_${d.id}">שעות עבודה בפועל</label>
            <input type="number" id="oc_hours_${d.id}" value="${o.actualHours || ''}" placeholder="${d.estimatedHours || ''}"></div>
          ${o.closedPrice > 0 && d.priceQuoted > 0 && o.closedPrice < d.priceQuoted ? `
          <div><label for="oc_conc_${d.id}">המחיר ירד. מי ביקש?</label>
            <select id="oc_conc_${d.id}">
              <option value="unknown"${(o.concession || 'unknown') === 'unknown' ? ' selected' : ''}>לא נרשם</option>
              <option value="client_asked"${o.concession === 'client_asked' ? ' selected' : ''}>הלקוח ביקש</option>
              <option value="i_offered"${o.concession === 'i_offered' ? ' selected' : ''}>הצעתי מעצמי</option>
            </select></div>` : ''}
          <button type="button" class="ghost" data-deal="${d.id}" data-status="__outcome">שמור תוצאה</button>
        </div>` : ''}
    </div>`;
  }).join('') : '<p class="lead nomargin">עוד לא נשמרה אף הצעה. בנה אחת למעלה ולחץ "שמור".</p>');

  const bar = el('dealBar');
  if (bar) bar.innerHTML = list.length
    ? `<button type="button" class="ghost" data-act="newdeal">הצעה חדשה</button>
       <span class="dealbar-n">${list.length} שמורות · ${win.undecided} ממתינות לתשובה</span>` : '';

  renderFunnel();      // transitions, from the journal
  renderHistory(list); // states, from the ledger
});

/* ---------- the tool's own track record ----------

   Everything above describes the deals. This describes the advice: how
   good the estimate this tool produced has actually been, and which of
   its four pricing methods has held up for this operator specifically.

   The product says a great deal about where its defaults come from — the
   effort table fitted backwards, the market tiers converted from US
   ranges, the value coefficient the middle of a band. All honest, and all
   still assertions about the tool rather than evidence about the person
   using it. This is the part that can stop being an assertion, and the
   panel is written so that the countdown to a finding is as visible as
   the finding: silence here must never read as agreement. */
/* ---------- what the operator actually did ----------

   Every other panel on this page reads the ledger, which holds states. This one
   reads the journal, which holds transitions — and it is the only place in the
   product that answers "did anything move" rather than "what is true now".

   Behaviour, never opinion. The research on this is unambiguous and it is not a
   close call: across 298 designs with both measured, preference and performance
   correlate .53, and users prefer the better-performing design only 70% of the
   time. A satisfaction number from a single operator would land in that 30%
   with no way to detect that it had. Counts of what happened cannot.

   Silence here says what is missing and how much of it. A zero that looks
   measured is worse than an admission, because the reader cannot tell the two
   apart — the same discipline the track record below holds. */
const renderFunnel = guard('funnel', function (){
  const box = el('funnelBox'); if (!box) return;
  if (!PC.journal || !PC.journal.funnel) { show('funnelSec', false); return; }
  const f = PC.journal.funnel();

  /* One deal, or a second visit. Not "any activity at all": a first visit with
     nothing saved reads "you opened this once and saved nothing", which is the
     empty panel explaining what it would eventually show that the track record
     below is careful never to be.

     A SECOND visit with nothing saved is the opposite — it is the most useful
     line on the page, because coming back and still not sending is the finding.
     So the gate is the thing that makes it a fact rather than a restatement of
     the ledger. */
  if (!f.deals && f.sessions < 2) { box.innerHTML = ''; show('funnelSec', false); return; }
  show('funnelSec', true);

  const n = (v, one, many) => v === 1 ? one : many.replace('%', v);
  const held = f.deals - f.removed;

  const row = (k, v) => `<div class="hist-row">
      <span class="hist-k">${k}</span><span class="hist-v">${v}</span></div>`;

  const stages = row('פתחת את הדף',
      n(f.sessions, 'פעם אחת', '% פעמים')) +
    row('נשמרו הצעות',
      f.deals ? n(f.deals, 'אחת', '%') + (f.removed
        ? ` · ${f.removed === 1 ? 'אחת נמחקה' : f.removed + ' נמחקו'}, ${held} בפנקס` : '')
              : 'עדיין אף אחת') +
    row('יצאו ללקוח', f.sent ? n(f.sent, 'אחת', '%') : 'עדיין אף אחת') +
    row('קיבלו תשובה', f.decided ? n(f.decided, 'אחת', '%') : 'עדיין אף אחת');

  /* The gap between saving and sending is the one duration this product can
     measure without asking anything, and it is the interesting one: a proposal
     that sits unsent is the most common way a good price never gets tested. */
  const timing = f.medianMinutesToSend !== null
    ? `<div class="hist-t"><b>מהשמירה לשליחה: ${f.medianMinutesToSend} דקות בחציון.</b>
         נמדד על ${n(f.sent, 'הצעה אחת', '% הצעות')} שיצאו.</div>`
    : `<div class="hist-gap">מהשמירה לשליחה — ${
         n(f.sendsNeeded, 'עוד שליחה אחת', 'עוד % שליחות')} וזה יימדד.
         עד אז אין כאן מספר, ולא אפס.</div>`;

  /* Reported apart because averaged together they describe neither: a price
     that fell before anybody had seen it is a decision made alone, and a price
     that fell at closing is one made across a table. */
  const money = (f.droppedBeforeSending
      ? `<div class="hist-find">${n(f.droppedBeforeSending,
          'בהצעה אחת המחיר ירד לפני שההצעה יצאה', 'ב-% הצעות המחיר ירד לפני שההצעה יצאה')}
         — זו הנחה שאף אחד לא ביקש.</div>` : '') +
    (f.closedLower
      ? `<div class="hist-find">${n(f.closedLower,
          'הצעה אחת נסגרה מתחת למחיר שנשלח', '% הצעות נסגרו מתחת למחיר שנשלח')}.</div>` : '');

  /* The whole clause varies, not only the count. Swapping the number alone left
     "הצעה אחת … ואינן", which is a plural verb after a singular subject — the
     kind of thing a template with one variable slot produces and a screenshot
     catches. */
  const retro = f.retro
    ? `<div class="hist-gap">${f.retro === 1
        ? 'הצעה אחת הוזנה בדיעבד ואינה נכללת בזמנים'
        : f.retro + ' הצעות הוזנו בדיעבד ואינן נכללות בזמנים'} — שם נמדדת
         ההקלדה ולא המכירה.</div>` : '';

  box.innerHTML = `<div class="hist-rows">${stages}</div>` + timing + money + retro;
});

const renderHistory = guard('history', function (list) {
  const box = el('historyBox'); if (!box) return;
  /* Computed before the report rather than after it, because the ceiling finding
     needs to know whether the price was ever tested — and a discount or a scope
     that widened is exactly that test. Passing it in keeps the question of
     whether the scope moved in deals.js, where scopeDrift() defines it, instead
     of growing a second implementation inside the track record. */
  const hold = PC.deals.priceHold();
  const rep = PC.history.report(list, PC.model.METHOD_LABEL, PC.PROVENANCE_LABEL, hold);
  if (!rep) { box.innerHTML = ''; show('historySec', false); return; }
  show('historySec', true);

  const acc = rep.accuracy;

  /* Quoted versus closed across everything, at any n. priceHold() has
     been written, commented and tested in deals.js since the ledger
     existed and called from nowhere — the one question the operator most
     wants answered, computed and thrown away on every render. */
  const holdLine = hold.n ? `<div class="hist-row">
      <span class="hist-k">המחיר ששלחת מול המחיר שנסגר</span>
      <span class="hist-v">${hold.n === 1
        ? (hold.held ? 'נסגרה במחיר המלא' : 'לא נסגרה במחיר המלא')
        : `${hold.held} מתוך ${hold.n} נסגרו במחיר המלא`}${
        hold.discounted
          ? ` · ${hold.discounted === 1
              ? `אחת ירדה ב-${hold.avgDiscount}%`
              : `${hold.discounted} ירדו, בממוצע ${hold.avgDiscount}%`}`
          : ''}</span>
    </div>` : '';

  /* The concession the line above cannot see.

     "נסגרו במחיר המלא" is computed from two numbers, so a deal that gained work
     after the quote went out counts as a clean win in it — the client paid the
     quote, and more was delivered for it. Left alone, the row above states the
     opposite of what happened on those deals.

     So this appears whenever the ledger can see it happen, and says the part
     that matters most: it is not in the discount figure. `widened` is null for a
     ledger with no baselines, and null is not a number greater than zero, so
     nothing is claimed about deals saved before the baseline existed. */
  const widenLine = hold.widened > 0 ? `<div class="hist-row">
      <span class="hist-k">נמסר יותר באותו מחיר</span>
      <span class="hist-v">${hold.widened === 1
        ? 'עסקה אחת קיבלה סעיף שלא היה בהצעה'
        : hold.widened + ' עסקאות קיבלו סעיפים שלא היו בהצעה'}, והמחיר לא עלה${
        hold.discounted ? ' · לא נכנס לאחוז ההנחה' : ''}</span>
    </div>` : '';

  /* The split, on its own line, whenever at least one side is attributed. One
     side alone is still worth saying: the line above already reports that a
     discount happened and how big, so what this adds is who moved the price,
     which is the only new fact here. What it does not do is appear for a set
     where nothing but 'unknown' has entries — "one was not recorded" is not a
     finding, and the countdown says that instead. */
  const bc = hold.byConcession || {};
  const sides = ['client_asked', 'i_offered'].filter(k => bc[k] && bc[k].n);
  const concLine = sides.length ? `<div class="hist-row">
      <span class="hist-k">מי הזיז את המחיר</span>
      <span class="hist-v">${sides.map(k =>
        `${esc(PC.CONCESSION_LABEL[k])}: ${bc[k].n === 1 ? 'אחת' : bc[k].n} · −${bc[k].avgDiscount}%`
      ).join(' · ')}${bc.unknown && bc.unknown.n
        ? ` · ${bc.unknown.n === 1 ? 'אחת לא נרשמה' : bc.unknown.n + ' לא נרשמו'}`
        : ''}</span>
    </div>` : '';

  const accLine = acc.n ? `<div class="hist-row">
      <span class="hist-k">האומדן שלך מול המציאות</span>
      <span class="hist-v">${acc.n === 1 ? 'מסירה אחת' : acc.n + ' מסירות'} · ${
        acc.within === 1 && acc.n === 1 ? 'בתוך' : acc.within + ' בתוך'} ±${
        Math.round(PC.history.CLOSE_ENOUGH * 100)}%${
        acc.over ? ` · ${acc.over === 1 ? 'אחת חרגה' : acc.over + ' חרגו'}` : ''}${
        acc.under ? ` · ${acc.under === 1 ? 'אחת מתחת' : acc.under + ' מתחת'}` : ''}</span>
    </div>` : '';

  const verdict = acc.verdict
    ? `<div class="hist-find hist-${acc.verdict.kind}">${esc(acc.verdict.text)}</div>` : '';
  const trendLine = rep.trend
    ? `<div class="hist-find hist-${rep.trend.improving ? 'holds' : 'low'}">${esc(rep.trend.text)}</div>` : '';
  /* Rendered as a finding rather than a row, because it is an argument and not a
     count — and marked `low` rather than `holds`, since a price nobody has ever
     tested is the same shape of problem as one that keeps sliding: in both cases
     the operator does not know where their ceiling is. Reading it as good news is
     exactly the mistake a win rate printed as a score invites. */
  const ceilingLine = rep.ceiling && rep.ceiling.untested && rep.ceiling.text
    ? `<div class="hist-find hist-low">${esc(rep.ceiling.text)}</div>` : '';

  const ready = rep.methods.rows.filter(r => r.enough);
  const methodTable = ready.length ? `
    <table class="hist-t">
      <caption>לפי שיטת התמחור שקבעה את המחיר בפועל</caption>
      <thead><tr><th scope="col">שיטה</th><th scope="col">הצעות</th>
        <th scope="col">נסגרו</th><th scope="col">במחיר מלא</th></tr></thead>
      <tbody>${ready.map(r => `<tr>
        <th scope="row">${esc(r.label)}</th>
        <td>${r.quoted}</td>
        <td>${r.decided ? `${r.won}/${r.decided}` : '—'}</td>
        <td>${r.pricedN ? `${r.heldFull}/${r.pricedN}${
          r.avgDiscount > 0 ? ` · −${r.avgDiscount}%` : ''}` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

  /* Second table, same shape and the same threshold as the one above it. It
     answers a question the operator could not previously ask of his own book:
     the figure the whole price hangs on — did the client name it, or did you.
     Every saved deal has carried the answer since the form started asking;
     nothing read it until now.

     Built from the same row fields as the method table, so if one of them ever
     learns to show something more it is one change and not two. */
  const provReady = rep.provenance.rows.filter(r => r.enough);
  const provTable = provReady.length ? `
    <table class="hist-t">
      <caption>לפי מאיפה הגיע המספר שעליו נבנה המחיר</caption>
      <thead><tr><th scope="col">המספר</th><th scope="col">הצעות</th>
        <th scope="col">נסגרו</th><th scope="col">במחיר מלא</th></tr></thead>
      <tbody>${provReady.map(r => `<tr>
        <th scope="row">${esc(r.label)}</th>
        <td>${r.quoted}</td>
        <td>${r.decided ? `${r.won}/${r.decided}` : '—'}</td>
        <td>${r.pricedN ? `${r.heldFull}/${r.pricedN}${
          r.avgDiscount > 0 ? ` · −${r.avgDiscount}%` : ''}` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

  /* The countdown, always, even once there are findings — because the
     questions this panel still cannot answer do not stop existing when
     one of them gets answered. */
  const missing = rep.unknowns.length ? `
    <div class="hist-gap">
      <div class="hist-gap-h">מה עוד אי אפשר לומר</div>
      <ul class="hist-gap-l">${rep.unknowns.map(u =>
        `<li><b>${esc(u.what)}</b> — ${esc(u.text)}</li>`).join('')}</ul>
    </div>` : '';

  box.innerHTML = (accLine || holdLine
      ? `<div class="hist-rows">${accLine}${holdLine}${widenLine}${concLine}</div>` : '') +
    verdict + trendLine + ceilingLine + methodTable + provTable + missing;
});

function newDeal(){
  currentDealId = null;
  ['q_process','q_client','q_trigger','q_prev','q_decider','q_deadline','q_success',
   'q_freq','q_minutes','q_err_freq','q_err_cost'].forEach(id => { const e = el(id); if (e) e.value = ''; });
  /* A select cannot be blanked the way a text field can — clearing its value
     leaves it showing nothing — so it goes back to the option the markup marks
     as default. It was missing from the list above, and that mattered much more
     once the ledger started reading it: a deal where the operator chose "I
     estimated it" left that choice sitting on the form, and the next proposal
     inherited it silently. One deal's answer became the next deal's record.
     Reported in review on the pull request that started reading this field. */
  const prov = el('q_provenance');
  if (prov) prov.value = 'unset';
  clearSystems();
  resetScope();
  clearTemplateChoice();
  resetGuide();
  renderScope(); renderLedger(); recompute();
  // a new proposal means there is nothing half-finished to come back to;
  // re-saving the blank form here made the recovery notice reappear forever
  PC.draft && PC.draft.clear();
  show('draftNote', false);
  scrollPageTop();
}
