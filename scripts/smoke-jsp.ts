import { formatJsp } from '../src/formatter/jsp/formatter';
import { BUILTIN_JSP_PROFILE } from '../src/formatter/jsp/profile';
import { JdtFormatterService } from '../src/formatter/jdtService';

const jdt = new JdtFormatterService();

const sample = `<%@ page import="java.util.*" %>
<html>
<body>
<%
String message="Hello";
int x=1;
if(x>0){System.out.println(message);}
%>
<%! private int counter=0; %>
<p>Count: <%=counter+1 %></p>
<ul><li>one</li><li>two</li></ul>
</body>
</html>
`;

async function main(): Promise<void> {
    const profile = { ...BUILTIN_JSP_PROFILE, formatScriptletJava: true };
    const formatJava = async (source: string, kind: 'statements' | 'expression' | 'class-body'): Promise<string> =>
        jdt.format({
            source,
            profilePath: require('path').join(__dirname, '..', 'formatters', 'java', 'default.xml'),
            kind: kind === 'statements' ? 'statements' : kind === 'expression' ? 'expression' : 'class-body',
        });
    const once = await formatJsp(sample, { profile, formatJava });
    const twice = await formatJsp(once, { profile, formatJava });
    console.log('=== FIRST PASS ===');
    console.log(once);
    console.log('=== IDEMPOTENT:', once === twice ? 'YES' : 'NO ===');
    if (once !== twice) {
        console.log('=== SECOND PASS ===');
        console.log(twice);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
