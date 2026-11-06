import * as fs from 'fs';
import * as path from 'path';
import { formatJsp } from '../src/formatter/jsp/formatter';
import { BUILTIN_JSP_PROFILE } from '../src/formatter/jsp/profile';

async function main(): Promise<void> {
    const dir = path.join(__dirname, '..', 'tests', 'fixtures', 'jsp');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsp') && !f.endsWith('-formatted.jsp'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(dir, file), 'utf8');
        const once = await formatJsp(source, { profile: BUILTIN_JSP_PROFILE });
        const twice = await formatJsp(once, { profile: BUILTIN_JSP_PROFILE });
        console.log(`===== ${file} =====`);
        console.log(once);
        console.log(`----- idempotent: ${once === twice ? 'YES' : 'NO'}`);
        if (once !== twice) {
            console.log('SECOND PASS:');
            console.log(twice);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
