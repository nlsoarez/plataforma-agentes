# Extensao EMBRATEL Nova REC

O codigo-fonte da extensao fica versionado sem credenciais. Gere o pacote carregavel com:

```bash
pnpm build:extension
```

Carregue `tools/embratel-rec-extension/dist` como extensao descompactada no Chrome/Edge. Depois informe, nas opcoes:

- URL: `https://relay.comunora.com.br`
- credencial nova gerada durante a migracao

A credencial antiga estava embutida na versao 1.15.0 e deve ser considerada comprometida. Ela nao pode ser reutilizada no servidor novo.
