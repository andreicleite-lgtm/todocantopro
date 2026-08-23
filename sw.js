// Service worker mínimo — habilita a instalação do app.
// Não guarda dados offline (o sistema precisa de internet pro Supabase).
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => { /* deixa passar direto pra rede */ });
