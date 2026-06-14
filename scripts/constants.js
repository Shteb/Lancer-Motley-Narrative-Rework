/**
 * Module-wide constants for the LANCER Motley Narrative Rules module.
 * House-rule behaviour is implemented in scripts/skill-check.js.
 */

/** The module id - must match `id` in module.json. */
export const MODULE_ID = "lancer-motley-narrative-rules";

/** Console log prefix for this module. */
export const LOG_PREFIX = "Lancer Motley | ";

/** World-setting keys. */
export const SETTINGS = {
  /** boolean: when true, skill triggers use the d6 dice pool; when false, stock 1d20+rank*2. */
  SKILL_DICE_POOL: "skillDicePool",
};

/** House-rule constants. */
export const HOUSE_RULES = {
  /** Everyone rolls at least this many d6 before rank/accuracy/difficulty. */
  BASE_DICE: 1,
  /** A die at or above this value is a success on a normal check. */
  THRESHOLD_NORMAL: 4,
  /** On a Hard check, only this value (a 6) succeeds. */
  THRESHOLD_HARD: 6,
  /** When the net pool clamps to zero, roll this many dice and require ALL to pass. */
  NET_ZERO_DICE: 2,
};

/** LANCER system integration points we override. Symbol names may drift between versions. */
export const LANCER_INTEGRATION = {
  /** Hook fired by the system during init: callAll("lancer.registerFlows", flowSteps, flows). */
  REGISTER_FLOWS_HOOK: "lancer.registerFlows",
  /** The flow-step keys (in game.lancer.flowSteps) used by the skill-trigger (StatRoll) flow. */
  STEPS: {
    SHOW_HUD: "showStatRollHUD",
    ROLL_CHECK: "rollCheck",
    PRINT_CARD: "printStatRollCard",
  },
};

/**
 * Alternative Sheets (`lancer-alternative-sheets`) compatibility - display + "Other skill" button.
 * Re-verify these selectors when that module updates.
 */
export const ALT_SHEET = {
  MODULE_ID: "lancer-alternative-sheets",
  /** Custom flow class the alt sheet registers in `game.lancer.flows` for its "Other skill" button. */
  OTHER_FLOW: "SkillTriggerOther",
  /** Skill-rank display surfaces. */
  SELECTORS: {
    /** Abilities-tab skill row (`data-uuid` is the skill); bonus `<span>` in the right options. */
    ABILITIES_ROW: ".la-collapsegroup[data-uuid]",
    ABILITIES_BONUS: ".la-summary > .la-right > span",
    /** Sidebar macro-box skill row; its skill-flow button (`data-uuid`) and rank readout box. */
    MACRO_ROW: ".la-skilltrigger",
    MACRO_BUTTON: "button.skill-flow[data-uuid]",
    MACRO_BONUS: ".la-skilltrigger__inner",
  },
};

/**
 * Lancer Automation (`lancer-automations`) Token Action HUD compatibility - badge display + "Other
 * Skill" roll. Re-verify these strings when that module updates.
 */
export const AUTOMATION = {
  MODULE_ID: "lancer-automations",
  /** Sentinel path the "Other Skill" button rolls; survives `initStatRollData`, so detectable in state. */
  OTHER_SKILL_PATH: "system.other_skill",
  /** Hook the HUD listens for to rebuild (fired on toggle so the display flips live). */
  REFRESH_HOOK: "forceUpdateTokenActionHud",
  /** English label of the skill-trigger sub-column whose badges we rewrite. */
  TRIGGERS_LABEL: "Triggers",
  /** TAH DOM handles for the badge rewrite (see scripts/tah-display.js). */
  HUD_ID: "la-hud",
  COL_LABEL: ".la-hud-col-label",
  BADGE: ".la-hud-badge",
};
