import { injectable, singleton } from 'tsyringe';
import { Manager } from '../control/manager';
import { Backups } from '../services/backups';
import { LogReader } from '../services/log-reader';
import { LoggerFactory } from '../services/loggerfactory';
import { Metrics } from '../services/metrics';
import { MissionFiles } from '../services/mission-files';
import { Monitor } from '../services/monitor';
import { SystemReporter } from '../services/system-reporter';
import { RCON } from '../services/rcon';
import { SteamCMD } from '../services/steamcmd';
import { CommandMap, Request, RequestTemplate, Response, ResponsePartHandler } from '../types/interface';
import { IService } from '../types/service';
import { LogLevel } from '../util/logger';
import { makeTable } from '../util/table';
import { constants as HTTP } from 'http2';
import { ConfigFileHelper, ConfigRevisionConflictError } from '../config/config-file-helper';
import { ServerDetector } from '../services/server-detector';
import { OperationConflictError, Operations, SafeOperationError } from '../services/operations';
import { NodeRegistry } from '../services/node-registry';
import { TrackedOperation } from '../types/operations';
import { FleetDispatcher } from '../services/fleet-dispatcher';
import { FleetCommand } from '../types/fleet';
import { UserLevel } from '../config/config';

/* istanbul ignore next */
const parseBoolean = (val: any): boolean => true === val || 'true' === val;

/* istanbul ignore next */
const parseNumber = (val: any): number => typeof val === 'number' ? val : Number(val);

@singleton()
@injectable()
export class Interface extends IService {

    public commandMap!: CommandMap;

    public constructor( // NOSONAR
        loggerFactory: LoggerFactory,
        private manager: Manager,
        private rcon: RCON,
        private monitor: Monitor,
        private systemReporter: SystemReporter,
        private serverDetector: ServerDetector,
        private metrics: Metrics,
        private steamCmd: SteamCMD,
        private logReader: LogReader,
        private backup: Backups,
        private missionFiles: MissionFiles,
        private configFileHelper: ConfigFileHelper,
        private operations: Operations,
        private nodeRegistry: NodeRegistry,
        private fleetDispatcher: FleetDispatcher,
    ) {
        super(loggerFactory.createLogger('Manager'));
        this.setupCommandMap();
    }

    private setupCommandMap(): void {

        this.commandMap = new Map([
            ['ping', RequestTemplate.build({
                level: 'view',
                disableRest: true,
                action: () => 'I won\'t say pong',
            })],
            ['process', RequestTemplate.build({
                level: 'view',
                action: this.getDayZProcesses,
            })],
            ['system', RequestTemplate.build({
                level: 'view',
                action: this.getSystemReport,
            })],
            ['players', RequestTemplate.build({
                level: 'view',
                action: this.getPlayers,
            })],
            ['bans', RequestTemplate.build({
                level: 'view',
                action: this.getBans,
            })],
            ['shutdown', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                noResponse: true,
                action: () => this.rcon.shutdown(),
            })],
            ['lock', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                noResponse: true,
                action: () => this.rcon.lock(),
            })],
            ['unlock', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                noResponse: true,
                action: () => this.rcon.unlock(),
            })],
            ['global', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'message' }],
                noResponse: true,
                action: (req, params) => this.rcon.global(params.message),
            })],
            ['kickall', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                noResponse: true,
                action: () => this.rcon.kickAll(),
            })],
            ['kick', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'player' }],
                noResponse: true,
                action: (req, params) => this.rcon.kick(params.player),
            })],
            ['ban', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'player' }],
                noResponse: true,
                action: (req, params) => this.rcon.ban(params.player),
            })],
            ['removeban', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'player' }],
                noResponse: true,
                action: (req, params) => this.rcon.removeBan(params.player),
            })],
            ['reloadbans', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                noResponse: true,
                action: () => this.rcon.reloadBans(),
            })],
            ['readbantxt', RequestTemplate.build({
                method: 'get',
                level: 'moderate',
                disableDiscord: true,
                action: /* istanbul ignore next */ () => this.rcon.readBanTxt(),
            })],
            ['bantxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.banTxt(params.steamid),
            })],
            ['unbantxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.unbanTxt(params.steamid),
            })],
            ['readprioritytxt', RequestTemplate.build({
                method: 'get',
                level: 'moderate',
                disableDiscord: true,
                action: /* istanbul ignore next */ () => this.rcon.readPriorityTxt(),
            })],
            ['prioritytxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.priorityTxt(params.steamid),
            })],
            ['unprioritytxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.unpriorityTxt(params.steamid),
            })],
            ['readwhitelisttxt', RequestTemplate.build({
                method: 'get',
                level: 'moderate',
                disableDiscord: true,
                action: /* istanbul ignore next */ () => this.rcon.readWhitelistTxt(),
            })],
            ['whitelisttxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.whitelistTxt(params.steamid),
            })],
            ['unwhitelisttxt', RequestTemplate.build({
                method: 'post',
                level: 'moderate',
                params: [{ name: 'steamid' }],
                noResponse: true,
                action: /* istanbul ignore next */ (req, params) => this.rcon.unwhitelistTxt(params.steamid),
            })],
            ['restart', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                params: [{ name: 'force', optional: true, parse: parseBoolean }],
                noResponse: true,
                action: (req, params) => this.monitor.killServer(!!params.force && params.force !== 'false'),
            })],
            ['isrestartlocked', RequestTemplate.build({
                method: 'get',
                level: 'view',
                action: () => this.monitor.restartLock,
            })],
            ['lockrestart', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                noResponse: true,
                action: () => this.monitor.restartLock = true,
            })],
            ['unlockrestart', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                noResponse: true,
                action: () => this.monitor.restartLock = false,
            })],
            ['metrics', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'type', location: 'query' }, { name: 'since', optional: true, location: 'query', parse: parseNumber }],
                action: (req, params) => this.metrics.fetchMetrics(params.type, params.since ? Number(params.since) : undefined),
            })],
            ['deleteMetrics', RequestTemplate.build({
                method: 'delete',
                level: 'admin',
                disableDiscord: true,
                params: [{name: 'maxAgeDays'}],
                noResponse: true,
                action: (req, params) => {
                    const days = Number(params.maxAgeDays);
                    if (days > 0) {
                        this.metrics.deleteMetrics(days * 24 * 60 * 60 * 1000);
                    }
                },
            })],
            ['logs', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'type', location: 'query' }, { name: 'since', optional: true, location: 'query', parse: parseNumber }],
                action: (req, params) => this.logReader.fetchLogs(params.type, params.since ? Number(params.since) : undefined),
            })],
            ['login', RequestTemplate.build({
                method: 'post',
                level: 'view',
                disableDiscord: true,
                action: (req) => {
                    const userLevel = this.manager.getUserLevel(req.user);
                    if (userLevel) {
                        this.log.log(LogLevel.IMPORTANT, `User ${req.user} logged in`);
                    }
                    return userLevel;
                },
            })],
            ['config', RequestTemplate.build({
                method: 'get',
                level: 'admin',
                disableDiscord: true,
                action: () => this.configFileHelper.getRedactedConfig(),
            })],
            ['configdocument', RequestTemplate.build({
                method: 'get',
                level: 'admin',
                disableDiscord: true,
                action: () => this.configFileHelper.getRevisionedConfig(),
            })],
            ['validateconfig', RequestTemplate.build({
                method: 'post',
                level: 'admin',
                disableDiscord: true,
                params: [{ name: 'config' }],
                action: (req, params) => {
                    const errors = this.configFileHelper.validateConfigContent(params.config);
                    return { valid: errors.length === 0, errors };
                },
            })],
            ['updateconfig', RequestTemplate.build({
                method: 'post',
                level: 'admin',
                disableDiscord: true,
                params: [{ name: 'config' }, { name: 'revision', optional: true }],
                action: (req, params) => {
                    try {
                        this.configFileHelper.writeConfig(params.config, params.revision);
                        return true;
                    } catch (e) {
                        if (e instanceof ConfigRevisionConflictError) {
                            throw new Response(HTTP.HTTP_STATUS_CONFLICT, e.message);
                        }
                        throw new Response(HTTP.HTTP_STATUS_BAD_REQUEST, e);
                    }
                },
            })],
            ['updatemods', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'validate', optional: true, parse: parseBoolean }, { name: 'force', optional: true, parse: parseBoolean }],
                action: (req, params) => this.steamCmd.updateAllMods({
                    validate: params?.validate,
                    force: params?.force,
                }),
            })],
            ['updateserver', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'validate', optional: true, parse: parseBoolean }],
                action: (req, params) => this.steamCmd.updateServer({
                    validate: params?.validate,
                }),
            })],
            ['backup', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                noResponse: true,
                action: () => this.createTrackedOperation(
                    'backup.create',
                    'missions',
                    async () => {
                        if (!await this.backup.createBackup()) {
                            throw new SafeOperationError('MISSIONS_NOT_FOUND', 'Mission directory does not exist');
                        }
                    },
                ),
            })],
            ['getbackups', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                action: () => this.backup.getBackups(),
            })],
            ['createbackup', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                action: () => this.createTrackedOperation(
                    'backup.create',
                    'missions',
                    async () => {
                        const created = await this.backup.createBackup();
                        if (!created) {
                            throw new SafeOperationError('MISSIONS_NOT_FOUND', 'Mission directory does not exist');
                        }
                    },
                ),
            })],
            ['restorebackup', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [
                    { name: 'id' },
                    { name: 'createBackup', optional: true, parse: parseBoolean },
                    { name: 'restart', optional: true, parse: parseBoolean },
                ],
                action: (req, params) => this.createTrackedOperation(
                    'backup.restore',
                    'missions',
                    () => this.restoreBackup(
                        params.id,
                        parseBoolean(params.createBackup),
                        parseBoolean(params.restart),
                    ),
                ),
            })],
            ['operations', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'limit', optional: true, location: 'query', parse: parseNumber }],
                action: (req, params) => this.operations.listOperations(parseNumber(params.limit)),
            })],
            ['operation', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'id', location: 'query' }],
                action: (req, params) => this.operations.getOperation(params.id),
            })],
            ['nodes', RequestTemplate.build({
                method: 'get',
                level: 'view',
                disableDiscord: true,
                action: () => this.nodeRegistry.list(),
            })],
            ['fleetdispatch', RequestTemplate.build({
                method: 'post',
                level: 'view',
                disableDiscord: true,
                params: [
                    { name: 'nodeId' },
                    { name: 'resource' },
                    { name: 'body', optional: true },
                    { name: 'query', optional: true },
                ],
                action: (req, params) => this.dispatchFleetCommand(req, params),
            })],
            ['fleethealth', RequestTemplate.build({
                method: 'get',
                level: 'view',
                disableDiscord: true,
                disableRest: true,
                action: () => ({ healthy: true, nodeId: String(this.manager.config.instanceId) }),
            })],
            ['writemissionfile', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'file' }, { name: 'content' }, { name: 'createBackup', optional: true, parse: parseBoolean }],
                noResponse: true,
                action: (req, params) => this.missionFiles.writeMissionFile(
                    params.file,
                    params.content,
                    params.createBackup,
                ),
            })],
            ['readmissionfile', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'file', location: 'query' }],
                action: (req, params) => this.missionFiles.readMissionFile(params.file),
            })],
            ['readmissionfiles', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'files' }],
                action: (req, params) => Promise.all(params.files.map((x: string) => this.missionFiles.readMissionFile(x))),
            })],
            ['readmissiondir', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'dir', location: 'query' }],
                action: async (req, params) => this.missionFiles.readMissionDir(params.dir),
            })],
            ['writeprofilefile', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'file' }, { name: 'content' }, { name: 'createBackup', optional: true, parse: parseBoolean }],
                noResponse: true,
                action: (req, params) => this.missionFiles.writeProfileFile(
                    params.file,
                    params.content,
                    params.createBackup,
                ),
            })],
            ['readprofilefile', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'file', location: 'query' }],
                action: (req, params) => this.missionFiles.readProfileFile(params.file),
            })],
            ['readprofilefiles', RequestTemplate.build({
                method: 'post',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'files' }],
                action: (req, params) => Promise.all(params.files.map((x: string) => this.missionFiles.readProfileFile(x))),
            })],
            ['readprofiledir', RequestTemplate.build({
                method: 'get',
                level: 'manage',
                disableDiscord: true,
                params: [{ name: 'dir', location: 'query' }],
                action: async (req, params) => this.missionFiles.readProfileDir(params.dir),
            })],
            ['serverinfo', RequestTemplate.build({
                method: 'get',
                level: 'view',
                disableDiscord: true,
                action: () => this.manager.getServerInfo(),
            })],
        ]);
    }

    private handleExecutionError(req: Request, error: any): Response {
        const errorMsg = `Error executing interface action: ${req.resource}`;
        this.log.log(LogLevel.ERROR, errorMsg, error);
        if (error instanceof Response) {
            return error;
        }
        if (error instanceof OperationConflictError) {
            return new Response(HTTP.HTTP_STATUS_CONFLICT, {
                message: error.message,
                operation: error.operation,
            });
        }
        return new Response(
            HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            errorMsg,
        );
    }

    private acceptsText(req: Request): boolean {
        return !!req?.accept?.startsWith('text');
    }

    private getDayZProcesses = async (req: Request): Promise<any> => {
        const result = await this.serverDetector.getDayZProcesses();
        if (!result?.length) {
            throw new Response(
                HTTP.HTTP_STATUS_NOT_FOUND,
                'Could not find any processes ¯\\_(ツ)_/¯',
            );
        }
        if (this.acceptsText(req)) {
            return makeTable([
                ['Name', 'PID', 'Created', 'Path'],
                ...result.map((x) => [
                    x.Name,
                    x.ProcessId,
                    x.CreationDate,
                    x.ExecutablePath,
                ]),
            ]).join('\n');
        }
        return result;
    };

    private getSystemReport = async (req: Request): Promise<any> => {
        const result = await this.systemReporter.getSystemReport();
        if (!result) {
            throw new Response(HTTP.HTTP_STATUS_NOT_FOUND, 'Could not determine system state');
        }
        return this.acceptsText(req) ? result.format() : result;
    };

    private getPlayers = async (req: Request): Promise<any> => {
        if (this.acceptsText(req)) {
            return this.rcon.getPlayersRaw();
        }
        return this.rcon.getPlayers();
    };

    private getBans = async (req: Request): Promise<any> => {
        if (this.acceptsText(req)) {
            return this.rcon.getBansRaw();
        }
        return this.rcon.getBans();
    };

    private createTrackedOperation(type: string, resource: string, action: () => Promise<void>): TrackedOperation {
        const operation = this.operations.createOperation(type, resource);
        void this.runTrackedOperation(operation.id, action);
        return operation;
    }

    private async runTrackedOperation(id: string, action: () => Promise<void>): Promise<void> {
        this.operations.startOperation(id);
        try {
            await action();
            this.operations.succeedOperation(id);
        } catch (error) {
            this.operations.failOperation(id, error);
        }
    }

    private async restoreBackup(id: string, createBackup: boolean, restart: boolean): Promise<void> {
        if (!restart && await this.serverDetector.isServerRunning()) {
            throw new SafeOperationError('SERVER_RUNNING', 'Server must be stopped before restoring a backup');
        }

        const previousRestartLock = this.monitor.restartLock;
        this.monitor.restartLock = true;
        try {
            if (restart) {
                if (!await this.monitor.killServer(true) || await this.serverDetector.isServerRunning()) {
                    throw new SafeOperationError('SERVER_STOP_FAILED', 'Could not stop server for backup restore');
                }
            }
            if (createBackup && !await this.backup.createBackup()) {
                throw new SafeOperationError('MISSIONS_NOT_FOUND', 'Mission directory does not exist');
            }
            await this.backup.restoreBackup(id);
            if (restart && !await this.monitor.startServer()) {
                throw new SafeOperationError('SERVER_START_FAILED', 'Backup restored but the server could not be restarted');
            }
        } finally {
            this.monitor.restartLock = previousRestartLock;
        }
    }

    private redactAuditRequest(req: Request): Request {
        const auditRequest = Object.assign(new Request(), req);
        if (!req.body) {
            return auditRequest;
        }
        if (['updateconfig', 'validateconfig', 'writemissionfile', 'writeprofilefile'].includes(req.resource)) {
            auditRequest.body = '[REDACTED]';
            return auditRequest;
        }
        auditRequest.body = this.redactAuditValue(req.body);
        if (req.resource === 'fleetdispatch'
            && ['updateconfig', 'validateconfig', 'writemissionfile', 'writeprofilefile'].includes(auditRequest.body.resource)) {
            auditRequest.body.body = '[REDACTED]';
        }
        return auditRequest;
    }

    private redactAuditValue(value: any): any {
        if (!value || typeof value !== 'object') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((entry) => this.redactAuditValue(entry));
        }
        return Object.keys(value).reduce((redacted: Record<string, any>, key) => {
            redacted[key] = /(password|secret|token|api.?key)/i.test(key)
                ? '[REDACTED]'
                : this.redactAuditValue(value[key]);
            return redacted;
        }, {} as Record<string, any>);
    }

    private hasLevel(actual: UserLevel, required: UserLevel): boolean {
        const levels: UserLevel[] = ['admin', 'manage', 'moderate', 'view'];
        return levels.includes(actual) && levels.indexOf(actual) <= levels.indexOf(required);
    }

    private async dispatchFleetCommand(req: Request, params: Record<string, any>): Promise<any> {
        if (params.resource === 'fleetdispatch') {
            throw new Response(HTTP.HTTP_STATUS_BAD_REQUEST, 'Recursive fleet dispatch is forbidden');
        }
        const target = this.commandMap.get(params.resource);
        if (!target || target.disableRest || !req.user || !this.manager.isUserOfLevel(req.user, target.level)) {
            throw new Response(HTTP.HTTP_STATUS_UNAUTHORIZED, 'You are not allowed to dispatch that command');
        }
        const authorizationLevel = this.manager.getUserLevel(req.user);
        const command: FleetCommand = {
            resource: params.resource,
            method: target.method,
            body: params.body,
            query: params.query,
            requiredCapability: params.resource,
            authorizationLevel,
            requestedBy: req.user,
        };
        const response = await this.fleetDispatcher.dispatch<Response>(
            params.nodeId,
            command,
            (localCommand) => this.executeFleetCommand(localCommand, String(this.manager.config.instanceId)),
        );
        if (response.status >= HTTP.HTTP_STATUS_BAD_REQUEST) {
            throw response;
        }
        return response.body;
    }

    public async executeFleetCommand(command: FleetCommand, sourceNodeId: string): Promise<Response> {
        if (command.resource === 'fleetdispatch') {
            return new Response(HTTP.HTTP_STATUS_BAD_REQUEST, 'Recursive fleet dispatch is forbidden');
        }
        const target = this.commandMap.get(command.resource);
        if (!target
            || command.method !== target.method
            || (target.disableRest && command.resource !== 'fleethealth')
            || !this.hasLevel(command.authorizationLevel, target.level)) {
            return new Response(HTTP.HTTP_STATUS_UNAUTHORIZED, 'Fleet command is not authorized');
        }

        const request = new Request();
        request.resource = command.resource;
        request.body = command.body;
        request.query = command.query;
        request.fleet = {
            authenticated: true,
            sourceNodeId,
            authorizationLevel: command.authorizationLevel,
            requestedBy: command.requestedBy,
        };
        return this.execute(request);
    }

    // apply RBAC and audit
    private async actionRbacCheck(req: Request, x: RequestTemplate): Promise<Response | null> {
        if (x.level) {
            const fleetAuthorized = req.fleet?.authenticated
                && this.hasLevel(req.fleet.authorizationLevel, x.level);
            const user = this.manager.config?.admins?.find((admin) => admin.userId === req.user);
            if (!fleetAuthorized && (!user || !req.user || !this.manager.isUserOfLevel(req.user, x.level))) {
                return new Response(
                    HTTP.HTTP_STATUS_UNAUTHORIZED,
                    'You are not allowed to do that',
                );
            }

            if (req.resource && x.method !== 'get') {
                const auditUser = req.fleet
                    ? `fleet:${req.fleet.sourceNodeId}:${req.fleet.requestedBy}`
                    : user.userId;
                void this.metrics.pushMetricValue(
                    'AUDIT',
                    {
                        timestamp: new Date().valueOf(),
                        user: auditUser,
                        value: this.redactAuditRequest(req),
                    },
                );

                if (req.resource !== 'global') {
                    this.log.log(
                        LogLevel.IMPORTANT,
                        `User '${auditUser}' executed: ${req.resource}`,
                    );
                }
            }
        }
    }

    // apply Init Lock
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async actionInitCheck(req: Request): Promise<Response | null> {
        if (!this.manager.initDone) {
            return new Response(
                HTTP.HTTP_STATUS_LOCKED,
                'The ServerManager is currently starting...',
            );
        }
        return null;
    }

    private async actionParamsCheck(req: Request, template: RequestTemplate): Promise<Response | null> {
        for (const param of template.params || []) {
            const paramVal = req[param.location || 'body']?.[param.name];
            if (!param.optional && !paramVal) {
                return new Response(HTTP.HTTP_STATUS_BAD_REQUEST, `Missing param ${param.name}`);
            }
        }
        return null;
    }

    public async execute(req: Request, responsePartHandler?: ResponsePartHandler): Promise<Response> {
        if (!req.resource || !this.commandMap.has(req.resource)) {
            return new Response(
                HTTP.HTTP_STATUS_BAD_REQUEST,
                'Unkown action',
            );
        }

        const template = this.commandMap.get(req.resource);

        const interceptors: ((r: Request, t: RequestTemplate) => Promise<Response | null>)[] = [
            (r) => this.actionInitCheck(r),
            (r, t) => this.actionRbacCheck(r, t),
            (r, t) => this.actionParamsCheck(r, t),
        ];

        for (const interceptor of interceptors) {
            const resp = await interceptor(req, template);
            if (resp) {
                return resp;
            }
        }

        const resolvedParams = {} as Record<string, any>;
        template.params.forEach(
            (param) => {
                resolvedParams[param.name] = req[param.location || 'body']?.[param.name];
            },
        );

        /* istanbul ignore next */
        const responsePartHandlerWrapper: ResponsePartHandler = async (part) => {
            return (req.canStream && responsePartHandler) ? responsePartHandler(part) : undefined;
        }

        try {
            if (template.noResponse) {
                await template.action(req, resolvedParams, { partialResponseCallback: responsePartHandlerWrapper });
                return new Response(
                    HTTP.HTTP_STATUS_OK,
                    'Done',
                );
            } else {
                const result = await template.action(req, resolvedParams, { partialResponseCallback: responsePartHandlerWrapper });
                if (!result) {
                    return new Response(HTTP.HTTP_STATUS_NOT_FOUND, 'Action had no results');
                }
                return new Response(HTTP.HTTP_STATUS_OK, result);
            }
        } catch (e) {
            return this.handleExecutionError(req, e);
        }
    }

}
