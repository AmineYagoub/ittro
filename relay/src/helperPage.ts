// The helper's web page (DESIGN.md screen 19): a sighted helper
// answers from here and installs nothing. Light theme, three answer
// buttons at least 60 tall, an optional note read aloud. The page
// polls for questions; a push tickle only wakes the service worker,
// which shows a generic prompt because the tickle carries no data.
export const HELP_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ittro helper</title>
<style>
body{margin:0;background:#F5F3EE;color:#0B0E13;font-family:'Readex Pro',system-ui,sans-serif}
main{max-width:430px;margin:0 auto;padding:28px 24px;display:flex;flex-direction:column;gap:16px}
.head{display:flex;align-items:center;gap:10px;color:#4A515C;font-size:16px}
.badge{width:36px;height:36px;border-radius:10px;background:#2A62F0;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px}
h1{margin:0;font-size:26px;font-weight:600;line-height:1.3}
p{margin:0;font-size:15px;color:#4A515C;line-height:1.5}
p.dark{color:#0B0E13}
img.photo{width:100%;border-radius:18px;display:block;background:#1A2029}
.answers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.answers button{height:64px;border:0;border-radius:16px;font-family:inherit;font-size:20px;font-weight:600;cursor:pointer}
.answers button:disabled{opacity:.45;cursor:default}
.yes{background:#2BD98A;color:#0B0E13}
.no{background:#B3261E;color:#fff}
.cant{background:#FFB224;color:#0B0E13;font-size:17px}
label.note{display:flex;flex-direction:column;gap:6px;font-size:15px;color:#4A515C}
label.note input{height:48px;border-radius:12px;border:2px solid #C9CDD4;background:#fff;padding:0 14px;font-size:17px;font-family:inherit;color:#0B0E13}
.code-row{display:flex;gap:10px}
.code-row input{flex:1;height:60px;border-radius:12px;border:2px solid #C9CDD4;background:#fff;padding:0 14px;font-size:24px;letter-spacing:6px;font-family:inherit;color:#0B0E13}
.big{height:60px;border:0;border-radius:16px;background:#2A62F0;color:#fff;font-family:inherit;font-size:20px;font-weight:600;cursor:pointer;padding:0 22px}
.big:disabled{opacity:.45;cursor:default}
.error{color:#B3261E;font-size:15px;min-height:22px}
.fine{font-size:13px;color:#4A515C}
[hidden]{display:none!important}
</style>
</head>
<body>
<main>
<div class="head"><span class="badge">i</span><span id="who">Ittro helper</span></div>
<section id="join">
<h1>Type the code they read to you</h1>
<p class="dark">Six digits, spoken one by one. The code expires after 10 minutes.</p>
<div class="code-row"><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Six digit code"></div>
<div><button class="big" id="joinBtn" type="button">Join as helper</button></div>
<p class="error" id="joinError"></p>
</section>
<section id="waiting" hidden>
<h1 id="waitTitle">You are their helper</h1>
<p class="dark" id="waitText">Waiting for their first question. Keep this page open; you will be notified.</p>
</section>
<section id="ask" hidden>
<h1 id="question">Is this it?</h1>
<img class="photo" id="photo" alt="The product they are holding">
<p id="read">Ittro's read</p>
<div class="answers">
<button class="yes" id="yesBtn" type="button">Yes</button>
<button class="no" id="noBtn" type="button">No</button>
<button class="cant" id="cantBtn" type="button">Can't tell</button>
</div>
<label class="note">A short note, read aloud to them<input id="note" maxlength="200" placeholder="it's the big one"></label>
<p class="error" id="answerError"></p>
<p class="fine">The photo is deleted when you answer, or after 30 minutes.</p>
</section>
<section id="thanks" hidden>
<h1>Answer sent. Thank you.</h1>
<p class="dark">The photo is deleted. Keep this page open for the next question.</p>
</section>
</main>
<script>
(function () {
  var token = null;
  var name = null;
  var currentId = null;
  var joinView = document.getElementById('join');
  var waitingView = document.getElementById('waiting');
  var askView = document.getElementById('ask');
  var thanksView = document.getElementById('thanks');
  function show(view) {
    joinView.hidden = view !== joinView;
    waitingView.hidden = view !== waitingView;
    askView.hidden = view !== askView;
    thanksView.hidden = view !== thanksView;
  }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (res) {
      return res.json().then(function (json) { return { status: res.status, json: json }; });
    });
  }
  function urlBase64ToBytes(text) {
    var padded = text.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4 !== 0) { padded += '='; }
    var bin = atob(padded);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) { out[i] = bin.charCodeAt(i); }
    return out;
  }
  function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { return; }
    Notification.requestPermission().then(function () {
      return navigator.serviceWorker.register('/help/sw.js');
    }).then(function (reg) {
      return fetch('/help/config').then(function (res) { return res.json(); }).then(function (config) {
        if (!config.vapidPublicKey) { return null; }
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(config.vapidPublicKey) });
      });
    }).then(function (sub) {
      if (!sub) { return; }
      post('/helper-push', { token: token, push: sub.toJSON() }).catch(function () {});
    }).catch(function () {});
  }
  function poll() {
    if (!token) { return; }
    fetch('/helper-next?token=' + encodeURIComponent(token)).then(function (res) { return res.json(); }).then(function (body) {
      var q = body.question;
      if (!q) {
        currentId = null;
        if (askView.hidden === false || waitingView.hidden === false) { show(waitingView); }
        return;
      }
      if (q.id === currentId && askView.hidden === false) { return; }
      currentId = q.id;
      document.getElementById('question').textContent = q.question;
      document.getElementById('photo').src = 'data:' + q.mime + ';base64,' + q.image;
      document.getElementById('read').textContent = "Ittro's read: " + q.read;
      document.getElementById('note').value = '';
      document.getElementById('answerError').textContent = '';
      show(askView);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Ittro has a question', { body: q.question }); } catch (e) {}
      }
    }).catch(function () {});
  }
  document.getElementById('joinBtn').addEventListener('click', function () {
    var code = document.getElementById('code').value.replace(/\\D/g, '');
    document.getElementById('joinError').textContent = '';
    if (code.length !== 6) {
      document.getElementById('joinError').textContent = 'Type all six digits.';
      return;
    }
    post('/helper-join', { code: code }).then(function (out) {
      if (!out.json.ok) {
        document.getElementById('joinError').textContent = 'Unknown or expired code. Ask them to read it again.';
        return;
      }
      token = out.json.token;
      name = out.json.name;
      document.getElementById('who').textContent = 'Ittro helper \\u00b7 for ' + name;
      document.getElementById('waitTitle').textContent = 'You are ' + name + "'s helper";
      show(waitingView);
      enablePush();
      poll();
    }).catch(function () {
      document.getElementById('joinError').textContent = 'No connection. Try again.';
    });
  });
  function answer(verdict) {
    if (!token || !currentId) { return; }
    document.getElementById('answerError').textContent = '';
    var note = document.getElementById('note').value.trim();
    post('/helper-answer', { token: token, id: currentId, verdict: verdict, note: note.length > 0 ? note : null }).then(function (out) {
      if (!out.json.ok) {
        document.getElementById('answerError').textContent = 'That question is gone. Waiting for the next one.';
        return;
      }
      currentId = null;
      show(thanksView);
    }).catch(function () {
      document.getElementById('answerError').textContent = 'No connection. Try again.';
    });
  }
  document.getElementById('yesBtn').addEventListener('click', function () { answer('yes'); });
  document.getElementById('noBtn').addEventListener('click', function () { answer('no'); });
  document.getElementById('cantBtn').addEventListener('click', function () { answer('cant_tell'); });
  setInterval(poll, 3000);
})();
</script>
</body>
</html>`;

export const HELP_SW = `self.addEventListener('push', function (event) {
  var show = self.registration.showNotification('Ittro has a question', {
    body: 'Open the helper page to answer.',
    tag: 'ittro-question'
  });
  if (event && event.waitUntil) {
    event.waitUntil(show);
  }
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var open = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
    for (var i = 0; i < windows.length; i += 1) {
      if (windows[i].url.indexOf('/help') !== -1 && 'focus' in windows[i]) {
        return windows[i].focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow('/help');
    }
    return null;
  });
  if (event && event.waitUntil) {
    event.waitUntil(open);
  }
});
`;
