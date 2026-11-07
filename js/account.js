/* Customer accounts, and the orders kept on this device. Used by the checkout (order.js), order.html and account.html.
   - Orders on this device: each order page saves its link here, so customers without an account can find it again.
     The links live in this browser only, and the my-orders function looks them up.
   - Accounts: Supabase Auth with email and password, plus a profile (name, cell number, specials) in public.customers.
     The session is stored under its own key, so a customer session and an admin session in /admin never mix.
     Needs supabase-js loaded first. Without it the device list still works and account features stay off.
   Account.authForm(container, options) draws "Create an account" and "Sign in" without a <form>, so it can sit
   inside the checkout form. */
(function () {
  var conf = window.SITE_SUPABASE || {};
  var DEVICE_KEY = "tsm-device-orders";
  var MAX_DEVICE = 30;
  var client = null;

  var PITCH = "Create an account to follow every order on any device and hear about specials first. " +
    "We'll also keep your cell number, which is how loyalty points work at our counter.";

  function db() {
    if (!client && window.supabase && conf.url) {
      client = window.supabase.createClient(conf.url, conf.key, {
        auth: { storageKey: "tsm-customer-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  // ---------- Orders on this device ----------
  function deviceOrders() {
    try {
      var list = JSON.parse(localStorage.getItem(DEVICE_KEY) || "[]");
      return Array.isArray(list) ? list.filter(function (o) { return o && /^[0-9a-f]{64}$/.test(o.t); }) : [];
    } catch (e) { return []; }
  }
  function saveDevice(list) {
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(list.slice(0, MAX_DEVICE))); } catch (e) { /* private browsing: nothing to keep */ }
  }
  function remember(token, brand, number) {
    var list = deviceOrders().filter(function (o) { return o.t !== token; });
    list.unshift({ t: token, brand: brand, number: number, at: new Date().toISOString() });
    saveDevice(list);
  }

  function call(name, body, bearer) {
    return fetch(conf.url.replace(/\/$/, "") + "/functions/v1/" + name, {
      method: "POST",
      headers: { apikey: conf.key, Authorization: "Bearer " + (bearer || conf.key), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) throw new Error(res.error || "Something went wrong. Please try again.");
      return res;
    });
  }

  // ---------- Accounts ----------
  function session() {
    if (!db()) return Promise.resolve(null);
    return db().auth.getSession().then(function (r) { return r.data.session; });
  }

  function profile(user) {
    return db().from("customers").select("name, phone, specials").eq("id", user.id).maybeSingle()
      .then(function (r) { return r.data || { name: "", phone: "", specials: false }; });
  }

  function saveProfile(user, fields) {
    return db().from("customers").update(fields).eq("id", user.id).select("id").then(function (r) {
      if (r.error || !r.data.length) throw new Error("Couldn't save your details. Please try again.");
    });
  }

  // South African cell numbers, written any common way: 082 123 4567, 0821234567, +27 82 123 4567.
  function cleanPhone(value) {
    var digits = String(value || "").replace(/[\s()-]/g, "");
    return /^(\+27|0)[6-8]\d{8}$/.test(digits) ? digits : null;
  }

  function friendly(error) {
    var code = (error && (error.code || "")) + " " + (error && error.message || "");
    if (/invalid_credentials|Invalid login/i.test(code)) return "That email and password don't match.";
    if (/email_not_confirmed/i.test(code)) return "Please confirm your email first, using the link we sent you.";
    if (/signup_disabled|Signups not allowed/i.test(code)) return "Accounts aren't open yet. Please choose No account for now.";
    if (/email_address_not_authorized/i.test(code)) return "We can't send email to that address yet. Please choose No account for now.";
    if (/user_already_exists|already registered/i.test(code)) return "There's already an account with that email. Sign in instead.";
    if (/weak_password|Password should/i.test(code)) return "Use a password of at least 8 characters.";
    if (/rate_limit|rate limit/i.test(code)) return "Too many tries just now. Please wait a few minutes and try again.";
    if (/fetch|network/i.test(code)) return "We couldn't reach the server. Please check your connection.";
    return "Something went wrong. Please try again.";
  }

  function pageUrl(name) { return location.href.replace(/[^/]*([?#].*)?$/, name); }

  function signUp(f) {
    return db().auth.signUp({
      email: f.email,
      password: f.password,
      options: { data: { name: f.name, phone: f.phone, specials: !!f.specials }, emailRedirectTo: pageUrl("account.html") }
    }).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
      // With email confirmation on, there's no session until they click the link.
      return { session: r.data.session, needsConfirm: !r.data.session };
    });
  }

  function signIn(email, password) {
    return db().auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
      return r.data.session;
    });
  }

  function resetPassword(email) {
    return db().auth.resetPasswordForEmail(email, { redirectTo: pageUrl("account.html") }).then(function (r) {
      if (r.error) throw new Error(friendly(r.error));
    });
  }

  // ---------- The sign-up / sign-in form ----------
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function field(prefix, name, label, type, auto, hint) {
    var wrap = el("div", { class: "fld" });
    var input = el("input", { id: prefix + name, class: "field", type: type, autocomplete: auto });
    wrap.appendChild(el("label", { class: "lbl", for: input.id }, label));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el("p", { class: "desc", style: "font-size:14px" }, hint));
    return { wrap: wrap, input: input };
  }

  // options: { prefix, onSignedIn(session), start: "signup" | "signin" }
  function authForm(container, options) {
    options = options || {};
    var p = options.prefix || "acct-";
    container.textContent = "";
    var root = el("div", { class: "stack acct-form", style: "gap:16px" });
    var tabs = el("div", { class: "btns", role: "group", "aria-label": "Account" });
    var upTab = el("button", { type: "button", class: "pill" }, "Create an account");
    var inTab = el("button", { type: "button", class: "pill" }, "Sign in");
    tabs.appendChild(upTab); tabs.appendChild(inTab);

    var up = el("div", { class: "stack", style: "gap:16px" });
    var uName = field(p, "up-name", "Your name", "text", "name");
    var uEmail = field(p, "up-email", "Email", "email", "email");
    var uPhone = field(p, "up-phone", "Cell number", "tel", "tel", "Use the number you'll give us at the counter for loyalty points.");
    var uPass = field(p, "up-pass", "Password", "password", "new-password", "At least 8 characters.");
    var specials = el("label", { class: "acct-check", style: "display:flex;gap:12px;align-items:flex-start;cursor:pointer" });
    var sBox = el("input", { type: "checkbox", style: "width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:currentColor" });
    specials.appendChild(sBox);
    specials.appendChild(el("span", null, "Send me specials and news by email. You can stop any time."));
    var upBtn = el("button", { type: "button", class: "btn" }, "Create Account");
    [uName, uEmail, uPhone, uPass].forEach(function (f) { up.appendChild(f.wrap); });
    up.appendChild(specials); up.appendChild(upBtn);

    var sin = el("div", { class: "stack", style: "gap:16px" });
    var iEmail = field(p, "in-email", "Email", "email", "email");
    var iPass = field(p, "in-pass", "Password", "password", "current-password");
    var inBtn = el("button", { type: "button", class: "btn" }, "Sign In");
    var forgot = el("button", { type: "button", class: "acct-link", style: "align-self:flex-start;min-height:44px;padding:0;background:none;border:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer" }, "Forgot your password?");
    sin.appendChild(iEmail.wrap); sin.appendChild(iPass.wrap); sin.appendChild(inBtn); sin.appendChild(forgot);

    var msg = el("p", { role: "alert", style: "margin:0;font-weight:700" });
    msg.hidden = true;
    root.appendChild(tabs); root.appendChild(up); root.appendChild(sin); root.appendChild(msg);
    container.appendChild(root);

    function say(text) { msg.textContent = text; msg.hidden = !text; }
    function show(which) {
      up.hidden = which !== "signup";
      sin.hidden = which !== "signin";
      upTab.setAttribute("aria-pressed", String(which === "signup"));
      inTab.setAttribute("aria-pressed", String(which === "signin"));
      say("");
    }
    function busy(btn, on, text) { btn.disabled = on; btn.textContent = text; }
    upTab.addEventListener("click", function () { show("signup"); });
    inTab.addEventListener("click", function () { show("signin"); });
    show(options.start || "signup");

    function validEmail(input) { return input.value.trim() && input.checkValidity(); }

    upBtn.addEventListener("click", function () {
      var phone = cleanPhone(uPhone.input.value);
      var problem = !uName.input.value.trim() ? "Add your name."
        : !validEmail(uEmail.input) ? "Add your email address."
        : !phone ? "Add a South African cell number, like 082 123 4567."
        : uPass.input.value.length < 8 ? "Use a password of at least 8 characters." : "";
      if (problem) { say(problem); return; }
      busy(upBtn, true, "Creating your account…");
      signUp({ name: uName.input.value.trim(), email: uEmail.input.value.trim(), phone: phone, password: uPass.input.value, specials: sBox.checked })
        .then(function (r) {
          busy(upBtn, false, "Create Account");
          if (r.needsConfirm) {
            iEmail.input.value = uEmail.input.value.trim();
            show("signin");
            say("Nearly there: we've emailed you a link to confirm your address. Click it, then sign in here.");
            return;
          }
          if (options.onSignedIn) options.onSignedIn(r.session);
        })
        .catch(function (e) { busy(upBtn, false, "Create Account"); say(e.message); });
    });

    inBtn.addEventListener("click", function () {
      if (!validEmail(iEmail.input) || !iPass.input.value) { say("Add your email and password."); return; }
      busy(inBtn, true, "Signing in…");
      signIn(iEmail.input.value.trim(), iPass.input.value)
        .then(function (s) { busy(inBtn, false, "Sign In"); if (options.onSignedIn) options.onSignedIn(s); })
        .catch(function (e) { busy(inBtn, false, "Sign In"); say(e.message); });
    });

    forgot.addEventListener("click", function () {
      if (!validEmail(iEmail.input)) { say("Add your email above, then tap Forgot your password again."); return; }
      resetPassword(iEmail.input.value.trim())
        .then(function () { say("If there's an account for that email, we've sent a link to choose a new password."); })
        .catch(function (e) { say(e.message); });
    });

    // Enter runs this form's own button, not the checkout it may sit inside.
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.tagName !== "INPUT" || e.target.type === "checkbox") return;
      e.preventDefault();
      (up.hidden ? inBtn : upBtn).click();
    });
  }

  window.Account = {
    PITCH: PITCH,
    enabled: function () { return !!db(); },
    db: db,
    session: session,
    profile: profile,
    saveProfile: saveProfile,
    cleanPhone: cleanPhone,
    signOut: function () { return db() ? db().auth.signOut() : Promise.resolve(); },
    onChange: function (fn) { if (db()) db().auth.onAuthStateChange(fn); },
    updatePassword: function (password) {
      return db().auth.updateUser({ password: password }).then(function (r) { if (r.error) throw new Error(friendly(r.error)); });
    },
    authForm: authForm,
    deviceOrders: deviceOrders,
    remember: remember,
    lookupDevice: function () {
      var tokens = deviceOrders().map(function (o) { return o.t; });
      return tokens.length ? call("my-orders", { action: "device", tokens: tokens }).then(function (r) { return r.orders; }) : Promise.resolve([]);
    },
    accountOrders: function (s, claim) {
      return call("my-orders", { action: "account", claim: claim || [] }, s.access_token);
    }
  };
})();
