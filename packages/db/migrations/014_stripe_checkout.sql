-- Campos de rastreio para Stripe Checkout.

alter table assinaturas add column if not exists provider_checkout_session_id text;
alter table assinaturas add column if not exists provider_price_id text;

create unique index if not exists assinaturas_checkout_session_unique
  on assinaturas (provider_checkout_session_id)
  where provider_checkout_session_id is not null;
