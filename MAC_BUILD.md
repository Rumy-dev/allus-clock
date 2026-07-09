# Build Allus Clock para macOS

## Overview
O Allus Clock está configurado para gerar builds para macOS (.dmg) via Electron Forge. Como estamos desenvolvendo no Windows, o build para macOS requer uma máquina com macOS ou CI/CD com suporte a macOS.

## Configuração realizada

✅ **Instalado:**
- `@electron-forge/maker-dmg` — gera instaladores .dmg (formato padrão macOS)
- Arquivo de entitlements (`assets/entitlements.plist`) — permissões do app
- Arquivo Info.plist extendido (`assets/info.plist`) — configurações macOS

✅ **forge.config.ts atualizado:**
- MakerDMG configurado com layout padrão (app + link para Applications)
- osxSign habilitado (pronto para assinatura, sem certificado por enquanto)

## Como buildar no macOS

### Opção 1: Máquina macOS local
```bash
npm run make
```
Isso gera um `.dmg` não assinado em `out/make/dmg/arm64/` (Apple Silicon) ou `x64/` (Intel).

### Opção 2: CI/CD com GitHub Actions (recomendado)
Configure GitHub Actions para buildar em macOS:

```yaml
# .github/workflows/build-mac.yml
name: Build macOS

on:
  push:
    tags:
      - 'v*'

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run make
      - uses: actions/upload-artifact@v4
        with:
          name: allus-clock-mac
          path: out/make/dmg
```

## Distribuição sem certificados (gratuito)

Como não temos Developer ID Apple ($99/ano), usuários macOS receberão aviso do Gatekeeper:
- **Aviso:** "Allus Clock é de um desenvolvedor não identificado"
- **Contorno:** Usuários abrem Finder → `Cmd+Espaço` → digit "Allus Clock" → `Cmd+Espaço` + `Enter`

Alternativa melhor: Distribuir via GitHub Releases com instruções claras.

## Cuando tiver certificados Apple (futuro)

Se adicionar Developer ID Certificate para code signing:

1. Obter certificado em [developer.apple.com](https://developer.apple.com)
2. Adicionar ao forge.config.ts:
```typescript
osxSign: {
  identity: 'Developer ID Application: Nome (XXXXX)',
  hardenedRuntime: true,
  entitlements: 'assets/entitlements.plist',
  entitlementsInherit: 'assets/entitlements.plist',
},
osxNotarize: {
  teamId: 'XXXXX',
}
```
3. Configurar variáveis de ambiente para CI/CD

## Arquivos criados/modificados
- `forge.config.ts` — Adicionado MakerDMG
- `package.json` — Adicionado @electron-forge/maker-dmg
- `assets/entitlements.plist` — Permissões do app
- `assets/info.plist` — Configurações macOS

## Próximos passos
1. ✅ Preparação concluída — ready to build
2. ⏳ Testar build em Mac ou CI quando necessário
3. 💰 (Opcional) Adicionar certificado Apple quando crescer o user base
