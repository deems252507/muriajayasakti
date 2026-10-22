-- Notifikasi chat di luar aplikasi (Web Push): satu baris per perangkat/browser yang mengaktifkan notifikasi.
create table if not exists mjs_push_subscriptions (
  endpoint text primary key,
  username text not null references staff (username) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mjs_push_subscriptions_user_idx on mjs_push_subscriptions (username);

-- Kunci VAPID dibuat otomatis oleh server saat pertama dipakai dan disimpan di sini.
create table if not exists mjs_push_config (
  key text primary key,
  value text not null
);
