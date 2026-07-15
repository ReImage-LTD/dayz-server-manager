import { LogsComponent } from './logs.component';

describe('LogsComponent', () => {
    it('creates the log stream container', () => {
        const component = new LogsComponent();

        component.ngOnInit();

        expect(component).toBeTruthy();
    });
});
