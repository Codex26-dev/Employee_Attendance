/**
 * Rushabh Workday connected app (Google Apps Script HtmlService).
 * Deploy as a web app after setting Script Properties; see SETUP.md.
 * This app only creates/writes App_Attendance and App_Progress.
 */
const APP = Object.freeze({
  SPREADSHEET_ID: '',
  ATTENDANCE: 'App_Attendance', PROGRESS: 'App_Progress',
  AH: ['Record ID','Employee ID','Employee Name','Mobile','Event','Server Timestamp','Work Date','Latitude','Longitude','Accuracy M','Office Distance M','Geofence Result'],
  PH: ['Record ID','Employee ID','Employee Name','Server Timestamp','Work Date','Project / Client','Work Summary','Status','Hours','Blockers','Support Needed','Next Day Plan']
});

function doGet() {
  return HtmlService.createTemplateFromFile('App').evaluate()
    .setTitle('Rushabh Workday').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function setupConnectedAppSheets() {
  const ss = spreadsheet_();
  ensureTab_(ss, APP.ATTENDANCE, APP.AH);
  ensureTab_(ss, APP.PROGRESS, APP.PH);
  return 'Ready: App_Attendance and App_Progress are present.';
}

function appRequestOtp(email) {
  const address = normalizeEmail_(email), employee = findEmployeeByEmail_(address);
  if (!employee) return {ok:false,message:'If this email is registered, a sign-in code will be sent.'};
  const cache = CacheService.getScriptCache(), key = 'email_otp_rate_' + digest_(address);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { if (cache.get(key)) return {ok:false,message:'Please wait 60 seconds before requesting another code.'}; cache.put(key,'1',60); } finally { lock.releaseLock(); }
  const raw = Utilities.getUuid().replace(/-/g,'').slice(0,8), code = String(100000 + (parseInt(raw,16) % 900000));
  cache.put('email_otp_' + digest_(address),digest_(code),300);
  cache.remove('email_try_' + digest_(address));
  try {
    MailApp.sendEmail(address,'Your Rushabh Workday sign-in code','Your sign-in code is '+code+'. It expires in 5 minutes. If you did not request this code, ignore this email.');
  } catch (err) { cache.remove('email_otp_' + digest_(address)); cache.remove(key); throw new Error('Email could not be sent. Check the registered address and Google mail quota.'); }
  return {ok:true,message:'Code sent to your registered email. It expires in five minutes.'};
}

function appVerifyOtp(email, otp) {
  const address = normalizeEmail_(email), code = String(otp || '').replace(/\D/g,''), cache = CacheService.getScriptCache();
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code.');
  const key='email_otp_'+digest_(address), triesKey='email_try_'+digest_(address), tries=Number(cache.get(triesKey)||0), expected=cache.get(key);
  if (tries >= 5) throw new Error('Too many attempts. Request a new code later.');
  if (!expected || expected !== digest_(code)) { cache.put(triesKey,String(tries+1),300); throw new Error('Code is invalid or expired.'); }
  cache.remove(key); cache.remove(triesKey);
  const employee = findEmployeeByEmail_(address);
  if (!employee) throw new Error('This employee account is not active.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  recordAppSession_(token,address);
  return {token:token,profile:publicProfile_(employee)};
}

function appLogout(token) { revokeAppSession_(token); return {ok:true}; }
function appGetContext(token) { const e = employeeForSession_(token); return {profile:publicProfile_(e),manager:isManager_(e),settings:clientSettings_()}; }
function appGetMyData(token) {
  const e = employeeForSession_(token), ss = spreadsheet_(), tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  return {today:today,attendance:rowsForEmployee_(ss,APP.ATTENDANCE,e.id,30),progress:rowsForEmployee_(ss,APP.PROGRESS,e.id,30)};
}

function appPunch(token, event, lat, lon, accuracy) {
  const e = employeeForSession_(token), kind = String(event || '').toUpperCase();
  if (!['CHECK_IN','CHECK_OUT'].includes(kind)) throw new Error('Unknown attendance action.');
  const p = PropertiesService.getScriptProperties();
  const officeLat = requiredNumber_(p.getProperty('OFFICE_LATITUDE'),'OFFICE_LATITUDE');
  const officeLon = requiredNumber_(p.getProperty('OFFICE_LONGITUDE'),'OFFICE_LONGITUDE');
  const radius = requiredNumber_(p.getProperty('GEOFENCE_RADIUS_METERS'),'GEOFENCE_RADIUS_METERS');
  const maxAccuracy = Number(p.getProperty('MAX_LOCATION_ACCURACY_METERS') || 100);
  const la = requiredNumber_(lat,'latitude'), lo = requiredNumber_(lon,'longitude'), acc = requiredNumber_(accuracy,'accuracy');
  if (la < -90 || la > 90 || lo < -180 || lo > 180) throw new Error('Location reading is invalid.');
  if (acc > maxAccuracy) throw new Error('Location accuracy is too low. Try again outdoors.');
  const dist = Math.round(distanceMeters_(officeLat,officeLon,la,lo));
  if (dist > radius) throw new Error('You are outside the attendance area (' + dist + ' m away).');
  enforcePunchWindow_(kind,p);
  const ss = spreadsheet_(), sheet = ensureTab_(ss,APP.ATTENDANCE,APP.AH), now = new Date();
  const tz = ss.getSpreadsheetTimeZone(), workDate = Utilities.formatDate(now,tz,'yyyy-MM-dd');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const existing = recordsForDate_(sheet,e.id,workDate);
    if (kind === 'CHECK_IN' && existing.some(r => r.Event === 'CHECK_IN')) throw new Error('Check-in is already recorded for today.');
    if (kind === 'CHECK_OUT' && (!existing.some(r => r.Event === 'CHECK_IN') || existing.some(r => r.Event === 'CHECK_OUT'))) throw new Error('Check-in is required and check-out can be recorded once.');
    sheet.appendRow([Utilities.getUuid(),e.id,e.name,e.mobile,kind,now,workDate,la,lo,Math.round(acc),dist,'INSIDE']);
  } finally { lock.releaseLock(); }
  return appGetMyData(token);
}

function appSaveProgress(token, payload) {
  const e = employeeForSession_(token), x = payload || {};
  const summary = cleanText_(x.summary,1200), project = cleanText_(x.project,160), status = cleanText_(x.status,40);
  if (!summary || !['Completed','In progress','Blocked'].includes(status)) throw new Error('Add a work summary and choose a valid status.');
  const hours = Number(x.hours || 0); if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw new Error('Hours must be between 0 and 24.');
  const ss = spreadsheet_(), sheet = ensureTab_(ss,APP.PROGRESS,APP.PH), now = new Date();
  sheet.appendRow([Utilities.getUuid(),e.id,e.name,now,Utilities.formatDate(now,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'),project,summary,status,hours,cleanText_(x.blockers,600),cleanText_(x.support,600),cleanText_(x.nextPlan,600)]);
  return appGetMyData(token);
}

function appManagerEmployees(token) {
  const viewer = employeeForSession_(token); requireManager_(viewer);
  return employees_(true).map(publicProfile_).sort((a,b)=>a.name.localeCompare(b.name));
}
function appManagerDashboard(token) {
  const viewer=employeeForSession_(token); requireManager_(viewer);
  const ss=spreadsheet_(), tz=ss.getSpreadsheetTimeZone(), today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  const people=employees_().map(e=>{const attendance=rowsForEmployee_(ss,APP.ATTENDANCE,e.id,50).concat(legacyAttendance_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)===today);const progress=rowsForEmployee_(ss,APP.PROGRESS,e.id,50).concat(legacyProgress_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)===today);const checkIn=attendance.some(r=>r.Event==='CHECK_IN'),checkOut=attendance.some(r=>r.Event==='CHECK_OUT');return {id:e.id,name:e.name,role:e.role,attendance:checkOut?'Checked out':checkIn?'Checked in':'Not checked in',reported:progress.length>0,progress:progress[0]||null};});
  return {date:today,people:people,summary:{team:people.length,checkedIn:people.filter(p=>p.attendance!=='Not checked in').length,reported:people.filter(p=>p.reported).length,blocked:people.filter(p=>p.progress&&/blocked/i.test(p.progress.Status||'')).length}};
}
function appManagerEmployeeDetail(token, employeeId, fromDate, toDate) {
  const viewer = employeeForSession_(token); requireManager_(viewer);
  const id = String(employeeId || ''), matches = employees_(true).filter(e => e.id === id), employee = matches[0];
  if (!employee) throw new Error('Employee not found.');
  if (matches.length !== 1) throw new Error('Employee ID is duplicated in the Employees tab; resolve it before viewing details.');
  const from = validDate_(fromDate), to = validDate_(toDate);
  if (!from || !to || from > to) throw new Error('Choose a valid date range.');
  const ss = spreadsheet_();
  return {profile:publicProfile_(employee),attendance:filterDates_(rowsForEmployee_(ss,APP.ATTENDANCE,id,5000).concat(legacyAttendance_(ss,id)),from,to),progress:filterDates_(rowsForEmployee_(ss,APP.PROGRESS,id,5000).concat(legacyProgress_(ss,id)),from,to)};
}

function spreadsheet_() { const id=PropertiesService.getScriptProperties().getProperty('SS_ID')||APP.SPREADSHEET_ID; if(!id) throw new Error('Set SS_ID in Apps Script project settings.'); return SpreadsheetApp.openById(id); }
function ensureTab_(ss,name,headers) {
  let sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name);
  const last=sh.getLastColumn();
  if (last===0) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); return sh; }
  const actual=sh.getRange(1,1,1,last).getDisplayValues()[0].map(x=>String(x).trim());
  if (headers.some((h,i)=>actual[i]!==h) || actual.length!==headers.length) throw new Error('Tab '+name+' exists with unexpected headers; no changes were made.');
  return sh;
}
function employeeHeaders_() {
  const sh=spreadsheet_().getSheetByName('Employees'); if(!sh) throw new Error('Employees tab not found.');
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());
  const find=(...opts)=>{const i=headers.findIndex(h=>opts.some(o=>h.toLowerCase()===o.toLowerCase())); if(i<0) throw new Error('Employees tab is missing required column: '+opts[0]); return i;};
  return {sh,id:find('Employee ID','ID'),name:find('Employee Name','Name'),mobile:headers.findIndex(h=>['Mobile Number','Mobile','Phone'].some(x=>h.toLowerCase()===x.toLowerCase())),email:headers.findIndex(h=>/^email\b/i.test(h)||['Email Address','Work Email'].some(x=>h.toLowerCase()===x.toLowerCase())),active:headers.findIndex(h=>['Active','Status'].some(x=>h.toLowerCase()===x.toLowerCase())),role:headers.findIndex(h=>['Role','Designation','Position'].some(x=>h.toLowerCase()===x.toLowerCase())),start:headers.findIndex(h=>/^start date/i.test(h)),end:headers.findIndex(h=>/^end date/i.test(h))};
}
function employees_(includeInactive) {
  const m=employeeHeaders_(), data=m.sh.getDataRange().getDisplayValues();
  const today=Utilities.formatDate(new Date(),m.sh.getParent().getSpreadsheetTimeZone(),'yyyy-MM-dd');
  return data.slice(1).filter(r=>r[m.id]&&r[m.name]).filter(r=>includeInactive||((m.active<0||!['inactive','no','false','left','terminated'].includes(String(r[m.active]).toLowerCase()))&&(m.start<0||!r[m.start]||sheetDate_(r[m.start],m.sh.getParent().getSpreadsheetTimeZone())<=today)&&(m.end<0||!r[m.end]||sheetDate_(r[m.end],m.sh.getParent().getSpreadsheetTimeZone())>=today))).map(r=>({id:String(r[m.id]).trim(),name:String(r[m.name]).trim(),mobile:m.mobile>=0&&r[m.mobile]?normalizeMobile_(r[m.mobile]):'',email:m.email>=0?String(r[m.email]||'').trim().toLowerCase():'',role:m.role<0?'':String(r[m.role]).trim()}));
}
function findEmployeeByEmail_(email) { const active=employees_(),matches=active.filter(e=>e.email===email); if(matches.length>1)throw new Error('This email is mapped to more than one active employee. Correct the Employees tab.'); if(matches.length)return matches[0]; if(managerEmails_().includes(email)){const managers=active.filter(isManager_);if(managers.length===1)return managers[0];if(managers.length>1)throw new Error('Manager Email is configured, but multiple manager rows exist. Add each manager email to Employees to remove ambiguity.');} return undefined; }
function employeeForSession_(token) { if(!token || !/^[a-f0-9-]{60,80}$/i.test(String(token))) throw new Error('Session expired. Sign in again.'); const cache=CacheService.getScriptCache(),key='session_'+token,sh=appSessionSheet_(),hash=digest_(token),v=sh.getDataRange().getValues(),h=v[0].map(String),ix=h.indexOf('Token Hash'); let row=v.findIndex((r,i)=>i>0&&String(r[ix])===hash),email; if(row>0)email=String(v[row][h.indexOf('Email')]||''); else { email=cache.get(key); if(!email)throw new Error('Session expired. Sign in again.'); sh.appendRow([hash,email,new Date()]); row=sh.getLastRow()-1; } const lastValue=sh.getRange(row+1,h.indexOf('Last Activity')+1).getValue(),last=lastValue instanceof Date?lastValue.getTime():new Date(lastValue).getTime(); if(!last||Date.now()-last>=8*60*60*1000){if(row>0)sh.deleteRow(row+1);cache.remove(key);throw new Error('Session expired after 8 hours of inactivity. Sign in again.')} const e=findEmployeeByEmail_(email); if(!e){sh.deleteRow(row+1);cache.remove(key);throw new Error('Employee account is no longer active.')} sh.getRange(row+1,h.indexOf('Last Activity')+1).setValue(new Date()); cache.put(key,email,21600); return e; }
const APP_SESSION_HEADERS_=['Token Hash','Email','Last Activity'];
function appSessionSheet_(){const ss=spreadsheet_();let sh=ss.getSheetByName('App_Sessions');if(!sh){sh=ss.insertSheet('App_Sessions');sh.getRange(1,1,1,3).setValues([APP_SESSION_HEADERS_]);sh.setFrozenRows(1)}const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());if(APP_SESSION_HEADERS_.some((x,i)=>h[i]!==x))throw new Error('App_Sessions has unexpected headers.');return sh}
function recordAppSession_(token,email){const sh=appSessionSheet_(),lock=LockService.getScriptLock();lock.waitLock(10000);try{sh.appendRow([digest_(token),email,new Date()])}finally{lock.releaseLock()}CacheService.getScriptCache().put('session_'+token,email,21600)}
function revokeAppSession_(token){if(!token)return;const cache=CacheService.getScriptCache(),sh=appSessionSheet_(),v=sh.getDataRange().getValues(),ix=v[0].map(String).indexOf('Token Hash'),hash=digest_(token),row=v.findIndex((r,i)=>i>0&&String(r[ix])===hash);if(row>0)sh.deleteRow(row+1);cache.remove('session_'+token)}
function isManager_(e) { return /^(manager|admin)$/i.test(e.role); }
function requireManager_(e) { if(!isManager_(e)) throw new Error('Manager access is required.'); }
function publicProfile_(e) { return {id:e.id,name:e.name,role:e.role||'Employee'}; }
function managerEmails_() { const sh=spreadsheet_().getSheetByName('Settings'); if(!sh||sh.getLastRow()<2)return[];const rows=sh.getDataRange().getDisplayValues(),h=rows[0].map(x=>String(x).trim().toLowerCase()),k=h.indexOf('setting'),v=h.indexOf('value');if(k<0||v<0)return[];const row=rows.slice(1).find(r=>String(r[k]).trim().toLowerCase()==='manager email');return row?String(row[v]||'').split(/[;,]/).map(x=>x.trim().toLowerCase()).filter(Boolean):[]; }
function clientSettings_() { const p=PropertiesService.getScriptProperties(); return {checkInStart:p.getProperty('CHECKIN_START')||'09:00',checkInEnd:p.getProperty('CHECKIN_END')||'11:00',checkOutStart:p.getProperty('CHECKOUT_START')||'17:00',checkOutEnd:p.getProperty('CHECKOUT_END')||'23:59'}; }
function enforcePunchWindow_(kind,p) { const start=p.getProperty(kind==='CHECK_IN'?'CHECKIN_START':'CHECKOUT_START'), end=p.getProperty(kind==='CHECK_IN'?'CHECKIN_END':'CHECKOUT_END'); if(!start||!end) throw new Error('Attendance window is not configured.'); const now=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'HH:mm'); if(now<start||now>end) throw new Error('Attendance is available from '+start+' to '+end+'.'); }
function rowsForEmployee_(ss,tab,id,limit) { const sh=ss.getSheetByName(tab); if(!sh||sh.getLastRow()<2)return[]; const values=sh.getDataRange().getValues(), heads=values[0].map(String), ix=heads.indexOf('Employee ID'); return values.slice(1).filter(r=>String(r[ix])===String(id)).slice(-limit).reverse().map(r=>{const o={};heads.forEach((h,i)=>o[h]=r[i] instanceof Date?Utilities.formatDate(r[i],ss.getSpreadsheetTimeZone(),'yyyy-MM-dd HH:mm'):r[i]);return o;}); }
function recordsForDate_(sh,id,date) { if(sh.getLastRow()<2)return[]; const v=sh.getDataRange().getValues(), h=v[0].map(String), idIx=h.indexOf('Employee ID'), dateIx=h.indexOf('Work Date'), evIx=h.indexOf('Event'); return v.slice(1).filter(r=>String(r[idIx])===String(id)&&String(r[dateIx])===date).map(r=>({Event:r[evIx]})); }
function filterDates_(rows,from,to) { return rows.filter(r=>String(r['Work Date']||'').slice(0,10)>=from&&String(r['Work Date']||'').slice(0,10)<=to); }
function legacyAttendance_(ss,id) {
  const sh=ss.getSheetByName('GPS_Attendance'); if(!sh||sh.getLastRow()<2)return[];
  const v=sh.getDataRange().getValues(),h=v[0].map(String),ix=k=>h.indexOf(k),idIx=ix('Employee ID'); if(idIx<0)return[];
  const dateText=x=>x instanceof Date?Utilities.formatDate(x,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'):String(x||'').slice(0,10);
  const stamp=x=>x instanceof Date?Utilities.formatDate(x,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd HH:mm:ss'):String(x||''); const out=[];
  v.slice(1).filter(r=>String(r[idIx])===String(id)).forEach(r=>{const day=dateText(r[ix('Date')]);[['CHECK_IN','Check-in Timestamp','Distance from Office (m)'],['CHECK_OUT','Check-out Timestamp','Check-out Distance (m)']].forEach(a=>{const t=r[ix(a[1])];if(t)out.push({'Work Date':day,Event:a[0],'Server Timestamp':stamp(t),'Office Distance M':r[ix(a[2])]||'—',Source:'GPS_Attendance'});});}); return out;
}
function legacyProgress_(ss,id) {
  const sh=ss.getSheetByName('Report_Data'); if(!sh||sh.getLastRow()<2)return[];
  const v=sh.getDataRange().getValues(),h=v[0].map(String),ix=k=>h.indexOf(k),idIx=ix('Employee ID'); if(idIx<0)return[];
  const dateText=x=>x instanceof Date?Utilities.formatDate(x,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'):String(x||'').slice(0,10);
  return v.slice(1).filter(r=>String(r[idIx])===String(id)).map(r=>({'Work Date':dateText(r[ix('Report Date')]),'Server Timestamp':r[ix('Submitted At')] instanceof Date?Utilities.formatDate(r[ix('Submitted At')],ss.getSpreadsheetTimeZone(),'yyyy-MM-dd HH:mm:ss'):String(r[ix('Submitted At')]||''),'Project / Client':r[ix('Client / Site')]||r[ix('Tomorrow Site / Client')]||'Daily report','Work Summary':[r[ix('Work Performed')],r[ix('Task Details')]].filter(Boolean).join(' · '),'Status':r[ix('Completion Status')]||r[ix('Attendance')]||'Submitted','Hours':r[ix('Hours Worked')]||0,Blockers:[r[ix('Pending Task')],r[ix('Pending Reason')]].filter(Boolean).join(' — '), 'Support Needed':[r[ix('Help Needed')],r[ix('Support Provided')]].filter(Boolean).join(' — '), 'Next Day Plan':[r[ix("Tomorrow's Planned Tasks")],r[ix('Tomorrow Site / Client')]].filter(Boolean).join(' · '),'Work Location':r[ix('Work Location')]||'', 'Priority':r[ix('Priority')]||'', 'Additional Work':r[ix('Additional Work / Learned')]||'', 'New Skills':r[ix('New Skills')]||'',Source:'Report_Data'}));
}
function normalizeMobile_(value) { let s=String(value||'').replace(/[\s()+.-]/g,''); if(s.startsWith('00'))s=s.slice(2); if(!/^\d{10,15}$/.test(s))throw new Error('Enter a valid mobile number with country code.'); return s; }
function normalizeEmail_(value) { const s=String(value||'').trim().toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('Enter a valid email address.'); return s; }
function digest_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(b=>(b+256).toString(16).slice(-2)).join(''); }
function cleanText_(value,max) { return String(value||'').replace(/[<>]/g,'').trim().slice(0,max); }
function requiredNumber_(v,label) { const n=Number(v); if(v===null||v===''||!Number.isFinite(n))throw new Error('Invalid or missing '+label+'.'); return n; }
function distanceMeters_(a,b,c,d) { const rad=x=>x*Math.PI/180, R=6371000, p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b),x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
function validDate_(x) { const s=String(x||''); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''; }
function sheetDate_(value,tz) { if(value instanceof Date)return Utilities.formatDate(value,tz,'yyyy-MM-dd'); const d=new Date(value); return isNaN(d.getTime())?'9999-12-31':Utilities.formatDate(d,tz,'yyyy-MM-dd'); }


const SCHEDULE_TAB_='App_Schedule';
const SCHEDULE_HEADERS_=['Schedule ID','Employee ID','Employee Name','Work Date','Start Time','End Time','Shift / Assignment','Location','Instructions','Created At','Created By'];
function appGetMySchedule(token){const e=employeeForSession_(token),ss=spreadsheet_(),tz=ss.getSpreadsheetTimeZone(),today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),end=new Date();end.setDate(end.getDate()+60);const through=Utilities.formatDate(end,tz,'yyyy-MM-dd');return scheduleRows_(ss,today,through,e.id)}
function appManagerGetSchedules(token,fromDate,toDate){const e=employeeForSession_(token);requireManager_(e);const from=validDate_(fromDate),to=validDate_(toDate);if(!from||!to||from>to)throw new Error('Choose a valid schedule date range.');return scheduleRows_(spreadsheet_(),from,to,'')}
function appManagerSaveSchedule(token,payload){const manager=employeeForSession_(token);requireManager_(manager);const x=payload||{},id=String(x.employeeId||'').trim(),employee=employees_().find(e=>e.id===id);if(!employee)throw new Error('Choose an active employee.');const date=validDate_(x.workDate),start=String(x.startTime||''),end=String(x.endTime||''),assignment=cleanText_(x.assignment,180);if(!date||isNaN(new Date(date+'T00:00:00').getTime()))throw new Error('Choose a valid work date.');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start===end)throw new Error('Choose valid start and end times.');if(!assignment)throw new Error('Add a shift or assignment.');const ss=spreadsheet_(),sh=ensureTab_(ss,SCHEDULE_TAB_,SCHEDULE_HEADERS_),now=new Date(),tz=ss.getSpreadsheetTimeZone(),workDate=new Date(date+'T12:00:00');const lock=LockService.getScriptLock();lock.waitLock(10000);try{sh.appendRow([Utilities.getUuid(),employee.id,employee.name,workDate,start,end,assignment,cleanText_(x.location,180),cleanText_(x.instructions,800),now,manager.email||manager.name]);}finally{lock.releaseLock()}return {ok:true}}
function scheduleRows_(ss,from,to,employeeId){const sh=ss.getSheetByName(SCHEDULE_TAB_);if(!sh||sh.getLastRow()<2)return[];const values=sh.getDataRange().getValues(),heads=values[0].map(String),tz=ss.getSpreadsheetTimeZone();return values.slice(1).map(row=>{const out={};heads.forEach((h,i)=>{let v=row[i];if(v instanceof Date)v=h==='Work Date'?Utilities.formatDate(v,tz,'yyyy-MM-dd'):h==='Created At'?Utilities.formatDate(v,tz,'yyyy-MM-dd HH:mm'):Utilities.formatDate(v,tz,'HH:mm');out[h]=v});return out}).filter(r=>String(r['Work Date'])>=from&&String(r['Work Date'])<=to&&(!employeeId||String(r['Employee ID'])===String(employeeId))).sort((a,b)=>(String(a['Work Date'])+String(a['Start Time'])).localeCompare(String(b['Work Date'])+String(b['Start Time'])))}

function appManagerGetGeofence(token) {
  const manager = employeeForSession_(token); requireManager_(manager);
  const p = PropertiesService.getScriptProperties();
  const numeric = key => { const value = p.getProperty(key); return value === null || value === '' ? '' : Number(value); };
  return {
    latitude: numeric('OFFICE_LATITUDE'), longitude: numeric('OFFICE_LONGITUDE'),
    radiusMeters: numeric('GEOFENCE_RADIUS_METERS'),
    maxAccuracyMeters: numeric('MAX_LOCATION_ACCURACY_METERS') || 100
  };
}

function appManagerSetGeofence(token, payload) {
  const manager = employeeForSession_(token); requireManager_(manager);
  const x = payload || {}, lat = requiredNumber_(x.latitude, 'latitude'), lon = requiredNumber_(x.longitude, 'longitude');
  const radius = requiredNumber_(x.radiusMeters, 'geofence radius');
  if (lat < -90 || lat > 90) throw new Error('Latitude must be between -90 and 90.');
  if (lon < -180 || lon > 180) throw new Error('Longitude must be between -180 and 180.');
  if (radius < 10 || radius > 10000) throw new Error('Radius must be between 10 and 10,000 metres.');
  PropertiesService.getScriptProperties().setProperties({
    OFFICE_LATITUDE: String(lat), OFFICE_LONGITUDE: String(lon), GEOFENCE_RADIUS_METERS: String(Math.round(radius))
  }, false);
  return appManagerGetGeofence(token);
}

// Productivity workflows. New tabs are created lazily and never clear existing data.
const TASK_TAB_='App_Tasks',TASK_HEADERS_=['Task ID','Employee ID','Employee Name','Task','Details','Due Date','Priority','Status','Created At','Created By','Updated At','Completed At','Completion Note'],TASK_LOCATION_HEADERS_=['Completion Latitude','Completion Longitude','Completion Accuracy M','Completion Location At'];
const REQUEST_TAB_='App_Requests',REQUEST_HEADERS_=['Request ID','Employee ID','Employee Name','Type','Start Date','End Date','Proposed Start','Proposed End','Reason','Status','Requested At','Reviewed By','Review Note','Reviewed At'];
function productivitySheets_(ss){const tasks=ensureTaskTab_(ss);return {tasks:tasks,requests:ensureTab_(ss,REQUEST_TAB_,REQUEST_HEADERS_)}}
function ensureTaskTab_(ss){let sh=ss.getSheetByName(TASK_TAB_);if(!sh)sh=ss.insertSheet(TASK_TAB_);if(sh.getLastColumn()===0){sh.getRange(1,1,1,TASK_HEADERS_.length+TASK_LOCATION_HEADERS_.length).setValues([TASK_HEADERS_.concat(TASK_LOCATION_HEADERS_)]);sh.setFrozenRows(1);return sh}const actual=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());if(TASK_HEADERS_.some((h,i)=>actual[i]!==h))throw new Error('Tab '+TASK_TAB_+' exists with unexpected headers; no changes were made.');ensureTaskLocationColumns_(sh);return sh}
function ensureTaskLocationColumns_(sh){const actual=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim()),missing=TASK_LOCATION_HEADERS_.filter(h=>!actual.includes(h));if(missing.length)sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);return sh}
function appManagerAssignTask(token,payload){const manager=employeeForSession_(token);requireManager_(manager);const x=payload||{},id=String(x.employeeId||'').trim(),employee=employees_().find(e=>e.id===id),title=cleanText_(x.title,180),details=cleanText_(x.details,800),due=validDate_(x.dueDate),priority=String(x.priority||'Normal');if(!employee)throw new Error('Choose an active employee.');if(!title)throw new Error('Enter a task.');if(!due||isNaN(new Date(due+'T12:00:00').getTime()))throw new Error('Choose a valid due date.');if(!['Low','Normal','High','Urgent'].includes(priority))throw new Error('Choose a valid priority.');const ss=spreadsheet_(),sh=productivitySheets_(ss).tasks,now=new Date(),lock=LockService.getScriptLock();lock.waitLock(10000);try{sh.appendRow([Utilities.getUuid(),employee.id,employee.name,title,details,new Date(due+'T12:00:00'),priority,'Assigned',now,manager.email||manager.name,now,'','']);}finally{lock.releaseLock()}return {ok:true}}
function appGetMyTasks(token){const e=employeeForSession_(token),ss=spreadsheet_(),sh=productivitySheets_(ss).tasks;return taskRows_(sh,ss).filter(r=>String(r['Employee ID'])===e.id).sort((a,b)=>String(a['Due Date']).localeCompare(String(b['Due Date'])))}
function appManagerGetTasks(token){const manager=employeeForSession_(token);requireManager_(manager);const ss=spreadsheet_();return taskRows_(productivitySheets_(ss).tasks,ss).sort((a,b)=>String(a['Due Date']).localeCompare(String(b['Due Date'])))}
function appUpdateMyTask(token,taskId,status,note){const e=employeeForSession_(token),allowed=['Assigned','In progress','Blocked'],ss=spreadsheet_(),sh=productivitySheets_(ss).tasks;if(!allowed.includes(String(status)))throw new Error('Choose a valid task status. Use Mark complete to finish a task and record its location.');const values=sh.getDataRange().getValues(),h=values[0].map(String),ix=k=>h.indexOf(k),row=values.findIndex((r,i)=>i>0&&String(r[ix('Task ID')])===String(taskId)&&String(r[ix('Employee ID')])===e.id);if(row<1)throw new Error('Task not found for this employee.');const rn=row+1,now=new Date();sh.getRange(rn,ix('Status')+1).setValue(status);sh.getRange(rn,ix('Updated At')+1).setValue(now);sh.getRange(rn,ix('Completion Note')+1).setValue(cleanText_(note,600));sh.getRange(rn,ix('Completed At')+1).clearContent();TASK_LOCATION_HEADERS_.forEach(k=>sh.getRange(rn,ix(k)+1).clearContent());return {ok:true}}
function appCompleteMyTask(token,taskId,note,latitude,longitude,accuracy){const e=employeeForSession_(token),ss=spreadsheet_(),sh=productivitySheets_(ss).tasks,lat=requiredNumber_(latitude,'latitude'),lon=requiredNumber_(longitude,'longitude'),acc=requiredNumber_(accuracy,'location accuracy');if(lat < -90||lat>90||lon < -180||lon>180||acc<=0||acc>10000)throw new Error('Location reading is invalid. Try again with location enabled.');const v=sh.getDataRange().getValues(),h=v[0].map(String),ix=k=>h.indexOf(k),row=v.findIndex((r,i)=>i>0&&String(r[ix('Task ID')])===String(taskId)&&String(r[ix('Employee ID')])===e.id);if(row<1)throw new Error('Task not found for this employee.');const rn=row+1;if(String(v[row][ix('Status')])==='Completed')throw new Error('This task is already marked complete.');const now=new Date();sh.getRange(rn,ix('Status')+1).setValue('Completed');sh.getRange(rn,ix('Updated At')+1).setValue(now);sh.getRange(rn,ix('Completed At')+1).setValue(now);sh.getRange(rn,ix('Completion Note')+1).setValue(cleanText_(note,600));sh.getRange(rn,ix('Completion Latitude')+1).setValue(lat);sh.getRange(rn,ix('Completion Longitude')+1).setValue(lon);sh.getRange(rn,ix('Completion Accuracy M')+1).setValue(Math.round(acc));sh.getRange(rn,ix('Completion Location At')+1).setValue(now);return {ok:true}}
function taskRows_(sh,ss){if(sh.getLastRow()<2)return[];const v=sh.getDataRange().getValues(),h=v[0].map(String),tz=ss.getSpreadsheetTimeZone();return v.slice(1).map(r=>{const o={};h.forEach((k,i)=>{let x=r[i];if(x instanceof Date)x=k==='Due Date'?Utilities.formatDate(x,tz,'yyyy-MM-dd'):Utilities.formatDate(x,tz,'yyyy-MM-dd HH:mm');o[k]=x});return o})}
function appSubmitRequest(token,payload){const e=employeeForSession_(token),x=payload||{},type=String(x.type||''),from=validDate_(x.startDate),to=validDate_(x.endDate||x.startDate),reason=cleanText_(x.reason,700),start=String(x.proposedStart||''),end=String(x.proposedEnd||'');if(!['Leave','Shift change'].includes(type))throw new Error('Choose leave or shift change.');if(!from||!to||from>to||isNaN(new Date(from+'T12:00:00').getTime())||isNaN(new Date(to+'T12:00:00').getTime()))throw new Error('Choose a valid date range.');if(!reason)throw new Error('Add a reason for the request.');if(type==='Shift change'&&(from!==to||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start===end))throw new Error('A shift change is for one scheduled day; enter valid proposed start and end times.');const ss=spreadsheet_(),sh=productivitySheets_(ss).requests,lock=LockService.getScriptLock();lock.waitLock(10000);try{sh.appendRow([Utilities.getUuid(),e.id,e.name,type,new Date(from+'T12:00:00'),new Date(to+'T12:00:00'),type==='Shift change'?start:'',type==='Shift change'?end:'',reason,'Pending',new Date(),'','','']);}finally{lock.releaseLock()}return {ok:true}}
function requestRows_(sh,ss){if(sh.getLastRow()<2)return[];const v=sh.getDataRange().getValues(),h=v[0].map(String),tz=ss.getSpreadsheetTimeZone();return v.slice(1).map(r=>{const o={};h.forEach((k,i)=>{let x=r[i];if(x instanceof Date)x=['Start Date','End Date'].includes(k)?Utilities.formatDate(x,tz,'yyyy-MM-dd'):Utilities.formatDate(x,tz,'yyyy-MM-dd HH:mm');o[k]=x});return o})}
function appGetMyRequests(token){const e=employeeForSession_(token),ss=spreadsheet_();return requestRows_(productivitySheets_(ss).requests,ss).filter(r=>String(r['Employee ID'])===e.id).reverse()}
function appManagerGetRequests(token){const m=employeeForSession_(token);requireManager_(m);const ss=spreadsheet_();return requestRows_(productivitySheets_(ss).requests,ss).filter(r=>r.Status==='Pending').reverse()}
function appManagerReviewRequest(token,requestId,decision,note){const manager=employeeForSession_(token);requireManager_(manager);if(!['Approved','Declined'].includes(String(decision)))throw new Error('Choose approve or decline.');const ss=spreadsheet_(),sheets=productivitySheets_(ss),sh=sheets.requests,v=sh.getDataRange().getValues(),h=v[0].map(String),ix=k=>h.indexOf(k),row=v.findIndex((r,i)=>i>0&&String(r[ix('Request ID')])===String(requestId));if(row<1)throw new Error('Request not found.');const r=v[row];if(String(r[ix('Status')])!=='Pending')throw new Error('This request was already reviewed.');if(decision==='Approved'&&String(r[ix('Type')])==='Shift change'){const date=sheetDate_(r[ix('Start Date')],ss.getSpreadsheetTimeZone()),sv=sheetsScheduleValues_(ss),matches=sv.rows.filter(x=>x.employeeId===String(r[ix('Employee ID')])&&x.date===date);if(matches.length!==1)throw new Error(matches.length?'More than one schedule matches this date; edit schedule manually before approval.':'No schedule exists for that employee and date; create a schedule before approving.');matches[0].sheet.getRange(matches[0].row,5,1,2).setValues([[String(r[ix('Proposed Start')]),String(r[ix('Proposed End')])]])}const n=row+1,now=new Date();sh.getRange(n,ix('Status')+1).setValue(decision);sh.getRange(n,ix('Reviewed By')+1).setValue(manager.email||manager.name);sh.getRange(n,ix('Review Note')+1).setValue(cleanText_(note,500));sh.getRange(n,ix('Reviewed At')+1).setValue(now);return {ok:true}}
function sheetsScheduleValues_(ss){const sh=ss.getSheetByName(SCHEDULE_TAB_);if(!sh||sh.getLastRow()<2)return {rows:[]};const v=sh.getDataRange().getValues(),h=v[0].map(String),ix=k=>h.indexOf(k),tz=ss.getSpreadsheetTimeZone();return {rows:v.slice(1).map((r,i)=>({sheet:sh,row:i+2,employeeId:String(r[ix('Employee ID')]),date:sheetDate_(r[ix('Work Date')],tz)}))}}
function appManagerWeeklyReport(token,fromDate,toDate){const m=employeeForSession_(token);requireManager_(m);const ss=spreadsheet_(),tz=ss.getSpreadsheetTimeZone(),to=validDate_(toDate)||Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),d=new Date(to+'T12:00:00');d.setDate(d.getDate()-6);const from=validDate_(fromDate)||Utilities.formatDate(d,tz,'yyyy-MM-dd');if(from>to)throw new Error('Choose a valid report date range.');const tasks=taskRows_(productivitySheets_(ss).tasks,ss),people=employees_().map(e=>{const progress=rowsForEmployee_(ss,APP.PROGRESS,e.id,1000).concat(legacyProgress_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)>=from&&String(r['Work Date']).slice(0,10)<=to),att=rowsForEmployee_(ss,APP.ATTENDANCE,e.id,1000).concat(legacyAttendance_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)>=from&&String(r['Work Date']).slice(0,10)<=to),mine=tasks.filter(t=>String(t['Employee ID'])===e.id),done=mine.filter(t=>t.Status==='Completed'&&String(t['Completed At']).slice(0,10)>=from&&String(t['Completed At']).slice(0,10)<=to).length,overdue=mine.filter(t=>t.Status!=='Completed'&&String(t['Due Date'])<to).length;return {name:e.name,id:e.id,attendance:att.filter(r=>r.Event==='CHECK_IN').length,reports:progress.length,blocked:progress.filter(r=>/blocked/i.test(String(r.Status||''))).length,tasksDone:done,tasksOpen:mine.filter(t=>t.Status!=='Completed').length,tasksOverdue:overdue}});return {from:from,to:to,people:people,summary:{team:people.length,checkIns:people.reduce((a,p)=>a+p.attendance,0),reports:people.reduce((a,p)=>a+p.reports,0),tasksDone:people.reduce((a,p)=>a+p.tasksDone,0),tasksOverdue:people.reduce((a,p)=>a+p.tasksOverdue,0),blocked:people.reduce((a,p)=>a+p.blocked,0)}}}
function managerRecipients_(){const list=employees_(true).filter(isManager_).map(e=>e.email).filter(Boolean);return Array.from(new Set(list.concat(managerEmails_())))}
function appManagerEnableEmailDigests(token){const m=employeeForSession_(token);requireManager_(m);if(!managerRecipients_().length)throw new Error('Add a manager email to Employees or Settings before enabling digests.');['sendDailyTeamDigest_','sendWeeklyTeamDigest_'].forEach(fn=>ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===fn).forEach(t=>ScriptApp.deleteTrigger(t)));ScriptApp.newTrigger('sendDailyTeamDigest_').timeBased().everyDays(1).atHour(18).create();ScriptApp.newTrigger('sendWeeklyTeamDigest_').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();return {ok:true,message:'Daily 6 PM and Monday 8 AM manager email digests enabled ('+Session.getScriptTimeZone()+').'}}
function sendDailyTeamDigest_(){const ss=spreadsheet_(),tz=ss.getSpreadsheetTimeZone(),today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),all=scheduleRows_(ss,today,today,''),leave=requestRows_(productivitySheets_(ss).requests,ss).filter(r=>r.Type==='Leave'&&r.Status==='Approved'&&String(r['Start Date'])<=today&&String(r['End Date'])>=today).map(r=>String(r['Employee ID'])),ids=Array.from(new Set(all.map(r=>String(r['Employee ID'])))).filter(id=>!leave.includes(id));const tasks=taskRows_(productivitySheets_(ss).tasks,ss),att=ids.filter(id=>rowsForEmployee_(ss,APP.ATTENDANCE,id,50).concat(legacyAttendance_(ss,id)).some(r=>String(r['Work Date']).slice(0,10)===today&&r.Event==='CHECK_IN')),reports=ids.filter(id=>rowsForEmployee_(ss,APP.PROGRESS,id,50).concat(legacyProgress_(ss,id)).some(r=>String(r['Work Date']).slice(0,10)===today)),byId=new Map(employees_().map(e=>[e.id,e.name])),missed=ids.filter(id=>!att.includes(id)),missing=ids.filter(id=>!reports.includes(id)),overdue=tasks.filter(t=>t.Status!=='Completed'&&String(t['Due Date'])<today);if(!missed.length&&!missing.length&&!overdue.length)return;const body=['Scheduled employees (approved leave excluded): '+ids.length,'Checked in: '+att.length+'/'+ids.length,'Progress reports: '+reports.length+'/'+ids.length,'Missed check-in: '+(missed.map(id=>byId.get(id)||id).join(', ')||'None'),'Missing report: '+(missing.map(id=>byId.get(id)||id).join(', ')||'None'),'Overdue tasks: '+(overdue.map(t=>(byId.get(String(t['Employee ID']))||t['Employee Name'])+' — '+t.Task+' (due '+t['Due Date']+')').join('\n')||'None')].join('\n');const to=managerRecipients_().join(',');if(to)MailApp.sendEmail(to,'Rushabh Workday daily team digest — '+today,body)}
function sendWeeklyTeamDigest_(){const managers=managerRecipients_();if(!managers.length)return;const report=appManagerWeeklyReportForTrigger_(),s=report.summary,body=['Week: '+report.from+' to '+report.to,'Team: '+s.team,'Check-ins: '+s.checkIns,'Progress reports: '+s.reports,'Tasks completed: '+s.tasksDone,'Overdue tasks: '+s.tasksOverdue,'Blocked reports: '+s.blocked,'','By employee:',...report.people.map(p=>p.name+': check-ins '+p.attendance+', reports '+p.reports+', tasks '+p.tasksDone+'/'+(p.tasksDone+p.tasksOpen)+' done, overdue '+p.tasksOverdue)].join('\n');MailApp.sendEmail(managers.join(','),'Rushabh Workday weekly team report — '+report.to,body)}
function appManagerWeeklyReportForTrigger_(){const ss=spreadsheet_(),tz=ss.getSpreadsheetTimeZone(),to=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),d=new Date(to+'T12:00:00');d.setDate(d.getDate()-6);const from=Utilities.formatDate(d,tz,'yyyy-MM-dd'),tasks=taskRows_(productivitySheets_(ss).tasks,ss),people=employees_().map(e=>{const progress=rowsForEmployee_(ss,APP.PROGRESS,e.id,1000).concat(legacyProgress_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)>=from&&String(r['Work Date']).slice(0,10)<=to),att=rowsForEmployee_(ss,APP.ATTENDANCE,e.id,1000).concat(legacyAttendance_(ss,e.id)).filter(r=>String(r['Work Date']).slice(0,10)>=from&&String(r['Work Date']).slice(0,10)<=to),mine=tasks.filter(t=>String(t['Employee ID'])===e.id),done=mine.filter(t=>t.Status==='Completed'&&String(t['Completed At']).slice(0,10)>=from&&String(t['Completed At']).slice(0,10)<=to).length;return {name:e.name,id:e.id,attendance:att.filter(r=>r.Event==='CHECK_IN').length,reports:progress.length,blocked:progress.filter(r=>/blocked/i.test(String(r.Status||''))).length,tasksDone:done,tasksOpen:mine.filter(t=>t.Status!=='Completed').length,tasksOverdue:mine.filter(t=>t.Status!=='Completed'&&String(t['Due Date'])<to).length}});return {from:from,to:to,people:people,summary:{team:people.length,checkIns:people.reduce((a,p)=>a+p.attendance,0),reports:people.reduce((a,p)=>a+p.reports,0),tasksDone:people.reduce((a,p)=>a+p.tasksDone,0),tasksOverdue:people.reduce((a,p)=>a+p.tasksOverdue,0),blocked:people.reduce((a,p)=>a+p.blocked,0)}}}

