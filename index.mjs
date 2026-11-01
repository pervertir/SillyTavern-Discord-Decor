// Discord Decor server plugin for SillyTavern.
//
// The SillyTavern-Discord theme keeps offline copies of the profile art people tick. A page
// can't read most of Discord's files, but a server can, so this plugin fetches them for it.
// It only ever reads Discord's collectible files. When Discord refuses one, it reads the same
// file from this repo's private art branch, with this machine's own GitHub login. It stores
// nothing itself: the theme saves what it gets to SillyTavern's user files.
//
// Routes (under /api/plugins/discord-decor):
//   GET  /status      { ok: true }, so the theme can tell the plugin is installed
//   POST /fetch       { url } → the file; the X-Decor-Source header says cdn or repo
//   GET  /file?url=   the same, for showing a file straight in a page

import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'cdn.discordapp.com';
const PATHS = ['/avatar-decoration-presets/', '/assets/collectibles/', '/assets/content/', '/media/v1/collectibles-shop/'];
/** App Icons are among the client's own files, named by a hash */
const APP_ICON = /^\/assets\/[a-f0-9]{16}\.webp$/;
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 60 * 1000;
const RAW = 'https://raw.githubusercontent.com/pervertir/SillyTavern-Discord-Decor/art/';
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** For tests only: Discord is treated as refusing any address containing this. */
const BLOCK = process.env.DISCORD_DECOR_BLOCK_CDN;

export const info = {
    id: 'discord-decor',
    name: 'Discord Decor',
    description: 'Fetches Discord profile art for the SillyTavern-Discord theme to keep offline.',
};

/** The address if it's one of Discord's collectible files, otherwise null. */
export function allowedUrl(address) {
    let url;
    try {
        url = new URL(String(address));
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
        return null;
    }
    if (url.hostname === 'discord.com') {
        return APP_ICON.test(url.pathname) ? url : null;
    }
    const allowed = url.hostname === HOST && !url.pathname.includes('..') && !url.pathname.includes('%2')
        && PATHS.some(part => url.pathname.startsWith(part));
    return allowed ? url : null;
}

/** Reads a whole response, or throws when it's refused or too large. */
async function read(address, headers = {}) {
    const response = await fetch(address, { headers, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`answered ${response.status}`);
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error('file too large');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
        throw new Error('file too large');
    }
    return { bytes, type: response.headers.get('content-type') };
}

/** The account git uses for this repo, from the plugin's own git settings. */
function gitUser() {
    return new Promise((resolve) => {
        execFile('git', ['-C', HERE, 'config', 'credential.username'], { timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout.trim()));
    });
}

/** This machine's GitHub password for the repo's account, or ''. Asked for each time and kept
 * by nobody: never logged, stored or sent to a page. */
async function githubToken() {
    const username = await gitUser();
    return new Promise((resolve) => {
        const child = spawn('git', ['-C', HERE, 'credential', 'fill'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: 10000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' },
        });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.on('error', () => resolve(''));
        child.on('close', () => {
            const line = output.split('\n').find(x => x.startsWith('password='));
            resolve(line ? line.slice('password='.length) : '');
        });
        child.stdin.end(`protocol=https\nhost=github.com\n${username ? `username=${username}\n` : ''}\n`);
    });
}

/** Discord's address → path on the art branch, from the branch's manifest; filled once. */
let backupPaths = null;

async function fromRepo(url) {
    const token = await githubToken();
    if (!token) {
        throw new Error('no GitHub login on this machine');
    }
    const headers = { Authorization: `Bearer ${token}` };
    if (!backupPaths) {
        const { bytes } = await read(`${RAW}manifest.json`, headers);
        backupPaths = new Map(JSON.parse(bytes.toString('utf8')).map(row => [row.url, row.path]));
    }
    const file = backupPaths.get(url.href);
    if (!file) {
        throw new Error('not on the art branch');
    }
    const { bytes } = await read(`${RAW}${file.split('/').map(encodeURIComponent).join('/')}`, headers);
    return { bytes, type: typeOf(file) };
}

/** Raw GitHub calls everything plain text, so the type comes from what the file is. */
function typeOf(file) {
    const types = { '.png': 'image/png', '.webp': 'image/webp', '.webm': 'video/webm', '.gif': 'image/gif', '.mp4': 'video/mp4' };
    return types[path.extname(file).toLowerCase()] ?? 'image/png';
}

/** The file from Discord, or from the repo when Discord refuses it. */
async function getFile(url) {
    try {
        if (BLOCK && url.href.includes(BLOCK)) {
            throw new Error('blocked for a test');
        }
        return { ...await read(url), source: 'cdn' };
    } catch (error) {
        console.warn('[discord-decor] Discord refused a file, trying the repo:', error.message);
        return { ...await fromRepo(url), source: 'repo' };
    }
}

async function serve(address, response) {
    const url = allowedUrl(address);
    if (!url) {
        return response.status(400).send({ error: 'Not a Discord collectible file' });
    }
    try {
        const { bytes, type, source } = await getFile(url);
        response.set('X-Decor-Source', source);
        response.type(type || 'application/octet-stream');
        return response.send(bytes);
    } catch (error) {
        console.warn('[discord-decor]', error.message);
        return response.status(502).send({ error: 'Could not get the file from Discord or the repo' });
    }
}

export async function init(router) {
    router.get('/status', (_request, response) => response.send({ ok: true }));
    router.post('/fetch', (request, response) => serve(request.body?.url, response));
    router.get('/file', (request, response) => serve(request.query?.url, response));
}

export async function exit() {}
