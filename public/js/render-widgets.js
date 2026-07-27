// Feature 4 — Stream widgets tab. One card per on-stream widget (from the WIDGETS
// catalog); each button dispatches sendStreamEvent(type) via POST /api/stream-event.
// These are stateless fire-and-forget triggers — there is no session state to
// reconcile, so this renders once and never needs a sessionChanged redraw.
//
// Ref: WebChannel API — Widget Events (sendStreamEvent).

function renderWidgets() {
  const container = $('widgetList');
  if (!container) return;

  container.innerHTML = WIDGETS.map(w => `
    <div class="card widget-card" data-widget="${w.id}">
      <div class="widget-head"><span class="widget-icon">${w.icon}</span> ${escHtml(w.name)}</div>
      <div class="widget-actions">
        ${w.events.map(ev => ev.dataKey ? `
          <div class="widget-addtime">
            <input type="number" class="widget-amount" value="60" min="1" data-widget-amount="${w.id}" aria-label="Amount">
            <button class="btn btn-sm btn-cmd" data-event="${ev.type}" data-amount-from="${w.id}" data-amount-key="${ev.dataKey}">${escHtml(ev.label)}</button>
          </div>
        ` : `
          <button class="btn btn-sm btn-cmd" data-event="${ev.type}">${escHtml(ev.label)}</button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderWidgets };
}
