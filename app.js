(() => {
  'use strict';
  const DATA_KEY = 'rushabh-workday-v1';
  const mode = document.documentElement.dataset.appMode || 'lite';
  const defaults = { profile: { name: '', workplace: 'Rushabh Enterprise', latitude: '', longitude: '', radius: 150 }, attendance: [], reports: [] };
  let state = loadState();
  let installPrompt = null;
  let toastTimer = 0;
  const $ = id => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const safe = value => String(value ?? '');
  const isoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const istTime = date => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(date));
  const displayDate = iso => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00+05:30`));

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      return { ...defaults, ...parsed, profile: { ...defaults.profile, ...(parsed?.profile || {}) }, attendance: Array.isArray(parsed?.attendance) ? parsed.attendance : [], reports: Array.isArray(parsed?.reports) ? parsed.reports : [] };
    } catch { return structuredClone(defaults); }
  }
  function saveState() { localStorage.setItem(DATA_KEY, JSON.stringify(state)); render(); }
  function toast(message) {
    const el = $('toast'); if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function todayAttendance() { return state.attendance.find(row => row.date === isoToday()); }
  function todayReports() { return state.reports.filter(row => row.date === isoToday()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  function latestPlan() { return state.reports.find(row => row.plan?.trim()); }
  function navigate(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
    const titles = { dashboard: 'Overview', attendance: 'Attendance', reports: 'Daily report', history: 'My activity', settings: 'Settings' };
    text('crumb-title', titles[view] || 'Overview');
    if (view === 'reports' && $('report-date') && !$('report-date').value) $('report-date').value = isoToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function dayHeading() {
    const today = new Date();
    text('today-weekday', new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', weekday:'long' }).format(today).toUpperCase());
    text('today-date', new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(today).toUpperCase());
    text('attendance-day', new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' }).format(today));
    text('footer-year', String(today.getFullYear()));
    const hr = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(today));
    text('greeting', `${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${state.profile.name ? `, ${state.profile.name.split(' ')[0]}` : ''}.`);
    if ($('report-date') && !$('report-date').value) $('report-date').value = isoToday();
  }
  function setUpMode() {
    text('mode-label', mode === 'pwa' ? 'ON THIS DEVICE' : 'LITE · ON THIS DEVICE');
    if (mode === 'pwa' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => toast('Offline install is unavailable in this browser.'));
      window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; const btn = $('install-button'); if (btn) btn.hidden = false; });
      $('install-button')?.addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('install-button').hidden = true; });
    }
  }
  function render() {
    const att = todayAttendance(), reports = todayReports(), hours = reports.reduce((n, row) => n + Number(row.hours || 0), 0);
    text('stat-attendance', att?.checkIn ? (att.checkOut ? 'Complete' : 'Checked in') : 'Not started');
    text('stat-attendance-note', att?.checkIn ? `${istTime(att.checkIn)} · ${att.locationStatus || 'Local log'}` : 'No check-in recorded');
    text('stat-reports', String(reports.length)); text('stat-hours', `${hours.toFixed(1)} hrs`);
    const plan = latestPlan(); text('stat-next', plan ? 'Plan ready' : 'Add a plan');
    text('focus-count', String(reports.length + (att?.checkIn ? 1 : 0)));
    text('focus-note', reports.length ? `You have ${reports.length} report${reports.length === 1 ? '' : 's'} saved for today.` : 'Your progress will appear here as you record your day.');
    const hi = $('hero-message'); if (hi) hi.textContent = att?.checkIn ? 'Your day is underway. Capture the work as it happens.' : 'Start with attendance, then capture what you get done.';
    text('attendance-state', att?.checkIn ? (att.checkOut ? 'Workday closed' : 'Check-in recorded') : 'Not started');
    text('checkin-time', att?.checkIn ? istTime(att.checkIn) : '—'); text('checkout-time', att?.checkOut ? istTime(att.checkOut) : '—');
    const inButton = $('checkin-button'), outButton = $('checkout-button');
    if (inButton) { inButton.disabled = Boolean(att?.checkIn); inButton.innerHTML = att?.checkIn ? 'Checked in <span>✓</span>' : 'Check in <span>↗</span>'; }
    if (outButton) { outButton.disabled = !att?.checkIn || Boolean(att?.checkOut); outButton.innerHTML = att?.checkOut ? 'Checked out <span>✓</span>' : 'Check out <span>↗</span>'; }
    renderRecent(); renderSavedReports(); renderHistory(); populateSettings();
  }
  function renderRecent() {
    const el = $('recent-activity'); if (!el) return;
    const rows = [ ...state.attendance.map(row => ({ kind: 'attendance', at: row.checkOut || row.checkIn, title: row.checkOut ? 'Checked out' : 'Checked in', detail: `${displayDate(row.date)} · ${row.locationStatus || 'Local log'}` })),
      ...state.reports.map(row => ({ kind: 'report', at: row.createdAt, title: row.work.slice(0, 80) || 'Daily report', detail: `${displayDate(row.date)} · ${row.status}` })) ].sort((a,b) => b.at.localeCompare(a.at)).slice(0,4);
    el.innerHTML = rows.length ? rows.map(row => `<div class="activity-item"><span class="activity-icon">${row.kind === 'report' ? '▤' : '◷'}</span><span class="activity-copy"><b>${escapeHtml(row.title)}</b><small>${escapeHtml(row.detail)}</small></span><span class="activity-time">${istTime(row.at)}</span></div>`).join('') : '<div class="empty-state"><div class="empty-symbol">✧</div>Your first check-in or report will appear here.</div>';
  }
  function renderSavedReports() {
    const el = $('saved-report-list'); if (!el) return;
    const rows = todayReports(); text('saved-report-count', `${rows.length} report${rows.length === 1 ? '' : 's'}`);
    el.innerHTML = rows.length ? rows.map(row => `<div class="saved-report"><b>${escapeHtml(row.work)}</b><small>${escapeHtml(row.status)} · ${Number(row.hours || 0).toFixed(1)} hrs</small></div>`).join('') : '<div class="empty-state">No reports saved today.</div>';
  }
  function renderHistory() {
    const el = $('history-list'); if (!el) return;
    const rows = [...state.attendance.map(row => ({ type:'attendance', date:row.date, at:row.checkOut || row.checkIn, title:row.checkOut ? 'Attendance · checked out' : 'Attendance · checked in', detail:`${row.checkIn ? istTime(row.checkIn) : ''}${row.checkOut ? ` → ${istTime(row.checkOut)}` : ''} · ${row.locationStatus || 'Local log'}`, tag:'Attendance' })), ...state.reports.map(row => ({ type:'report', date:row.date, at:row.createdAt, title:row.work, detail:`${row.status} · ${Number(row.hours || 0).toFixed(1)} hours${row.plan ? ` · Plan: ${row.plan}` : ''}`, tag:'Daily report' }))].sort((a,b) => b.at.localeCompare(a.at));
    text('history-summary', `${rows.length} item${rows.length === 1 ? '' : 's'} · stored only in this browser`);
    el.innerHTML = rows.length ? rows.map(row => `<div class="history-row"><span class="activity-icon">${row.type === 'report' ? '▤' : '◷'}</span><span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(displayDate(row.date))} · ${escapeHtml(row.detail)}</small></span><span class="history-tag">${row.tag}</span></div>`).join('') : '<div class="empty-state"><div class="empty-symbol">⌁</div>No activity yet. Start with a check-in or daily report.</div>';
  }
  function populateSettings() {
    const values = { 'profile-name':state.profile.name, 'workplace-name':state.profile.workplace, 'office-latitude':state.profile.latitude, 'office-longitude':state.profile.longitude, 'geofence-radius':state.profile.radius };
    Object.entries(values).forEach(([id,value]) => { const el = $(id); if (el && document.activeElement !== el && el.value !== String(value ?? '')) el.value = value ?? ''; });
    const avatar = $('avatar'); if (avatar) avatar.textContent = state.profile.name ? state.profile.name.trim()[0].toUpperCase() : 'R';
  }
  function escapeHtml(value) { return safe(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]); }
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const rad = v => v * Math.PI / 180, dLat = rad(lat2-lat1), dLon=rad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function locationForPunch() {
    const configured = state.profile.latitude !== '' && state.profile.longitude !== '';
    if (!configured) return Promise.resolve({ status:'Not configured · local only', distance:null });
    if (!navigator.geolocation) return Promise.reject(new Error('This browser cannot access location. No punch was saved.'));
    return new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(position => {
      const c = position.coords, radius = Math.max(20, Number(state.profile.radius) || 150);
      const distance = distanceMeters(Number(state.profile.latitude),Number(state.profile.longitude),c.latitude,c.longitude);
      if (c.accuracy > 150) return reject(new Error(`Location accuracy is ${Math.round(c.accuracy)} m. Move to a clear area and retry.`));
      if (distance > radius) return reject(new Error(`Outside the configured local radius (${Math.round(distance)} m away). No punch was saved.`));
      resolve({ status:`Within ${Math.round(distance)} m · approx.`, distance:Math.round(distance) });
    }, error => reject(new Error(error.code === 1 ? 'Location permission was denied. No punch was saved.' : error.code === 3 ? 'Location timed out. Try again outdoors.' : 'Location is unavailable. No punch was saved.')), { enableHighAccuracy:true, timeout:20000, maximumAge:0 }));
  }
  async function punch(kind) {
    const button = $(kind === 'in' ? 'checkin-button' : 'checkout-button');
    if (button) button.disabled = true;
    text('location-result', '');
    const info = $('location-result'); if (info) info.innerHTML = '<b>Checking this device…</b><span>If an office geofence is configured, your browser may ask to use location.</span>';
    try {
      const location = await locationForPunch(); const now = new Date().toISOString(); let row = todayAttendance();
      if (!row) { row = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, date:isoToday(), checkIn:'', checkOut:'', locationStatus:location.status }; state.attendance.push(row); }
      if (kind === 'in') { if (row.checkIn) throw new Error('A check-in is already saved for today.'); row.checkIn=now; row.locationStatus=location.status; }
      else { if (!row.checkIn) throw new Error('Check in first.'); if (row.checkOut) throw new Error('A check-out is already saved for today.'); row.checkOut=now; row.locationStatus=location.status; }
      saveState();
      if (info) info.innerHTML = `<b>${escapeHtml(location.status)}</b><span>${location.distance === null ? 'Personal local log; no geofence check was made.' : 'Approximate proximity check completed on this device.'}</span>`;
      toast(kind === 'in' ? 'Local check-in saved on this device.' : 'Local check-out saved on this device.');
    } catch (error) { if (info) info.innerHTML = `<b>Not recorded</b><span>${escapeHtml(error.message || 'Could not record this action.')}</span>`; toast(error.message || 'Could not record this action.'); }
    finally { const latest = todayAttendance(); if (button) button.disabled = kind === 'in' ? Boolean(latest?.checkIn) : !latest?.checkIn || Boolean(latest?.checkOut); }
  }
  function saveReport(event) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const data = new FormData(form), work = safe(data.get('work')).trim();
    const report = { id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), date:safe(data.get('date')), hours:Number(data.get('hours')), location:safe(data.get('location')), work, status:safe(data.get('status')), client:safe(data.get('client')).trim(), pending:safe(data.get('pending')).trim(), plan:safe(data.get('plan')).trim(), createdAt:new Date().toISOString() };
    state.reports.push(report); saveState(); form.reset(); $('report-date').value = isoToday(); text('form-message', 'Saved on this device'); toast('Daily report saved locally.');
  }
  function saveSettings() {
    const lat = $('office-latitude').value.trim(), lon = $('office-longitude').value.trim(), radius = Number($('geofence-radius').value || 150);
    if ((lat && (!Number.isFinite(Number(lat)) || Number(lat)<-90 || Number(lat)>90)) || (lon && (!Number.isFinite(Number(lon)) || Number(lon)<-180 || Number(lon)>180)) || ((lat === '') !== (lon === ''))) { toast('Enter both valid office coordinates or leave both empty.'); return; }
    state.profile = { name:$('profile-name').value.trim(), workplace:$('workplace-name').value.trim() || 'Rushabh Enterprise', latitude:lat, longitude:lon, radius:Math.min(2000,Math.max(20,radius)) };
    saveState(); toast('Settings saved on this device.');
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ app:'Rushabh Workday Lite', exportedAt:new Date().toISOString(), data:state },null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=`rushabh-workday-${isoToday()}.json`; a.click(); URL.revokeObjectURL(url); toast('Local backup downloaded.');
  }
  function exportCsv() {
    const rows = [['Type','Date','Time','Status','Details','Hours'], ...state.attendance.map(r=>['Attendance',r.date,istTime(r.checkIn),r.checkOut?'Checked out':'Checked in',r.locationStatus,'']), ...state.reports.map(r=>['Daily report',r.date,istTime(r.createdAt),r.status,r.work,r.hours])];
    const csv = rows.map(row=>row.map(cell=>`"${safe(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=`rushabh-activity-${isoToday()}.csv`;a.click();URL.revokeObjectURL(url);toast('Activity exported.');
  }
  function clearData() { if (!confirm('Clear all reports, attendance entries, and profile settings from this device? This cannot be undone.')) return; localStorage.removeItem(DATA_KEY); state=loadState(); render(); toast('This device’s data has been cleared.'); }

  document.addEventListener('click', event => {
    const view = event.target.closest('[data-view]'); if (view) navigate(view.dataset.view);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-report') navigate('reports');
  });
  $('avatar')?.addEventListener('click',()=>navigate('settings'));
  $('checkin-button')?.addEventListener('click',()=>punch('in'));
  $('checkout-button')?.addEventListener('click',()=>punch('out'));
  $('report-form')?.addEventListener('submit',saveReport);
  $('save-settings')?.addEventListener('click',saveSettings);
  $('download-backup')?.addEventListener('click',downloadBackup);
  $('export-button')?.addEventListener('click',exportCsv);
  $('clear-data')?.addEventListener('click',clearData);
  dayHeading(); setUpMode(); render();
  const clock = () => text('live-clock', new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date()));
  clock(); setInterval(clock,30000);
})();
