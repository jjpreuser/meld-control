// Feature 3 — One-tap command deck. Renders grouped deck-style buttons from the
// COMMAND_GROUPS catalog; each fires sendCommand(cmd) via POST /api/command.
// Stateless and fire-and-forget, so no sessionChanged handling needed.
//
// Ref: WebChannel API — Commands & Events (sendCommand).

function renderCommands() {
  const container = $('commandDeck');
  if (!container) return;

  container.innerHTML = COMMAND_GROUPS.map(group => `
    <div class="cmd-group">
      <div class="cmd-group-title">${escHtml(group.title)}</div>
      <div class="command-grid">
        ${group.commands.map(c => `
          <button class="btn btn-cmd" data-cmd="${c.cmd}">
            <span class="cmd-icon">${c.icon || ''}</span>
            <span class="cmd-label">${escHtml(c.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderCommands };
}
