-- Atualiza o modelo Anthropic antigo que passou a retornar 404 na API.
-- Escopo propositalmente restrito: só troca exatamente o identificador quebrado.

update ai_provider_settings
   set default_model = 'claude-haiku-4-5-20251001',
       atualizado_em = now()
 where provider = 'anthropic'
   and default_model = 'claude-3-5-haiku-20241022';

update agentes
   set modelo = 'claude-haiku-4-5-20251001'
 where provider = 'anthropic'
   and modelo = 'claude-3-5-haiku-20241022';
