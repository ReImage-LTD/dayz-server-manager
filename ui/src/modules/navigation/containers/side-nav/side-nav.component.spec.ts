import { Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { FleetContextService } from '../../../app-common/services/fleet-context.service';
import { NavigationService } from '../../services/navigation.service';
import { SideNavComponent } from './side-nav.component';

const navigationServiceStub = {};

@Component({
    template: `
        <sb-side-nav [someInput]="someInput" (someFunction)="someFunction($event)"></sb-side-nav>
    `,
})
class TestHostComponent {
    // someInput = 1;
    // someFunction(event: Event) {}
}

describe('SideNavComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponent: TestHostComponent;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    let component: SideNavComponent;
    let componentDE: DebugElement;
    let componentNE: Element;

    let navigationService: NavigationService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [TestHostComponent, SideNavComponent],
            imports: [FormsModule, NoopAnimationsModule],
            providers: [
                { provide: NavigationService, useValue: navigationServiceStub },
                {
                    provide: FleetContextService,
                    useValue: {
                        activeNode$: new BehaviorSubject(undefined),
                        nodes$: new BehaviorSubject([]),
                        select: jasmine.createSpy('select'),
                    },
                },
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
        expect(hostComponentNE.querySelector('sb-side-nav')).toEqual(jasmine.anything());
        expect(component.navigationService).toBe(navigationService);
    });
});
