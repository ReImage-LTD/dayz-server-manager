import * as path from 'path';
import * as commentJson from 'comment-json';
import { LogLevel } from '../util/logger';
import { Paths } from '../services/paths';
import { Config } from './config';
import { generateConfigTemplate } from './config-template';
import { parseConfigFileContent, validateConfig } from './config-validate';
import { inject, injectable, singleton } from 'tsyringe';
import { FSAPI, InjectionTokens } from '../util/apis';
import { IService } from '../types/service';
import { LoggerFactory } from '../services/loggerfactory';
import { origExit } from '../util/exit-capture';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { detectOS } from '../util/detect-os';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const configschema = require('./config.schema.json');

export interface RevisionedConfig {
    config: string;
    revision: string;
}

export class ConfigRevisionConflictError extends Error {

    public constructor() {
        super('Config has changed since it was read');
        this.name = 'ConfigRevisionConflictError';
    }

}

@singleton()
@injectable()
export class ConfigFileHelper extends IService {

    public static readonly REDACTED_SECRET = '[REDACTED]';

    public static readonly CFG_NAME = 'server-manager.json';

    public constructor(
        loggerFactory: LoggerFactory,
        private paths: Paths,
        @inject(InjectionTokens.fs) private fs: FSAPI,
    ) {
        super(loggerFactory.createLogger('Config'));
    }

    public getConfigFilePath(): string {
        return path.join(this.paths.cwd(), ConfigFileHelper.CFG_NAME);
    }

    public getConfigFileContent(cfgPath: string): string {
        if (this.fs.existsSync(cfgPath)) {
            return this.fs.readFileSync(cfgPath, { encoding: 'utf-8' });
        }
        throw new Error('Config file does not exist');
    }

    public getRevisionedConfig(): RevisionedConfig {
        const config = this.getConfigFileContent(this.getConfigFilePath());
        return {
            config: this.redactConfigContent(config),
            revision: this.getRevision(config),
        };
    }

    public getRedactedConfig(): string {
        return this.redactConfigContent(this.getConfigFileContent(this.getConfigFilePath()));
    }

    public validateConfigContent(newConfig: string): string[] {
        try {
            const config = this.mergeConfig(newConfig);
            return validateConfig(config);
        } catch (error) {
            return [error?.message || String(error)];
        }
    }

    private logConfigErrors(errors: string[]): void {
        this.log.log(LogLevel.ERROR, 'Config has errors:');

        for (const configError of errors) {
            this.log.log(LogLevel.ERROR, configError);
        }
    }

    public readConfig(): Config | null {
        let fileContent: string;
        try {
            const cfgPath = this.getConfigFilePath();
            this.log.log(LogLevel.IMPORTANT, `Trying to read config at: ${cfgPath}`);
            fileContent = this.getConfigFileContent(cfgPath);

            // apply defaults
            const parsed = commentJson.assign(
                new Config(),
                parseConfigFileContent(fileContent),
            );
            const configErrors = validateConfig(parsed);
            if (configErrors?.length) {
                this.logConfigErrors(configErrors);

                return null;
            }

            this.log.log(LogLevel.IMPORTANT, 'Successfully read config');

            return parsed;
        } catch (e) {
            this.log.log(LogLevel.ERROR, `Error reading config: ${e.message}`, e);
            return null;
        }
    }

    public writeConfig(newConfig: string, expectedRevision?: string): void {
        const cfgPath = this.getConfigFilePath();
        if (expectedRevision !== undefined) {
            const current = this.getConfigFileContent(cfgPath);
            if (this.getRevision(current) !== expectedRevision) {
                throw new ConfigRevisionConflictError();
            }
        }

        const config = this.mergeConfig(newConfig);

        const configErrors = validateConfig(config);
        if (configErrors?.length) {
            throw ['New config contains errors. Cannot replace config.', ...configErrors];
        }

        try {
            const temporaryPath = `${cfgPath}.${randomBytes(6).toString('hex')}.tmp`;
            this.fs.writeFileSync(temporaryPath, commentJson.stringify(config, null, 2));
            try {
                this.fs.renameSync(temporaryPath, cfgPath);
            } catch (error) {
                this.fs.rmSync(temporaryPath, { force: true });
                throw error;
            }
        } catch (e) {
            throw [`Error generating / writing config (${e?.message ?? 'Unknown'}). Cannot replace config.`];
        }
    }

    private mergeConfig(newConfig: string): Config {
        const current = this.readConfig() || commentJson.parse(generateConfigTemplate(configschema)) as any as Config;
        const incoming = commentJson.parse(newConfig) as any as Config;
        for (const remote of incoming.remoteNodes || []) {
            if (remote.sharedSecret === ConfigFileHelper.REDACTED_SECRET) {
                remote.sharedSecret = current.remoteNodes?.find((node) => node.id === remote.id)?.sharedSecret || '';
            }
        }
        const preserve = (key: keyof Config): void => {
            if ((incoming as any)[key] === ConfigFileHelper.REDACTED_SECRET) {
                (incoming as any)[key] = (current as any)[key];
            }
        };
        ['discordBotToken', 'ingameApiKey', 'rconPassword', 'steamPassword'].forEach((key) => preserve(key as keyof Config));
        for (const admin of incoming.admins || []) {
            if (admin.password === ConfigFileHelper.REDACTED_SECRET) {
                admin.password = current.admins?.find((item) => item.userId === admin.userId)?.password || '';
            }
        }
        if (incoming.serverCfg && current.serverCfg) {
            for (const key of ['password', 'passwordAdmin'] as const) {
                if (incoming.serverCfg[key] === ConfigFileHelper.REDACTED_SECRET) {
                    incoming.serverCfg[key] = current.serverCfg[key];
                }
            }
        }
        return commentJson.assign(
            current,
            incoming,
        );
    }

    private redactConfigContent(content: string): string {
        const config = commentJson.parse(content) as any as Config;
        for (const remote of config.remoteNodes || []) {
            remote.sharedSecret = ConfigFileHelper.REDACTED_SECRET;
        }
        for (const admin of config.admins || []) {
            admin.password = ConfigFileHelper.REDACTED_SECRET;
        }
        config.discordBotToken = ConfigFileHelper.REDACTED_SECRET;
        config.ingameApiKey = ConfigFileHelper.REDACTED_SECRET;
        config.rconPassword = ConfigFileHelper.REDACTED_SECRET;
        config.steamPassword = ConfigFileHelper.REDACTED_SECRET;
        if (config.serverCfg) {
            config.serverCfg.password = ConfigFileHelper.REDACTED_SECRET;
            config.serverCfg.passwordAdmin = ConfigFileHelper.REDACTED_SECRET;
        }
        return commentJson.stringify(config, null, 2);
    }

    private getRevision(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    public createDefaultConfig(): void {

        const cfgPath = this.getConfigFilePath();

        if (!this.fs.existsSync(cfgPath)) {
            const defaultConfig = commentJson.parse(generateConfigTemplate(configschema)) as any as Config;

            // apply safe defaults
            defaultConfig.admins[0].password = randomUUID();
            defaultConfig.ingameApiKey = randomUUID();
            defaultConfig.rconPassword = randomUUID();
            defaultConfig.serverCfg.passwordAdmin = randomUUID();

            // linux specifics
            if (detectOS() !== 'windows') {
                defaultConfig.serverExe = 'DayZServer';
            }

            this.fs.writeFileSync(
                cfgPath,
                commentJson.stringify(defaultConfig, null, 2),
            );

            console.log('\n\n\n');
            console.log('Did not find a server manager config!');
            console.log(`Created a new config with default values at: ${cfgPath}`);
            console.log('Adjust the config to fit your needs and restart the manager!');
            console.log('\n\n');

            if (typeof global.it === 'function') {
                return;
            }
            origExit(0); // end process
        }

    }

}
