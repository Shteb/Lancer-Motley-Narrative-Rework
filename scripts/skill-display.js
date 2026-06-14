/**
 * Skill-trigger rank display override: rewrite the rendered DOM in the `renderActorSheet` /
 * `renderItemSheet` hooks to show `+{rank}d6` instead of the stock `+{rank*2}`. Gated on the
 * setting - stock display is left untouched when off.
 */

import { isDicePoolEnabled } from "./settings.js";
import { ALT_SHEET } from "./constants.js";

/** Marker class so the injected item-sheet readout is only added once per render. */
const ITEM_READOUT_CLASS = "lmnr-rank-readout";

/** Register the display hooks. Call once from `init`/`ready`. */
export function registerDisplayHooks() {
  Hooks.on("renderActorSheet", onRenderActorSheet);
  Hooks.on("renderItemSheet", onRenderItemSheet);
}

/** Normalise the V1 render-hook html arg (jQuery or HTMLElement) to a root element. */
function rootOf(html) {
  if (html instanceof HTMLElement) return html;
  if (html && html[0] instanceof HTMLElement) return html[0];
  return null;
}

/** Format a trigger rank as its `+{rank}d6` display string. Shared with the TAH badge rewrite. */
export function formatRankDice(rank) {
  const n = Number(rank) || 0;
  const sign = n < 0 ? "-" : "+"; // negatives shouldn't occur for skills
  return `${sign}${Math.abs(n)}d6`;
}

/** Pilot sheet (and ref previews): rewrite each skill-flow bonus to `+{rank}d6`. */
function onRenderActorSheet(app, html) {
  if (!isDicePoolEnabled()) return;
  const root = rootOf(html);
  if (!root) return;

  // Stock lancer sheet: `<a class="skill-flow"><span class="roll-modifier">+{rank*2}</span></a>`.
  for (const flow of root.querySelectorAll("a.skill-flow")) {
    const modifier = flow.querySelector(".roll-modifier");
    if (!modifier) continue;
    const rank = resolveRank(flow, modifier);
    if (rank === null) continue;
    modifier.textContent = formatRankDice(rank);

    // Tighten the stock spacing inline so the wider "+{rank}d6" label fits without clipping.
    flow.style.marginInline = "0.35em";
    flow.style.gap = "0.25em";
    flow.style.justifyContent = "center";
    flow.style.whiteSpace = "nowrap";
    modifier.style.whiteSpace = "nowrap";
  }

  // Alternative Sheets compatibility (separate markup); no-ops on the stock sheet.
  rewriteAltSheetRanks(root);
}

/**
 * Alt sheet (`lancer-alternative-sheets`) rewrite: set the rank bonus to `+{rank}d6` on its two
 * surfaces, keyed on the skill item's `system.curr_rank`. Selectors live in `ALT_SHEET.SELECTORS`.
 */
function rewriteAltSheetRanks(root) {
  const S = ALT_SHEET.SELECTORS;

  // Abilities tab: skill row `.la-collapsegroup[data-uuid]` -> its bonus `<span>` in the right options.
  for (const row of root.querySelectorAll(S.ABILITIES_ROW)) {
    const rank = skillRankFromUuid(row.dataset?.uuid);
    if (rank === null) continue;
    const bonus = row.querySelector(S.ABILITIES_BONUS);
    if (bonus) bonus.textContent = formatRankDice(rank);
  }

  // Sidebar macro box: `.la-skilltrigger` -> readout box, keyed on its `skill-flow` button's uuid.
  // ("Other skill" uses a non-`skill-flow` button, so MACRO_BUTTON excludes it - its "0" box stays.)
  for (const row of root.querySelectorAll(S.MACRO_ROW)) {
    const button = row.querySelector(S.MACRO_BUTTON);
    if (!button) continue;
    const rank = skillRankFromUuid(button.dataset?.uuid);
    if (rank === null) continue;
    const bonus = row.querySelector(S.MACRO_BONUS);
    if (bonus) bonus.textContent = formatRankDice(rank);
  }
}

/** Rank from a UUID, but only for skill items. @returns {number|null} */
function skillRankFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    if (doc?.type !== "skill") return null;
    const rank = doc.system?.curr_rank;
    return typeof rank === "number" ? rank : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Rank for a stock `.skill-flow` element: prefer the linked item's `system.curr_rank`, else halve the
 * stock `+{rank*2}` text. @returns {number|null}
 */
function resolveRank(flow, modifier) {
  const uuidEl = flow.closest("[data-uuid]");
  const uuid = uuidEl?.dataset?.uuid;
  if (uuid) {
    try {
      const doc = fromUuidSync(uuid);
      const rank = doc?.system?.curr_rank;
      if (typeof rank === "number") return rank;
    } catch (_e) {
      /* fall through to text parsing */
    }
  }
  // Fallback: stock text is "+{rank*2}".
  const match = modifier.textContent.match(/-?\d+/);
  if (!match) return null;
  return Math.trunc(parseInt(match[0], 10) / 2);
}

/** Skill item sheet: add a read-only `+{rank}d6` readout beside the editable RANK input. */
function onRenderItemSheet(app, html) {
  if (!isDicePoolEnabled()) return;
  const item = app?.document ?? app?.object;
  if (!item || item.type !== "skill") return;

  const root = rootOf(html);
  if (!root || root.querySelector(`.${ITEM_READOUT_CLASS}`)) return;

  const details = root.querySelector(".header-details");
  if (!details) return;

  const rank = Number(item.system?.curr_rank) || 0;
  const readout = document.createElement("span");
  readout.className = ITEM_READOUT_CLASS;
  readout.textContent = formatRankDice(rank);
  readout.title = game.i18n.localize("LMNR.display.itemReadoutTooltip");
  readout.style.marginLeft = "8px";
  readout.style.fontWeight = "bold";
  readout.style.whiteSpace = "nowrap";
  details.appendChild(readout);
}
