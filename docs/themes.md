# Theme Customization Guide

JavaScope color schemes are **editor token color customizations**, not full UI
themes. Only Java and JSP documents are affected — your workbench theme,
icons, and every other language keep their colors.

## Built-in schemes

| Scheme | ID | Based on |
|---|---|---|
| Eclipse Light | `eclipse-light` | Classic Eclipse Java editor defaults |
| Eclipse Dark | `eclipse-dark` | Eclipse dark theme conventions |
| IntelliJ Light | `intellij-light` | IntelliJ IDEA default scheme |
| IntelliJ Darcula | `intellij-darcula` | IntelliJ Darcula |

Select one in **Administration → Themes & Syntax** or by setting
`themes.active` in `.javascope/settings.json`.

## How it works (and why)

VS Code does not let extensions register new theme contributions at runtime,
so JavaScope applies schemes through the supported
`editor.tokenColorCustomizations` /
`editor.semanticTokenColorCustomizations` APIs:

- TextMate rules are scoped strictly to `*.java` / `*.jsp` selectors — no
  other language is touched.
- Semantic rules (from the Java language server) are scoped to your current
  workbench theme (`"[Theme Name]": { rules: … }`) and follow it when you
  switch themes.
- Applied entries carry a `javascope` marker. Disabling or switching a scheme
  removes **only** marked entries from those settings, so cleanup is exact
  even across window reloads and your own customizations in the same keys are
  preserved.

## Contrast

Schemes have a type (`light`/`dark`) independent of your workbench theme. A
light scheme on a dark workbench (or the reverse) still applies, but colors
meant for a white background (e.g. black type names) look off — JavaScope
warns in that case and offers the matching counterpart (Eclipse Light ↔
Eclipse Dark, IntelliJ Light ↔ Darcula).

## Custom themes

Drop a JSON file into `themes/` under either `.javascope` directory:

```jsonc
{
  "name": "Acme Corp",
  "type": "dark",                       // "light" or "dark" (fallback palette base)
  "colors": {
    "keyword": "#C586C0",
    "string": "#CE9178",
    "comment": "#6A9955",
    "className": "#4EC9B0",
    "methodDeclaration": "#DCDCAA",
    "field": "#9CDCFE",
    "staticField": "#9CDCFE",
    "parameter": "#9CDCFE",
    "number": "#B5CEA8",
    "foreground": "#D4D4D4"
  },
  "textMateRules": [                    // optional, appended verbatim
    { "scope": ["meta.method.java"], "settings": { "fontStyle": "italic" } }
  ],
  "semanticRules": {                    // optional semantic token colors
    "interface": "#4EC9B0",
    "property.static.readonly": {       // selectors may include modifiers
      "foreground": "#0000C0",
      "fontStyle": "bold italic"
    }
  }
}
```

Available `colors` slots: `foreground`, `keyword`, `string`, `stringEscape`,
`number`, `comment`, `javadoc`, `javadocTag`, `className`, `interfaceName`,
`enumName`, `annotation`, `methodDeclaration`, `methodCall`, `field`,
`staticField`, `parameter`, `localVariable`, `operator`, `punctuation`.

Unspecified slots inherit from the built-in palette matching `type`. Files
with invalid colors or shapes are reported in the Administration panel and
skipped.

## Enable / disable

Independent toggle: **Administration → Themes & Syntax → Enable JavaScope
color customization** (or `javascope.toggleThemes`). Disabling colors does
not affect either formatter.
