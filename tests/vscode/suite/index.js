const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

async function run() {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
    const testsRoot = path.resolve(__dirname);
    const files = await glob('**/*.test.js', { cwd: testsRoot });
    files.sort();
    for (const file of files) {
        mocha.addFile(path.resolve(testsRoot, file));
    }
    await new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} tests failed.`));
            } else {
                resolve();
            }
        });
    });
}

module.exports = { run };
