// On Netlify or Vercel, '/api' is a same-site relay to the Supabase functions (see netlify.toml / vercel.json),
// so work networks that block supabase.co still work. The GitHub Pages build replaces this file with
// the direct Supabase address. No key is needed: the functions do their own checks.
window.TDR_CONFIG = {
  functionsUrl: '/api',
  anonKey: '',
};
