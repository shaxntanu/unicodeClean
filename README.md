# Unicode Clean

Unicode Clean is an installable, cross-agent skill for giving agent-authored documents a careful final Unicode and whitespace cleanup. The skill instructions are the main feature; the browser app is an optional way to try the same Python helper.

## Install the skill

This repository uses the portable Agent Skills format: a folder with `SKILL.md` frontmatter and instructions, plus optional scripts and host-specific metadata. The same skill can be used in Claude Code and Codex.

- **Claude Code:** place this repository at `~/.claude/skills/unicode-clean` for a personal skill, or at `.claude/skills/unicode-clean` inside a project.
- **Codex:** place it at `${CODEX_HOME:-~/.codex}/skills/unicode-clean`. `agents/openai.yaml` provides Codex-specific display metadata; the `SKILL.md` workflow remains portable.
- **Other Agent Skills hosts:** install the repository as a discoverable skill directory containing `SKILL.md` and `text_sanitizer.py`.

After installation, ask the agent to use `$unicode-clean` while drafting or revising a document, or ask it to clean supplied text. The agent applies the helper to prose, preserves the user's wording and document format, checks its review notes, and reports the changes. Python 3.7+ with only the standard library is needed in the agent's execution environment.

## What the skill does

[`SKILL.md`](SKILL.md) instructs an agent to use [`text_sanitizer.py`](text_sanitizer.py), rather than paraphrasing or reproducing its rules. The helper returns cleaned text, change counts, and review notes. It protects common Markdown code fences, indented code, inline backticks, and simple URL spans. It is a lightweight span recognizer, not a full Markdown or HTML parser.

The helper can normalize line endings, selected Unicode spaces and control characters, apply NFC/NFKC/no normalization, optionally change zero-width spaces, and apply exact replacements the user supplied or approved. It conservatively converts some paired em-dash asides and flags them for review. The function reads and writes no files; the agent handles document access and saving only within the user's request.

Unicode Clean is text hygiene, not a prose humanizer, grammar checker, authorship classifier, or AI-detector bypass. It does not change wording to conceal AI authorship or optimize detector scores.

## Optional browser demo

The dark-mode Vercel app is a small try-it feature. It runs the repository's Python helper in a browser Web Worker using [Pyodide](https://pyodide.org/), which compiles Python to WebAssembly. Vercel serves the static app and the Python source; the browser downloads the pinned Pyodide runtime on first use. The text is passed to the local worker and is not sent to Vercel or the runtime CDN, and this app does not save text to a server. The browser may cache the runtime files.

For a Vercel import, use the repository root (`.`), the **Other** framework preset, no build command, and the root as the output directory. No environment variables or Python server function are needed. For a local preview, serve the repository over HTTP (for example, `python -m http.server 8765`) and open `http://localhost:8765/`; the Pyodide runtime requires a web server and an internet connection on first use.

The interactive architecture diagram is embedded in the demo and is also available at [`architecture-overview.html`](architecture-overview.html).

## Use the Python helper directly

```python
from text_sanitizer import sanitize_text

result = sanitize_text(
    "The prototype—tested yesterday—worked.\nTechnical notation: x², 10–20 V.",
    normalization="NFC",
    em_dashes="asides",
    zero_width_spaces="remove",
    remove_bidi=False,
)

print(result.text)
print(result.changes)
for note in result.review:
    print("Review:", note)
```

Run the built-in example with `python text_sanitizer.py`. Review the returned notes, especially after NFKC normalization, zero-width-space changes, or removal of directional controls.
