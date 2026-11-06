# Changelog

## 1.0.0 — 2026-11-01

Initial release.

### Themes & Syntax
- Four built-in editor color schemes: Eclipse Light, Eclipse Dark,
  IntelliJ Light, IntelliJ Darcula (TextMate + semantic token customization,
  Java/JSP scoped only).
- Custom themes from `.javascope/themes/*.json` with validation and
  discovery.
- Bundled JSP TextMate grammar (directives, scriptlets with embedded Java
  highlighting, EL expressions).

### Java formatting
- Headless Eclipse JDT formatter (`org.eclipse.jdt.core` 3.42) bundled as a
  CLI JAR; default Eclipse profile included.
- Eclipse XML profile import/export, multi-profile files, workspace-over-user
  precedence, built-in profile protection.
- Format document command, format on save, enable/disable toggle.

### JSP formatting
- Structured tokenizer/tree formatter for mixed JSP content; scriptlet,
  declaration and expression Java formatted by the same JDT engine.
- JSON profiles (indentation, line width, attribute wrapping, blank lines,
  whitespace hygiene); conservative fallback for unbalanced markup.
- Idempotent, CRLF-aware, semantics-preserving (directives, EL, comments).

### Configuration & administration
- User (`~/.javascope`) and workspace (`<workspace>/.javascope`) layers with
  documented precedence, file watching, validation with readable errors.
- React-based Administration webview (strict CSP, script nonces, message
  validation) for themes, formatters, profiles, toggles and shortcuts.
- Nine commands with optional `Ctrl/Cmd+Alt+F` formatting shortcuts;
  independent feature toggles.
- 71 unit tests + 5 VS Code integration tests; packaged VSIX.
