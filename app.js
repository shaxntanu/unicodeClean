const REMOVABLE = ["\u00ad", "\ufeff", "\u2060"];
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const CONTROLS = /[\x00-\x08\x0e-\x1f\x7f-\x84\x86-\x9f]/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const INLINE = /(?<!`)(?<ticks>`+)(?!`)[^\n]*?(?<!`)\k<ticks>(?!`)|https?:\/\/[^\s<>]+|(?<![\p{L}\p{N}_])www\.[^\s<>]+/gu;
const SAMPLE = "The prototype—tested yesterday—worked.\n\nA single em dash—can change a sentence, so this one is flagged for review.\n\nTechnical notation: x², 10–20 V, −5 V.\nEmoji: 👩‍💻\n\n```python\nvalue = \"  keep  code  \"\n```\n\nA soft hyphen: co\u00adoperate. A link stays as written: https://example.com/a—b";

const input = document.querySelector("#input-text");
const output = document.querySelector("#output-text");
const inputCount = document.querySelector("#input-count");
const outputCount = document.querySelector("#output-count");
const outputState = document.querySelector("#output-state");
const reportCount = document.querySelector("#report-count");
const reportContent = document.querySelector("#report-content");
const copyButton = document.querySelector("#copy-button");
const rewriteList = document.querySelector("#rewrite-list");

function countOccurrences(value, token) {
  if (!token) return 0;
  return value.split(token).length - 1;
}

function splitLinesKeepEndings(value) {
  return (value.match(/.*?(?:\r\n?|\n|[\x0b\x0c\x85\u2028\u2029]|$)/gsu) || []).filter(Boolean);
}

function protectedBlocks(value) {
  const blocks = [];
  let pending = [];
  let fence = null;

  for (const line of splitLinesKeepEndings(value)) {
    const match = FENCE.exec(line.replace(/[\r\n]+$/u, ""));

    if (fence !== null) {
      blocks.push([line, true]);
      if (match && match[1][0] === fence[0] && match[1].length >= fence[1] && !match[2].trim()) {
        fence = null;
      }
    } else if (match) {
      if (pending.length) blocks.push([pending.join(""), false]);
      pending = [];
      fence = [match[1][0], match[1].length];
      blocks.push([line, true]);
    } else if (/^( {4}|\t)/u.test(line)) {
      if (pending.length) blocks.push([pending.join(""), false]);
      pending = [];
      blocks.push([line, true]);
    } else {
      pending.push(line);
    }
  }

  if (pending.length) blocks.push([pending.join(""), false]);
  return blocks;
}

function makeCounter() {
  const counts = Object.create(null);
  return {
    counts,
    add(key, amount = 1) {
      if (amount) counts[key] = (counts[key] || 0) + amount;
    },
  };
}

function validateOptions(options) {
  if (!["NFC", "NFKC", "none"].includes(options.normalization)) {
    throw new Error("Choose NFC, NFKC, or no Unicode normalization.");
  }
  if (!["asides", "keep"].includes(options.emDashes)) {
    throw new Error("Choose whether paired em dashes are converted or kept.");
  }
  if (!["remove", "space", "keep"].includes(options.zeroWidthSpaces)) {
    throw new Error("Choose whether zero-width spaces are removed, replaced, or kept.");
  }
  for (const [before, after] of options.rewrites) {
    if (typeof before !== "string" || before.length === 0 || typeof after !== "string") {
      throw new Error("Each replacement needs a non-empty Find value and a Replace with value.");
    }
  }
}

function fixDashes(value, emDashes, counter, review) {
  const pieces = value.split(/([.!?\n])/u);

  for (let index = 0; index < pieces.length; index += 2) {
    const part = pieces[index];

    if (emDashes === "asides" && countOccurrences(part, "—") === 2) {
      const sections = part.split("—");
      const left = sections[0].trim();
      const aside = sections[1].trim();
      const right = sections[2].trim();
      const words = aside.match(/[\p{L}]+/gu) || [];
      const leftChars = Array.from(left);
      const rightChars = Array.from(right);

      if (
        left && right && words.length >= 2 &&
        /[\p{L}\p{N}]/u.test(leftChars[leftChars.length - 1]) &&
        /\p{L}/u.test(rightChars[0])
      ) {
        const leading = (part.match(/^\s*/u) || [""])[0];
        const trailing = (part.match(/\s*$/u) || [""])[0];
        const replacement = `${left} (${aside}) ${right}`;
        pieces[index] = `${leading}${replacement}${trailing}`;
        counter.add("paired_asides_converted");
        review.push(`Check inferred aside: ${JSON.stringify(part.trim())} -> ${JSON.stringify(replacement)}`);
        continue;
      }
    }

    if (part.includes("—")) {
      review.push(`Em dash retained; choose an explicit rewrite: ${JSON.stringify(part.trim())}`);
    }
  }

  return pieces.join("");
}

function sanitizeText(text, options) {
  if (typeof text !== "string") throw new Error("Text input must be a string.");
  validateOptions(options);

  const counter = makeCounter();
  const review = [];

  function cleanProse(inputText) {
    let value = inputText;

    for (const [before, after] of options.rewrites) {
      const count = countOccurrences(value, before);
      if (count) {
        value = value.split(before).join(after);
        counter.add("explicit_rewrites", count);
      }
    }

    const lineEndings = value.match(/\r\n?|[\x85\u2028\x0b]/gu) || [];
    if (lineEndings.length) {
      value = value.replace(/\r\n?|[\x85\u2028\x0b]/gu, "\n");
      counter.add("line_endings_normalized", lineEndings.length);
    }

    const paragraphSeparators = value.match(/[\u2029\x0c]/gu) || [];
    if (paragraphSeparators.length) {
      value = value.replace(/[\u2029\x0c]/gu, "\n\n");
      counter.add("paragraph_separators_normalized", paragraphSeparators.length);
    }

    for (const character of REMOVABLE) {
      const count = countOccurrences(value, character);
      if (count) {
        value = value.split(character).join("");
        counter.add(`removed_U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`, count);
      }
    }

    const zeroWidthCount = countOccurrences(value, "\u200b");
    if (zeroWidthCount && options.zeroWidthSpaces !== "keep") {
      value = value.split("\u200b").join(options.zeroWidthSpaces === "space" ? " " : "");
      counter.add("zero_width_spaces_changed", zeroWidthCount);
      review.push("Check word boundaries where zero-width spaces changed.");
    }

    const bidiMatches = value.match(BIDI) || [];
    if (bidiMatches.length) {
      if (options.removeBidi) {
        value = value.replace(BIDI, "");
        counter.add("directional_controls_removed", bidiMatches.length);
        review.push("Check the reading order of mixed-direction text.");
      } else {
        review.push("Directional controls preserved; they can be meaningful.");
      }
    }

    const controlMatches = value.match(CONTROLS) || [];
    if (controlMatches.length) {
      value = value.replace(CONTROLS, "");
      counter.add("control_characters_removed", controlMatches.length);
      review.push("Check text around removed control characters.");
    }

    if (options.normalization !== "none") {
      const normalized = value.normalize(options.normalization);
      if (normalized !== value) {
        counter.add("unicode_spans_normalized");
        if (options.normalization === "NFKC") {
          review.push("NFKC used: check superscripts, units, and mathematical symbols.");
        }
      }
      value = normalized;
    }

    let normalizedSpaces = "";
    let spacesChanged = 0;
    for (const character of value) {
      if (character !== " " && /\p{Zs}/u.test(character)) {
        normalizedSpaces += " ";
        spacesChanged += 1;
      } else {
        normalizedSpaces += character;
      }
    }
    value = normalizedSpaces;
    counter.add("unicode_spaces_normalized", spacesChanged);

    const interiorRuns = value.match(/(?<=\S)(?:[ \t]{2,}|\t)(?=\S)/gu) || [];
    if (interiorRuns.length) {
      value = value.replace(/(?<=\S)(?:[ \t]{2,}|\t)(?=\S)/gu, " ");
      counter.add("interior_whitespace_runs_collapsed", interiorRuns.length);
    }

    const blankLineGroups = value.match(/\n(?:[ \t]*\n){2,}/gu) || [];
    if (blankLineGroups.length) {
      value = value.replace(/\n(?:[ \t]*\n){2,}/gu, "\n\n");
      counter.add("excess_blank_line_groups_collapsed", blankLineGroups.length);
    }

    return fixDashes(value, options.emDashes, counter, review);
  }

  const outputParts = [];
  for (const [block, protectedBlock] of protectedBlocks(text)) {
    if (protectedBlock) {
      outputParts.push(block);
      continue;
    }

    let cursor = 0;
    for (const match of block.matchAll(INLINE)) {
      outputParts.push(cleanProse(block.slice(cursor, match.index)));
      outputParts.push(match[0]);
      cursor = match.index + match[0].length;
    }
    outputParts.push(cleanProse(block.slice(cursor)));
  }

  return {
    text: outputParts.join(""),
    changes: counter.counts,
    review: [...new Set(review)],
  };
}

function getOptions() {
  const rewrites = [];
  for (const row of rewriteList.querySelectorAll(".rewrite-row")) {
    const before = row.querySelector("[data-rewrite-before]").value;
    const after = row.querySelector("[data-rewrite-after]").value;
    if (!before && !after) continue;
    rewrites.push([before, after]);
  }

  return {
    normalization: document.querySelector("#normalization").value,
    emDashes: document.querySelector("#em-dashes").value,
    zeroWidthSpaces: document.querySelector("#zero-width").value,
    removeBidi: document.querySelector("#remove-bidi").checked,
    rewrites,
  };
}

function characterCount(value) {
  const amount = Array.from(value).length;
  return `${amount.toLocaleString()} ${amount === 1 ? "character" : "characters"}`;
}

function updateInputCount() {
  inputCount.textContent = characterCount(input.value);
}

function appendReportLine(list, label, value) {
  const item = document.createElement("li");
  item.className = "change-item";
  const name = document.createElement("span");
  name.textContent = label;
  const count = document.createElement("strong");
  count.textContent = value.toLocaleString();
  item.append(name, count);
  list.append(item);
}

const CHANGE_LABELS = {
  explicit_rewrites: "Exact replacements",
  line_endings_normalized: "Line endings normalized",
  paragraph_separators_normalized: "Paragraph separators normalized",
  "removed_U+00AD": "Soft hyphens removed",
  "removed_U+FEFF": "Byte-order marks removed",
  "removed_U+2060": "Word joiners removed",
  zero_width_spaces_changed: "Zero-width spaces changed",
  directional_controls_removed: "Direction controls removed",
  control_characters_removed: "Control characters removed",
  unicode_spans_normalized: "Unicode spans normalized",
  unicode_spaces_normalized: "Unicode spaces normalized",
  interior_whitespace_runs_collapsed: "Interior whitespace runs collapsed",
  excess_blank_line_groups_collapsed: "Excess blank-line groups collapsed",
  paired_asides_converted: "Paired asides converted",
};

function renderReport(result) {
  const entries = Object.entries(result.changes);
  const totalChanges = entries.reduce((sum, [, count]) => sum + count, 0);
  reportCount.textContent = totalChanges ? totalChanges.toLocaleString() : "0";
  reportContent.replaceChildren();
  reportContent.classList.add("has-report");

  const summary = document.createElement("p");
  summary.className = "report-summary";
  summary.textContent = totalChanges
    ? `${totalChanges.toLocaleString()} change${totalChanges === 1 ? "" : "s"} recorded. Protected code and URL spans were copied through unchanged.`
    : "No cleanup changes were needed. Protected code and URL spans were copied through unchanged.";
  reportContent.append(summary);

  if (entries.length) {
    const list = document.createElement("ul");
    list.className = "change-list";
    for (const [key, count] of entries) {
      const label = CHANGE_LABELS[key] || key.replaceAll("_", " ");
      appendReportLine(list, label, count);
    }
    reportContent.append(list);
  }

  if (result.review.length) {
    const box = document.createElement("div");
    box.className = "review-box";
    const heading = document.createElement("h3");
    heading.className = "report-subhead";
    heading.textContent = `Review ${result.review.length === 1 ? "note" : "notes"}`;
    const list = document.createElement("ul");
    list.className = "review-list";
    for (const note of result.review) {
      const item = document.createElement("li");
      item.className = "review-item";
      item.textContent = note;
      list.append(item);
    }
    box.append(heading, list);
    reportContent.append(box);
  } else {
    const ok = document.createElement("div");
    ok.className = "clean-box";
    ok.textContent = "No meaning-sensitive cleanup was flagged for review.";
    reportContent.append(ok);
  }
}

function runCleanup() {
  outputState.classList.remove("error-state");
  try {
    const result = sanitizeText(input.value, getOptions());
    output.value = result.text;
    outputCount.textContent = characterCount(result.text);
    outputState.textContent = result.review.length
      ? `${result.review.length} review ${result.review.length === 1 ? "note" : "notes"} to check.`
      : "Cleanup complete. Review the summary below.";
    renderReport(result);
    copyButton.disabled = result.text.length === 0;
  } catch (error) {
    outputState.textContent = error.message;
    outputState.classList.add("error-state");
  }
}

function addRewriteRow() {
  const row = document.createElement("div");
  row.className = "rewrite-row";
  const before = document.createElement("input");
  before.type = "text";
  before.placeholder = "Find exact text";
  before.setAttribute("aria-label", "Find exact text");
  before.dataset.rewriteBefore = "";
  const after = document.createElement("input");
  after.type = "text";
  after.placeholder = "Replace with";
  after.setAttribute("aria-label", "Replace with");
  after.dataset.rewriteAfter = "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-rewrite";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove this replacement");
  remove.addEventListener("click", () => row.remove());
  row.append(before, after, remove);
  rewriteList.append(row);
  before.focus();
}

input.addEventListener("input", updateInputCount);
document.querySelector("#clean-button").addEventListener("click", runCleanup);
document.querySelector("#sample-button").addEventListener("click", () => {
  input.value = SAMPLE;
  updateInputCount();
  input.focus();
});
document.querySelector("#clear-button").addEventListener("click", () => {
  input.value = "";
  output.value = "";
  inputCount.textContent = "0 characters";
  outputCount.textContent = "Waiting for text";
  outputState.textContent = "Ready when you are.";
  outputState.classList.remove("error-state");
  reportCount.textContent = "—";
  reportContent.classList.remove("has-report");
  reportContent.replaceChildren();
  copyButton.disabled = true;
  input.focus();
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyButton.textContent = "Copied";
    window.setTimeout(() => { copyButton.textContent = "Copy"; }, 1300);
  } catch {
    output.focus();
    output.select();
    outputState.textContent = "Clipboard access was unavailable. Select and copy the result instead.";
  }
});
document.querySelector("#add-rewrite").addEventListener("click", addRewriteRow);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runCleanup();
});

updateInputCount();
