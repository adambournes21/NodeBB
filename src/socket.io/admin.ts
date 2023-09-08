import winston from 'winston';
import meta from '../meta';
import user from '../user';
import events from '../events';
import db from '../database';
import privileges from '../privileges';
import websockets, { server as websocketServer } from './index';
import { getDictionary as getAdminSearchDict } from '../admin/search';

import promisify from '../promisify';
import { buildAll } from '../meta/build';

// Convert the CommonJS imports to ES6 imports
import adminUser from './admin/user';
import categories from './admin/categories';
import settings from './admin/settings';
import tags from './admin/tags';
import rewards from './admin/rewards';
import navigation from './admin/navigation';
import rooms from './admin/rooms';
import social from './admin/social';
import themes from './admin/themes';
import plugins from './admin/plugins';
import widgets from './admin/widgets';
import config from './admin/config';
import email from './admin/email';
import analytics from './admin/analytics';
import logs from './admin/logs';
import errors from './admin/errors';
import digest from './admin/digest';
import cache from './admin/cache';

// Define the ISocketAdmin interface
interface ISocketAdmin {
    adminUser?: unknown;
    categories?: unknown;
    settings?: unknown;
    tags?: unknown;
    rewards?: unknown;
    navigation?: unknown;
    rooms?: unknown;
    social?: unknown;
    themes?: unknown;
    plugins?: unknown;
    widgets?: unknown;
    config?: unknown;
    email?: unknown;
    analytics?: unknown;
    logs?: unknown;
    errors?: unknown;
    digest?: unknown;
    cache?: unknown;

    before?(socket: unknown, method: string): Promise<void>;
    restart?(socket: unknown): Promise<void>;

    reload?(socket: unknown): Promise<void>;
    fireEvent?(socket: unknown, data: IData, callback: ICallback): void;
    deleteEvents?(socket: unknown, eids: number[], callback: ICallback): void;
    deleteAllEvents?(socket: unknown, data: unknown, callback: ICallback): void;
    getSearchDict?(socket: unknown): Promise<unknown>;
    deleteAllSessions?(socket: unknown, data: unknown, callback: ICallback): void;
    reloadAllSessions?(socket: unknown, data: unknown, callback: ICallback): void;
    getServerTime?(socket: unknown, data: unknown, callback: ICallback): void;
}

const SocketAdmin: ISocketAdmin = {
    adminUser,
    categories,
    settings,
    tags,
    rewards,
    navigation,
    rooms,
    social,
    themes,
    plugins,
    widgets,
    config,
    email,
    analytics,
    logs,
    errors,
    digest,
    cache,
};

interface ISocket {
    uid: number;
    ip: string;
    // If you truly expect any property with a string key, keep the line below.
    // But if you can, specify all the expected properties.
    [key: string]: unknown; // Using `unknown` instead of `any` can sometimes be safer.
}

interface EventPayload {
    // define the shape of the expected payload here
    [key: string]: unknown;
}

interface WebsocketServer {
    emit(eventName: string, payload: EventPayload): void;
}

interface UserSettings {
    userLang?: string;
}

interface MetaConfig {
    defaultLang?: string;
}

interface MySocket {
    uid: number;
    // other properties...
}

interface Auth {
    deleteAllSessions(callback: CallbackType): void;
}

interface User {
    auth: Auth;
    isAdministrator(uid: number): Promise<boolean>;
    getSettings(uid: number): Promise<UserSettings>;
}

interface IData {
    name: string;
    payload?: unknown;
}

interface ICallback {
    (err: Error | null, result?: unknown): void;
}


declare const user: User;


SocketAdmin.before = async (socket: ISocket, method: string) => {
    const isAdmin = await user.isAdministrator(socket.uid);
    if (isAdmin) {
        return;
    }

    const privilegeSet = privileges.admin.socketMap.hasOwnProperty(method) ?
        (privileges.admin.socketMap[method] as string).split(';') :// assert as string
        [];

    const hasPrivilege = (await Promise.all(privilegeSet.map(
        async privilege => privileges.admin.can(privilege, socket.uid)
    ))).some(Boolean);

    if (privilegeSet.length && hasPrivilege) {
        return;
    }

    winston.warn(`[socket.io] Call to admin method ( ${method} ) blocked (accessed by uid ${socket.uid})`);
    throw new Error('[[error:no-privileges]]');
};

async function logRestart(socket: ISocket) {
    await events.log({
        type: 'restart',
        uid: socket.uid,
        ip: socket.ip,
    });
    await (db as { setObject: (key: string, value: unknown) => Promise<void> }).setObject('lastrestart', {
        uid: socket.uid,
        ip: socket.ip,
        timestamp: Date.now(),
    });
}

SocketAdmin.restart = async function (socket: ISocket) {
    await logRestart(socket);
    meta.restart();
};

SocketAdmin.reload = async function (socket: ISocket) {
    await buildAll();
    await events.log({
        type: 'build',
        uid: socket.uid,
        ip: socket.ip,
    });

    await logRestart(socket);
    meta.restart();
};

SocketAdmin.fireEvent = (socket: unknown, data: { name: string, payload?: EventPayload }, callback: ICallback) => {
    (websocketServer as WebsocketServer).emit(data.name, data.payload || {});
    callback(null);
};

SocketAdmin.deleteEvents = (socket: unknown, eids: number[], callback: ICallback) => {
    // Assuming events.deleteEvents returns a promise
    events.deleteEvents(eids)
        .then(() => {
            callback(null); // Successfully deleted, so invoke the callback with no error
        })
        .catch((err: Error) => {
            callback(err); // There was an error, pass it to the callback
        });
};

SocketAdmin.deleteAllEvents = (socket: unknown, data: unknown, callback: ICallback) => {
    events.deleteAll()
        .then(() => {
            callback(null);
        })
        .catch((err: Error) => {
            console.error(err);
            callback(err);
        });
};

SocketAdmin.getSearchDict = async (socket: unknown) => {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const settings = (await user.getSettings((socket as { uid: number }).uid));
    const lang = settings.userLang || (meta.config as MetaConfig).defaultLang || 'en-GB';
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    return await getAdminSearchDict(lang);
};

type CallbackType = (err?: Error) => void;

SocketAdmin.deleteAllSessions = (socket: MySocket, data: unknown, callback: CallbackType) => {
    user.auth.deleteAllSessions(callback);
};

SocketAdmin.reloadAllSessions = (socket: MySocket, data: unknown, callback: CallbackType) => {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    websockets.in(`uid_${socket.uid}`).emit('event:livereload');
    callback();
};

type ServerTimeCallback = (error: Error | null, data: { timestamp: number; offset: number }) => void;

SocketAdmin.getServerTime = (socket: unknown, data: unknown, callback: ServerTimeCallback) => {
    const now = new Date();
    callback(null, {
        timestamp: now.getTime(),
        offset: now.getTimezoneOffset(),
    });
};

promisify(SocketAdmin);

export default SocketAdmin;

// source of some of these changes: chatGPT
