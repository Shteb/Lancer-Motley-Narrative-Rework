/**
 * Dice-pool skill-check resolution - the behavioural core of the module and the canonical
 * implementation of the house rules (pool maths, success counting and chat-card information).
 * The chat card uses inline styles so persisted messages still render correctly if the module
 * is later disabled.
 */

import { HOUSE_RULES } from "./constants.js";

/** The currently-open skill-check dialog instance, so a new prompt can replace any open one. */
let activeDialog = null;

/** Minimal HTML escape for interpolating (world-authored) skill names into card/dialog markup. */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/**
 * Net dice pool for a skill check: `max(0, BASE + rank + accuracy - difficulty)`.
 * @returns {{ poolDice: number, netZero: boolean }} `netZero` true when the clamp produced zero.
 */
export function computePoolSize(rank, accuracy, difficulty) {
  const bonus = HOUSE_RULES.BASE_DICE + (Number(rank) || 0);
  const net = bonus + (Number(accuracy) || 0) - (Number(difficulty) || 0);
  const poolDice = Math.max(0, net);
  return { poolDice, netZero: poolDice === 0 };
}

/**
 * Roll and resolve a skill check: evaluate the pool and count d6 faces >= threshold
 * (threshold 6 when Hard; net-zero rolls 2d6 and needs ALL to pass).
 * @returns {Promise<{ roll, faces, successes, totalDice, threshold, hard, netZero }>}
 */
export async function resolveSkillCheck({ rank, accuracy, difficulty, hard }) {
  const { poolDice, netZero } = computePoolSize(rank, accuracy, difficulty);
  const threshold = hard ? HOUSE_RULES.THRESHOLD_HARD : HOUSE_RULES.THRESHOLD_NORMAL;

  // Net-zero rule: roll 2d6 and succeed only if ALL dice meet the threshold ("take the worse").
  const diceToRoll = netZero ? HOUSE_RULES.NET_ZERO_DICE : poolDice;

  const roll = await new Roll(`${diceToRoll}d6`).evaluate();
  const faces = roll.dice[0].results.map(r => r.result);

  const successes = netZero
    ? (faces.every(r => r >= threshold) ? 1 : 0)
    : faces.filter(r => r >= threshold).length;

  return { roll, faces, successes, totalDice: poolDice, threshold, hard: Boolean(hard), netZero };
}

/**
 * Show the Accuracy/Difficulty/Hard prompt for a skill trigger: name, A/D steppers, Hard
 * toggle, live "Total: Nd6" readout, styled with the LANCER system's own classes.
 * @returns {Promise<{ accuracy, difficulty, hard } | null>} input, or null if cancelled/closed.
 */
export async function promptSkillCheck({ skillName, rank }) {
  // Only one skill-check dialog at a time: close any still-open one from a previous invocation.
  // (The closed dialog's prompt resolves to null, so its flow aborts cleanly.)
  if (activeDialog?.element?.isConnected) {
    try { await activeDialog.close(); } catch (_e) { /* already closing */ }
  }

  const L = key => game.i18n.localize(key);
  const basePool = HOUSE_RULES.BASE_DICE + (Number(rank) || 0);
  const rankLabel = `+${Number(rank) || 0}d6`;

  // Use the LANCER system's `.lancer` / `.lancer-hud` classes so the dialog inherits the active
  // theme; layout via inline styles so it never depends on this module's stylesheet.
  const stepper = (which, label) => `
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
      <strong>${label}</strong>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="lancer-button" type="button" data-step="${which}" data-delta="-1"
                style="display:flex; align-items:center; justify-content:center; width:2.2em; height:1.9em;">
          <i class="fas fa-minus"></i>
        </button>
        <span data-display="${which}" style="min-width:1.5em; text-align:center; font-weight:bold; font-size:1.3em;">0</span>
        <button class="lancer-button" type="button" data-step="${which}" data-delta="1"
                style="display:flex; align-items:center; justify-content:center; width:2.2em; height:1.9em;">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <input type="hidden" name="${which}" value="0">
    </div>
  `;

  const content = `
    <div class="lancer lancer-hud" style="display:flex; flex-direction:column; gap:10px; padding:6px 4px;">
      <div style="text-align:center; font-size:1.38em; font-weight:bold;">
        <i class="fas fa-dice-d20"></i> ${escapeHtml(skillName)}
        <span style="opacity:0.75;">${rankLabel}</span>
      </div>
      <hr style="border:none; border-top:1px solid var(--primary-color, #666); width:100%; margin:0;">
      <div style="display:flex; justify-content:space-between; gap:16px;">
        ${stepper("accuracy", L("LMNR.dialog.accuracy"))}
        ${stepper("difficulty", L("LMNR.dialog.difficulty"))}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
        <label class="container" style="flex:1; display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" name="hard">
          <span style="text-wrap:nowrap;">${L("LMNR.dialog.hard")}</span>
        </label>
        <div style="flex:1; text-align:center;">
          ${L("LMNR.dialog.total")} <b><span data-readout="total" style="font-size:1.3em;">${basePool}d6</span></b>
        </div>
      </div>
    </div>
  `;

  // DialogV2.wait resolves with the value the chosen button's callback returns, or `false`/`null` if
  // the dialog is dismissed (rejectClose:false). We return the gathered input from the Confirm button.
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${L("LMNR.dialog.windowTitle")} - ${skillName}` },
    classes: ["lancer"],
    position: { width: 400 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "confirm",
        label: L("LMNR.dialog.confirm"),
        default: true,
        callback: (_event, _button, dialog) => readInputs(dialog.element),
      },
      {
        action: "cancel",
        label: L("LMNR.dialog.cancel"),
      },
    ],
    render: (_event, dialog) => {
      activeDialog = dialog;
      attachDialogListeners(dialog.element, Number(rank) || 0);
    },
  });

  // `confirm` returns the input object; `cancel`/dismiss return the action string or false.
  return result && typeof result === "object" ? result : null;
}

/** Read the Accuracy/Difficulty/Hard values out of the dialog form. */
function readInputs(root) {
  return {
    accuracy: parseInt(root.querySelector("[name=accuracy]").value) || 0,
    difficulty: parseInt(root.querySelector("[name=difficulty]").value) || 0,
    hard: root.querySelector("[name=hard]").checked,
  };
}

/** Wire the stepper buttons and live pool-size readout inside the dialog. */
function attachDialogListeners(root, rank) {
  const totalSpan = root.querySelector('[data-readout="total"]');

  const updateTotal = () => {
    const accuracy = parseInt(root.querySelector("[name=accuracy]")?.value) || 0;
    const difficulty = parseInt(root.querySelector("[name=difficulty]")?.value) || 0;
    const { poolDice, netZero } = computePoolSize(rank, accuracy, difficulty);
    // Show the literal dice rolled: a net-zero pool rolls 2d6 keeping the lowest ("take the worse").
    if (totalSpan) totalSpan.textContent = netZero ? `${HOUSE_RULES.NET_ZERO_DICE}d6kl` : `${poolDice}d6`;
  };

  root.querySelectorAll("[data-step]").forEach(btn => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.step;
      const delta = parseInt(btn.dataset.delta) || 0;
      const input = root.querySelector(`[name=${which}]`);
      const display = root.querySelector(`[data-display="${which}"]`);
      const val = Math.max(0, (parseInt(input.value) || 0) + delta);
      input.value = String(val);
      if (display) display.textContent = String(val);
      updateTotal();
    });
  });

  root.querySelector("[name=hard]")?.addEventListener("change", updateTotal);
  updateTotal();
}

/**
 * Chat-card HTML for a resolved check. Inline-styled so it survives the module being disabled;
 * colours each die by success. `totalDice` is the net pool before the net-zero substitution.
 * @returns {string} HTML content for the ChatMessage.
 */
export function buildCardContent({ skillName, faces, successes, totalDice, threshold, hard, netZero }) {
  const L = key => game.i18n.localize(key);
  const F = (key, data) => game.i18n.format(key, data);

  const diceHTML = faces.map(r => {
    const success = r >= threshold;
    const bg = success ? "#2a6a2a" : "#6a2a2a";
    const border = success ? "#4caf50" : "#f44336";
    return `<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background:${bg};border:2px solid ${border};border-radius:4px;margin:2px;font-weight:bold;font-size:15px;color:white;">${r}</span>`;
  }).join("");

  const dicePhrase = netZero
    ? F("LMNR.card.netZeroDice", { n: faces.length })
    : `${totalDice}d6`;

  return `
    <div class="lmnr-skill-card" style="font-size:14px; line-height:1.6;">
      <div style="font-size:20px; font-weight:bold; margin-bottom:2px;">${L("LMNR.card.heading")}</div>
      <div style="font-size:16px; font-weight:bold; margin-bottom:4px;">${F("LMNR.card.used", { name: escapeHtml(skillName) })}</div>
      <div><b>${L("LMNR.card.diceRolled")}:</b> ${dicePhrase}</div>
      <div><b>${L("LMNR.card.hard")}:</b> ${hard ? L("LMNR.card.yes") : L("LMNR.card.no")}</div>
      <hr style="margin:4px 0;">
      <div style="margin:4px 0;">${diceHTML}</div>
      <hr style="margin:4px 0;">
      <div style="font-size:15px;"><b>${F("LMNR.card.successes", { n: successes })}</b></div>
    </div>
  `;
}
