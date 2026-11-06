package dev.javascope.formatter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.eclipse.jdt.core.ToolFactory;
import org.eclipse.jdt.core.formatter.CodeFormatter;
import org.eclipse.jface.text.Document;
import org.eclipse.text.edits.TextEdit;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Headless Eclipse JDT formatter CLI.
 *
 * Usage:
 *   java -jar javascope-jdt-formatter.jar --profile <profile.xml> [--profile-name <name>]
 *        [--kind compilation-unit|statements|expression|class-body] [--line-separator lf|crlf|cr|auto]
 *        [--offset <n> --length <n>]
 *
 * Source is read from stdin (UTF-8); formatted output is written to stdout (UTF-8).
 * Exit code 0 on success, 1 on error. Errors are reported on stderr.
 *
 * Also supports:
 *   --dump-default-profile <out.xml>   Writes the Eclipse built-in default profile to out.xml.
 */
public final class JavaScopeFormatter {

    private static final int EXIT_OK = 0;
    private static final int EXIT_ERROR = 1;

    public static void main(String[] args) {
        int code;
        try {
            code = run(args);
        } catch (Throwable t) {
            t.printStackTrace(System.err);
            code = EXIT_ERROR;
        }
        System.exit(code);
    }

    private static int run(String[] args) throws Exception {
        Map<String, String> argMap = parseArgs(args);

        if (argMap.containsKey("dump-default-profile")) {
            dumpDefaultProfile(argMap.get("dump-default-profile"));
            return EXIT_OK;
        }

        String profilePath = argMap.get("profile");
        if (profilePath == null || profilePath.isBlank()) {
            System.err.println("error: --profile <file.xml> is required");
            return EXIT_ERROR;
        }
        Path path = Path.of(profilePath);
        if (!Files.isRegularFile(path)) {
            System.err.println("error: profile file not found: " + profilePath);
            return EXIT_ERROR;
        }

        Map<String, String> options = readProfile(path, argMap.get("profile-name"));

        String kindName = argMap.getOrDefault("kind", "compilation-unit");
        int kind = toKind(kindName);

        String source = readStdin();

        int offset = parseInt(argMap.get("offset"), 0);
        int length = parseInt(argMap.get("length"), source.length() - offset);

        String lineSeparator = toLineSeparator(argMap.getOrDefault("line-separator", "auto"), source);

        CodeFormatter formatter = ToolFactory.createCodeFormatter(options, ToolFactory.M_FORMAT_EXISTING);
        TextEdit edit;
        try {
            edit = formatter.format(kind, source, offset, length, 0, lineSeparator);
        } catch (Exception e) {
            System.err.println("error: JDT format failed: " + e.getMessage());
            return EXIT_ERROR;
        }
        if (edit == null) {
            // JDT could not produce edits; signal to caller so it can keep the original text.
            System.err.println("warning: JDT produced no edits (unparseable input?); original text returned unchanged");
            System.out.write(source.getBytes(StandardCharsets.UTF_8));
            return EXIT_OK;
        }

        Document document = new Document(source);
        try {
            edit.apply(document);
        } catch (Exception e) {
            System.err.println("error: failed to apply JDT edits: " + e.getMessage());
            return EXIT_ERROR;
        }
        System.out.write(document.get().getBytes(StandardCharsets.UTF_8));
        return EXIT_OK;
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            if (a.startsWith("--")) {
                String key = a.substring(2);
                if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                    map.put(key, args[++i]);
                } else {
                    map.put(key, "true");
                }
            }
        }
        return map;
    }

    private static int parseInt(String value, int fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String readStdin() throws IOException {
        InputStream in = System.in;
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[65536];
        int read;
        while ((read = in.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        return buffer.toString(StandardCharsets.UTF_8);
    }

    private static int toKind(String name) {
        switch (name) {
            case "statements":
                return CodeFormatter.K_STATEMENTS;
            case "expression":
                return CodeFormatter.K_EXPRESSION;
            case "class-body":
                return CodeFormatter.K_CLASS_BODY_DECLARATIONS;
            case "compilation-unit":
            default:
                return CodeFormatter.K_COMPILATION_UNIT;
        }
    }

    private static String toLineSeparator(String name, String source) {
        switch (name) {
            case "lf":
                return "\n";
            case "crlf":
                return "\r\n";
            case "cr":
                return "\r";
            case "auto":
            default:
                int idx = source.indexOf('\n');
                if (idx > 0 && source.charAt(idx - 1) == '\r') {
                    return "\r\n";
                }
                return "\n";
        }
    }

    /** Reads an Eclipse CodeFormatterProfile XML file into a JDT options map. */
    private static Map<String, String> readProfile(Path path, String wantedName) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        DocumentBuilder builder = factory.newDocumentBuilder();
        org.w3c.dom.Document doc = builder.parse(path.toFile());
        doc.getDocumentElement().normalize();

        NodeList profiles = doc.getElementsByTagName("profile");
        if (profiles.getLength() == 0) {
            throw new IllegalArgumentException("no <profile> elements found in " + path);
        }
        Element chosen = null;
        for (int i = 0; i < profiles.getLength(); i++) {
            Element p = (Element) profiles.item(i);
            String name = p.getAttribute("name");
            if (wantedName == null || wantedName.isBlank() || wantedName.equals(name)) {
                chosen = p;
                break;
            }
        }
        if (chosen == null) {
            throw new IllegalArgumentException("profile '" + wantedName + "' not found in " + path
                    + " (available: " + listProfileNames(profiles) + ")");
        }

        Map<String, String> options = new LinkedHashMap<>();
        NodeList settings = chosen.getElementsByTagName("setting");
        for (int i = 0; i < settings.getLength(); i++) {
            Element s = (Element) settings.item(i);
            options.put(s.getAttribute("id"), s.getAttribute("value"));
        }
        return options;
    }

    private static String listProfileNames(NodeList profiles) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < profiles.getLength(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(((Element) profiles.item(i)).getAttribute("name"));
        }
        return sb.toString();
    }

    /** Dumps the Eclipse built-in default formatter profile to an XML file. */
    private static void dumpDefaultProfile(String outPath) throws Exception {
        Map<String, String> options = defaultOptions();
        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n");
        xml.append("<profiles version=\"21\">\n");
        xml.append("<profile kind=\"CodeFormatterProfile\" name=\"Eclipse [built-in]\" version=\"21\">\n");
        options.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> xml.append("<setting id=\"").append(escapeXml(e.getKey()))
                        .append("\" value=\"").append(escapeXml(e.getValue())).append("\"/>\n"));
        xml.append("</profile>\n</profiles>\n");
        Files.writeString(Path.of(outPath), xml.toString(), StandardCharsets.UTF_8);
        System.err.println("default profile written to " + outPath);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> defaultOptions() throws Exception {
        Class<?> clazz = Class.forName("org.eclipse.jdt.internal.formatter.DefaultCodeFormatterOptions");
        // Preferred: DefaultCodeFormatterOptions.getEclipseDefaultSettings() : Map<String,String>
        try {
            java.lang.reflect.Method m = clazz.getMethod("getEclipseDefaultSettings");
            Object map = m.invoke(null);
            if (map instanceof Map) {
                return new LinkedHashMap<>((Map<String, String>) map);
            }
        } catch (NoSuchMethodException ignored) {
        }
        // Fallback: instance + getMap()
        try {
            java.lang.reflect.Method getDefault = clazz.getMethod("getDefaultSettings");
            Object instance = getDefault.invoke(null);
            java.lang.reflect.Method getMap = clazz.getMethod("getMap");
            Object map = getMap.invoke(instance);
            if (map instanceof Map) {
                return new LinkedHashMap<>((Map<String, String>) map);
            }
        } catch (NoSuchMethodException ignored) {
        }
        throw new IllegalStateException("could not obtain Eclipse default formatter options");
    }

    private static String escapeXml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private JavaScopeFormatter() {
    }

    static {
        // Redirect JDT's possible System.err noise away only when quiet flag is set in future.
        PrintStream unused = System.err;
    }
}
