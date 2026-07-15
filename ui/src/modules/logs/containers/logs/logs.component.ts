import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'sb-logs',
    templateUrl: './logs.component.html',
    styleUrls: ['logs.component.scss'],
})
export class LogsComponent implements OnInit {

    public ngOnInit(): void {
        // Child routes provide the selected log stream.
    }

}
