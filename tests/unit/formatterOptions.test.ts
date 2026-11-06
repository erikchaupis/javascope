import * as assert from 'assert';
import { describe, it } from 'mocha';
import {
    applyFormatterOverrides,
    flattenOptionValues,
    FORMATTER_OPTION_DEFS,
    parseFormatterProfile,
    serializeFormatterProfile,
} from '../../src/formatter/formatterOptions';

const SAMPLE_PROFILE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<profiles version="21">
<profile kind="CodeFormatterProfile" name="Test" version="21">
<setting id="org.eclipse.jdt.core.formatter.lineSplit" value="120"/>
<setting id="org.eclipse.jdt.core.formatter.tabulation.char" value="tab"/>
</profile>
</profiles>
`;

describe('formatter options', () => {
    it('round-trips profile xml losslessly', () => {
        const parsed = parseFormatterProfile(SAMPLE_PROFILE);
        assert.strictEqual(parsed.name, 'Test');
        assert.strictEqual(parsed.settings.get('org.eclipse.jdt.core.formatter.lineSplit'), '120');
        assert.strictEqual(serializeFormatterProfile(parsed), SAMPLE_PROFILE);
    });

    it('applies overrides in place and appends unknown ids', () => {
        const merged = applyFormatterOverrides(SAMPLE_PROFILE, {
            'org.eclipse.jdt.core.formatter.lineSplit': '100',
            'org.eclipse.jdt.core.formatter.indentation.size': '2',
        });
        const parsed = parseFormatterProfile(merged);
        assert.strictEqual(parsed.settings.get('org.eclipse.jdt.core.formatter.lineSplit'), '100');
        assert.strictEqual(parsed.settings.get('org.eclipse.jdt.core.formatter.indentation.size'), '2');
        assert.strictEqual(parsed.settings.get('org.eclipse.jdt.core.formatter.tabulation.char'), 'tab');
        assert.ok(merged.startsWith('<?xml'));
        assert.ok(merged.trimEnd().endsWith('</profiles>'));
    });

    it('escapes and unescapes xml entities', () => {
        const merged = applyFormatterProfilesEscape();
        const parsed = parseFormatterProfile(merged);
        assert.strictEqual(parsed.settings.get('x.weird"id'), 'a<b&"c');
    });

    it('exposes the option schema with eclipse ids', () => {
        assert.ok(FORMATTER_OPTION_DEFS.length >= 8);
        for (const def of FORMATTER_OPTION_DEFS) {
            assert.ok(def.ids.every((id) => id.startsWith('org.eclipse.jdt.core.formatter.')));
            assert.ok(['Indentation', 'Braces', 'Spacing', 'Line width'].includes(def.group));
        }
        const flat = flattenOptionValues({ lineSplit: '90' });
        assert.strictEqual(flat['org.eclipse.jdt.core.formatter.lineSplit'], '90');
        assert.strictEqual(flat['org.eclipse.jdt.core.formatter.tabulation.char'], 'tab');
    });
});

function applyFormatterProfilesEscape(): string {
    return applyFormatterOverrides(SAMPLE_PROFILE, { 'x.weird"id': 'a<b&"c' });
}
