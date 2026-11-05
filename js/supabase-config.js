/* Supabase connection for the public pages and /admin.
   The publishable key is safe to ship in the browser: row-level security only lets the public read visible items,
   and only signed-in admins can change them. Leave these as-is and the pages show their built-in (static) menu. */
window.SITE_SUPABASE = {
  url: "https://awazfdglfhmkejrctnkz.supabase.co",
  key: "sb_publishable_rJD_dad-1yr-Gkavq4QdbQ_Q-UUYs3w"
};
