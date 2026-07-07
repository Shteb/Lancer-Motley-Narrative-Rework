/**
 * LANCER Motley Narrative Rules - entry point. Wires the d6 dice-pool skill override and the
 * `+{rank}d6` display. The flow override installs from the `lancer.registerFlows` hook, with a
 * `ready` fallback against `game.lancer.flowSteps` (else fails loudly).
 */

import { MODULE_ID, LOG_PREFIX, LANCER_INTEGRATION } from "./constants.js";
import { registerSettings } from "./settings.js";
import { installSkillFlowOverride, installOtherSkillFlowOverride } from "./skill-flow.js";
import { registerDisplayHooks } from "./skill-display.js";
import { registerPilotStressHooks } from "./pilot-stress.js";
import { registerPilotBurdensHooks } from "./pilot-burdens.js";
import { registerTahDisplay } from "./tah-display.js";

/** Tracks whether the flow override has been installed, so the ready-fallback doesn't double up. */
let flowOverrideInstalled = false;

// --- Top-level: catch the system's flow-registration hook -------------------------------------
// Registered at import time so it precedes the system's init (which fires the hook).
Hooks.on(LANCER_INTEGRATION.REGISTER_FLOWS_HOOK, (flowSteps /*, flows */) => {
  flowOverrideInstalled = installSkillFlowOverride(flowSteps) || flowOverrideInstalled;
});

Hooks.once("init", () => {
  console.log(`${LOG_PREFIX}Initialising ${MODULE_ID}.`);
  registerSettings();
  registerDisplayHooks();
  registerPilotStressHooks();
  registerPilotBurdensHooks();
});

Hooks.once("ready", () => {
  // Confirm the system is present and the override took. If the registerFlows hook never reached us
  // (version drift), retry directly against the live registry; otherwise fail loudly.
  if (game.system?.id !== "lancer") {
    console.warn(`${LOG_PREFIX}Active system is "${game.system?.id}", not "lancer" - skill override inactive.`);
    return;
  }

  if (!flowOverrideInstalled) {
    flowOverrideInstalled = installSkillFlowOverride(game.lancer?.flowSteps);
  }

  if (!flowOverrideInstalled) {
    const msg = `${MODULE_ID}: could not install the skill dice-pool override (lancer flow steps not found). `
      + `The system's skill-flow integration may have changed.`;
    console.error(`${LOG_PREFIX}${msg}`, { lancer: game.lancer });
    ui.notifications?.error(msg, { permanent: true });
  } else {
    console.log(`${LOG_PREFIX}Ready - skill dice-pool override active.`);
  }

  // Optional compatibility (no-ops when the relevant module is inactive): Alternative Sheets'
  // "Other skill" button and the Lancer Automation Token Action HUD badge display.
  installOtherSkillFlowOverride(game.lancer?.flows);
  registerTahDisplay();
});
