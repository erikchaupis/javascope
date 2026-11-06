import * as fs from 'fs';
import { formatJsp } from '../src/formatter/jsp/formatter';
import { ProfileManager } from '../src/formatter/profileManager';
import { JdtFormatterService } from '../src/formatter/jdtService';

async function main(): Promise<void> {
    const pm = new ProfileManager({
        userConfigDir: '/nonexistent',
        workspaceConfigDir: null,
        builtinJavaProfilePath: 'formatters/java/default.xml',
        builtinJspProfilePath: 'formatters/jsp/default.json',
    });
    const profile = await pm.getJspProfile('builtin:jsp:default');
    const jdt = new JdtFormatterService();
    const formatJava = (source: string, kind: 'statements' | 'expression' | 'class-body') =>
        jdt.format({ source, profilePath: 'formatters/java/default.xml', kind });
    const source = fs.readFileSync('examples/workspace/webapp/users.jsp', 'utf8');
    const out = await formatJsp(source, { profile, formatJava });
    console.log(out);
    const again = await formatJsp(out, { profile, formatJava });
    console.log('IDEMPOTENT:', out === again ? 'YES' : 'NO');
}
main().catch((e) => { console.error(e); process.exit(1); });
