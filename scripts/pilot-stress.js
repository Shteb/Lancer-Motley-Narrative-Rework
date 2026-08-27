/**
 * Always-visible Pilot Stress. Both sheets omit the Stress DOM until a Bond exists, so we clone the
 * sheet's own HP control and retarget it at `system.bond_state.stress`: it inherits the live theme,
 * and the sheet's form submit persists it. Gated on the setting; no-ops when off.
 */

import { isPilotStressEnabled } from "./settings.js";
import { PILOT_STRESS, AUTOMATION } from "./constants.js";

/**
 * Any Stress control already on the sheet — ours from an earlier pass, a native one, or one the
 * Lancer Automation module injected. A second input with the same `name` would also break submit.
 */
const EXISTING_STRESS_CONTROL = [
  `.${PILOT_STRESS.MARKER}`,
  `input[name="${PILOT_STRESS.VALUE_PATH}"]`,
  AUTOMATION.STRESS_MARKERS,
].join(", ");

/** Register the pilot-stress hook. Call once from `init`. */
export function registerPilotStressHooks() {
  Hooks.on("renderActorSheet", onRenderActorSheet);
}

/** Normalise the V1 render-hook html arg (jQuery or HTMLElement) to a root element. */
function rootOf(html) {
  if (html instanceof HTMLElement) return html;
  if (html && html[0] instanceof HTMLElement) return html[0];
  return null;
}

/** True when the pilot already has a Bond (native Stress is shown, so we must not inject). */
function hasBond(actor) {
  return Boolean(actor.system?.bond) || Boolean(actor.itemTypes?.bond?.length);
}

function onRenderActorSheet(app, html) {
  if (!isPilotStressEnabled()) return;

  const actor = app?.document ?? app?.object;
  if (!actor || actor.type !== "pilot") return;
  if (hasBond(actor)) return;

  const root = rootOf(html);
  if (!root) return;

  // Idempotent per render, and yields to any other module's Stress control.
  if (root.querySelector(EXISTING_STRESS_CONTROL)) return;

  const counter = foundry.utils.getProperty(actor, PILOT_STRESS.PATH);
  if (!counter) return;

  const hpInput = root.querySelector(`input[name="${PILOT_STRESS.HP_VALUE_PATH}"]`);

  // Alt sheet: HP is a Svelte `StatusBar` in the sidebar.
  const hpBar = hpInput?.closest(PILOT_STRESS.ALT.STATUS_BAR);
  if (hpBar) {
    injectAltStressBar(hpBar, counter);
    return;
  }

  // Stock sheet: a readout beside HP in the header, plus the native hex track in the narrative tab.
  const hpStat = hpInput?.closest(PILOT_STRESS.STOCK.COMPACT_STAT);
  if (hpStat) injectStockHeaderStress(hpStat, counter);

  const narrativeTab = root.querySelector(PILOT_STRESS.STOCK.NARRATIVE_TAB);
  if (narrativeTab) injectStockStressCounter(narrativeTab, actor, counter);
}

/** Stock sheet header: clone the HP `compact-stat` cell, swap its icon, and retarget its input at Stress. */
function injectStockHeaderStress(hpStat, counter) {
  const stat = hpStat.cloneNode(true);
  const input = stat.querySelector(`input[name="${PILOT_STRESS.HP_VALUE_PATH}"]`);
  if (!input) return; // no input in the clone — a dead cell is worse than nothing

  stat.classList.add(PILOT_STRESS.MARKER);
  stat.setAttribute("data-tooltip", game.i18n.localize("LMNR.pilotStress.tooltip"));

  const icon = stat.querySelector(PILOT_STRESS.STOCK.STAT_ICON);
  if (icon) icon.className = PILOT_STRESS.STOCK.STRESS_ICON;

  input.name = PILOT_STRESS.VALUE_PATH;
  input.value = String(Number(counter.value) || 0);

  const maxSpan = [...stat.querySelectorAll(PILOT_STRESS.STOCK.STAT_MAX)].pop();
  if (maxSpan) maxSpan.textContent = String(maxOf(counter));

  normaliseOnChange(input, counter);
  hpStat.after(stat);
}

/** Stock sheet: inject the native hex Stress counter (system's `generic-counter` helper) and wire clicks. */
function injectStockStressCounter(narrativeTab, actor, counter) {
  const helper = Handlebars.helpers?.[PILOT_STRESS.STOCK.COUNTER_HELPER];
  if (typeof helper !== "function") return; // system helper unavailable — fail quietly, nothing to show

  let markup;
  try {
    markup = helper(game.i18n.localize("LMNR.pilotStress.label"), counter, PILOT_STRESS.PATH);
  } catch (_e) {
    return;
  }
  markup = markup?.toString?.() ?? String(markup); // coerce Handlebars SafeString → string

  // The counter markup is itself a `.card`; wrap only for the marker + layout (no nested card frame).
  const wrapper = document.createElement("div");
  wrapper.className = `${PILOT_STRESS.MARKER} flexrow`;
  wrapper.innerHTML = markup;

  // Place it where the bond card would sit: right after the top level/grit card.
  const topCard = narrativeTab.querySelector(".card.clipped");
  if (topCard) topCard.after(wrapper);
  else narrativeTab.prepend(wrapper);

  wireStockStressCounter(wrapper, actor);
}

/** Replicate the system's counter interaction (item.ts handleCounterInteraction) for our injected hexes. */
function wireStockStressCounter(wrapper, actor) {
  for (const hex of wrapper.querySelectorAll(PILOT_STRESS.STOCK.HEX)) {
    hex.addEventListener("click", ev => {
      ev.stopPropagation();
      updateStress(actor, hex.dataset.available === "true" ? -1 : 1);
    });
  }
  const minus = wrapper.querySelector(PILOT_STRESS.STOCK.MINUS_BUTTON);
  if (minus) minus.addEventListener("click", ev => { ev.stopPropagation(); updateStress(actor, -1); });
  const plus = wrapper.querySelector(PILOT_STRESS.STOCK.PLUS_BUTTON);
  if (plus) plus.addEventListener("click", ev => { ev.stopPropagation(); updateStress(actor, +1); });
}

/**
 * Alt sheet: clone the sidebar's HP `StatusBar` and retarget it at Stress — drop HP's overshield /
 * burn sub-bars, recolour the fill, relabel, rename the input.
 */
function injectAltStressBar(hpBar, counter) {
  const bar = hpBar.cloneNode(true);
  const input = bar.querySelector(`input[name="${PILOT_STRESS.HP_VALUE_PATH}"]`);
  if (!input) return; // no input in the clone — a read-only bar is worse than nothing

  bar.classList.add(PILOT_STRESS.MARKER);
  for (const sub of bar.querySelectorAll(PILOT_STRESS.ALT.SUB_BARS)) sub.remove();

  const value = Number(counter.value) || 0;
  const max = maxOf(counter);

  const fill = bar.querySelector(PILOT_STRESS.ALT.FILL);
  if (fill) {
    fill.classList.remove(PILOT_STRESS.ALT.HEALTH_FILL);
    fill.classList.add(PILOT_STRESS.ALT.STRESS_FILL);
    fill.style.setProperty("--la-percent", `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`);
  }

  const label = bar.querySelector(PILOT_STRESS.ALT.LABEL);
  if (label) {
    label.textContent = game.i18n.localize("LMNR.pilotStress.label");
    // Only when the alt sheet rendered a tooltip at all (it's a per-sheet setting).
    if (label.hasAttribute("data-tooltip")) {
      label.setAttribute("data-tooltip", game.i18n.localize("LMNR.pilotStress.tooltip"));
    }
  }

  input.name = PILOT_STRESS.VALUE_PATH;
  input.value = String(value);

  const progress = bar.querySelector(PILOT_STRESS.ALT.PROGRESS_SPAN);
  if (progress) progress.textContent = `${value}/${max}`;

  wireAltEditState(input, fill, progress);
  normaliseOnChange(input, counter, { relative: true });

  // Stack under HP, spaced like the native bonded layout.
  const spacer = document.createElement("div");
  spacer.className = `${PILOT_STRESS.ALT.SPACER} ${PILOT_STRESS.MARKER}`;
  hpBar.after(spacer, bar);
}

/** Replay `StatusBar.svelte`'s editing state, which the clone loses along with its Svelte bindings. */
function wireAltEditState(input, fill, progress) {
  const editFill = PILOT_STRESS.ALT.EDIT_FILL.split(" ");

  input.addEventListener("focus", () => {
    input.select();
    input.classList.remove(PILOT_STRESS.ALT.TEXT_HIDDEN);
    input.classList.add(PILOT_STRESS.ALT.TEXT_SHOWN);
    progress?.classList.add(PILOT_STRESS.ALT.SPAN_HIDDEN);
    fill?.classList.remove(PILOT_STRESS.ALT.STRESS_FILL);
    fill?.classList.add(...editFill);
  });

  input.addEventListener("blur", () => {
    input.classList.remove(PILOT_STRESS.ALT.TEXT_SHOWN);
    input.classList.add(PILOT_STRESS.ALT.TEXT_HIDDEN);
    progress?.classList.remove(PILOT_STRESS.ALT.SPAN_HIDDEN);
    fill?.classList.remove(...editFill);
    fill?.classList.add(PILOT_STRESS.ALT.STRESS_FILL);
  });
}

/**
 * Point an injected input's bounds at Stress and clamp it in place on `change`, then let the event
 * bubble so the sheet's own form submit writes the value. `relative` accepts the alt sheet's `+n` /
 * `-n` entry; the stock header input is `type="number"`, so it takes absolute values only.
 */
function normaliseOnChange(input, counter, { relative = false } = {}) {
  // Inherited from HP, these would otherwise cap the input short of the Stress track.
  if (input.hasAttribute("min")) input.min = String(minOf(counter));
  if (input.hasAttribute("max")) input.max = String(maxOf(counter));

  input.addEventListener("change", () => {
    const current = Number(counter.value) || 0;
    const raw = String(input.value).trim();

    let next = current;
    if (relative && raw.startsWith("+")) next = current + Number(raw.slice(1));
    else if (relative && raw.startsWith("-")) next = current - Number(raw.slice(1));
    else if (raw) next = Number(raw);
    if (!Number.isFinite(next)) next = current;

    input.value = String(clampStress(next, counter));
  });
}

/** The counter's bounds, defaulting to the pilot model's `0` / `8`. */
function minOf(counter) {
  return Number.isFinite(counter?.min) ? counter.min : 0;
}

function maxOf(counter) {
  return Number.isFinite(counter?.max) ? counter.max : 8;
}

/** Clamp to the counter's bounds; neither the data model nor the sheet form does this for us. */
function clampStress(value, counter) {
  return Math.max(minOf(counter), Math.min(maxOf(counter), Math.round(value)));
}

/** Persist a Stress delta from the hex pips, which have no form input of their own. */
function updateStress(actor, delta) {
  const counter = foundry.utils.getProperty(actor, PILOT_STRESS.PATH) ?? {};
  const current = Number(counter.value) || 0;
  const next = clampStress(current + delta, counter);
  if (next === current) return;
  return actor.update({ [PILOT_STRESS.VALUE_PATH]: next });
}
