/**
 * Flow-step override for pilot skill triggers: replaces the `StatRollFlow` steps in `flowSteps` with
 * wrappers that handle skill rolls via the dice pool and delegate everything else (HASE/ENG burn) to
 * the original step. Overriding `flowSteps` re-routes every caller (sheets, alt sheets, chat drags).
 */

import { LANCER_INTEGRATION, ALT_SHEET, AUTOMATION, LOG_PREFIX } from "./constants.js";
import { isDicePoolEnabled } from "./settings.js";
import { resolveSkillCheck, promptSkillCheck, buildCardContent } from "./skill-check.js";

const STEPS = LANCER_INTEGRATION.STEPS;

/** State scratch-space key for passing our data between the HUD/roll/card steps. */
const SCRATCH = "lmnrSkillCheck";

/** Marker so we never double-wrap a step (idempotent install). */
const WRAP_MARK = "__lmnrWrapped";

/**
 * Dice-pool context for a StatRoll flow state, or null to leave the roll to the original step.
 * Claims a skill trigger (at `curr_rank`) and the Automation TAH "Other Skill" button (rank 0).
 *
 * @returns {{ rank: number, skillName: string } | null}
 */
function skillContext(state) {
  if (!isDicePoolEnabled()) return null;
  const item = state?.item;
  if (item && typeof item.is_skill === "function" && item.is_skill()) {
    return { rank: Number(item.system?.curr_rank) || 0, skillName: item.name ?? "" };
  }
  if (!item && state?.data?.path === AUTOMATION.OTHER_SKILL_PATH) {
    return { rank: 0, skillName: game.i18n.localize("LMNR.dialog.otherSkill") };
  }
  return null;
}

/**
 * Replace the StatRoll flow steps in the given `flowSteps` map with skill-aware wrappers.
 *
 * @param {Map<string, Function>} flowSteps  The system's step registry (from the hook or game.lancer).
 * @returns {boolean} true if all expected steps were found and wrapped (or already wrapped).
 */
export function installSkillFlowOverride(flowSteps) {
  if (!flowSteps || typeof flowSteps.get !== "function") return false;

  const required = [STEPS.SHOW_HUD, STEPS.ROLL_CHECK, STEPS.PRINT_CARD];
  const missing = required.filter(key => !flowSteps.get(key));
  if (missing.length) {
    console.error(`${LOG_PREFIX}Cannot install skill dice-pool override - missing flow steps: ${missing.join(", ")}.`);
    return false;
  }

  wrapStep(flowSteps, STEPS.SHOW_HUD, skillShowHUD);
  wrapStep(flowSteps, STEPS.ROLL_CHECK, skillRollCheck);
  wrapStep(flowSteps, STEPS.PRINT_CARD, skillPrintCard);

  console.log(`${LOG_PREFIX}Skill dice-pool flow override installed.`);
  return true;
}

/**
 * Wrap one flow step: when `skillContext(state)` claims the roll, run `skillStep`; otherwise call the
 * captured original. No-ops if the step is already our wrapper (idempotent).
 */
function wrapStep(flowSteps, key, skillStep) {
  const original = flowSteps.get(key);
  if (original?.[WRAP_MARK]) return; // already wrapped

  const wrapper = async (state, options) => {
    if (skillContext(state)) return skillStep(state, options);
    return original(state, options);
  };
  wrapper[WRAP_MARK] = true;
  flowSteps.set(key, wrapper);
}

// --- Alternative Sheets "Other skill" button (optional compatibility) --------------------------

/**
 * Re-route Alternative Sheets' "Other skill" button onto the dice pool (rank 0 -> +0d6) by replacing
 * its `SkillTriggerOther` entry in `game.lancer.flows`. Call on `ready`; no-ops when the alt sheet
 * (and thus the flow key) is absent.
 *
 * @param {Map<string, Function>} flows  `game.lancer.flows`.
 * @returns {boolean} true if installed (or already installed); false if not applicable.
 */
export function installOtherSkillFlowOverride(flows) {
  if (!flows || typeof flows.get !== "function") return false;

  const Original = flows.get(ALT_SHEET.OTHER_FLOW);
  if (!Original) return false;
  if (Original[WRAP_MARK]) return true;

  // The alt sheet only ever does `new Flow(uuid, data).begin()`, so a minimal drop-in suffices.
  const OtherSkillFlow = class {
    constructor(uuid, data) {
      this.uuid = uuid;
      this.data = data;
    }

    async begin() {
      if (!isDicePoolEnabled()) return new Original(this.uuid, this.data).begin();
      return runOtherSkillCheck(await resolveActor(this.uuid));
    }
  };
  OtherSkillFlow[WRAP_MARK] = true;

  flows.set(ALT_SHEET.OTHER_FLOW, OtherSkillFlow);
  console.log(`${LOG_PREFIX}Alternative Sheets "Other skill" override installed.`);
  return true;
}

/** Prompt + roll + post a rank-0 ("Other skill") dice-pool check. Returns false if cancelled. */
async function runOtherSkillCheck(actor) {
  const skillName = game.i18n.localize("LMNR.dialog.otherSkill");
  const input = await promptSkillCheck({ skillName, rank: 0 });
  if (!input) return false;
  await postSkillCard(actor, skillName, await resolveSkillCheck({ rank: 0, ...input }));
  return true;
}

/** Post the dice-pool chat card for a resolved check (Dice So Nice animates via `rolls`). */
async function postSkillCard(actor, skillName, result) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: buildCardContent({ skillName, ...result }),
    rolls: [result.roll],
  });
}

/** Resolve a flow uuid (the alt sheet passes the pilot's) to its Actor for the chat speaker. */
async function resolveActor(uuid) {
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : doc?.actor ?? null;
  } catch (_e) {
    return null;
  }
}

// --- Skill-specific step implementations -------------------------------------------------------

/** HUD step: gather Accuracy/Difficulty/Hard. Returns false (aborts the flow) if cancelled. */
async function skillShowHUD(state) {
  const { rank, skillName } = skillContext(state);
  const input = await promptSkillCheck({ skillName, rank });
  if (!input) return false;

  state.data ??= {};
  state.data[SCRATCH] = { skillName, rank, ...input };
  return true;
}

/** Roll step: evaluate the dice pool and count successes. */
async function skillRollCheck(state) {
  const scratch = state.data?.[SCRATCH];
  if (!scratch) return false; // HUD must have run; abort rather than fall back to 1d20
  const { rank, accuracy, difficulty, hard } = scratch;
  state.data[SCRATCH].result = await resolveSkillCheck({ rank, accuracy, difficulty, hard });
  return true;
}

/** Card step: post the dice-pool chat card. */
async function skillPrintCard(state) {
  const scratch = state.data?.[SCRATCH];
  if (!scratch?.result) return false;
  await postSkillCard(state.actor, scratch.skillName, scratch.result);
  return true;
}
