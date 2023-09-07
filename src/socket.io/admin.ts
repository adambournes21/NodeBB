import winston from 'winston';
import meta from '../meta';
import user from '../user';
import events from '../events';
import db from '../database';
import privileges from '../privileges';
import websockets, { server as websocketServer } from './index';
import { getDictionary as getAdminSearchDict } from '../admin/search';

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
    adminUser?: any;
    categories?: any;
    settings?: any;
    tags?: any;
    rewards?: any;
    navigation?: any;
    rooms?: any;
    social?: any;
    themes?: any;
    plugins?: any;
    widgets?: any;
    config?: any;
    email?: any;
    analytics?: any;
    logs?: any;
    errors?: any;
    digest?: any;
    cache?: any;

    before?(socket: any, method: string): Promise<void>;
    restart?(socket: any): Promise<void>;

    reload?(socket: any): Promise<void>;
    fireEvent?(socket: any, data: { name: string, payload?: any }, callback: (...args: any[]) => any): void;
    deleteEvents?(socket: any, eids: number[], callback: (err: Error | null, result?: any) => void): void;
    deleteAllEvents?(socket: any, data: any, callback: (err: Error | null, result?: any) => void): void;
    getSearchDict?(socket: any): Promise<any>;
    deleteAllSessions?(socket: any, data: any, callback: (err: Error | null, result?: any) => void): void;
    reloadAllSessions?(socket: any, data: any, callback: (err: Error | null, result?: any) => void): void;
    getServerTime?(socket: any, data: any, callback: (err: Error | null, result?: any) => void): void;
    // ... Add other methods here if needed
}

// Define the SocketAdmin object using the imported modules and the ISocketAdmin type
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
    [key: string]: any;// Use this line to allow additional properties, but try to avoid `any` where possible.
}

interface WebsocketServer {
    emit(eventName: string, payload: any): void;
}

interface UserSettings {
    userLang?: string;
}

interface MetaConfig {
    defaultLang?: string;
}

SocketAdmin.before = async (socket: ISocket, method: string) => {
    const isAdmin = await user.isAdministrator(socket.uid) as boolean;
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

// Move logRestart function to the top to address the "use before define" error
async function logRestart(socket: ISocket) {
    await events.log({
        type: 'restart',
        uid: socket.uid,
        ip: socket.ip,
    });
    await (db as { setObject: (key: string, value: any) => Promise<void> }).setObject('lastrestart', {
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

SocketAdmin.fireEvent = (socket: any, data: { name: string, payload?: any }, callback: () => void) => {
    (websocketServer as WebsocketServer).emit(data.name, data.payload || {});
    callback();
};

type CallbackWithError = (err?: any) => void;

SocketAdmin.deleteEvents = (socket: unknown, eids: number[], callback: CallbackWithError) => {
    events.deleteEvents(eids, (err: any) => {
        if (err) {
            // Handle the error or pass it to the callback
            return callback(err);
        }
        callback();
    });
};

SocketAdmin.deleteAllEvents = (socket: unknown, data: unknown, callback: CallbackWithError) => {
    events.deleteAll((err: any) => {
        if (err) {
            // Handle the error or pass it to the callback
            return callback(err);
        }
        callback();
    });
};

SocketAdmin.getSearchDict = async (socket: unknown) => {
    const settings = (await user.getSettings((socket as { uid: number }).uid)) as UserSettings;
    const lang = settings.userLang || (meta.config as MetaConfig).defaultLang || 'en-GB';
    return await getAdminSearchDict(lang);
};

SocketAdmin.deleteAllSessions = (socket: any, data: any, callback: Function) => {
    user.auth.deleteAllSessions(callback);
};

SocketAdmin.reloadAllSessions = (socket: any, data: any, callback: Function) => {
    websockets.in(`uid_${socket.uid}`).emit('event:livereload');
    callback();
};

SocketAdmin.getServerTime = (socket: any, data: any, callback: Function) => {
    const now = new Date();
    callback(null, {
        timestamp: now.getTime(),
        offset: now.getTimezoneOffset(),
    });
};

import promisify from '../promisify';
promisify(SocketAdmin);
export default SocketAdmin;