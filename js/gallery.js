/* Photos from the gallery_photos table (the Gallery tab in /admin), in the order set there.
   - The gallery page (gallery.html, #photos): the first 15 show; "Show more photos" adds 15 at a time.
   - A preview ([data-gallery-preview="8"], on the catering page): just the first 8, as equal tiles, so the
     sizes set in the admin can't leave gaps. "View more photos" below it opens the gallery page.
   If the table can't be read, the photos written into the page are used instead, the same way. */
(function () {
  var PAGE = 15;
  var SHAPES = { wide: "w", tall: "t", big: "w t" };

  function siteSrc(u) { return /^https:\/\//.test(u) || /^images\//.test(u) ? u : null; }

  var request = null;
  function load() {
    if (request) return request;
    var conf = window.SITE_SUPABASE || {};
    if (!conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return (request = Promise.resolve(null));
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/gallery_photos?select=src,alt,shape&is_hidden=is.false&order=sort_order,created_at";
    return (request = fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return null; }));
  }

  // Replaces the photos in `box` with `rows`; `shapes` keeps the sizes set in the admin.
  function fill(box, rows, shapes) {
    box.textContent = "";
    rows.forEach(function (p) {
      var src = siteSrc(p.src);
      if (!src) return;
      var img = document.createElement("img");
      img.src = src;
      img.alt = p.alt;
      img.loading = "lazy";
      if (shapes && SHAPES[p.shape]) img.className = SHAPES[p.shape];
      box.appendChild(img);
    });
  }

  // The gallery page.
  (function () {
    var box = document.getElementById("photos");
    var more = document.getElementById("more");
    var count = document.getElementById("count");
    if (!box || !more) return;
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

    showNext(false); // the photos in the page, until the list loads
    load().then(function (rows) {
      if (!rows || !rows.length) return;
      fill(box, rows, true);
      shown = Math.max(shown, PAGE) - PAGE; // keep as many showing as before, if more were asked for already
      showNext(false);
    });
  })();

  // Previews.
  Array.prototype.forEach.call(document.querySelectorAll("[data-gallery-preview]"), function (box) {
    var n = parseInt(box.getAttribute("data-gallery-preview"), 10) || 8;
    load().then(function (rows) {
      if (rows && rows.length) fill(box, rows.slice(0, n), false);
    });
  });
})();
