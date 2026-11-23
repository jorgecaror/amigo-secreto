/*
 * Configuración pública del sitio. Ver docs/SUPABASE-SETUP.md.
 * - Si supabaseUrl o supabaseAnonKey están vacíos, los perfiles se desactivan y la app funciona igual (sin cuenta).
 * - La anon/publishable key es PÚBLICA por diseño: la seguridad de los datos la da RLS (supabase/schema.sql).
 *   NUNCA poner aquí la service_role / secret key.
 */
window.AMIGO_SECRETO_CONFIG = Object.freeze({
  supabaseUrl: 'https://afrsrmxkgfztevosnjkw.supabase.co',      // ej: 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcnNybXhrZ2Z6dGV2b3Nuamt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NTAxOTMsImV4cCI6MjExMTAyNjE5M30.XPoQS1aZ4ziAcA98PvRJfTPjCpoLcTRJym4boZ0SMEU'   // ej: 'eyJhbGciOi...' (anon) o 'sb_publishable_...'
});
