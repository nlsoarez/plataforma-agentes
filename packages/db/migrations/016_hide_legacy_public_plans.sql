-- A UI publica deve mostrar apenas os planos oficiais Attende.
update planos
   set is_public = false,
       is_active = false,
       updated_at = now()
 where code is not null
   and code not in ('start', 'pro', 'business', 'white_label');
