/**
 * World settings. A single toggle: skill triggers resolve as the d6 dice pool (default ON)
 * or the stock `1d20 + rank*2`. Read live at click/render time, so flipping it applies immediately.
 */

import { MODULE_ID, SETTINGS, AUTOMATION } from "./constants.js";

/** Register module settings. Call from the `init` hook. */
export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.SKILL_DICE_POOL, {
    name: "LMNR.settings.skillDicePool.name",
    hint: "LMNR.settings.skillDicePool.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: () => {
      rerenderOpenSheets();
      // Refresh the Lancer Automation Token Action HUD (if open) so its skill badges / "Other Skill"
      // behaviour flip immediately. Harmless no-op when that module isn't installed.
      Hooks.callAll(AUTOMATION.REFRESH_HOOK);
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_PILOT_STRESS, {
    name: "LMNR.settings.showPilotStress.name",
    hint: "LMNR.settings.showPilotStress.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: () => rerenderOpenSheets(),
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_PILOT_BURDENS, {
    name: "LMNR.settings.showPilotBurdens.name",
    hint: "LMNR.settings.showPilotBurdens.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: () => rerenderOpenSheets(),
  });
}

/**
 * @returns {boolean} true when the dice-pool house rule is active. Defaults to true if the setting
 *   has not been registered yet (e.g. during very early system init, before our `init` ran).
 */
export function isDicePoolEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.SKILL_DICE_POOL) === true;
  } catch (_e) {
    // Setting not registered yet - assume the module's default (house rule on).
    return true;
  }
}

/**
 * @returns {boolean} true when Pilot Stress should be shown/editable even without a Bond. Defaults to
 *   true if the setting has not been registered yet (matches the module default).
 */
export function isPilotStressEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.SHOW_PILOT_STRESS) === true;
  } catch (_e) {
    return true;
  }
}

/**
 * @returns {boolean} true when the fixed Pilot Burden trackers should be shown/editable. Defaults to
 *   true if the setting has not been registered yet (matches the module default).
 */
export function isPilotBurdensEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.SHOW_PILOT_BURDENS) === true;
  } catch (_e) {
    return true;
  }
}

/** Re-render any open actor/item sheets so the rank display flips immediately when toggled. */
function rerenderOpenSheets() {
  for (const app of Object.values(ui.windows ?? {})) {
    const doc = app?.document ?? app?.object;
    if (doc && (doc.documentName === "Actor" || doc.documentName === "Item")) {
      app.render(false);
    }
  }
}
