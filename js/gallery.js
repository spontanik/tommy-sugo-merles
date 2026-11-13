/* The gallery page (gallery.html). Photos come from the gallery_photos table (the Gallery tab in /admin), in the order
   set there. The first 15 show; "Show more photos" adds 15 at a time. If the table can't be read, the photos written
   into the page are used instead, the same way. */
(function () {
  var PAGE = 15;
  var SHAPES = { wide: "w", tall: "t", big: "w t" };
  var box = document.getElementById("photos");
  var more = document.getElementById("more");
  var count = document.getElementById("count");
  if (!box) return;
  var shown = 0;

  function photos() { return Array.prototype.slice.call(box.querySelectorAll("img")); }

  function showNext(focusNew) {
    var all = photos();
    var from = shown;
    shown = Math.min(all.length, shown + PAGE);
    all.forEach(function (img, i) { img.hidden = i >= shown; });
    more.hidden = shown >= all.length;
    count.textContent = all.length ? "Showing " + shown + " of " + all.length + " photos" : "";
    // Keyboard and screen reader users carry on from the first new photo.
    if (focusNew && all[from]) {
      all[from].tabIndex = -1;
      all[from].focus();
    }
  }

  more.addEventListener("click", function () { showNext(true); });

  function siteSrc(u) { return /^https:\/\//.test(u) || /^images\//.test(u) ? u : null; }

  function load() {
    var conf = window.SITE_SUPABASE || {};
    if (!conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return Promise.resolve(null);
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/gallery_photos?select=src,alt,shape&is_hidden=is.false&order=sort_order,created_at";
    return fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return null; });
  }

  showNext(false); // the photos in the page, until the list loads
  load().then(function (rows) {
    if (!rows || !rows.length) return;
    box.textContent = "";
    rows.forEach(function (p) {
      var src = siteSrc(p.src);
      if (!src) return;
      var img = document.createElement("img");
      img.src = src;
      img.alt = p.alt;
      img.loading = "lazy";
      if (SHAPES[p.shape]) img.className = SHAPES[p.shape];
      box.appendChild(img);
    });
    shown = Math.max(shown, PAGE) - PAGE; // keep as many showing as before, if more were asked for already
    showNext(false);
  });
})();
