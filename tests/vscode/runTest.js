const fs = require('fs');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
        const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
        const workspacePath = path.resolve(__dirname, 'workspace');
        const userDataDir = path.resolve(__dirname, '..', '..', '.vscode-test', 'user-data');
        // A fresh user-data-dir would open in the default dark theme every run;
        // pin the isolated instance to a light theme so the test window matches
        // the project's usual look (tests are theme-agnostic).
        fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
        fs.writeFileSync(
            path.join(userDataDir, 'User', 'settings.json'),
            JSON.stringify({ 'workbench.colorTheme': 'Visual Studio Light' }, null, 2),
        );
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                workspacePath,
                '--disable-extensions',
                `--user-data-dir=${userDataDir}`,
            ],
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main();
