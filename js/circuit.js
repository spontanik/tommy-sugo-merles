/* On the circuit: where the Tommy Sugo truck is next, from the circuit_events table (the Events tab in /admin).
   Circuit.label(start, end) writes an event's dates the way the cards show them ("12–15 Nov"); the admin uses it too.
   On the catering page, Circuit.fill() replaces the cards in [data-circuit] with the events that haven't ended yet,
   soonest first, keeping the last "More dates" card. If the table can't be read, the cards written into the page stay. */
(function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function parts(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  }

  function label(start, end) {
    var a = parts(start), b = parts(end);
    if (!a) return "";
    if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return a.d + " " + MONTHS[a.m];
    if (a.y === b.y && a.m === b.m) return a.d + "–" + b.d + " " + MONTHS[a.m];
    return a.d + " " + MONTHS[a.m] + " – " + b.d + " " + MONTHS[b.m];
  }

  // Today in South Africa, as YYYY-MM-DD, so an event stays up until the end of its last day there.
  function today() {
    try { return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); } catch (e) {}
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function safeLink(u) { return /^https?:\/\/\S+$/.test(u || "") ? u : null; }

  function card(ev) {
    var link = safeLink(ev.link);
    var art = el("article", "date");
    if (ev.logo_url && /^https:\/\//.test(ev.logo_url)) {
      var img = el("img");
      img.src = ev.logo_url;
      img.alt = ev.name + " logo";
      img.loading = "lazy";
      var logo;
      img.onerror = function () { logo.remove(); }; // a missing logo shouldn't leave a gap
      if (link) {
        // The text link below names the page, so the logo is a second, mouse-only way there.
        logo = el("a", "date-logo");
        logo.href = link;
        logo.target = "_blank";
        logo.rel = "noopener";
        logo.tabIndex = -1;
        logo.setAttribute("aria-hidden", "true");
        img.alt = "";
      } else {
        logo = el("div", "date-logo");
      }
      logo.appendChild(img);
      art.appendChild(logo);
    }
    art.appendChild(el("p", "tag red", label(ev.starts_on, ev.ends_on)));
    art.appendChild(el("h3", null, ev.name));
    var dl = el("dl");
    [["Where", ev.venue], ["Serving", ev.serving]].forEach(function (p) {
      if (!p[1]) return;
      var row = el("div");
      row.appendChild(el("dt", null, p[0]));
      row.appendChild(el("dd", null, p[1]));
      dl.appendChild(row);
    });
    if (dl.children.length) art.appendChild(dl);
    if (link) {
      var a = el("a", "date-link", "Event page ↗");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", ev.name + " event page (opens in a new tab)");
      art.appendChild(a);
    }
    return art;
  }

  function fill(box) {
    box = box || document.querySelector("[data-circuit]");
    var conf = window.SITE_SUPABASE || {};
    if (!box || !conf.url || !conf.key || /YOUR-/.test(conf.url + conf.key)) return Promise.resolve(false);
    var q = conf.url.replace(/\/$/, "") + "/rest/v1/circuit_events" +
      "?select=name,starts_on,ends_on,venue,serving,logo_url,link" +
      "&is_hidden=is.false&last_day=gte." + today() + "&order=starts_on,name";
    return fetch(q, { headers: { apikey: conf.key, Authorization: "Bearer " + conf.key } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        var more = box.querySelector(".date.more");
        Array.prototype.slice.call(box.querySelectorAll(".date:not(.more)")).forEach(function (n) { n.remove(); });
        rows.forEach(function (ev) { box.insertBefore(card(ev), more); });
        return true;
      })
      .catch(function () { return false; });
  }

  window.Circuit = { label: label, today: today, fill: fill };
})();
