# Build Allus Focus para macOS

## Status atual
✅ Configuração de build pronta (MakerDMG, entitlements, Info.plist)
✅ GitHub Actions builda e publica o `.dmg` automaticamente (`.github/workflows/build-mac.yml`)
⚠️ O disparo automático (push de tag `v*`) pode falhar silenciosamente se a tag
   for criada no mesmo commit de uma mudança grande no repo (ex.: rename do
   repositório) — foi o que aconteceu com a v3.0.6, que saiu sem `.dmg` na
   release. Nesses casos, dispare manualmente (ver abaixo) que ele publica
   certinho na release já existente.

## CI/CD (GitHub Actions)

`.github/workflows/build-mac.yml` builda em runner `macos-latest` e publica o
`.dmg` direto na release do GitHub (via `PublisherGithub`, usa a versão do
`package.json` pra achar/criar a release — não depende de qual ref disparou
o run). Funciona normalmente desde a v3.0.0.

Se uma tag nova não disparar o build sozinha, dispare à mão:
**Actions → Build macOS → Run workflow** (branch `master`).

## Como buildar no macOS localmente (alternativa)

Precisa de alguém com um Mac (Pedro tem Apple Silicon M-series). Ver
`Allus-Clock-Build-Mac.pdf` na raiz do repo pra instruções passo a passo
prontas pra encaminhar.

Resumo do processo:
```bash
git clone https://github.com/Rumy-dev/Allus-Focus.git
cd Allus-Focus
npm install
npm run make
```
Gera o `.dmg` não assinado em:
- `out/make/dmg/arm64/Allus Focus.dmg` — Apple Silicon (M1/M2/M3...)
- `out/make/dmg/x64/Allus Focus.dmg` — Intel

## Publicando uma nova versão

1. Bump de versão em `package.json`
2. Criar tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. Conferir se `build-mac.yml` e `build-windows.yml` rodaram (Actions) e
   publicaram os assets na release `vX.Y.Z`. Se não rodaram sozinhos, disparar
   manualmente via `workflow_dispatch` (Actions → Run workflow).

## Distribuição pros usuários finais

Como não temos Developer ID Apple ($99/ano), o `.dmg` não é assinado.
Na primeira abertura, o macOS mostra "desenvolvedor não identificado":
- Contorno: clicar com **botão direito** no app → **Abrir** → confirmar
  "Abrir mesmo assim" (só necessário uma vez)

Link de download da versão mais recente sempre fica em:
**https://github.com/Rumy-dev/Allus-Focus/releases**

## Quando tiver certificado Apple (futuro)

Se adicionar Developer ID Certificate para code signing, em `forge.config.ts`:
```typescript
osxSign: {
  identity: 'Developer ID Application: Nome (XXXXX)',
  hardenedRuntime: true,
  optionsForFile: () => ({ entitlements: 'assets/entitlements.plist' }),
},
osxNotarize: {
  teamId: 'XXXXX',
}
```
Isso elimina o aviso do Gatekeeper e permite habilitar o GitHub Actions
pra assinar + notarizar automaticamente também.

## Arquivos relevantes
- `forge.config.ts` — MakerDMG, osxSign, entitlements, publisher, fuses
- `assets/entitlements.plist` — permissões do app (tray, notificações, arquivos)
- `assets/info.plist` — configurações macOS (Info.plist estendido)
- `.github/workflows/build-mac.yml` — build + publish automático via macos-latest
- `Allus-Clock-Build-Mac.pdf` — instruções pra quem for gerar o build

## Bugs já encontrados e corrigidos (histórico, v3.0.6)

Documentado aqui pra não perder o contexto se precisar mexer de novo nessa
área. Todos corrigidos entre os commits `a98e8b9` e `2f6ad1c`.

1. **`.dmg` com conteúdo errado.** `MakerDMG.contents` estava com um array
   fixo e `path: ''` pro app — `electron-installer-dmg` só resolve o caminho
   real do app quando `contents` é passado como **função** que recebe
   `opts.appPath`. Com array fixo, empacotava a pasta errada.

2. **Republicar não sobrescrevia asset.** `PublisherGithub` pula o upload em
   silêncio se já existe um asset com o mesmo nome na release — precisa
   `force: true` pra garantir que reruns realmente substituam o `.dmg`/`.exe`
   antigo.

3. **Crash no launch em Apple Silicon (`SIGKILL Code Signature Invalid`).**
   `FusesPlugin` reescreve bytes do binário do Electron Framework, invalidando
   a assinatura ad-hoc original. A proteção `resetAdHocDarwinSignature` do
   plugin só liga sozinha quando **não** há `osxSign` configurado — como
   temos (pros entitlements), precisa ser forçada manualmente:
   `resetAdHocDarwinSignature: true` no `FusesPlugin`.

4. **Login falha só no Mac ("Cannot coerce the result to a single JSON
   object" / perfil não carrega, mesma conta funcionando no Windows).**
   Causa: `safeStorage.isEncryptionAvailable()` (Keychain via Electron)
   retornou `false` num Mac com macOS muito recente (26.5) — provável gap de
   compatibilidade entre Electron 43.x e essa versão do macOS (ainda não
   existe Electron 44 estável pra testar se corrige; monitorar releases
   futuras do Electron). Sem Keychain, a sessão do Supabase nunca persistia,
   e o supabase-js manda requests sem o header de autenticação quando não
   acha sessão no storage — o RLS então esconde os dados como se ninguém
   estivesse logado. Fix em `src/main/supabase/secureStorage.ts`: quando o
   Keychain/DPAPI falha, cai num fallback que gera e guarda uma chave
   AES-256-GCM própria (arquivo com permissão `0o600`) em vez de desistir de
   persistir a sessão. Continua criptografado em repouso, só não depende mais
   do SO. Tem log de depuração ativo em `debug-auth.log` (pasta de dados do
   app) pra confirmar se esse caso voltar a acontecer — remover esse log
   depois de um tempo estável sem reincidência.

## Gatekeeper ("app corrompido"/"desenvolvedor não identificado")

Sem Developer ID Apple, isso reaparece a **cada novo `.dmg` baixado** (não é
bug, é o macOS marcando qualquer download não notarizado). Precisa sempre:
```bash
xattr -cr "/Applications/Allus Focus.app"
```
seguido de clique direito → Abrir. Isso vai continuar acontecendo até
notarizar o app (ver seção acima, "Quando tiver certificado Apple").
