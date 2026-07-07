/**
 * Always-visible Pilot Burdens. Like Stress, the pilot Burdens section (`system.bond_state.burdens`)
 * is only rendered once a Bond is present, so when SHOW_PILOT_BURDENS is on this module injects a fixed
 * set of three trackers (lengths 4 / 6 / 10) that are un-deletable and fixed-length with editable name
 * + fill. State lives in a module flag (`actor.flags[MODULE_ID].burdens`), never the native array, so
 * the native add/delete/edit-length controls can't touch them. Gated on the setting; no-ops when off.
 */

import { isPilotBurdensEnabled } from "./settings.js";
import { MODULE_ID, PILOT_BURDENS } from "./constants.js";

/** Register the pilot-burdens hook. Call once from `init`. */
export function registerPilotBurdensHooks() {
  Hooks.on("renderActorSheet", onRenderActorSheet);
}

/** Normalise the V1 render-hook html arg (jQuery or HTMLElement) to a root element. */
function rootOf(html) {
  if (html instanceof HTMLElement) return html;
  if (html && html[0] instanceof HTMLElement) return html[0];
  return null;
}

/** Escape a string for safe interpolation into an HTML attribute value. */
function escapeAttr(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** True when the pilot has a Bond (native Burdens section is shown, so we must not inject ours). */
function hasBond(actor) {
  return Boolean(actor.system?.bond) || Boolean(actor.itemTypes?.bond?.length);
}

function onRenderActorSheet(app, html) {
  if (!isPilotBurdensEnabled()) return;

  const actor = app?.document ?? app?.object;
  if (!actor || actor.type !== "pilot") return;
  // Bondless-only: once a Bond is added, the system's native Burdens section takes over. Our flag
  // state is preserved, so removing the Bond restores the trackers.
  if (hasBond(actor)) return;

  const root = rootOf(html);
  if (!root) return;

  // Idempotent per render (fresh V1 render replaces the DOM, so this only guards double-injection).
  if (root.querySelector(`.${PILOT_BURDENS.MARKER}`)) return;

  const narrativeTab = root.querySelector(PILOT_BURDENS.STOCK.NARRATIVE_TAB);
  if (narrativeTab) {
    injectStockBurdens(narrativeTab, actor);
    return;
  }

  const bondsContainer = root.querySelector(PILOT_BURDENS.ALT.BONDS_CONTAINER);
  if (bondsContainer) {
    injectAltBurdens(bondsContainer, actor);
  }
}

// --- Shared flag-backed state -----------------------------------------------------------------

/**
 * The current state of the three fixed trackers, derived from module constants overlaid with the
 * actor's saved flag. Always returns exactly `TRACKERS.length` entries; no seeding is performed.
 * @returns {{max:number,name:string,value:number}[]}
 */
function getBurdenState(actor) {
  const saved = actor.getFlag(MODULE_ID, PILOT_BURDENS.FLAG_KEY);
  const defaultName = game.i18n.localize("LMNR.pilotBurdens.defaultName");
  return PILOT_BURDENS.TRACKERS.map((def, i) => {
    const s = Array.isArray(saved) ? saved[i] : undefined;
    const name = s && typeof s.name === "string" ? s.name : defaultName;
    const value = Math.max(0, Math.min(def.max, Number(s?.value) || 0));
    return { max: def.max, name, value };
  });
}

/** Persist a patch (`{name}` and/or `{value}`) to one tracker, clamped to its fixed length. */
function setBurden(actor, index, patch) {
  const state = getBurdenState(actor).map(t => ({ name: t.name, value: t.value }));
  const max = PILOT_BURDENS.TRACKERS[index]?.max ?? 0;
  const merged = { ...state[index], ...patch };
  merged.value = Math.max(0, Math.min(max, Number(merged.value) || 0));
  state[index] = merged;
  return actor.setFlag(MODULE_ID, PILOT_BURDENS.FLAG_KEY, state);
}

/** Adjust a tracker's fill by `delta`, clamped. No-op when it would not change. */
function adjustBurden(actor, index, delta) {
  const t = getBurdenState(actor)[index];
  if (!t) return;
  const next = Math.max(0, Math.min(t.max, t.value + delta));
  if (next === t.value) return;
  return setBurden(actor, index, { value: next });
}

// --- Stock sheet ------------------------------------------------------------------------------

/** Stock sheet: inject a Burdens card of three native `counter` hexes (no context menu) with editable names, then wire handlers. */
function injectStockBurdens(narrativeTab, actor) {
  const helper = Handlebars.helpers?.[PILOT_BURDENS.STOCK.COUNTER_HELPER];
  if (typeof helper !== "function") return; // system helper unavailable — nothing to show

  const isOwner = actor.isOwner;
  const state = getBurdenState(actor);

  const card = document.createElement("div");
  card.className = `${PILOT_BURDENS.MARKER} card clipped`;
  const header = document.createElement("div");
  header.className = "lancer-header lancer-primary submajor clipped";
  const headerSpan = document.createElement("span");
  headerSpan.textContent = game.i18n.localize("LMNR.pilotBurdens.sectionLabel");
  header.appendChild(headerSpan);
  card.appendChild(header);

  state.forEach((t, i) => {
    const data = { lid: `lmnr_burden_${i}`, name: t.name, min: 0, max: t.max, value: t.value, default_value: 0 };
    let markup;
    try {
      markup = helper(data, `flags.${MODULE_ID}.${PILOT_BURDENS.FLAG_KEY}.${i}`, { noContextMenu: true });
    } catch (_e) {
      return;
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = (markup?.toString?.() ?? String(markup)).trim();
    const counterEl = tmp.firstElementChild;
    if (!counterEl) return;

    // Swap the `// name //` header span for an editable input.
    const span = counterEl.querySelector(`${PILOT_BURDENS.STOCK.HEADER} span`);
    if (span) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "lmnr-burden-name";
      input.value = t.name;
      input.placeholder = game.i18n.localize("LMNR.pilotBurdens.defaultName");
      Object.assign(input.style, {
        background: "transparent", border: "none", color: "inherit", font: "inherit",
        flex: "1", minWidth: "0", textAlign: "center",
      });
      span.replaceWith(input);
    }

    card.appendChild(counterEl);
    wireStockBurden(counterEl, i, actor, isOwner);
  });

  // Place above the native bond burdens block: right after the top level/grit card.
  const topCard = narrativeTab.querySelector(".card.clipped");
  if (topCard) topCard.after(card);
  else narrativeTab.prepend(card);
}

/** Wire one stock counter: name input persists; pips / +/- adjust fill. Read-only for non-owners. */
function wireStockBurden(counterEl, index, actor, isOwner) {
  const nameInput = counterEl.querySelector(".lmnr-burden-name");
  if (nameInput) {
    if (!isOwner) nameInput.disabled = true;
    else nameInput.addEventListener("change", () => setBurden(actor, index, { name: nameInput.value }));
  }
  if (!isOwner) return;

  for (const hex of counterEl.querySelectorAll(PILOT_BURDENS.STOCK.HEX)) {
    hex.addEventListener("click", ev => {
      ev.stopPropagation();
      adjustBurden(actor, index, hex.dataset.available === "true" ? -1 : 1);
    });
  }
  const minus = counterEl.querySelector(PILOT_BURDENS.STOCK.MINUS_BUTTON);
  if (minus) minus.addEventListener("click", ev => { ev.stopPropagation(); adjustBurden(actor, index, -1); });
  const plus = counterEl.querySelector(PILOT_BURDENS.STOCK.PLUS_BUTTON);
  if (plus) plus.addEventListener("click", ev => { ev.stopPropagation(); adjustBurden(actor, index, +1); });
}

// --- Alt sheet --------------------------------------------------------------------------------

/**
 * Alt sheet: prepend a Burdens section into the static `.la-SVELTE-BONDS` container, replicating the
 * native Clock/Burden DOM so it matches the Clocks section. Add/edit/delete controls omitted (fixed /
 * un-deletable); name is editable, collapse handled by our own header.
 */
function injectAltBurdens(bondsContainer, actor) {
  const isOwner = actor.isOwner;
  const state = getBurdenState(actor);
  const label = game.i18n.localize("LMNR.pilotBurdens.sectionLabel");

  const rows = state.map((t, i) => {
    const pips = Array.from({ length: t.max }, (_v, j) => {
      const filled = j < t.value;
      const icon = filled ? "mdi-hexagon-slice-6" : "mdi-hexagon-outline";
      return `<button type="button" data-pip="${j}" data-available="${filled}"${isOwner ? "" : " disabled"}`
        + ` class="la-counterbox__button mdi ${icon} la-prmy-header la-scdy-primary -fontsize7 counter-hex"></button>`;
    }).join("");
    return `
      <div class="la-flexcol -widthfull" data-lmnr-index="${i}">
        <div class="la-collapsegroup -widthfull collapse-group">
          <div class="la-summary la-flexrow la-dropshadow -justifybetween -widthfull -whitespacenowrap clipped-bot-alt -padding0-l -padding3-r la-text-header la-prmy-header -bol la-bckg-pilot">
            <div class="la-left la-flexrow -justifystart -aligncenter -gap1 -widthfull -overflowhidden">
              <i class="mdi mdi-weight -fontsize5 -padding0-lr"></i>
              <input type="text" class="lmnr-burden-name" value="${escapeAttr(t.name)}"${isOwner ? "" : " disabled"}
                style="flex:1;min-width:0;background:transparent;border:none;color:inherit;">
            </div>
          </div>
          <div class="-padding2-l">
            <div class="la-counterbox la-flexrow -aligncenter la-text-header -padding1-lr clipped-alt -widthfull la-bckg-header-anti">
              ${pips}
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  const section = document.createElement("div");
  section.className = `${PILOT_BURDENS.MARKER} la-collapsegroup -widthfull collapse-group`;
  section.innerHTML = `
    <span class="la-summary la-flexrow la-dropshadow -justifybetween -widthfull -whitespacenowrap la-text-header la-prmy-header clipped-top -padding0-tb -padding3-lr la-bckg-weapon collapse-trigger" data-lmnr-collapse>
      <div class="la-terminaltext -whitespacenowrap -textoverflowellipsis -textalignleft la-text-header -fontsize4 -overflowhidden"><span class="la-cmdline -bold -fadein">&gt;//: </span><span>${escapeAttr(label).toUpperCase()} </span><span class="la-extension -fontface-stylized -lower -fadein">--collapse</span><span class="la-cursor -fontface-stylized -fadein"></span></div>
    </span>
    <div class="la-collapsegroup__wrapper collapse-wrapper" data-lmnr-collapse-wrapper>
      <div class="la-collapsecontent -padding0-l -padding0-tb -bordersround-lb -widthfull -heightfull la-brdr-weapon">
        <div class="la-generated -widthfull -gap1 la-flexcol">${rows}</div>
      </div>
    </div>`;

  bondsContainer.insertBefore(section, bondsContainer.firstChild);

  wireAltBurdens(section, actor, isOwner);
}

/** Wire the injected alt burdens: collapse toggle for all; name/pip edits for owners only. */
function wireAltBurdens(section, actor, isOwner) {
  // Our own collapse toggle (the alt sheet's store doesn't know our injected node); flip the hover
  // extension text like the native header (`--collapse` open / `--expand` collapsed).
  const trigger = section.querySelector("[data-lmnr-collapse]");
  const wrapper = section.querySelector("[data-lmnr-collapse-wrapper]");
  if (trigger && wrapper) {
    const extension = trigger.querySelector(".la-extension");
    trigger.addEventListener("click", () => {
      const collapsed = wrapper.classList.toggle("collapsed");
      if (extension) extension.textContent = collapsed ? "--expand" : "--collapse";
    });
  }

  if (!isOwner) return;
  for (const row of section.querySelectorAll("[data-lmnr-index]")) {
    const index = Number(row.dataset.lmnrIndex);
    const nameInput = row.querySelector(".lmnr-burden-name");
    if (nameInput) nameInput.addEventListener("change", () => setBurden(actor, index, { name: nameInput.value }));
    for (const pip of row.querySelectorAll(".counter-hex")) {
      pip.addEventListener("click", ev => {
        ev.stopPropagation();
        adjustBurden(actor, index, pip.dataset.available === "true" ? -1 : 1);
      });
    }
  }
}
