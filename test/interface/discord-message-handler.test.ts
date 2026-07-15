import 'reflect-metadata';
import { expect } from '../expect';
import { ImportMock } from 'ts-mock-imports'
import { DiscordMessageHandler } from '../../src/interface/discord-message-handler';
import { StubInstance, disableConsole, enableConsole, stubClass } from '../util';
import { DependencyContainer, Lifecycle, container } from 'tsyringe';
import { Manager } from '../../src/control/manager';
import { Interface } from '../../src/interface/interface';

class TestMessage {

    author = {
        tag: '#admin'
    };
    content = '!test val1 val2';
    channel = { name: 'testChannel' };

    
    replyMsg: string;
    public reply(msg: string): void {
        this.replyMsg = msg;
    }

}


describe('Test Discord Message handler', () => {

    let injector: DependencyContainer;

    let manager: StubInstance<Manager>;
    let interfaceService: StubInstance<Interface>;

    before(() => {
        disableConsole();
    });

    after(() => {
        enableConsole();
    });

    beforeEach(() => {
        // restore mocks
        ImportMock.restore();

        container.reset();
        injector = container.createChildContainer();

        injector.register(Manager, stubClass(Manager), { lifecycle: Lifecycle.Singleton });
        injector.register(Interface, stubClass(Interface), { lifecycle: Lifecycle.Singleton });
        
        manager = injector.resolve(Manager) as any;
        manager.initDone = true;
        (manager as any).config = {
            discordChannels: [
                {
                    channel: 'testChannel',
                    mode: 'admin'
                }
            ]
        };

        interfaceService = injector.resolve(Interface) as any;
        interfaceService.commandMap = new Map([
            ['test', {
                disableDiscord: false,
                params: [{ name: 'arg1' }, { name: 'arg2' }]
            }],
            ['global', {
                disableDiscord: false,
                params: [{ name: 'message' }]
            }],
            ['testparsed', {
                disableDiscord: false,
                params: [{ name: 'count', parse: Number }, { name: 'message' }]
            }],
            ['testoptional', {
                disableDiscord: false,
                params: [{ name: 'value', optional: true }]
            }],
            ['testDisabled', { disableDiscord: true }]
        ]) as any;
        interfaceService.execute
            .resolves({
                status: 200,
                body: 'test success',
            });
    });

    it('handleMessage-before init', async () => {
        manager.initDone = false;

        const handler = injector.resolve(DiscordMessageHandler);
        const message = new TestMessage();

        await handler.handleCommandMessage(message as any);

        expect(message.replyMsg).to.be.undefined;
        expect(interfaceService.execute.called).to.be.false;
    });

    it('handleMessage-no command', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        const message = new TestMessage();
        message.content = 'asdf 1234 123';

        await handler.handleCommandMessage(message as any);

        expect(message.replyMsg).to.include('not found');
        expect(interfaceService.execute.called).to.be.false;
    });

    it('handleMessage-discord disabled command', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        const message = new TestMessage();
        message.content = '!testDisabled';

        await handler.handleCommandMessage(message as any);

        expect(message.replyMsg).to.include('not found');
        expect(interfaceService.execute.called).to.be.false;
    });

    it('handleMessage-wrong channel', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        
        const message = new TestMessage();
        message.channel.name = 'asdf';
        await handler.handleCommandMessage(message as any);
        expect(message.replyMsg).to.include('not allowed');
        expect(interfaceService.execute.called).to.be.false;
    });

    it('handleMessage-wrong param count', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        
        const message = new TestMessage();
        message.content = '!test val1';
        await handler.handleCommandMessage(message as any);
        expect(message.replyMsg).to.include('Wrong param count');
        expect(interfaceService.execute.called).to.be.false;
    });

    it('handleMessage', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        
        const message = new TestMessage();
        await handler.handleCommandMessage(message as any);
        expect(message.replyMsg).to.include('test success');
        expect(interfaceService.execute.called).to.be.true;
        expect(interfaceService.execute.firstCall.args[0].body).to.deep.equal({
            arg1: 'val1',
            arg2: 'val2',
        });
    });

    it('handleMessage-preserves multiword global message', async () => {
        const handler = injector.resolve(DiscordMessageHandler);

        const message = new TestMessage();
        message.content = '!global Sample global message';
        await handler.handleCommandMessage(message as any);

        expect(interfaceService.execute.firstCall.args[0].body).to.deep.equal({
            message: 'Sample global message',
        });
    });

    it('handleMessage-parses earlier params before multiword final string param', async () => {
        const handler = injector.resolve(DiscordMessageHandler);

        const message = new TestMessage();
        message.content = '!testParsed 2 Sample global message';
        await handler.handleCommandMessage(message as any);

        expect(interfaceService.execute.firstCall.args[0].body).to.deep.equal({
            count: 2,
            message: 'Sample global message',
        });
    });

    it('handleMessage-allows omitted optional param', async () => {
        const handler = injector.resolve(DiscordMessageHandler);

        const message = new TestMessage();
        message.content = '!testOptional';
        await handler.handleCommandMessage(message as any);

        expect(message.replyMsg).to.include('test success');
        expect(interfaceService.execute.firstCall.args[0].body).to.deep.equal({});
    });

    it('handleMessage-help', async () => {
        const handler = injector.resolve(DiscordMessageHandler);
        
        const message = new TestMessage();
        message.content = '!help'
        await handler.handleCommandMessage(message as any);
        expect(message.replyMsg).to.include('!test <arg1> <arg2>');
        expect(message.replyMsg).to.include('!testoptional [value]');
        expect(interfaceService.execute.called).to.be.false;
    });

    // it('handleMessage-help', async () => {
    //     const handler = injector.resolve(DiscordMessageHandler);
        
    //     const message = new TestMessage();
    //     message.content = '!help';
    //     await handler.handleCommandMessage(message as any);
    //     expect(message.replyMsg).to.include('!test');
    //     expect(interfaceService.execute.called).to.be.false;
    // });

});
