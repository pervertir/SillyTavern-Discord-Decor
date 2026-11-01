import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedUrl } from './index.mjs';

test('allows Discord collectible files', () => {
    for (const url of [
        'https://cdn.discordapp.com/avatar-decoration-presets/a_1.png?size=96&passthrough=true',
        'https://cdn.discordapp.com/assets/collectibles/nameplates/x/1/asset.webm',
        'https://cdn.discordapp.com/assets/content/abc',
        'https://cdn.discordapp.com/media/v1/collectibles-shop/1/static',
    ]) {
        assert.ok(allowedUrl(url), url);
    }
});

test('refuses everything else', () => {
    for (const url of [
        '',
        'not a url',
        'http://cdn.discordapp.com/assets/content/abc',
        'https://cdn.discordapp.com/attachments/1/2/a.png',
        'https://cdn.discordapp.com.evil.example/assets/content/abc',
        'https://evil.example/assets/content/abc',
        'https://user@cdn.discordapp.com/assets/content/abc',
        'https://cdn.discordapp.com:8443/assets/content/abc',
        'https://cdn.discordapp.com/assets/content/%2e%2e/attachments/a.png',
        'http://127.0.0.1:8000/assets/content/abc',
    ]) {
        assert.equal(allowedUrl(url), null, url);
    }
});
