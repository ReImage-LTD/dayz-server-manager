import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import * as commentJson from 'comment-json';

import { Config } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
    let fixture: ComponentFixture<SettingsComponent>;
    let component: SettingsComponent;
    let appCommon: jasmine.SpyObj<AppCommonService>;
    let config: Config;

    beforeEach(waitForAsync(() => {
        config = new Config();
        appCommon = jasmine.createSpyObj<AppCommonService>('AppCommonService', [
            'fetchManagerConfig',
            'updateManagerConfig',
        ]);
        appCommon.fetchManagerConfig.and.returnValue(of(commentJson.stringify(config)));
        appCommon.updateManagerConfig.and.returnValue(of(undefined));

        TestBed.configureTestingModule({
            declarations: [SettingsComponent],
            imports: [FormsModule],
            providers: [
                { provide: AppCommonService, useValue: appCommon },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        }).compileComponents();
    }));

    beforeEach(fakeAsync(() => {
        fixture = TestBed.createComponent(SettingsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        tick();
        fixture.detectChanges();
    }));

    it('renders the operations sections and protects credentials', () => {
        const element = fixture.nativeElement as HTMLElement;

        expect(element.querySelectorAll('.settings-section').length).toBe(8);
        expect(element.querySelector<HTMLInputElement>('#discordBotToken')?.type).toBe('password');
        expect(element.querySelector<HTMLInputElement>('#rconPassword')?.type).toBe('password');
        expect(element.querySelector<HTMLInputElement>('#steamPassword')?.type).toBe('password');
    });

    it('submits the current configuration through AppCommonService', fakeAsync(() => {
        component.config.instanceId = 'test-instance';

        component.onSubmit();
        tick();

        expect(appCommon.updateManagerConfig).toHaveBeenCalled();
        expect(appCommon.updateManagerConfig.calls.mostRecent().args[0]).toContain('test-instance');
        expect(component.outcomeBadge).toEqual({
            message: 'Successfully updated config',
            success: true,
        });
    }));

    it('adds and removes custom server.cfg entries without submitting', () => {
        const initialCount = component.serverCfgProps?.length || 0;

        component.addCustomServerCfgEntry('customField', 'string');

        expect(component.serverCfgProps?.length).toBe(initialCount + 1);
        expect(component.config.serverCfg['customField']).toBe('');

        const customProperty = component.serverCfgProps?.find((prop) => prop.name === 'customField');
        expect(customProperty).toBeDefined();
        component.removeCustomServerCfgEntry(customProperty!);

        expect(component.serverCfgProps?.length).toBe(initialCount);
        expect(component.config.serverCfg['customField']).toBeUndefined();
        expect(appCommon.updateManagerConfig).not.toHaveBeenCalled();
    });
});
