import { NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppCommonService } from '../../../../modules/app-common/services/app-common.service';
import { LogMonitorComponent } from './log-monitor.component';

describe('LogMonitorComponent', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('scrolls to the latest entry when following is resumed', () => {
        const zone = { run: (work: () => void): void => work() } as unknown as NgZone;
        const component = new LogMonitorComponent(
            zone,
            {} as unknown as AppCommonService,
            {} as unknown as ActivatedRoute,
        );
        const element = { scrollHeight: 500, scrollTop: 0 };
        component.container = { elementRef: { nativeElement: element } };
        component.lockToEnd = false;

        component.toggleLock();
        jasmine.clock().tick(1);

        expect(component.lockToEnd).toBeTrue();
        expect(element.scrollTop).toBe(500);
        component.ngOnDestroy();
    });
});
