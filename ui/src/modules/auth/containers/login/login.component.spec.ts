import { Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

import { LoginComponent } from './login.component';

@Component({
    template: `
        <sb-login [someInput]="someInput" (someFunction)="someFunction($event)"></sb-login>
    `,
})
class TestHostComponent {
    // someInput = 1;
    // someFunction(event: Event) {}
}

describe('LoginComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponent: TestHostComponent;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    let component: LoginComponent;
    let componentDE: DebugElement;
    let componentNE: Element;
    let auth: jasmine.SpyObj<AuthService>;
    let router: jasmine.SpyObj<Router>;

    beforeEach(() => {
        auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
        router = jasmine.createSpyObj<Router>('Router', ['navigate']);

        TestBed.configureTestingModule({
            declarations: [TestHostComponent, LoginComponent],
            imports: [FormsModule, NoopAnimationsModule],
            providers: [
                { provide: AuthService, useValue: auth },
                { provide: Router, useValue: router },
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

        fixture.detectChanges();
    });

    it('should display the component', () => {
        expect(hostComponentNE.querySelector('sb-login')).toEqual(jasmine.anything());
    });

    it('uses a semantic form and secure autocomplete fields', () => {
        const form = componentNE.querySelector('form');
        const username = componentNE.querySelector('#inputUser');
        const password = componentNE.querySelector('#inputPassword');
        const button = componentNE.querySelector('button');

        expect(form).toEqual(jasmine.anything());
        expect(username && username.getAttribute('autocomplete')).toBe('username');
        expect(password && password.getAttribute('autocomplete')).toBe('current-password');
        expect(button && button.getAttribute('type')).toBe('submit');
    });

    it('authenticates once and navigates to the dashboard', async () => {
        auth.login.and.returnValue(Promise.resolve());
        router.navigate.and.returnValue(Promise.resolve(true));
        component.username = 'operator';
        component.password = 'secret';
        component.remember = true;

        const login = component.login();
        expect(component.isLoading).toBe(true);
        await component.login();
        await login;

        expect(auth.login).toHaveBeenCalledOnceWith('operator', 'secret', true);
        expect(router.navigate).toHaveBeenCalledOnceWith(['/dashboard']);
        expect(component.isLoading).toBe(false);
    });

    it('shows a clear error and resets loading after a failed login', async () => {
        auth.login.and.returnValue(Promise.reject(new Error('Unauthorized')));
        component.username = 'operator';
        component.password = 'wrong';
        spyOn(console, 'error');

        await component.login();

        expect(component.failure).toContain('Check your username and password');
        expect(component.isLoading).toBe(false);
        fixture.detectChanges();
        expect(componentNE.querySelector('[role="alert"]')).toEqual(jasmine.anything());
    });
});
