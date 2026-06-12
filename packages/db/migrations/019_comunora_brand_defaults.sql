begin;

update tenants t
   set nome = case
         when t.nome is null
           or btrim(t.nome) = ''
           or lower(btrim(t.nome)) in ('attende', 'neural lab', 'neural lab command center', 'command center')
           then 'Comunora'
         else t.nome
       end,
       logo_url = case
         when t.logo_url is null
           or btrim(t.logo_url) = ''
           or lower(t.logo_url) like '%attende%'
           or lower(t.logo_url) like '%neural%'
           then '/brand/comunora/comunora-logo-horizontal-light.svg'
         else t.logo_url
       end,
       favicon_url = case
         when t.favicon_url is null
           or btrim(t.favicon_url) = ''
           or lower(t.favicon_url) like '%attende%'
           or lower(t.favicon_url) like '%neural%'
           then '/brand/comunora/comunora-favicon.svg'
         else t.favicon_url
       end,
       cor_primaria = case
         when t.cor_primaria is null or upper(t.cor_primaria) in ('#22C55E', '#14B8A6', '#0F172A')
           then '#1565FF'
         else t.cor_primaria
       end,
       support_email = case
         when t.support_email is null
           or btrim(t.support_email) = ''
           or lower(t.support_email) like '%attende%'
           or lower(t.support_email) like '%neural%'
           then 'suporte@comunora.com.br'
         else t.support_email
       end,
       updated_at = now()
 where t.nome is null
    or btrim(t.nome) = ''
    or lower(btrim(t.nome)) in ('attende', 'neural lab', 'neural lab command center', 'command center')
    or t.logo_url is null
    or btrim(t.logo_url) = ''
    or lower(t.logo_url) like '%attende%'
    or lower(t.logo_url) like '%neural%'
    or t.favicon_url is null
    or btrim(t.favicon_url) = ''
    or lower(t.favicon_url) like '%attende%'
    or lower(t.favicon_url) like '%neural%'
    or t.cor_primaria is null
    or upper(t.cor_primaria) in ('#22C55E', '#14B8A6', '#0F172A')
    or t.support_email is null
    or btrim(t.support_email) = ''
    or lower(t.support_email) like '%attende%'
    or lower(t.support_email) like '%neural%';

commit;
