/**
 * Token Action HUD display override for the "Lancer Automation" module (`lancer-automations`).
 * Rewrites the `.la-hud-badge` text (`+{rank*2}` -> `+{rank}d6`) in the "Triggers" column via a
 * MutationObserver. Gated on the setting; a no-op unless the module is active.
 */

import { AUTOMATION } from "./constants.js";
import { isDicePoolEnabled } from "./settings.js";
import { formatRankDice } from "./skill-display.js";

/** Marker so a rewritten badge isn't reprocessed (and its `+Nd6` text never re-parsed as `rank*2`). */
const BADGE_MARK = "lmnrD6";

let observer = null;
let scheduled = false;

/**
 * Install the TAH badge rewrite. Call once from `ready`. No-ops (and skips the observer entirely)
 * unless the automation module is active.
 */
export function registerTahDisplay() {
  if (observer) return; // already installed
  if (!game.modules.get(AUTOMATION.MODULE_ID)?.active) return;

  observer = new MutationObserver(scheduleRewrite);
  observer.observe(document.body, { childList: true, subtree: true });
}

/** Coalesce bursts of mutations into one rewrite per frame. */
function scheduleRewrite() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    rewriteTriggerBadges();
  });
}

/** Rewrite every `+{rank*2}` badge in the HUD's "Triggers" column to `+{rank}d6`. */
function rewriteTriggerBadges() {
  if (!isDicePoolEnabled()) return;
  const hud = document.getElementById(AUTOMATION.HUD_ID);
  if (!hud) return;

  for (const label of hud.querySelectorAll(AUTOMATION.COL_LABEL)) {
    if (label.textContent.trim() !== AUTOMATION.TRIGGERS_LABEL) continue;
    const column = label.parentElement;
    if (!column) continue;

    for (const badge of column.querySelectorAll(AUTOMATION.BADGE)) {
      if (badge.dataset[BADGE_MARK]) continue; // already rewritten
      const match = badge.textContent.match(/-?\d+/);
      if (!match) continue;
      // The badge text is the stock bonus (rank * 2); halve it back to the trigger rank.
      const rank = Math.trunc(parseInt(match[0], 10) / 2);
      badge.textContent = formatRankDice(rank);
      badge.dataset[BADGE_MARK] = "1";
    }
  }
}
