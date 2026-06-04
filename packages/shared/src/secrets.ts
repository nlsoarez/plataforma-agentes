// Resolve segredos por referência. Em dev (SECRETS_PROVIDER=env) lê de variáveis
// de ambiente. Em produção, troque por Doppler/Vault. A chave em si nunca toca o banco.
export async function resolverSegredo(ref: string): Promise<string> {
  const provider = process.env.SECRETS_PROVIDER ?? 'env';
  if (provider === 'env') {
    const v = process.env[ref];
    if (!v) throw new Error(`segredo nao encontrado: ${ref}`);
    return v;
  }
  // TODO: integrar Doppler/Vault/AWS Secrets Manager aqui.
  throw new Error(`SECRETS_PROVIDER nao suportado: ${provider}`);
}
