import { AfterViewInit, Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { LogMessage, LogType } from '../../../app-common/models';
import { Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ApiFetcher, AppCommonService } from '../../../../modules/app-common/services/app-common.service';

@Component({
    standalone: false,
    selector: 'sb-log-monitor',
    templateUrl: './log-monitor.component.html',
    styleUrls: ['./log-monitor.component.scss'],
})
export class LogMonitorComponent implements OnInit, OnDestroy, AfterViewInit {

    public title: string = 'Logs';
    @ViewChild('scrollView') public container!: any;
    public itemSize = 22;
    public lockToEnd: boolean = true;

    public messages: LogMessage[] = [];
    public sub?: Subscription;
    private scrollTimer?: number;

    public constructor(
        private zone: NgZone,
        private appCommon: AppCommonService,
        private route: ActivatedRoute,
    ) {}

    private getFetcher(type: LogType): ApiFetcher<LogType, LogMessage> {
        return this.appCommon.getApiFetcher<LogType, LogMessage>(type);
    }

    public ngOnInit(): void {

        const logType = this.route.snapshot.data['logType'] as LogType;
        if (!logType) return;

        this.title = this.route.snapshot.data['title'];
        const logFetcher = this.getFetcher(logType);

        this.messages = [...(logFetcher.snapshot ?? [])];
        this.scrollToBottom();
        this.sub = logFetcher.dataInserted.subscribe(
            (x) => {
                this.messages = [...this.messages, x];
                this.scrollToBottom();
            },
            console.error,
        );
    }

    public ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
            this.sub = undefined;
        }
        if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
    }

    public ngAfterViewInit(): void {
        this.scrollToBottom();
    }

    private scrollToBottom(force?: boolean): void {
        if (!this.container?.elementRef?.nativeElement || (!this.lockToEnd && !force)) return;

        if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
        this.zone.run(() => {
            this.scrollTimer = window.setTimeout(() => {
                const element = this.container?.elementRef?.nativeElement;
                if (element) element.scrollTop = element.scrollHeight;
            });
        });
    }

    public toggleLock(): void {
        this.lockToEnd = !this.lockToEnd;
        if (this.lockToEnd) this.scrollToBottom(true);
    }

}
