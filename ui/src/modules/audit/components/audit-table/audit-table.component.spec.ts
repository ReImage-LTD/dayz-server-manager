import { DecimalPipe } from '@angular/common';
import { Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';

import { AuditService } from '../../services/audit.service';
import { AuditTableComponent } from './audit-table.component';

@Component({
    template: `
        <sb-audit-table></sb-audit-table>
    `,
})
class TestHostComponent {
    // someInput = 1;
    // someFunction(event: Event) {}
}

describe('AuditTableComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponent: TestHostComponent;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    let component: AuditTableComponent;
    let componentDE: DebugElement;
    let componentNE: Element;

    const auditService = {
        audits$: new BehaviorSubject([]),
        total$: new BehaviorSubject(0),
        loading$: new BehaviorSubject(false),
        page: 1,
        pageSize: 4,
        searchTerm: '',
        sortColumn: 'timestamp',
        sortDirection: '',
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [TestHostComponent, AuditTableComponent],
            imports: [FormsModule, NoopAnimationsModule],
            providers: [DecimalPipe, { provide: AuditService, useValue: auditService }],
            schemas: [NO_ERRORS_SCHEMA],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        hostComponent = fixture.componentInstance;
        hostComponentDE = fixture.debugElement;
        hostComponentNE = hostComponentDE.nativeElement;

        componentDE = hostComponentDE.children[0];
        component = componentDE.componentInstance;
        componentNE = componentDE.nativeElement;

        fixture.detectChanges();
    });

    it('should display the component', () => {
        expect(hostComponentNE.querySelector('sb-audit-table')).toEqual(jasmine.anything());
        expect(auditService.pageSize).toBe(component.MAX_ITEMS);
    });

    it('maps request accept headers to their trigger', () => {
        expect(component.mapTrigger('application/json')).toBe('API/Web');
        expect(component.mapTrigger('text/plain')).toBe('Discord');
        expect(component.mapTrigger()).toBe('Unknown');
    });
});
