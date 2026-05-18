// StudyCenter Service Worker
// Fires a study briefing on every Chromebook login / Chrome startup

// ── Install & Activate ────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
});
// ── Activate: fires when Chrome starts up after login ─────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    self.clients.claim().then(function() {
      return maybeNotify();
    })
  );
});

// ── Periodic Background Sync (fallback / extra reliability) ───────────
self.addEventListener('periodicsync', function(e) {
  if (e.tag === 'daily-study-check') {
    e.waitUntil(maybeNotify());
  }
});

// ── Fire every login / startup ────────────────────────────────────────
function maybeNotify() {
  return fireNotifications();
}

function fireNotifications() {

  return caches.open('sc-data').then(function(dataCache) {
    return dataCache.match('studycenter-data').then(function(resp) {
      if (!resp) {
        return sendNotif(
          '📚 StudyCenter — Good morning!',
          'Open the app to review your assignments and tests for today.'
        );
      }
      return resp.json().then(function(data) {
        return buildAndSendNotifs(data);
      });
    });
  });
}

function buildAndSendNotifs(data) {
  var assignments = data.assignments || [];
  var tests = data.tests || [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  var pending = assignments.filter(function(a) { return !a.done; });
  var overdue = pending.filter(function(a) { return daysUntil(a.due) < 0; });
  var dueToday = pending.filter(function(a) { return daysUntil(a.due) === 0; });
  var dueTomorrow = pending.filter(function(a) { return daysUntil(a.due) === 1; });
  var dueSoon = pending.filter(function(a) { var n = daysUntil(a.due); return n >= 2 && n <= 3; });
  var urgentTests = tests.filter(function(t) { var n = daysUntil(t.date); return n >= 0 && n <= 3; });

  var notifs = [];

  if (overdue.length === 1)
    notifs.push(['⚠️ Overdue Assignment', overdue[0].title + ' is past due!']);
  else if (overdue.length > 1)
    notifs.push(['⚠️ ' + overdue.length + ' Overdue Assignments', overdue.map(function(a){return a.title;}).join(', ')]);

  if (dueToday.length === 1)
    notifs.push(['📅 Due Today', dueToday[0].title + ' is due today!']);
  else if (dueToday.length > 1)
    notifs.push(['📅 ' + dueToday.length + ' Things Due Today', dueToday.map(function(a){return a.title;}).join(', ')]);

  if (dueTomorrow.length === 1)
    notifs.push(['🔔 Due Tomorrow', dueTomorrow[0].title + ' is due tomorrow.']);
  else if (dueTomorrow.length > 1)
    notifs.push(['🔔 ' + dueTomorrow.length + ' Things Due Tomorrow', dueTomorrow.map(function(a){return a.title;}).join(', ')]);

  if (dueSoon.length)
    notifs.push(['📚 Coming Up Soon', dueSoon.map(function(a){return a.title + ' (in ' + daysUntil(a.due) + 'd)';}).join(', ')]);

  urgentTests.forEach(function(t) {
    var n = daysUntil(t.date);
    var when = n === 0 ? 'TODAY' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
    notifs.push(['📝 ' + t.type + ' ' + when + '!', t.title + ' (' + t.cls + ') is ' + when + '.']);
  });

  if (!notifs.length) {
    notifs.push(['✅ All clear! — StudyCenter', 'Nothing urgent due in the next 3 days. Keep it up!']);
  }

  // Send all notifications with a small delay between them
  var chain = Promise.resolve();
  notifs.forEach(function(n, i) {
    chain = chain.then(function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          sendNotif(n[0], n[1]).then(resolve);
        }, i * 800);
      });
    });
  });
  return chain;
}

function sendNotif(title, body) {
  return self.registration.showNotification(title, {
    body: body,
    icon: 'data:image/svg+xml,%3Csvg width=\'256\' height=\'256\' viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'256\' height=\'256\' rx=\'52\' fill=\'%230d0f14\'/%3E%3Ccircle cx=\'128\' cy=\'128\' r=\'44\' fill=\'%231a1e28\'/%3E%3Cpolyline points=\'110,128 122,141 148,112\' fill=\'none\' stroke=\'%234da6ff\' stroke-width=\'6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg width=\'96\' height=\'96\' viewBox=\'0 0 96 96\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'96\' height=\'96\' rx=\'20\' fill=\'%237c6af7\'/%3E%3Cpolyline points=\'30,48 42,61 66,36\' fill=\'none\' stroke=\'white\' stroke-width=\'8\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E',
    tag: 'studycenter-daily',
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'open', title: '📖 Open StudyCenter' }
    ]
  });
}

// ── Notification click → open the app ─────────────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf('StudyCenter') !== -1 && 'focus' in clients[i]) {
          return clients[i].focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./StudyCenter.html');
      }
    })
  );
});
