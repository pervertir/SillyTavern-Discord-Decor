// Discord Decor server plugin for SillyTavern.
//
// The SillyTavern-Discord theme keeps offline copies of the profile art people tick. A page
// can't read most of Discord's files, but a server can, so this plugin fetches them for it.
// It only ever reads Discord's collectible files, and stores nothing itself: the theme saves
// what it gets to SillyTavern's user files. No art is shipped with this plugin.
//
// Routes (under /api/plugins/discord-decor):
//   GET  /status   { ok: true }, so the theme can tell the plugin is installed
//   POST /fetch    { url } → the file

const HOST = 'cdn.discordapp.com';
const PATHS = ['/avatar-decoration-presets/', '/assets/collectibles/', '/assets/content/', '/media/v1/collectibles-shop/'];
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 60 * 1000;

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
    const allowed = url.protocol === 'https:' && url.hostname === HOST && !url.username && !url.password
        && !url.port && !url.pathname.includes('..') && !url.pathname.includes('%2')
        && PATHS.some(path => url.pathname.startsWith(path));
    return allowed ? url : null;
}

export async function init(router) {
    router.get('/status', (_request, response) => response.send({ ok: true }));

    router.post('/fetch', async (request, response) => {
        const url = allowedUrl(request.body?.url);
        if (!url) {
            return response.status(400).send({ error: 'Not a Discord collectible file' });
        }
        try {
            const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!upstream.ok) {
                return response.status(502).send({ error: `Discord answered ${upstream.status}` });
            }
            if (Number(upstream.headers.get('content-length')) > MAX_BYTES) {
                await upstream.body?.cancel();
                return response.status(413).send({ error: 'File too large' });
            }
            const bytes = Buffer.from(await upstream.arrayBuffer());
            if (bytes.length > MAX_BYTES) {
                return response.status(413).send({ error: 'File too large' });
            }
            response.type(upstream.headers.get('content-type') || 'application/octet-stream');
            return response.send(bytes);
        } catch (error) {
            console.warn('[discord-decor]', error.message);
            return response.status(502).send({ error: 'Could not reach Discord' });
        }
    });
}

export async function exit() {}
