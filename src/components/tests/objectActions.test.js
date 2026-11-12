import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {actionRequest, postAction} from '../objectActions';
import {clearConfigStamps, recordConfigWrite} from '../../app/config-stamps';
import {trackWrite, useActionTracker} from '../../app/action-tracker';

const written = (stamp) => new Response(null, {status: 200, headers: stamp ? {'OM-Last-Modified': stamp} : {}});

describe('the request of an action', () => {
    afterEach(() => clearConfigStamps());

    test('no option, the address alone, as before', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'switch'}))
            .toEqual({url: '/api/object/path/ns1/svc/web/action/switch'});
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1'}))
            .toEqual({url: '/api/node/name/n1/instance/path/ns1/svc/web/action/start'});
    });

    test('the object switch to a node, live, in its json body', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2', live: true}})).toEqual({
            url: '/api/object/path/ns1/svc/web/action/switch',
            body: JSON.stringify({destination: ['n2'], live: true}),
        });
    });

    test('the options of a resource action after its rid', () => {
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1', rid: 'fs#1,fs#2', options: {force: true}}))
            .toEqual({url: '/api/node/name/n1/instance/path/ns1/svc/web/action/start?rid=fs%231%2Cfs%232&force=true'});
    });

    test('the cluster object takes none: its freeze is the cluster\'s', () => {
        expect(actionRequest({path: 'root/ccfg/cluster', action: 'freeze', options: {force: true}}))
            .toEqual({url: '/api/cluster/action/freeze'});
    });

    test('an instance action asks for the configuration last written here, the object and a refresh do not', () => {
        recordConfigWrite('ns1/svc/web', written('2026-10-23T09:00:00.123456789Z'));
        expect(actionRequest({path: 'ns1/svc/web', action: 'start', node: 'n1', options: {force: true}}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/web/action/start?force=true&config_updated_at=2026-10-23T09%3A00%3A00.123456789Z');
        expect(actionRequest({path: 'ns1/svc/web', action: 'status', node: 'n1'}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/web/action/status');
        expect(actionRequest({path: 'ns1/svc/web', action: 'start'}).url)
            .toBe('/api/object/path/ns1/svc/web/action/start');
        // Another object written nothing: asks nothing.
        expect(actionRequest({path: 'ns1/svc/db', action: 'start', node: 'n1'}).url)
            .toBe('/api/node/name/n1/instance/path/ns1/svc/db/action/start');
    });
});

describe('the configuration written, kept for the actions that follow', () => {
    afterEach(() => clearConfigStamps());

    test('from the answer of a write tracked; an older one does not replace it', async () => {
        const info = {action: 'config', subject: 'ns1/svc/web', label: 'config', path: 'ns1/svc/web'};
        await trackWrite(written('2026-10-23T09:00:02Z'), info, async () => '');
        await trackWrite(written('2026-10-23T09:00:01Z'), info, async () => '');
        expect(actionRequest({path: 'ns1/svc/web', action: 'stop', node: 'n1'}).url)
            .toContain('config_updated_at=2026-10-23T09%3A00%3A02Z');
    });

    test('a write refused, or answered without the time, keeps nothing', async () => {
        const info = {action: 'config', subject: 'ns1/svc/web', label: 'config', path: 'ns1/svc/web'};
        await trackWrite(new Response(null, {status: 403, headers: {'OM-Last-Modified': '2026-10-23T09:00:00Z'}}), info, async () => 'no');
        await trackWrite(written(), info, async () => '');
        expect(actionRequest({path: 'ns1/svc/web', action: 'stop', node: 'n1'}).url).not.toContain('config_updated_at');
    });
});

describe('postAction', () => {
    beforeEach(() => {
        localStorage.setItem('authToken', 'tok');
        global.fetch = vi.fn().mockResolvedValue(new Response(null, {status: 204}));
    });
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.removeItem('authToken');
    });

    test('posts the body of the options as json', async () => {
        await postAction({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2'}});
        expect(global.fetch).toHaveBeenCalledWith('/api/object/path/ns1/svc/web/action/switch', {
            method: 'POST',
            headers: {Authorization: 'Bearer tok', 'Content-Type': 'application/json'},
            body: JSON.stringify({destination: ['n2'], live: false}),
        });
    });

    test('refused by the instance monitor: the reason said, the orchestration it is recorded under kept, its logs then shown', async () => {
        useActionTracker.setState({tracked: [], revealed: 0});
        const ID = '33333333-3333-3333-3333-333333333333';
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 409, title: 'set instance monitor', detail: 'no instance to switch from', orchestration_id: ID, node: 'n2',
        }), {status: 409, headers: {'Content-Type': 'application/json'}}));
        const refusal = await postAction({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2'}});
        expect(refusal).toMatchObject({status: 409, detail: expect.stringMatching(/no instance to switch from/)});
        expect(useActionTracker.getState().tracked[0]).toMatchObject({
            state: 'refused', kind: 'orchestration', followedId: ID, node: 'n2', error: expect.stringMatching(/no instance to switch from/),
        });
    });

    test('a refusal naming no orchestration, or the nil one, has none to follow', async () => {
        useActionTracker.setState({tracked: [], revealed: 0});
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 409, title: 'set instance monitor', detail: 'refused', orchestration_id: '00000000-0000-0000-0000-000000000000', node: 'n2',
        }), {status: 409, headers: {'Content-Type': 'application/json'}}));
        await postAction({path: 'ns1/svc/web', action: 'switch', options: {destination: 'n2'}});
        expect(useActionTracker.getState().tracked[0]).toMatchObject({state: 'refused', kind: 'exec'});
        expect(useActionTracker.getState().tracked[0].followedId).toBeUndefined();
    });

    test('a clear or a status refused, or not sent: said in the tray all the same; accepted, nothing to follow', async () => {
        useActionTracker.setState({tracked: [], revealed: 0});
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({status: 403, detail: 'not an operator'}), {status: 403, headers: {'Content-Type': 'application/json'}}));
        expect(await postAction({path: 'ns1/svc/web', action: 'clear', node: 'n1'})).toMatchObject({status: 403});
        global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
        await postAction({path: 'ns1/svc/web', action: 'status', node: 'n2'});
        expect(useActionTracker.getState().tracked.map(({action, state, error}) => [action, state, error])).toEqual([
            ['status', 'refused', expect.stringMatching(/network down/)],
            ['clear', 'refused', expect.stringMatching(/HTTP 403.*not an operator/)],
        ]);
        useActionTracker.setState({tracked: [], revealed: 0});
        global.fetch = vi.fn().mockResolvedValue(new Response(null, {status: 200}));
        await postAction({path: 'ns1/svc/web', action: 'clear', node: 'n1'});
        expect(useActionTracker.getState().tracked).toEqual([]);
    });

    test('refused, the caller saying it itself: not in the tray', async () => {
        useActionTracker.setState({tracked: [], revealed: 0});
        global.fetch = vi.fn().mockResolvedValue(new Response(null, {status: 500}));
        expect(await postAction({path: 'ns1/svc/web', action: 'status', node: 'n1'}, {saysRefusal: true})).toMatchObject({status: 500});
        expect(useActionTracker.getState().tracked).toEqual([]);
    });

    test('without one, no body, as before', async () => {
        await postAction({path: 'ns1/svc/web', action: 'start', node: 'n1', options: {}});
        expect(global.fetch).toHaveBeenCalledWith('/api/node/name/n1/instance/path/ns1/svc/web/action/start', {
            method: 'POST',
            headers: {Authorization: 'Bearer tok'},
        });
    });
});
