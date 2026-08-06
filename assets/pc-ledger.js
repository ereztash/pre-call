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
  el('proposal').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveCurrentDeal(){
  const rec = PC.deals.save(dealSnapshot());
  if (!rec) { flashDoc('השמירה נכשלה — ייתכן שאחסון הדפדפן חסום'); return; }
  currentDealId = rec.id;
  renderLedger(); flashDoc('נשמר'); track('deal_saved');
}

function markSent(){
  if (!currentDealId) saveCurrentDeal();
  if (!currentDealId) return;
  PC.deals.setStatus(currentDealId, 'sent');
  renderLedger(); flashDoc('סומנה כנשלחה'); track('deal_sent');
}

function flashDoc(msg){
  const f = el('cpFlag'); if (!f) return;
  f.textContent = msg;
  f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 2000);
}

function setDealStatus(id, s){ PC.deals.setStatus(id, s); renderLedger(); }

function removeDeal(id){
  if (currentDealId === id) currentDealId = null;
  PC.deals.remove(id); renderLedger();
}

function saveOutcome(id){
  PC.deals.recordOutcome(id, {
    closedPrice: el('oc_price_' + id).value,
    actualHours: el('oc_hours_' + id).value
  });
  renderLedger(); recompute(); track('outcome_recorded');
}

const renderLedger = guard('ledger', function (){
  const box = el('ledgerBox'); if (!box) return;
  const list = PC.deals.list();
  const cal = PC.deals.calibration();
  const win = PC.deals.winRate();

  const summary = list.length ? `
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
    return `<div class="deal">
      <div class="deal-h">
        <b>${esc(d.client)}</b>
        <span class="deal-st st-${d.status}">${PC.STATUS_LABEL[d.status]}</span>
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
      </div>
      ${d.status === 'won' || done ? `
        <div class="deal-out">
          <div><label for="oc_price_${d.id}">מחיר שנסגר בפועל</label>
            <input type="number" id="oc_price_${d.id}" value="${o.closedPrice || ''}" placeholder="${d.priceQuoted || ''}"></div>
          <div><label for="oc_hours_${d.id}">שעות עבודה בפועל</label>
            <input type="number" id="oc_hours_${d.id}" value="${o.actualHours || ''}" placeholder="${d.estimatedHours || ''}"></div>
          <button type="button" class="ghost" data-deal="${d.id}" data-status="__outcome">שמור תוצאה</button>
        </div>` : ''}
    </div>`;
  }).join('') : '<p class="lead nomargin">עוד לא נשמרה אף הצעה. בנה אחת למעלה ולחץ "שמור".</p>');

  const bar = el('dealBar');
  if (bar) bar.innerHTML = list.length
    ? `<button type="button" class="ghost" data-act="newdeal">הצעה חדשה</button>
       <span class="dealbar-n">${list.length} שמורות · ${win.undecided} ממתינות לתשובה</span>` : '';
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
