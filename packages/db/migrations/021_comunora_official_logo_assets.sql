begin;

update tenants
   set logo_url = '/brand/comunora/comunora-logo-horizontal-official.png',
       favicon_url = '/brand/comunora/comunora-favicon.png',
       updated_at = now()
 where status <> 'deleted'
   and (
     logo_url is null
     or logo_url = ''
     or logo_url = '/brand/comunora/comunora-logo-horizontal-light.svg'
     or logo_url = '/brand/comunora/comunora-logo-horizontal-dark.svg'
     or logo_url like '%attende%'
     or logo_url like '%neural%'
     or favicon_url is null
     or favicon_url = ''
     or favicon_url = '/brand/comunora/comunora-favicon.svg'
     or favicon_url like '%attende%'
     or favicon_url like '%neural%'
   );

commit;
