---
name: unicode-clean
description: Clean Unicode and whitespace in supplied prose with reviewable changes while preserving common Markdown code and URL spans. Use for text hygiene, not rewriting or authorship analysis.
---

# Unicode Clean

Use the bundled `text_sanitizer.py` function to clean text predictably and return its change counts and review notes. The function reads and writes no files; keep file access and saving under the user's requested scope.

## Workflow

1. Identify the text or requested local document and the cleanup the user wants. Read only the relevant content. Preserve the source and return the result in chat unless the user asks for a file.
2. Read the `sanitize_text` docstring in `text_sanitizer.py` before choosing non-default options. Resolve the helper beside this `SKILL.md`; do not assume the caller's working directory. Import and call `sanitize_text` instead of reimplementing its Unicode rules. Pass user content as runtime data, not interpolated shell or Python source.
3. For ordinary cleanup, use the defaults. Keep NFC normalization and preserve bidirectional controls unless the user requests otherwise. Use NFKC only when compatibility folding is intended, since it can change superscripts and other symbols. Treat zero-width-space edits and bidi-control removals as meaning-sensitive and check the surrounding text.
4. Supply `rewrites` only for exact replacement pairs the user provides or explicitly approves. Do not invent sentence rewrites or change wording to make text sound more human.
5. Inspect `result.text`, `result.changes`, and every item in `result.review`. Check meaning, word boundaries, reading order, and formatting where the notes indicate a possible change. If an edit is ambiguous, preserve the original passage and ask the user to review that specific change.
6. Return the cleaned text or a concise diff, followed by the change counts and review notes. Save to a separate requested path; overwrite a source file only when the user explicitly asks.

## Scope

This skill performs deterministic text hygiene. It is not a grammar or style rewriter, plagiarism checker, authorship classifier, or AI-detector bypass. Do not test or optimize text against AI-detector scores or alter prose to conceal AI authorship. If asked for detector evasion, explain this boundary and offer transparent cleanup, clarity edits, or an appropriate disclosure instead.

The utility protects common Markdown code fences, indented code, inline backticks, and simple URL spans, but it is not a complete Markdown or HTML parser. Keep its limitations in mind when processing mixed-format documents.
