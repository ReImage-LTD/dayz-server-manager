import { expect } from '../expect';
import * as childProcess from 'child_process';
import * as sinon from 'sinon';
import { isRunFromWindowsGUI } from '../../src/util/is-run-from-gui';

describe('Test is run from GUI', () => {

    afterEach(() => {
        sinon.restore();
    });

    it('detects Windows Explorer as the parent process', () => {
        sinon.stub(process, 'platform').value('win32');
        const spawnSync = sinon.stub(childProcess, 'spawnSync').returns({
            status: 0,
            stdout: 'explorer.exe\r\n',
        } as childProcess.SpawnSyncReturns<string>);

        expect(isRunFromWindowsGUI()).to.be.true;
        expect(spawnSync.firstCall.args[0]).to.equal('powershell.exe');
        expect(spawnSync.firstCall.args[1].join(' ')).to.include(`ProcessId = ${process.ppid}`);
        expect(spawnSync.firstCall.args[1].join(' ')).to.not.include('wmic');
    });

    it('returns false when the process query produces no output', () => {
        sinon.stub(process, 'platform').value('win32');
        sinon.stub(childProcess, 'spawnSync').returns({
            status: 1,
            stdout: null,
        } as childProcess.SpawnSyncReturns<string>);

        expect(isRunFromWindowsGUI()).to.be.false;
    });

    it('returns false when the process query throws', () => {
        sinon.stub(process, 'platform').value('win32');
        sinon.stub(childProcess, 'spawnSync').throws();

        expect(isRunFromWindowsGUI()).to.be.false;
    });

    it('returns false outside Windows', () => {
        sinon.stub(process, 'platform').value('linux');

        expect(isRunFromWindowsGUI()).to.be.false;
    });

});
