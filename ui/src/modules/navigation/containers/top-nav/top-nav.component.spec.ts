import { Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject, of } from 'rxjs';

import { ServerInfo } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import { FleetContextService } from '../../../app-common/services/fleet-context.service';
import { AuthService } from '../../../auth/services/auth.service';
import { SBRouteData } from '../../models';
import { NavigationService } from '../../services/navigation.service';
import { TopNavComponent } from './top-nav.component';

const routeData = new BehaviorSubject<SBRouteData>({ breadcrumbs: [] });

@Component({
    template: `
        <sb-top-nav [someInput]="someInput" (someFunction)="someFunction($event)"></sb-top-nav>
    `,
})
class TestHostComponent {
    // someInput = 1;
    // someFunction(event: Event) {}
}

describe('TopNavComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponent: TestHostComponent;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    let component: TopNavComponent;
    let componentDE: DebugElement;
    let componentNE: Element;

    let navigationService: NavigationService;
    let auth: jasmine.SpyObj<AuthService>;
    let appCommon: jasmine.SpyObj<AppCommonService>;

    beforeEach(() => {
        routeData.next({ breadcrumbs: [] });
        const navigationServiceStub = {
            routeData$: () => routeData.asObservable(),
            toggleSideNav: jasmine.createSpy('toggleSideNav'),
        };
        auth = jasmine.createSpyObj<AuthService>('AuthService', ['logout', 'getAuthHeaders']);
        auth.getAuthHeaders.and.returnValue({});
        appCommon = jasmine.createSpyObj<AppCommonService>(
            'AppCommonService',
            ['adjustRefreshRate', 'triggerUpdate', 'fetchServerInfo'],
            { refreshRate: 30, SERVER_INFO: new BehaviorSubject<ServerInfo | undefined>(undefined) },
        );
        appCommon.fetchServerInfo.and.returnValue(of({} as ServerInfo));
        const fleetContextStub = {
            activeNode$: new BehaviorSubject(undefined),
            load: jasmine.createSpy('load').and.returnValue(Promise.resolve()),
        };

        TestBed.configureTestingModule({
            declarations: [TestHostComponent, TopNavComponent],
            imports: [FormsModule, NoopAnimationsModule],
            providers: [
                { provide: NavigationService, useValue: navigationServiceStub },
                { provide: AuthService, useValue: auth },
                { provide: AppCommonService, useValue: appCommon },
                { provide: FleetContextService, useValue: fleetContextStub },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        hostComponent = fixture.componentInstance;
        hostComponentDE = fixture.debugElement;
        hostComponentNE = hostComponentDE.nativeElement;

        componentDE = hostComponentDE.children[0];
        component = componentDE.componentInstance;
        componentNE = componentDE.nativeElement;

        navigationService = TestBed.inject(NavigationService);

        fixture.detectChanges();
    });

    it('should display the component', () => {
        expect(hostComponentNE.querySelector('sb-top-nav')).toEqual(jasmine.anything());
    });

    it('uses the current route breadcrumb as its title', () => {
        routeData.next({ breadcrumbs: [{ text: 'System' }] });

        expect(component.title).toBe('System');
    });

    it('forwards manual refresh requests', () => {
        component.refreshNow();

        expect(appCommon.triggerUpdate).toHaveBeenCalled();
    });
});
