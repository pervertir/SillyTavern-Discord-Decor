# SillyTavern Discord Decor

A server plugin for the [SillyTavern-Discord](https://github.com/pervertir/SillyTavern-Discord) theme. It lets the theme keep offline copies of the profile art you tick, without turning on SillyTavern's CORS proxy.

- Browsers can't read most of Discord's files, but a server can. The plugin fetches them when the theme asks.
- It only reads Discord's collectible files, from `cdn.discordapp.com`. It refuses any other address.
- The theme saves the files to your SillyTavern user files. This repo contains code only, and no art.

The art belongs to Discord and its licensors. Your copies are for your own use.

## Install

1. In SillyTavern's `config.yaml`, set `enableServerPlugins: true`.
2. Clone this repo into SillyTavern's `plugins` folder:

   ```bash
   git clone https://github.com/pervertir/SillyTavern-Discord-Decor plugins/SillyTavern-Discord-Decor
   ```

3. Restart SillyTavern.

## What happens next

The theme downloads a starter set once: everything your characters and personas are using, plus the first 6 items of each kind. Choose anything else, or delete what you don't want, under Change Look > **Offline Copies**. If **Use only saved copies** is on, nothing downloads by itself.

## License

MIT
