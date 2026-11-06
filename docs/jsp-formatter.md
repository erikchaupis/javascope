# JSP Formatter Guide

JSP is mixed content — HTML, JSP directives, declarations, scriptlets,
expressions, Expression Language, JSTL tags and comments. The JavaScope JSP
engine is a **structured tokenizer + tree formatter** written for exactly
this mix (see [Known Limitations](known-limitations.md) for the compatibility
statement vs. Eclipse WTP).

## What gets formatted

- **HTML structure** — element nesting drives indentation; short elements
  with text-only content stay on one line; long attribute lists wrap per
  `lineWidth`.
- **JSP directives** `<%@ page … %>` — attribute spacing normalized, blank
  line inserted after the directive group.
- **Scriptlets** `<% … %>` — Java code formatted by the **Eclipse JDT
  formatter** with your active Java profile (unless disabled or Java is
  unavailable, in which case the original code is kept).
- **Declarations** `<%! … %>` — Java member declarations formatted by JDT.
- **Expressions** `<%= … %>` — Java expressions formatted by JDT.
- **Comments** — `<%-- --%>` and `<!-- -->` content preserved, layout
  normalized.
- **EL expressions** `${…}` — never modified; preserved verbatim in text and
  attribute values.

## Safety

- Unbalanced markup triggers a **conservative fallback**: Java bodies are
  still formatted and whitespace hygiene applied, but tag layout is left
  untouched — JavaScope never invents, moves or deletes tags.
- If a scriptlet does not parse as Java, its original text is preserved.
- Formatting is idempotent (verified by tests) and line-ending aware
  (CRLF in → CRLF out).

## Default profile

`builtin:jsp:default`:

```jsonc
{
  "indentation": { "style": "space", "size": 4 },   // or "tab"
  "lineWidth": 120,
  "maxBlankLines": 1,
  "trimTrailingWhitespace": true,
  "formatScriptletJava": true,                       // use Eclipse JDT inside JSP blocks
  "blankLineAfterDirective": true,
  "keepInlineIfShort": true,                         // keep <p>${x}</p> on one line
  "html": { "wrapAttributes": "auto" }               // auto | force | preserve
}
```

## Custom profiles

Create one in the Administration panel, or drop a JSON file into
`formatters/jsp/` under either `.javascope` directory. Profiles are validated
on load; invalid files are reported and skipped.

## Example

Input:

```jsp
<%@ page language="java" contentType="text/html" %>
<html><body>
<c:forEach items="${users}" var="user">
<p>${user.name}</p>
</c:forEach>
<%
String message="Hello";
%>
</body></html>
```

Output:

```jsp
<%@ page language="java" contentType="text/html" %>

<html>
    <body>
        <c:forEach items="${users}" var="user">
            <p>${user.name}</p>
        </c:forEach>
        <%
            String message = "Hello";
        %>
    </body>
</html>
```
