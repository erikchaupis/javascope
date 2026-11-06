import * as assert from 'assert';
import { isWebviewMessage } from '../../src/webview/messages';

describe('webview message validation', () => {
    it('accepts well-formed messages', () => {
        assert.ok(isWebviewMessage({ type: 'ready' }));
        assert.ok(isWebviewMessage({ type: 'reload' }));
        assert.ok(isWebviewMessage({ type: 'setTheme', id: 'eclipse-light' }));
        assert.ok(isWebviewMessage({ type: 'toggleThemes', enabled: true }));
        assert.ok(isWebviewMessage({ type: 'toggleJspTemplates', enabled: false }));
        assert.ok(isWebviewMessage({ type: 'getFormatterOptions', id: 'p' }));
        assert.ok(
            isWebviewMessage({
                type: 'formatPreview',
                id: 'p',
                settings: { 'org.eclipse.jdt.core.formatter.lineSplit': '120' },
            }),
        );
        assert.ok(isWebviewMessage({ type: 'updateFormatterOptions', id: 'p', settings: {} }));
        assert.ok(isWebviewMessage({ type: 'getJspProfileOptions', id: 'p' }));
        assert.ok(isWebviewMessage({ type: 'jspFormatPreview', id: 'p', profile: { lineWidth: 120 } }));
        assert.ok(!isWebviewMessage({ type: 'jspFormatPreview', id: 'p', profile: 42 }));
        assert.ok(isWebviewMessage({ type: 'setActiveProfile', kind: 'java', id: 'user:java:x' }));
        assert.ok(isWebviewMessage({ type: 'createProfile', kind: 'jsp', name: 'x', duplicateFrom: 'builtin:jsp:default' }));
        assert.ok(isWebviewMessage({ type: 'createProfile', kind: 'java', name: 'x', origin: 'user' }));
        assert.ok(isWebviewMessage({ type: 'createProfile', kind: 'java', name: 'x', origin: 'workspace' }));
        assert.ok(isWebviewMessage({ type: 'updateProfileContent', id: 'a', content: '{}' }));
        assert.ok(isWebviewMessage({ type: 'openConfigDir', target: 'user' }));
        assert.ok(isWebviewMessage({ type: 'updateSettings', patch: { enabled: false } }));
    });

    it('rejects malformed and unknown messages', () => {
        assert.ok(!isWebviewMessage(null));
        assert.ok(!isWebviewMessage('hello'));
        assert.ok(!isWebviewMessage({}));
        assert.ok(!isWebviewMessage({ type: 'setTheme' })); // missing id
        assert.ok(!isWebviewMessage({ type: 'setActiveProfile', kind: 'ruby', id: 'x' }));
        assert.ok(!isWebviewMessage({ type: 'openConfigDir', target: 'etc' }));
        assert.ok(!isWebviewMessage({ type: 'createProfile', kind: 'java' })); // missing name
        assert.ok(!isWebviewMessage({ type: 'createProfile', kind: 'java', name: 'x', origin: 'etc' })); // bad origin
        assert.ok(!isWebviewMessage({ type: 'createProfile', kind: 'java', name: 42 }));
        assert.ok(!isWebviewMessage({ type: 'updateProfileContent', id: 'a' })); // missing content
        assert.ok(!isWebviewMessage({ type: 'exec', command: 'rm -rf /' }));
        // importProfile never accepts a path from the webview: the extension
        // shows a native dialog instead, and extra fields are ignored.
        assert.ok(isWebviewMessage({ type: 'importProfile', kind: 'java' }));
    });
});
