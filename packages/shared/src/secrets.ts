// Resolve segredos por referência. Em dev (SECRETS_PROVIDER=env) lê de variáveis
// de ambiente. Em produção, troque por Doppler/Vault. A chave nunca toca o banco.
export async function resolverSegredo(ref: string): Promise<string> {
  const provider = process.env.SECRETS_PROVIDER ?? 'env';
  if (provider === 'env') {
    const v = process.env[ref];
    if (!v) throw new Error(`segredo nao encontrado: ${ref}`);
    return v;
  }
  throw new Error(`SECRETS_PROVIDER nao suportado: ${provider}`);
}

// Grava um segredo no cofre. Em dev (env) não persiste — apenas avisa (sem logar o valor).
export async function guardarSegredo(ref: string, _valor: string): Promise<void> {
  const provider = process.env.SECRETS_PROVIDER ?? 'env';
  if (provider === 'env') {
    console.warn(`[cofre] provider=env nao persiste. Configure manualmente o segredo: ${ref}`);
    return;
  }
  // TODO: escrever no Doppler/Vault/AWS Secrets Manager.
  throw new Error(`SECRETS_PROVIDER nao suportado para escrita: ${provider}`);
}
