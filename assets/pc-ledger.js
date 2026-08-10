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

let currentDealId = null;

function dealSnapshot(){
  const m = model();
  return {
    id: currentDealId || undefined,
    client: txt('q_client') || 'ללא שם',
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
  if (!d || !d.form) { flashDoc('העסקה הזאת נשמרה לפני שהיה אפשר לפתוח מחדש'); return; }
  applyDraft(d.form);
  currentDealId = d.id;
  renderScope(); renderLedger(); recompute(); renderGuide();
  saveDraft();
  const note = el('draftNote');
  if (note) {
    note.innerHTML = 'נפתחה לעריכה: ' + esc(d.client) +
      ' · נשמרה ' + (d.created || '').slice(0, 10) +
      ' <button type="button" class="ghost" data-act="newdeal">הצעה חדשה במקום</button>';
    show('draftNote', true);
  }
  scrollToEl('proposal', 'start');
}

function saveCurrentDeal(){
  const rec = PC.deals.save(dealSnapshot());
  if (!rec) { flashDoc('השמירה נכשלה — ייתכן שאחסון הדפדפן חסום'); return; }
  currentDealId = rec.id;
  renderLedger(); flashDoc('נשמר'); track('deal_saved');
}

/* The emotional peak of the whole product is the moment a proposal worth
   real money leaves the building, and the entire acknowledgement used to
   be a two-second grey toast. Worse than thin: it is the one moment the
   operator is willing to do one more thing, and the one thing worth doing
   is the thing that makes them come back. */
function markSent(){
  if (!currentDealId) saveCurrentDeal();
  if (!currentDealId) return;
  PC.deals.setStatus(currentDealId, 'sent');
  renderLedger(); track('deal_sent');
  offerFollowup(currentDealId);
}

/* No server here means the product cannot notify anybody, ever. What it
   can do is hand over a trigger that lives somewhere which does — the
   operator's own calendar. One file, no account, no permission prompt,
   and it still fires on a phone with this tab long closed. */
function offerFollowup(id){
  const d = PC.deals.get(id);
  const due = d && PC.followup.dueState(d);
  const bar = el('draftNote');
  if (!d || !due || !bar) { flashDoc('סומנה כנשלחה'); return; }
  const when = new Date(Math.max(
    new Date(d.sentAt).getTime() + PC.followup.NUDGE_AFTER_DAYS * 864e5,
    due.expires.getTime() - PC.followup.CLOSING_WINDOW_DAYS * 864e5));
  bar.innerHTML = '<b>נשלחה.</b> התוקף שכתוב במסמך הוא ' +
    due.expires.toLocaleDateString('he-IL') + '. ' +
    'רוצה תזכורת ל-' + when.toLocaleDateString('he-IL') + ' לבדוק מה קרה? ' +
    '<button type="button" class="ghost" data-deal="' + esc(id) + '" data-status="__ics">' +
    'הוסף ליומן</button>';
  show('draftNote', true);
}

function downloadFollowup(id){
  const d = PC.deals.get(id);
  if (!d) return;
  const text = PC.followup.icsFor(d, { ils });
  if (!text) { flashDoc('אין תאריך שליחה להצעה הזאת'); return; }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = PC.followup.filenameFor(d);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  flashDoc('התזכורת ירדה — פתח את הקובץ כדי להוסיף אותה ליומן');
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
  PC.deals.setStatus(id, s);
  renderLedger();
  if (s === 'sent' && (!before || before.status !== 'sent')) offerFollowup(id);
}

function removeDeal(id){
  if (currentDealId === id) currentDealId = null;
  PC.deals.remove(id); renderLedger();
}

function saveOutcome(id){
  /* The concession control only exists once a lower closing price has been
     saved, so on the first save there is nothing to read. recordOutcome keeps
     the previous answer when none is sent, so reading it as absent here is
     safe rather than destructive. */
  const conc = el('oc_conc_' + id);
  PC.deals.recordOutcome(id, {
    closedPrice: el('oc_price_' + id).value,
    actualHours: el('oc_hours_' + id).value,
    concession: conc ? conc.value : undefined
  });
  renderLedger(); recompute(); track('outcome_recorded');
}

const renderLedger = guard('ledger', function (){
  const box = el('ledgerBox'); if (!box) return;
  const list = PC.deals.list();
  const cal = PC.deals.calibration();
  const win = PC.deals.winRate();

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

  renderHistory(list);
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
const renderHistory = guard('history', function (list) {
  const box = el('historyBox'); if (!box) return;
  const rep = PC.history.report(list, PC.model.METHOD_LABEL);
  if (!rep) { box.innerHTML = ''; show('historySec', false); return; }
  show('historySec', true);

  const acc = rep.accuracy;
  const hold = PC.deals.priceHold();

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
      ? `<div class="hist-rows">${accLine}${holdLine}${concLine}</div>` : '') +
    verdict + trendLine + methodTable + missing;
});

function newDeal(){
  currentDealId = null;
  ['q_process','q_client','q_trigger','q_prev','q_decider','q_deadline','q_success',
   'q_freq','q_minutes','q_err_freq','q_err_cost'].forEach(id => { const e = el(id); if (e) e.value = ''; });
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
