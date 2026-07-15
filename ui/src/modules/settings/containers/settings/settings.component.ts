import { Component, OnInit } from '@angular/core';
import { Config, DiscordChannelType, Event, Hook, RemoteNodeConfig, WorkshopMod } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import * as commentJson from 'comment-json';
import { firstValueFrom } from 'rxjs';

import configschema from '../../../../../../src/config/config.schema.json';

type ServerCfgKey = Extract<keyof typeof configschema.definitions.ServerCfg.properties, string>;

interface Property {
    name: string;
    description: string;
    enum?: (string | number)[];
    type: 'number' | 'string' | 'boolean';
    default: any;
    custom?: boolean;
}

@Component({
    standalone: false,
    selector: 'sb-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['settings.component.scss'],
})
export class SettingsComponent implements OnInit {

    public schema = configschema;

    public config!: Config;
    public loading = true;

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    public serverCfgProps?: Property[];

    public constructor(
        public appCommon: AppCommonService,
    ) {}

    public onSubmit(): void {
        if (!this.isConfigComplete()) {
            this.outcomeBadge = { message: 'Complete all required repeatable settings before saving', success: false };
            return;
        }
        this.loading = true;
        this.outcomeBadge = undefined;
        firstValueFrom(this.appCommon.updateManagerConfig(
            commentJson.stringify(this.config),
        )).then(
            () => {
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Successfully updated config',
                    success: true,
                };
            },
            (err) => {
                console.error(err);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Failed to update config. See manager logs for details',
                    success: false,
                };
            },
        );
    }

    public ngOnInit(): void {
        this.reset();
    }

    public reset(): void {
        this.loading = true;
        this.outcomeBadge = undefined;
        firstValueFrom(this.appCommon.fetchManagerConfig()).then(
            (config) => {
                this.config = commentJson.parse(config) as any;
                if (this.config.discordChannels?.length) {
                    this.config.discordChannels = this.config.discordChannels.map((x) => {
                        if (typeof x.mode === 'string') {
                            x.mode = [x.mode];
                        }
                        return x;
                    });
                }
                this.config.admins = this.config.admins || [];
                this.config.events = (this.config.events || []).map((event) => ({
                    ...event,
                    params: event.params || [],
                }));
                this.config.hooks = (this.config.hooks || []).map((hook) => ({
                    ...hook,
                    params: hook.params || [],
                }));

                if (this.config.serverCfg) {
                    this.serverCfgProps = this.getServerCfgProps(this.config);
                } else {
                    this.serverCfgProps = [];
                }

                this.loading = false;
            },
            (err) => {
                console.error(err);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Failed to load config. See manager logs for details',
                    success: false,
                };
            },
        );
    }

    public getDiscordChannels(): {
        channel: string;
        mode: DiscordChannelType[];
    }[] {
        return this.config.discordChannels as any;
    }

    public addDiscordChannel(): void {
        this.config.discordChannels.push({
            channel: '',
            mode: ['admin'],
        });
    }

    public addWorkshopMod(): void {
        this.config.steamWsMods.push({
            name: '',
            workshopId: '',
        });
    }

    public addAdmin(): void {
        this.config.admins.push({
            userId: '',
            userLevel: 'view',
            password: '',
        });
    }

    public addEvent(): void {
        this.config.events.push({
            name: '',
            type: 'message',
            cron: '',
            params: [],
        });
    }

    public addHook(): void {
        this.config.hooks.push({
            type: 'beforeStart',
            program: '',
            params: [],
        });
    }

    public addRemoteNode(): void {
        this.config.remoteNodes.push({
            id: '',
            name: '',
            endpoint: '',
            sharedSecret: '',
            capabilities: ['serverinfo', 'system', 'players', 'logs', 'metrics'],
            authorizationLevel: 'view',
        });
    }

    public setNodeCapabilities(node: RemoteNodeConfig, value: string): void {
        node.capabilities = this.parseParams(value);
    }

    public isConfigComplete(): boolean {
        return this.config.admins.every((admin) => !!admin.userId.trim() && !!admin.password)
            && this.config.remoteNodes.every((node) => !!node.id.trim() && !!node.name.trim()
                && !!node.endpoint.trim() && !!node.sharedSecret && node.capabilities.length > 0)
            && this.config.events.every((event) => !!event.name.trim() && !!event.cron.trim())
            && this.config.hooks.every((hook) => !!hook.program.trim());
    }

    public setEventParams(event: Event, value: string): void {
        event.params = this.parseParams(value);
    }

    public setHookParams(hook: Hook, value: string): void {
        hook.params = this.parseParams(value);
    }

    private parseParams(value: string): string[] {
        return value.split(',').map((part) => part.trim()).filter((part) => !!part);
    }

    public isWorkshopMod(mod: string | WorkshopMod): mod is WorkshopMod {
        return typeof mod !== 'string';
    }

    private getServerCfgProps(config: Config): Property[] {
        const fixedKeys = ['motd', 'motdInterval', 'Missions'] as ServerCfgKey[];

        const known = (this.schema.definitions.ServerCfg.propertyOrder as ServerCfgKey[])
            .filter((x) => {
                const { type } = this.schema.definitions.ServerCfg.properties[x];

                const included = ['string', 'number'].includes(type)
                    && !fixedKeys.includes(x);

                return included;
            })
            .map((x) => ({
                ...(this.schema.definitions.ServerCfg.properties[x] as Property),
                name: x,
            }));

        const unknown = Object.keys(config.serverCfg || {})
            .filter((key) => !known.some((knownKey) => knownKey.name === key) && !fixedKeys.includes(key as ServerCfgKey) && ['string', 'number'].includes(typeof config.serverCfg[key]))
            .map((key) => {
                return {
                    name: key as ServerCfgKey,
                    description: '',
                    type: typeof config.serverCfg[key] as 'string' | 'number',
                    default: typeof config.serverCfg[key] === 'string' ? '' : 0,
                    custom: true,
                };
            });

        return [...known, ...unknown];
    }

    public addCustomServerCfgEntry(name: string, type: 'string' | 'number'): void {
        const trimmedName = name.trim();

        if (trimmedName.length < 3) {
            this.outcomeBadge = {
                message: 'Custom field names must be at least 3 characters long',
                success: false,
            };
            return;
        }

        if (this.serverCfgProps?.some((prop) => prop.name === trimmedName)) {
            this.outcomeBadge = {
                message: `A server.cfg field named ${trimmedName} already exists`,
                success: false,
            };
            return;
        }

        this.serverCfgProps?.push({
            name: trimmedName,
            description: '',
            type,
            default: type === 'string' ? '' : 0,
            custom: true,
        });
        this.config.serverCfg[trimmedName] = type === 'string' ? '' : 0;
        this.outcomeBadge = undefined;
    }

    public removeCustomServerCfgEntry(prop: Property): void {
        if (!prop.custom) {
            return;
        }

        this.serverCfgProps = this.serverCfgProps?.filter((entry) => entry !== prop);
        delete this.config.serverCfg[prop.name];
    }

}
