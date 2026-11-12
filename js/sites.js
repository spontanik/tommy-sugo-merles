/* Where each site lives. On spontanik.co.za every site has its own address: the main page on spontanik.co.za, the
   brands on tommy. and merles., the admin on admin. (the routes in vercel.json serve the right file at each one). Anywhere else
   (a local copy, GitHub Pages) everything is one folder, so the pages link to each other as files.

   Links marked data-site="tommy" (or home, merles, admin, events, shop) are pointed at the right address when the page
   loads. Events and the combined Shop are pages on the main address (spontanik.co.za/events.html). Their
   href stays as the file, so they still work locally. Load this from the page's folder: js/sites.js, or ../js/sites.js
   from the admin. */
(function () {
  var DOMAIN = "spontanik.co.za";
  var SUBDOMAINS = { home: "", tommy: "tommy.", merles: "merles.", admin: "admin.", events: "", shop: "" };
  var FILES = { home: "index.html", tommy: "tommy-sugo.html", merles: "merles-schnitz.html", admin: "admin/", events: "events.html", shop: "shop.html" };
  var LIVE_PATHS = { events: "events.html", shop: "shop.html" }; // the rest are each address's home page

  var host = location.hostname;
  var live = host === DOMAIN || host.slice(-DOMAIN.length - 1) === "." + DOMAIN;
  var inAdmin = /\/admin\/[^/]*$/.test(location.pathname);

  // The site's address, with an optional hash ("#menu"). Unknown sites go to the main page.
  function url(site, hash) {
    if (!(site in FILES)) site = "home";
    hash = hash || "";
    if (live) return "https://" + SUBDOMAINS[site] + DOMAIN + "/" + (LIVE_PATHS[site] || "") + hash;
    return (inAdmin ? "../" : "") + FILES[site] + hash;
  }

  function point(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-site]"), function (a) {
      a.href = url(a.getAttribute("data-site"), a.getAttribute("data-site-hash") || "");
    });
  }

  if (live) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { point(); });
    else point();
  }

  window.Sites = { url: url, live: live, point: point };
})();
