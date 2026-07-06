/**
 * Always-visible Pilot Stress.
 */

import { isPilotStressEnabled } from "./settings.js";
import { PILOT_STRESS } from "./constants.js";

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

  // Idempotent per render (fresh V1 render replaces the DOM, so this only guards double-injection).
  if (root.querySelector(`.${PILOT_STRESS.MARKER}`)) return;

  const narrativeTab = root.querySelector(PILOT_STRESS.STOCK.NARRATIVE_TAB);
  if (narrativeTab) {
    injectStockStress(narrativeTab, actor);
    return;
  }

  const barsContainer = root.querySelector(PILOT_STRESS.ALT.BARS_CONTAINER);
  if (barsContainer) {
    injectAltStress(barsContainer, actor);
  }
}

/** Stock sheet: inject the native hex Stress counter (system's `generic-counter` helper) and wire clicks. */
function injectStockStress(narrativeTab, actor) {
  const helper = Handlebars.helpers?.[PILOT_STRESS.STOCK.COUNTER_HELPER];
  if (typeof helper !== "function") return; // system helper unavailable — fail quietly, nothing to show

  const counter = foundry.utils.getProperty(actor, PILOT_STRESS.PATH);
  if (!counter) return;

  let markup;
  try {
    markup = helper("Stress", counter, PILOT_STRESS.PATH);
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

  wireStockStress(wrapper, actor);
}

/** Replicate the system's counter interaction (item.ts handleCounterInteraction) for our injected hexes. */
function wireStockStress(wrapper, actor) {
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

/** Alt sheet: append a `la-*` replica of the Stress `StatusBar` to the "Pilot Bars" container and wire it. */
function injectAltStress(barsContainer, actor) {
  const counter = foundry.utils.getProperty(actor, PILOT_STRESS.PATH);
  if (!counter) return;

  const value = Number(counter.value) || 0;
  const max = Number.isFinite(counter.max) ? counter.max : 8;
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const label = game.i18n.localize("LMNR.pilotStress.label");
  const tooltip = game.i18n.localize("LMNR.pilotStress.tooltip");

  const row = document.createElement("div");
  row.className = `${PILOT_STRESS.MARKER} la-flexrow -gap2`;
  row.innerHTML = `
    <div class="la-visuals -flex5">
      <div class="la-statusbar la-flexrow -fontsizemedium -gap2 la-text-text" title="${tooltip}">
        <span class="la-damage__span -fontsizesmall -flexbasis13 -textalignright">${label}</span>
        <div class="la-bar-h la-bckg-darken-3 -flex1 -positionrelative -widthfull -height3 -overflowhidden clipped">
          <div class="la-bar-h-progress la-flexrow -widthfull -heightfull">
            <input type="number" class="la-bar-h-progress__input -widthfull -heightfull -positionrelative -textaligncenter la-text-transparent"
              name="${PILOT_STRESS.VALUE_PATH}" data-dtype="Number" value="${value}">
            <span class="la-bar-h-progress__span -lineheight3 -positionabsolute -pointerdisable">${value}/${max}</span>
          </div>
          <div class="la-bar-h-progress la-bar-h-current -positionabsolute -top0 -heightfull ${PILOT_STRESS.ALT.BAR_FILL}"
            style="--la-percent:${pct}%"></div>
        </div>
      </div>
    </div>`;

  barsContainer.appendChild(row);
  wireAltStress(row, value, actor);
}

/** Wire the injected alt input: focus/blur toggles the transparent overlay; change persists the value. */
function wireAltStress(row, previous, actor) {
  const input = row.querySelector("input");
  const span = row.querySelector(".la-bar-h-progress__span");
  if (!input) return;

  input.addEventListener("focus", () => {
    input.select();
    input.classList.remove("la-text-transparent");
    span?.classList.add("-visibilityhidden");
  });
  input.addEventListener("blur", () => {
    input.classList.add("la-text-transparent");
    span?.classList.remove("-visibilityhidden");
  });
  input.addEventListener("change", () => {
    const raw = input.value?.trim() ?? "";
    let next = previous;
    if (raw.startsWith("+")) next = previous + Number(raw.slice(1));
    else if (raw.startsWith("-")) next = previous - Number(raw.slice(1));
    else if (raw) next = Number(raw);
    if (!Number.isFinite(next)) next = previous;
    updateStress(actor, next, { absolute: true });
  });
}

/** Persist a Stress change, clamped to the field's bounds. `amount` is a delta unless `absolute` is set. */
function updateStress(actor, amount, { absolute = false } = {}) {
  const s = foundry.utils.getProperty(actor, PILOT_STRESS.PATH) ?? {};
  const min = Number.isFinite(s.min) ? s.min : 0;
  const max = Number.isFinite(s.max) ? s.max : 8;
  const current = Number(s.value) || 0;
  let next = absolute ? amount : current + amount;
  next = Math.max(min, Math.min(max, next));
  if (next === current) return;
  return actor.update({ [PILOT_STRESS.VALUE_PATH]: next });
}
