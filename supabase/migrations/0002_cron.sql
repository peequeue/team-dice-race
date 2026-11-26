-- Hourly weekday trigger for the resolver. pg_cron runs in UTC; the `resolve`
-- Edge Function itself checks whether 4pm Australia/Sydney has passed and which
-- dates are outstanding, so daylight saving never shifts the reveal.
--
-- Before running: in the Supabase dashboard, Project Settings > Vault, add two secrets:
--   project_url  = https://<project-ref>.supabase.co
--   cron_secret  = a long random string (also set as the CRON_SECRET Edge Function secret)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'resolve-hourly',
  '2 * * * 1-5',          -- minute 2 of every hour, Monday to Friday (UTC)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/resolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
