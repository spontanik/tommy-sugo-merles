/* The Merle's home page's opening: a chat, like a phone's messages, in the empty frame. A friend's bubble shows typing
   dots, then "Keen for schnitz tonight?" types itself out; your reply shows typing dots, then "Let's get schnitzfaced."
   types out, sends and is read. The chat fades as the big MERLE'S wordmark comes in as the heading, Merle drops onto the
   top of the frame, and the buttons come in. It plays every time the home page opens (the inline script before <main data-view="home"> in
   merles-schnitz.html sets html.mchat before the frame is drawn). A click, tap or key press skips it. ?chat=off skips it,
   and ?chat-t=6000 holds it at that moment (in ms), for checking one step of it. */
(function () {
  var root = document.documentElement, chat = document.querySelector(".chat");
  window.MerlesChat = true;
  if (!chat || !root.classList.contains("mchat")) return;

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var prog = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };

  // ---- Timeline (ms) ----
  var MSGS = [
    { el: document.getElementById("mc-1"), text: "Keen for schnitz tonight?", on: 400, type: [1700, 3300], sent: 3350 },
    { el: document.getElementById("mc-2"), text: "Let's get schnitzfaced.", on: 3900, type: [5100, 6700], sent: 6750, read: 7150 }
  ];
  // The reply stays up for about two seconds once it's typed, so there's time to read it, before the chat fades.
  var T = { away: 8700, head: 8750, logo: 9150, rest: 9700, end: 10500 };

  // The time on the messages: now, as on a phone.
  var d = new Date(), now = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  var TICKS = '<svg viewBox="0 0 18 11" aria-hidden="true" focusable="false"><path d="M1 6l3 3 6-7M7 8l1 1 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  MSGS.forEach(function (m, i) {
    m.dots = m.el.querySelector(".dots"); m.txt = m.el.querySelector(".txt"); m.meta = m.el.querySelector(".meta");
    m.meta.innerHTML = now + (i === 1 ? TICKS : "");
  });

  function render(t) {
    MSGS.forEach(function (m) {
      // The bubble pops up with typing dots; then the words type themselves out, a letter at a time; then the time (and,
      // on yours, the ticks, which go dark once it's read).
      m.el.classList.toggle("on", t >= m.on);
      var typing = t >= m.type[0];
      m.dots.hidden = typing;
      var n = Math.round(prog(t, m.type[0], m.type[1]) * m.text.length);
      if (m.txt.textContent.length !== n) m.txt.textContent = m.text.slice(0, n);
      m.meta.hidden = t < m.sent;
      m.meta.classList.toggle("read", !!m.read && t >= m.read);
    });
    chat.classList.toggle("away", t >= T.away);
    root.classList.toggle("m-head", t >= T.head);
    root.classList.toggle("m-logo", t >= T.logo);
    root.classList.toggle("m-rest", t >= T.rest);
  }

  var raf = null, start = null;
  function settle() {
    if (raf) cancelAnimationFrame(raf);
    root.classList.remove("mchat", "m-head", "m-logo", "m-rest");
    document.removeEventListener("click", settle, true);
    window.removeEventListener("keydown", settle);
  }
  function frame(now) {
    if (start == null) start = now;
    var t = now - start;
    if (t >= T.end) return settle();
    render(t);
    raf = requestAnimationFrame(frame);
  }

  render(0);
  var hold = /[?&]chat-t=(\d+)/.exec(location.search);
  if (hold) { render(+hold[1]); return; }
  document.addEventListener("click", settle, true);
  window.addEventListener("keydown", settle);
  // If someone leaves the home view mid-chat (the nav links), finish it so the frame is whole when they come back.
  window.addEventListener("hashchange", settle);
  // Start once the fonts are in, so the words don't change shape as they type, or after a moment regardless.
  var begun = false;
  function begin() { if (begun) return; begun = true; raf = requestAnimationFrame(frame); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(begin);
  setTimeout(begin, 700);
})();
