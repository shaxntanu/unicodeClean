const SAMPLE = "The prototype—tested yesterday—worked.\n\nA single em dash—can change a sentence, so this one is flagged for review.\n\nTechnical notation: x², 10–20 V, −5 V.\nEmoji: 👩‍💻\n\n```python\nvalue = \"  keep  code  \"\n```\n\nA soft hyphen: co\u00adoperate. A link stays as written: https://example.com/a—b";

const input = document.querySelector("#input-text");
const output = document.querySelector("#output-text");
const inputCount = document.querySelector("#input-count");
const outputCount = document.querySelector("#output-count");
const outputState = document.querySelector("#output-state");
const reportCount = document.querySelector("#report-count");
const reportContent = document.querySelector("#report-content");
const cleanButton = document.querySelector("#clean-button");
const copyButton = document.querySelector("#copy-button");
const rewriteList = document.querySelector("#rewrite-list");

let pythonWorker = null;
let activeRun = 0;

function getOptions() {
  const rewrites = {};
  for (const row of rewriteList.querySelectorAll(".rewrite-row")) {
    const before = row.querySelector("[data-rewrite-before]").value;
    const after = row.querySelector("[data-rewrite-after]").value;
    if (!before && !after) continue;
    if (!before || !after) {
      throw new Error("Complete both fields for each exact replacement.");
    }
    if (Object.hasOwn(rewrites, before)) {
      throw new Error("Each exact Find value must be unique.");
    }
    rewrites[before] = after;
  }

  return {
    normalization: document.querySelector("#normalization").value,
    em_dashes: document.querySelector("#em-dashes").value,
    zero_width_spaces: document.querySelector("#zero-width").value,
    remove_bidi: document.querySelector("#remove-bidi").checked,
    rewrites,
  };
}

function getPythonWorker() {
  if (!pythonWorker) {
    pythonWorker = new Worker("/python-worker.js", { type: "module" });
  }
  return pythonWorker;
}

function cleanWithLocalPython(text, options, onStatus) {
  return new Promise((resolve, reject) => {
    const worker = getPythonWorker();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    function removeListeners() {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    }

    function handleMessage(event) {
      if (event.data?.id !== requestId) return;
      if (event.data.type === "status") {
        onStatus(event.data.message);
        return;
      }

      removeListeners();
      if (event.data.type === "result") resolve(event.data.result);
      else reject(new Error(event.data.message || "Python cleanup failed."));
    }

    function handleError(event) {
      removeListeners();
      pythonWorker = null;
      reject(new Error(event.message || "Could not start the browser Python worker."));
    }

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ id: requestId, text, options });
  });
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

async function runCleanup() {
  const runId = ++activeRun;
  cleanButton.disabled = true;
  outputState.classList.remove("error-state");
  outputState.textContent = "Starting Python in your browser…";

  try {
    const result = await cleanWithLocalPython(input.value, getOptions(), (message) => {
      if (runId === activeRun) outputState.textContent = message;
    });
    if (runId !== activeRun) return;

    output.value = result.text;
    outputCount.textContent = characterCount(result.text);
    outputState.textContent = result.review.length
      ? `${result.review.length} review ${result.review.length === 1 ? "note" : "notes"} to check.`
      : "Cleanup complete. Review the summary below.";
    renderReport(result);
    copyButton.disabled = result.text.length === 0;
  } catch (error) {
    if (runId !== activeRun) return;
    outputState.textContent = error.message;
    outputState.classList.add("error-state");
  } finally {
    if (runId === activeRun) cleanButton.disabled = false;
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
cleanButton.addEventListener("click", runCleanup);
document.querySelector("#sample-button").addEventListener("click", () => {
  input.value = SAMPLE;
  updateInputCount();
  input.focus();
});
document.querySelector("#clear-button").addEventListener("click", () => {
  activeRun += 1;
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
  cleanButton.disabled = false;
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
document.querySelectorAll(".install-copy").forEach((button) => {
  button.addEventListener("click", async () => {
    const originalLabel = button.textContent;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy unavailable — select command above";
    }
    window.setTimeout(() => { button.textContent = originalLabel; }, 1800);
  });
});
document.querySelector("#add-rewrite").addEventListener("click", addRewriteRow);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runCleanup();
});

updateInputCount();
