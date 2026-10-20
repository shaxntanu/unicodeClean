import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
let pyodidePromise;

async function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX });
      const response = await fetch("/text_sanitizer.py", { cache: "no-cache" });
      if (!response.ok) {
        throw new Error("Could not load the bundled Python sanitizer.");
      }

      pyodide.globals.set("_unicode_clean_source", await response.text());
      pyodide.runPython(`
import types as _types
_unicode_clean_module = _types.ModuleType("text_sanitizer")
exec(compile(_unicode_clean_source, "text_sanitizer.py", "exec"), _unicode_clean_module.__dict__)
`);
      return pyodide;
    })();
  }

  try {
    return await pyodidePromise;
  } catch (error) {
    pyodidePromise = null;
    throw error;
  }
}

self.addEventListener("message", async (event) => {
  const { id, text, options } = event.data || {};
  let pyodide = null;
  self.postMessage({
    id,
    type: "status",
    message: "Loading the Python runtime in this browser (first use may take a moment)…",
  });

  try {
    pyodide = await getPyodide();
    self.postMessage({ id, type: "status", message: "Running the Python cleanup locally…" });
    pyodide.globals.set("_unicode_clean_request", JSON.stringify({ text, options }));
    const resultJson = pyodide.runPython(`
import json as _json
_request = _json.loads(_unicode_clean_request)
_options = _request.get("options") or {}
_result = _unicode_clean_module.sanitize_text(
    _request.get("text"),
    normalization=_options.get("normalization", "NFC"),
    em_dashes=_options.get("em_dashes", "asides"),
    zero_width_spaces=_options.get("zero_width_spaces", "remove"),
    remove_bidi=_options.get("remove_bidi", False),
    rewrites=_options.get("rewrites", {}),
)
_unicode_clean_reply = _json.dumps({"text": _result.text, "changes": _result.changes, "review": _result.review}, ensure_ascii=False)
_unicode_clean_reply
`);
    const result = JSON.parse(resultJson);
    self.postMessage({ id, type: "result", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error?.message || "Python cleanup failed in the browser.",
    });
  } finally {
    if (pyodide) {
      pyodide.globals.set("_unicode_clean_request", "");
      pyodide.runPython(`
for _unicode_clean_name in ("_request", "_options", "_result", "_unicode_clean_reply"):
    globals().pop(_unicode_clean_name, None)
`);
    }
  }
});
