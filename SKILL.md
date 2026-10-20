---
name: unicode-clean
description: Apply a final Unicode and whitespace cleanup to agent-authored documents or supplied prose, preserving wording, common Markdown code, and URLs while reporting changes for review. Use when creating or revising a document, or when the user asks to clean text; this is not prose rewriting or detector evasion.
---

# Unicode Clean

Use this skill as a last-mile hygiene pass while creating or revising a document, or when the user asks to clean supplied prose. Keep the author's wording, tone, and claims intact.

## Workflow

1. Draft or revise the requested content normally. Apply cleanup to the final user-facing prose before delivery; skip it if the user asks you to preserve the text exactly or omit cleanup.
2. For an existing document, use the host's document tools to inspect and edit only the requested material. Pass prose segments as strings; do not pass binary files, markup, code, or whole document packages through the sanitizer. Preserve the source and save or overwrite only as the user requested.
3. Resolve `text_sanitizer.py` beside this `SKILL.md`. Read the `sanitize_text` docstring before choosing non-default options, then import and call `sanitize_text` instead of reimplementing its rules. Pass text as runtime data, not as interpolated shell or Python source.
4. Use defaults unless the user requests otherwise. Keep NFC normalization and preserve bidirectional controls. Use NFKC only when compatibility folding is intended. Treat zero-width-space changes, bidi-control removal, and inferred paired-em-dash conversions as meaning-sensitive; inspect nearby text and each review note.
5. Return the cleaned text or deliver the requested document, plus a concise change summary and every relevant review note. If an edit could change meaning, preserve the original passage and flag it for the user.

## Scope

The helper deterministically cleans selected Unicode and whitespace characters, applies only exact user-approved replacements, and reports changes. It does not rewrite prose to make it sound more human, verify authorship, or optimize for AI-detector scores. If asked for detector evasion, explain this boundary and offer transparent text cleanup or clarity edits that do not conceal authorship.

It protects common Markdown code fences, indented code, inline backticks, and simple URL spans, but it is not a complete Markdown or HTML parser. Keep those limits in mind when handling mixed-format content.
