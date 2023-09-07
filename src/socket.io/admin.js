"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketAdmin = void 0;
const winston_1 = __importDefault(require("winston"));
const meta_1 = __importDefault(require("../meta"));
const user_1 = __importDefault(require("../user"));
const events_1 = __importDefault(require("../events"));
const database_1 = __importDefault(require("../database"));
const privileges_1 = __importDefault(require("../privileges"));
const index_1 = __importStar(require("./index"));
const search_1 = require("../admin/search");
const categories_1 = __importDefault(require("./admin/categories"));
const settings_1 = __importDefault(require("./admin/settings"));
const tags_1 = __importDefault(require("./admin/tags"));
const rewards_1 = __importDefault(require("./admin/rewards"));
const navigation_1 = __importDefault(require("./admin/navigation"));
const rooms_1 = __importDefault(require("./admin/rooms"));
const social_1 = __importDefault(require("./admin/social"));
const themes_1 = __importDefault(require("./admin/themes"));
const plugins_1 = __importDefault(require("./admin/plugins"));
const widgets_1 = __importDefault(require("./admin/widgets"));
const config_1 = __importDefault(require("./admin/config"));
// I noticed you imported 'settings' twice, so I'm removing one of them.
const email_1 = __importDefault(require("./admin/email"));
const analytics_1 = __importDefault(require("./admin/analytics"));
const logs_1 = __importDefault(require("./admin/logs"));
const errors_1 = __importDefault(require("./admin/errors"));
const digest_1 = __importDefault(require("./admin/digest"));
const cache_1 = __importDefault(require("./admin/cache"));
// Define the SocketAdmin object using the imported modules
exports.SocketAdmin = {
    user: user_1.default,
    categories: categories_1.default,
    settings: settings_1.default,
    tags: tags_1.default,
    rewards: rewards_1.default,
    navigation: navigation_1.default,
    rooms: rooms_1.default,
    social: social_1.default,
    themes: themes_1.default,
    plugins: plugins_1.default,
    widgets: widgets_1.default,
    config: config_1.default,
    email: email_1.default,
    analytics: analytics_1.default,
    logs: logs_1.default,
    errors: errors_1.default,
    digest: digest_1.default,
    cache: cache_1.default
};
exports.SocketAdmin.before = (socket, method) => __awaiter(void 0, void 0, void 0, function* () {
    const isAdmin = yield user_1.default.isAdministrator(socket.uid);
    if (isAdmin) {
        return;
    }
    // Check admin privileges mapping (if not in mapping, deny access)
    const privilegeSet = privileges_1.default.admin.socketMap.hasOwnProperty(method) ? privileges_1.default.admin.socketMap[method].split(';') : [];
    const hasPrivilege = (yield Promise.all(privilegeSet.map((privilege) => __awaiter(void 0, void 0, void 0, function* () { return privileges_1.default.admin.can(privilege, socket.uid); })))).some(Boolean);
    if (privilegeSet.length && hasPrivilege) {
        return;
    }
    winston_1.default.warn(`[socket.io] Call to admin method ( ${method} ) blocked (accessed by uid ${socket.uid})`);
    throw new Error('[[error:no-privileges]]');
});
exports.SocketAdmin.restart = function (socket) {
    return __awaiter(this, void 0, void 0, function* () {
        yield logRestart(socket);
        meta_1.default.restart();
    });
};
function logRestart(socket) {
    return __awaiter(this, void 0, void 0, function* () {
        yield events_1.default.log({
            type: 'restart',
            uid: socket.uid,
            ip: socket.ip,
        });
        yield database_1.default.setObject('lastrestart', {
            uid: socket.uid,
            ip: socket.ip,
            timestamp: Date.now(),
        });
    });
}
exports.SocketAdmin.reload = function (socket) {
    return __awaiter(this, void 0, void 0, function* () {
        yield require('../meta/build').buildAll();
        yield events_1.default.log({
            type: 'build',
            uid: socket.uid,
            ip: socket.ip,
        });
        yield logRestart(socket);
        meta_1.default.restart();
    });
};
exports.SocketAdmin.fireEvent = (socket, data, callback) => {
    index_1.server.emit(data.name, data.payload || {});
    callback();
};
exports.SocketAdmin.deleteEvents = (socket, eids, callback) => {
    events_1.default.deleteEvents(eids, callback);
};
exports.SocketAdmin.deleteAllEvents = (socket, data, callback) => {
    events_1.default.deleteAll(callback);
};
exports.SocketAdmin.getSearchDict = (socket) => __awaiter(void 0, void 0, void 0, function* () {
    const settings = yield user_1.default.getSettings(socket.uid);
    const lang = settings.userLang || meta_1.default.config.defaultLang || 'en-GB';
    return yield (0, search_1.getDictionary)(lang);
});
exports.SocketAdmin.deleteAllSessions = (socket, data, callback) => {
    user_1.default.auth.deleteAllSessions(callback);
};
exports.SocketAdmin.reloadAllSessions = (socket, data, callback) => {
    index_1.default.in(`uid_${socket.uid}`).emit('event:livereload');
    callback();
};
exports.SocketAdmin.getServerTime = (socket, data, callback) => {
    const now = new Date();
    callback(null, {
        timestamp: now.getTime(),
        offset: now.getTimezoneOffset(),
    });
};
const promisify_1 = __importDefault(require("../promisify"));
(0, promisify_1.default)(exports.SocketAdmin);
