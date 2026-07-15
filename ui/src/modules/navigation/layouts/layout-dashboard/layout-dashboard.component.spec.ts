import { ChangeDetectorRef, Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';

import { NavigationService } from '../../services/navigation.service';
import { LayoutDashboardComponent } from './layout-dashboard.component';

const sideNavVisible = new BehaviorSubject(true);
const navigationServiceStub = {
    sideNavVisible$: () => sideNavVisible.asObservable(),
};

@Component({
    template: `
        <sb-layout-dashboard
            [someInput]="someInput"
            (someFunction)="someFunction($event)"
        ></sb-layout-dashboard>
    `,
})
class TestHostComponent {
    // someInput = 1;
    // someFunction(event: Event) {}
}

describe('LayoutDashboardComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponent: TestHostComponent;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    let component: LayoutDashboardComponent;
    let componentDE: DebugElement;
    let componentNE: Element;

    let navigationService: NavigationService;

    beforeEach(() => {
        sideNavVisible.next(true);
        TestBed.configureTestingModule({
            declarations: [TestHostComponent, LayoutDashboardComponent],
            imports: [NoopAnimationsModule],
            providers: [
                { provide: NavigationService, useValue: navigationServiceStub },
                ChangeDetectorRef,
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
        expect(hostComponentNE.querySelector('sb-layout-dashboard')).toEqual(jasmine.anything());
    });

    it('reflects side navigation visibility', () => {
        sideNavVisible.next(false);

        expect(component.sideNavHidden).toBe(true);
    });
});
