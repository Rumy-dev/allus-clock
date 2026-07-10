import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon',
    extraResource: ['assets'],
    extendInfo: 'assets/info.plist',
    osxSign: {
      optionsForFile: () => ({ entitlements: 'assets/entitlements.plist' }),
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: 'assets/icon.ico' }),
    new MakerDMG({
      // Nome do volume sem espaço: "hdiutil detach" falha de forma
      // intermitente em runners do GitHub Actions quando o volume montado
      // tem espaço no nome (bug conhecido do electron-installer-dmg/hdiutil
      // em CI — o volume monta como "Allus Focus" mas o detach às vezes
      // procura por um path que não bate, retornando "No such file or
      // directory"). Local, num Mac de verdade, isso normalmente não acontece.
      name: 'AllusFocus',
      format: 'ULFO',
      iconSize: 100,
      contents: [
        { x: 100, y: 100, type: 'file', path: '' },
        { x: 400, y: 100, type: 'link', path: '/Applications' },
      ],
    }),
    new MakerZIP({}, ['linux']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: 'Rumy-dev', name: 'allus-clock' },
      prerelease: false,
      // Por padrão o publisher cria a release como draft (invisível pra API
      // pública e pro auto-updater) — precisamos explicitamente publicar de
      // verdade pra update-electron-app conseguir enxergá-la.
      draft: false,
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
