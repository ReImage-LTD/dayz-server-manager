import * as childProcess from 'child_process';

export const isRunFromWindowsGUI = (): boolean => {
    if (process.platform !== 'win32') {
        return false;
    }

    let result: childProcess.SpawnSyncReturns<string>;
    try {
        result = childProcess.spawnSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `(Get-CimInstance Win32_Process -Filter "ProcessId = ${process.ppid}").Name`,
            ],
            {
                encoding: 'utf8',
            },
        );
    } catch {
        return false;
    }

    if (result.status !== 0 || !result.stdout) {
        return false;
    }

    const parentName = result.stdout.trim().toLowerCase();
    return (
        parentName === 'ApplicationFrameHost.exe'.toLowerCase()
        || parentName === 'explorer.exe'
    );
};
