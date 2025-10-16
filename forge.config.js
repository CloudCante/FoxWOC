// forge.config.js
const { VitePlugin } = require('@electron-forge/plugin-vite');
const path = require('path');

const makers =
  process.platform === 'win32'
    ? [
        { name: '@electron-forge/maker-squirrel',
           config: {
            setupIcon: path.resolve(__dirname,'assets/app.ico')
           } },
      ]
    : process.platform === 'darwin'
    ? [
        { name: '@electron-forge/maker-zip' },
        { name: '@electron-forge/maker-dmg', config: {} },
      ]
    : [
        { name: '@electron-forge/maker-deb', config: {} },
        { name: '@electron-forge/maker-rpm', config: {} },
      ];

module.exports = {
  packagerConfig: { 
    asar:  true, 
    icon: path.resolve(__dirname,'assets/app.ico'),
    extraResource: ["input"] },
  makers,
  plugins: [
    new VitePlugin({
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
      build: [
        { entry: 'src/main.js', config: 'vite.main.config.mjs' },
        { entry: 'src/preload.js', config: 'vite.preload.config.mjs' },
      ],
    }),
  ],
};
