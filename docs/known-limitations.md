# Known Limitations

## Java formatting
- Requires a Java runtime (`java` on PATH). Without it, Java formatting and
  JSP scriptlet formatting are unavailable (clear error shown); themes and
  JSP structural formatting still work.
- The formatter runs as a CLI process per invocation (~300 ms JVM startup).
  Fine for manual formatting and format-on-save; not a daemon.
- Java formatting operates on the whole document. Eclipse *range* formatting
  is not exposed as a command.

## JSP formatting
- **Compatibility:** the JSP engine is a purpose-built structured formatter,
  not Eclipse WTP. It covers directives, declarations, scriptlets,
  expressions, EL, JSTL/custom tags, HTML and both comment styles. It does
  **not** aim for byte-for-byte WTP parity; rule semantics follow the
  JavaScope JSON profiles.
- XML-form JSP documents (`<jsp:root>`/`<jsp:directive>` style) and tag
  library descriptor formatting are out of scope; their content is preserved.
- Long text content lines are re-indented but never hard-wrapped.
- Documents with unbalanced markup use the conservative fallback: Java inside
  JSP blocks is still formatted, but HTML layout is left exactly as authored.
- `<pre>`, `<textarea>` and other whitespace-sensitive elements: content is
  preserved; the surrounding structure is still re-indented.

## Themes
- Editor token colors only; JavaScope intentionally does not change the
  workbench theme. A light scheme on a dark UI theme keeps the dark editor
  background (choose a matching UI theme for the classic look).
- Semantic colors rely on the Red Hat Java extension (or another Java
  language server); without one, TextMate-only colors apply.
- Exact Eclipse/IntelliJ hex values follow published defaults as closely as
  possible; minor differences across IDE versions are possible.

## General
- Format-on-save runs JavaScope's formatter in addition to whatever other
  formatters are enabled; use one formatter for on-save to avoid double
  formatting.
- Profile/theme caching is file-watch driven; extremely rapid successive
  edits are debounced (~250 ms).
