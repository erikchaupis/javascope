import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type JdtFormatKind = 'compilation-unit' | 'statements' | 'expression' | 'class-body';

export interface JdtFormatRequest {
    source: string;
    profilePath: string;
    profileName?: string;
    kind: JdtFormatKind;
    timeoutMs?: number;
}

export interface JdtFormatterOptions {
    /** Directory containing `javascope-jdt-formatter.jar` (default: bundled `formatters/java/bin`). */
    jarPath?: string;
    /** Java executable (default: `java` on PATH). */
    javaExecutable?: string;
}

/**
 * Locates the bundled formatter JAR relative to this module, tolerating both
 * the source tree (`src/formatter`), the bundled extension (`out/`) and
 * installed-extension layouts by walking upward.
 */
function resolveBundledJar(): string {
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
        const candidate = path.join(dir, 'formatters', 'java', 'bin', 'javascope-jdt-formatter.jar');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    // Default assumption: extension root layout (out/ sits directly inside it).
    return path.join(__dirname, '..', 'formatters', 'java', 'bin', 'javascope-jdt-formatter.jar');
}

/**
 * Runs the headless Eclipse JDT formatter CLI shipped at
 * `formatters/java/bin/javascope-jdt-formatter.jar`.
 *
 * The CLI reads Java source on stdin and writes the formatted result on
 * stdout; errors go to stderr with a non-zero exit code.
 */
export class JdtFormatterService {
    private readonly jarPath: string;
    private readonly javaExecutable: string;
    private javaChecked = false;
    private javaAvailable = false;

    constructor(options: JdtFormatterOptions = {}) {
        this.jarPath = options.jarPath ?? resolveBundledJar();
        this.javaExecutable = options.javaExecutable ?? process.env.JAVASCOPE_JAVA ?? 'java';
    }

    isJarPresent(): boolean {
        return fs.existsSync(this.jarPath);
    }

    async isJavaAvailable(): Promise<boolean> {
        if (this.javaChecked) {
            return this.javaAvailable;
        }
        this.javaChecked = true;
        try {
            const result = await this.run(['-version'], '', 10000);
            this.javaAvailable = result.code === 0;
        } catch {
            this.javaAvailable = false;
        }
        return this.javaAvailable;
    }

    async format(request: JdtFormatRequest): Promise<string> {
        if (!this.isJarPresent()) {
            throw new Error(`JavaScope JDT formatter JAR not found at ${this.jarPath}`);
        }
        const timeoutMs = request.timeoutMs ?? 60000;
        const args = [
            '-jar',
            this.jarPath,
            '--profile',
            request.profilePath,
            '--kind',
            request.kind,
            '--line-separator',
            'lf',
        ];
        if (request.profileName) {
            args.push('--profile-name', request.profileName);
        }
        const result = await this.run(args, request.source.replace(/\r\n/g, '\n'), timeoutMs);
        if (result.code !== 0) {
            throw new Error(`JDT formatter failed (exit ${result.code}): ${result.stderr.trim()}`);
        }
        return result.stdout;
    }

    private run(args: string[], stdin: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            let child: ChildProcess;
            try {
                child = spawn(this.javaExecutable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            } catch (e) {
                reject(e);
                return;
            }
            const stdout: Buffer[] = [];
            const stderr: Buffer[] = [];
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try {
                        child.kill('SIGKILL');
                    } catch {
                        // ignore
                    }
                    reject(new Error(`JDT formatter timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            child.stdout?.on('data', (d: Buffer) => stdout.push(d));
            child.stderr?.on('data', (d: Buffer) => stderr.push(d));
            child.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                }
            });
            child.on('close', (code) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve({
                        code: code ?? 1,
                        stdout: Buffer.concat(stdout).toString('utf8'),
                        stderr: Buffer.concat(stderr).toString('utf8'),
                    });
                }
            });
            child.stdin?.on('error', () => {
                // E.g. process exited early; close handler reports the real error.
            });
            child.stdin?.write(stdin, 'utf8', () => {
                child.stdin?.end();
            });
        });
    }
}
