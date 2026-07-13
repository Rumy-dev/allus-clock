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
    // Sem notarização, o Gatekeeper do macOS 10.15+ bloqueia/alerta o app
    // mesmo assinado ("Apple não pôde verificar..."). Opt-in via env vars
    // (Apple ID + app-specific password + team ID, gerados em
    // appleid.apple.com) — sem eles configurados, build local segue como
    // hoje (assinado, não notarizado).
    ...(process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID
      ? {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: 'assets/icon.ico',
      // Assinatura de código do instalador/exe Windows. Sem isso o Windows
      // SmartScreen mostra "editor desconhecido" e o binário pode ser
      // adulterado sem detecção. Fica opt-in via env vars — sem certificado
      // configurado, o build segue funcionando sem assinar (comportamento
      // atual inalterado). Certificado .pfx (code signing, ex.: DigiCert/
      // Sectigo) + senha vão em CI como secrets, nunca commitados.
      ...(process.env.WINDOWS_CERT_FILE
        ? {
            certificateFile: process.env.WINDOWS_CERT_FILE,
            certificatePassword: process.env.WINDOWS_CERT_PASSWORD,
          }
        : {}),
    }),
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
      // `contents` customizado precisa ser uma função que recebe `opts.appPath`
      // (caminho real do .app gerado no build) — um array fixo com path
      // vazio faz o electron-installer-dmg resolver pro cwd da CI e empacotar
      // a pasta errada em vez do app (foi o que quebrou o .dmg da v3.0.6).
      contents: (opts: { appPath: string }) => [
        { x: 100, y: 100, type: 'file', path: opts.appPath },
        { x: 400, y: 100, type: 'link', path: '/Applications' },
      ],
    }),
    new MakerZIP({}, ['linux']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: 'Rumy-dev', name: 'Allus-Focus' },
      prerelease: false,
      // Por padrão o publisher cria a release como draft (invisível pra API
      // pública e pro auto-updater) — precisamos explicitamente publicar de
      // verdade pra update-electron-app conseguir enxergá-la.
      draft: false,
      // Sem isso, se já existir um asset com o mesmo nome na release (ex.:
      // rerodar o build manualmente pra mesma versão), o publisher pula o
      // upload em silêncio e o job aparece como sucesso sem trocar nada.
      force: true,
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
      // Flipar fuses reescreve bytes no binário do Electron Framework,
      // invalidando a assinatura ad-hoc original dele. O plugin só resigna
      // automaticamente quando NÃO há osxSign configurado — como temos
      // osxSign (pros entitlements), essa proteção fica desligada por
      // padrão e o app crasha no Mac (SIGKILL Code Signature Invalid) ao
      // abrir. Forçar aqui resigna o binário logo após flipar os fuses.
      resetAdHocDarwinSignature: true,
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
