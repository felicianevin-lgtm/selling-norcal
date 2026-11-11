/**
 * Postcard QR landing pages -> Google Sheet log (always) -> Follow Up Boss (Belia's account, only once the key is set).
 * No Zapier. Deploy as a Web App (Execute as: Me · Who has access: Anyone) from team@norcaladmin.com.
 * Paste the /exec URL into LEAD_ENDPOINT at the top of each landing page's <script>.
 *
 * TWO MODES, switched by one Script Property:
 *   LOG ONLY (default)  – no FUB_API_KEY property set. Every submission is appended to the log sheet and
 *                         nothing is sent to Follow Up Boss. Use this for test submissions.
 *   LIVE                – Project Settings -> Script Properties -> add FUB_API_KEY = <Belia's Follow Up Boss API key>.
 *                         Every submission is logged AND created/merged in FUB, tagged, staged, and enrolled in
 *                         its plan. Remove the property to go back to log-only. (Never put the key in the HTML.)
 *
 * LOG SHEET: "Website Lead Log - selling-norcal.com" in team@norcaladmin's Drive, folder Expired Remarketing.
 *   https://docs.google.com/spreadsheets/d/1aLj9sQPSHYT_iFWt2J2L9dx_zepK28XvC4yVSpsNML8/edit
 *   The script writes the header row itself on first use. Every submission = one row, including the FUB result.
 *
 * Verified in FUB on 9/18/2026:
 *   tags   "Partners In Luxury", "Expired Luxury", "Luxury"
 *   stage  "Expired Luxury - Partners In Luxury"
 *   plans  24 = Luxury Expired Action Plan (Belia) Sends email right now
 *          23 = Luxury Expired Action Plan (Deborah) Sends email right now
 *          30-35 = the QR guide plans + Website Contact (built 9/19/2026, see constants below)
 * Rule (doc 06): one QR plan per person. A second form submission adds the tags + a note but does not
 * enroll a second QR plan (the first plan already sends the other pieces on day 7/14).
 */
const FUB = 'https://api.followupboss.com/v1/';

// Log sheet (team@norcaladmin Drive > Expired Remarketing). Created 9/22/2026.
const LOG_SHEET_ID = '1aLj9sQPSHYT_iFWt2J2L9dx_zepK28XvC4yVSpsNML8';
const LOG_TAB      = 'Leads';
const LOG_HEADERS  = ['Timestamp', 'Offer', 'Name', 'Email', 'Phone', 'Address', 'Interest', 'Message',
                      'Consent to call/text', 'Page', 'Source (postcard)', 'FUB result', 'FUB person id'];

// FUB action plan IDs — created by API 9/19/2026 in Belia's account (beliam-homes). Admin -> Action Plans.
// The guide itself is emailed by the plan's Day-0 step, from Belia's FUB email. This script only tags + enrolls.
const PLAN_ID_QR_DIDNT_SELL       = 30;   // "QR: Didn't Sell Guide"
const PLAN_ID_QR_SECOND_LAUNCH    = 31;   // "QR: Second Launch Plan"
const PLAN_ID_QR_SPRING_CHECKLIST = 32;   // "QR: Spring Checklist"
const PLAN_ID_QR_FALL_PREP        = 33;   // "QR: Fall Prep"
const PLAN_ID_QR_MARKET_REPORT    = 34;   // "QR: Market Report"
const PLAN_ID_WEBSITE_CONTACT     = 35;   // "Website Contact"
const QR_PLAN_IDS = [PLAN_ID_QR_DIDNT_SELL, PLAN_ID_QR_SECOND_LAUNCH, PLAN_ID_QR_SPRING_CHECKLIST, PLAN_ID_QR_FALL_PREP, PLAN_ID_QR_MARKET_REPORT];

// ON HOLD 10/2/2026 (Deborah + Belia): the market report. Empty this list to bring it back.
const PAUSED_OFFERS = ['report'];

// Which offer -> which tags / stage / plan
const OFFERS = {
  guide:     { tags: ['Partners In Luxury', 'Expired Luxury', 'WHYYOURLUXURYHOMEDIDNTSELL'], stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_DIDNT_SELL },
  plan:      { tags: ['Partners In Luxury', 'Expired Luxury', 'THESECONDLAUNCHPLAN'],            stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_SECOND_LAUNCH },
  checklist: { tags: ['Partners In Luxury', 'Expired Luxury', 'SPRINGRELAUNCHCHECKLIST'],         stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_SPRING_CHECKLIST },
  fallprep:  { tags: ['Partners In Luxury', 'Luxury', 'FALLPREPGUIDE'],                           stage: null, plan: PLAN_ID_QR_FALL_PREP },
  report:    { tags: ['Partners In Luxury', 'Luxury', 'LUXURYMARKETREPORT'],                      stage: null, plan: PLAN_ID_QR_MARKET_REPORT },
  contact:   { tags: ['Partners In Luxury', 'WEBSITECONTACT'],                                      stage: null, plan: PLAN_ID_WEBSITE_CONTACT }
};
// Channel tag from the ?src= on the page URL: c1..c7 = that postcard, ad1.. = that StreetText ad, else website.
// Tag spelling matches what Felicia typed into StreetText (uppercase, no spaces) so FUB sees ONE tag per guide either way.
const CHANNEL_TAGS = {
  c1: 'POSTCARD1ITSNOTTHEHOUSE', c2: 'POSTCARD2WHEREYOURBUYERLIVES', c3: 'POSTCARD3WENOTICED',
  c4: 'POSTCARD4THESECONDLAUNCH', c5: 'POSTCARD5SPRINGISFIVEMONTHSAWAY', c6: 'POSTCARD6YOURNEIGHBORSAREASKING',
  c7: 'POSTCARD7MARKETUPDATE',
  ad1: 'AD1ITSNOTTHEHOUSE', ad2: 'AD2-THESECONDLAUNCH', ad3: 'AD3-SPRINGISFIVEMONTHSAWAY',
  ad4: 'AD4EVERYAGENTINTOWN', ad5: 'AD5-WHEREBUYERLIVES', ad6: 'AD6FALLPREP'
};
function channelTag_(src) { return CHANNEL_TAGS[src] || (src ? ('AD-' + String(src).toUpperCase()) : 'WEBSITEDIRECT'); }

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { d = {}; }
  let offer = OFFERS[d.offer] ? d.offer : 'guide';
  if (PAUSED_OFFERS.indexOf(offer) >= 0) offer = 'contact';   // paused pieces are handled as a plain website contact
  const src = ((d.page || '').match(/[?&]src=([^&#]+)/) || [])[1] || (offer === 'contact' ? 'website' : '');

  // 1) Follow Up Boss — only when the key is present (LIVE mode). Otherwise log-only.
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  let fub = { result: 'not sent (log-only mode: FUB_API_KEY not set)', id: '' };
  if (key) fub = sendToFub_(d, offer, key, src);

  // 2) Paper trail — every submission, whatever happened with FUB.
  let logged = false;
  try {
    logToSheet_([new Date(), offer, d.name || '', d.email || '', d.phone || '', d.address || '', d.interest || '',
                 d.message || '', d.consent ? 'YES' : 'no', d.page || '', src, fub.result, fub.id]);
    logged = true;
  } catch (err) { fub.result += ' | LOG ERROR ' + err; }

  return out_({ ok: true, logged: logged, fub: fub.result, id: fub.id });
}

function doGet() { return out_({ ok: true, service: 'postcard-qr-to-fub', mode: PropertiesService.getScriptProperties().getProperty('FUB_API_KEY') ? 'live' : 'log-only' }); }

// ---- Follow Up Boss -------------------------------------------------------------------------------
// MATCHING RULE (Felicia 11/11/2026): postcard people are ALREADY in Belia's FUB. A form submission must be
// linked to the existing contact, never create a duplicate. Lookup order:
//   1) email  2) phone  3) property address among people tagged "workable" / "Partners In Luxury"
// Only when nothing matches is a new person created (ad / website visitors who were never mailed).
// Existing contacts: tags are ADDED (never removed), the typed email/phone is appended as a non-primary entry,
// name / stage / source / assigned agent are left alone. FUB "Tag Added" automations then start the guide plan
// (and the 10-minute fub_tag_enroll sweep backs it up), so the script does NOT enroll existing people itself
// (that would enroll them twice). One QR plan per person: if they are already in a QR plan, the guide tag is
// withheld (it would trigger another plan) and a note is left instead.
const LIST_TAGS = ['workable', 'Partners In Luxury'];
// Tags that fire a FUB "Tag Added" automation into a plan (see fub_tag_enroll.py TAG_PLAN)
const TRIGGER_TAGS = ['WHYYOURLUXURYHOMEDIDNTSELL', 'THESECONDLAUNCHPLAN', 'SPRINGRELAUNCHCHECKLIST',
                      'EVERYAGENTHASYOURADDRESS', 'THREEQUESTIONSTOASKEVERYAGENT'];

function fubGet_(path, auth) {
  const r = UrlFetchApp.fetch(FUB + path, { headers: auth, muteHttpExceptions: true });
  return r.getResponseCode() === 200 ? JSON.parse(r.getContentText() || '{}') : {};
}
function digits_(s) { return String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); }
// "633 Kalthoff Common, Livermore" -> "633 kalthoff" (house number + first word of the street name)
function addrKey_(s) {
  const m = String(s || '').toLowerCase().replace(/[.,#]/g, ' ').match(/^\s*(\d+[a-z]?)\s+(?:(?:n|s|e|w|north|south|east|west)\s+)?([a-z0-9]+)/);
  return m ? m[1] + ' ' + m[2] : '';
}
function nameScore_(p, typedName) {
  const t = String(typedName || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const f = String(p.firstName || '').toLowerCase(), l = String(p.lastName || '').toLowerCase();
  return (l && t.indexOf(l) >= 0 ? 2 : 0) + (f && t.indexOf(f) >= 0 ? 1 : 0);
}

// Returns { id, how } for an existing contact, or null
function findExisting_(d, auth) {
  const email = String(d.email || '').trim().toLowerCase();
  if (email) {
    const b = fubGet_('people?email=' + encodeURIComponent(email) + '&limit=5&fields=id,name', auth);
    if (b.people && b.people.length) return { id: b.people[0].id, how: 'email' };
  }
  const ph = digits_(d.phone);
  if (ph.length === 10) {
    const b = fubGet_('people?phone=' + ph + '&limit=5&fields=id,name', auth);
    if (b.people && b.people.length) return { id: b.people[0].id, how: 'phone' };
  }
  const key = addrKey_(d.address);
  if (key) {
    const seen = {}, hits = [];
    LIST_TAGS.forEach(function (tag) {
      for (let off = 0; off < 2000; off += 100) {
        const b = fubGet_('people?tags=' + encodeURIComponent(tag) + '&limit=100&offset=' + off + '&fields=id,firstName,lastName,addresses', auth);
        const ppl = b.people || [];
        ppl.forEach(function (p) {
          if (seen[p.id]) return; seen[p.id] = 1;
          if ((p.addresses || []).some(function (a) { return addrKey_(a.street) === key; })) hits.push(p);
        });
        if (ppl.length < 100) break;
      }
    });
    if (hits.length) {
      hits.sort(function (a, b) { return nameScore_(b, d.name) - nameScore_(a, d.name) || a.id - b.id; });
      const best = hits[0];
      return { id: best.id, how: 'address' + (nameScore_(best, d.name) ? '' : ' (name differs - check)') + (hits.length > 1 ? ', ' + hits.length + ' at address' : '') };
    }
  }
  return null;
}

function sendToFub_(d, offer, key, src) {
  try {
    const cfg = OFFERS[offer];
    const auth = { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' };
    const wantTags = cfg.tags.concat([channelTag_(src)]);
    const noteBody = 'Requested: ' + offer + '\nSubmitted as: ' + (d.name || '') + ' / ' + (d.email || '') + ' / ' + (d.phone || '') +
      '\nProperty: ' + (d.address || '') + (d.interest ? '\nInterest: ' + d.interest : '') + (d.message ? '\nMessage: ' + d.message : '') +
      '\nConsent to call/text: ' + (d.consent ? 'YES' : 'no') + '\nPage: ' + (d.page || '') + '\nSubmitted: ' + (d.ts || new Date().toISOString());
    const note = function (id, subject, body) {
      UrlFetchApp.fetch(FUB + 'notes', { method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
        payload: JSON.stringify({ personId: id, subject: subject, body: body }) });
    };

    // ---- 1) Existing contact: link, never create ----
    const hit = findExisting_(d, auth);
    if (hit) {
      const p = fubGet_('people/' + hit.id, auth);
      const inQr = QR_PLAN_IDS.indexOf(cfg.plan) >= 0 ? currentQrPlan_(hit.id, auth) : null;
      let add = wantTags.slice();
      if (inQr) add = add.filter(function (t) { return TRIGGER_TAGS.indexOf(t) < 0 && t !== 'FALLPREPGUIDE'; });
      const tags = (p.tags || []).slice();
      add.forEach(function (t) { if (tags.map(function (x) { return x.toLowerCase(); }).indexOf(t.toLowerCase()) < 0) tags.push(t); });
      const upd = { tags: tags };
      const email = String(d.email || '').trim();
      if (email && !(p.emails || []).some(function (e) { return String(e.value).toLowerCase() === email.toLowerCase(); }))
        upd.emails = (p.emails || []).map(function (e) { return { value: e.value, type: e.type, isPrimary: e.isPrimary }; })
                                     .concat([{ value: email, type: 'other', isPrimary: (p.emails || []).length ? false : true }]);
      const ph = digits_(d.phone);
      if (ph.length === 10 && !(p.phones || []).some(function (x) { return digits_(x.value) === ph; }))
        upd.phones = (p.phones || []).map(function (x) { return { value: x.value, type: x.type, isPrimary: x.isPrimary }; })
                                     .concat([{ value: ph, type: 'mobile', isPrimary: (p.phones || []).length ? false : true }]);
      const r = UrlFetchApp.fetch(FUB + 'people/' + hit.id, { method: 'put', contentType: 'application/json', headers: auth,
        payload: JSON.stringify(upd), muteHttpExceptions: true });
      note(hit.id, (offer === 'contact' ? 'Website contact' : 'Postcard QR: ' + offer) + ' (matched by ' + hit.how + ')', noteBody);
      let result = 'matched existing by ' + hit.how + (r.getResponseCode() < 300 ? '' : ' (tag update FAILED ' + r.getResponseCode() + ')');
      if (inQr) {
        note(hit.id, 'Second QR request: ' + offer, 'Also requested "' + offer + '" but is already in QR plan ' + inQr +
          '. Guide tag withheld so no second plan starts (one QR plan per person). Send the piece by hand if they ask.');
        result += ', already in plan ' + inQr + ' (not re-enrolled)';
      } else if (cfg.plan === PLAN_ID_QR_FALL_PREP || cfg.plan === PLAN_ID_WEBSITE_CONTACT) {
        // No Tag Added automation for these two: enroll directly if not already on the plan
        const on = fubGet_('actionPlansPeople?personId=' + hit.id + '&limit=100', auth);
        const list = on.actionPlansPeople || on.actionplanspeople || [];
        if (!list.some(function (x) { return x.actionPlanId === cfg.plan; })) {
          const en = UrlFetchApp.fetch(FUB + 'actionPlansPeople', { method: 'post', contentType: 'application/json', headers: auth,
            muteHttpExceptions: true, payload: JSON.stringify({ personId: hit.id, actionPlanId: cfg.plan }) });
          result += en.getResponseCode() < 300 ? ', enrolled in plan ' + cfg.plan : ', plan enroll FAILED ' + en.getResponseCode();
        }
      } else {
        result += ', plan ' + cfg.plan + ' starts from the tag automation';
      }
      return { result: result, id: String(hit.id) };
    }

    // ---- 2) Nobody matched: genuinely new lead (ad / website visitor) ----
    const name = (d.name || '').trim().split(/\s+/);
    const first = name.shift() || '', last = name.join(' ');
    const addr = (d.address || '').split(',').map(function (s) { return s.trim(); });
    const person = {
      firstName: first, lastName: last,
      emails: d.email ? [{ value: d.email, type: 'home' }] : [],
      phones: d.phone ? [{ value: d.phone, type: 'mobile' }] : [],
      addresses: d.address ? [{ street: addr[0] || '', city: addr[1] || '', state: 'CA' }] : [],
      tags: wantTags,
      source: offer === 'contact' ? 'Website' : 'Postcard QR'
    };   // NOTE: FUB rejects a 'type' field on people (tested 9/19/2026); seller-ness is carried by tags + stage
    if (cfg.stage) person.stage = cfg.stage;
    const r = UrlFetchApp.fetch(FUB + 'people?deduplicate=true', {
      method: 'post', contentType: 'application/json', headers: auth, payload: JSON.stringify(person), muteHttpExceptions: true
    });
    const body = JSON.parse(r.getContentText() || '{}');
    const id = body.id;
    if (!id) return { result: 'FUB ERROR ' + r.getResponseCode() + ' ' + (body.errorMessage || r.getContentText()).slice(0, 200), id: '' };
    note(id, offer === 'contact' ? 'Website contact' : 'Postcard QR: ' + offer, noteBody);

    // Created-with-tags never fires the Tag Added automations, so enroll directly (one QR plan per person)
    let result = 'created new';
    if (cfg.plan) {
      const already = QR_PLAN_IDS.indexOf(cfg.plan) >= 0 ? currentQrPlan_(id, auth) : null;
      if (already) {
        result += ', already in plan ' + already + ' (not re-enrolled)';
      } else {
        const en = UrlFetchApp.fetch(FUB + 'actionPlansPeople', {
          method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
          payload: JSON.stringify({ personId: id, actionPlanId: cfg.plan })
        });
        result += en.getResponseCode() < 300 ? ', enrolled in plan ' + cfg.plan : ', plan enroll FAILED ' + en.getResponseCode();
      }
    }
    return { result: result, id: String(id) };
  } catch (err) {
    return { result: 'FUB ERROR ' + err, id: '' };
  }
}

// Returns the id of a QR plan the person is already in (running or finished), else null
function currentQrPlan_(personId, auth) {
  try {
    const r = UrlFetchApp.fetch(FUB + 'actionPlansPeople?personId=' + personId + '&limit=100', { headers: auth, muteHttpExceptions: true });
    const b = JSON.parse(r.getContentText() || '{}');
    const list = b.actionplanspeople || b.actionPlansPeople || [];
    for (let i = 0; i < list.length; i++) if (QR_PLAN_IDS.indexOf(list[i].actionPlanId) >= 0) return list[i].actionPlanId;
  } catch (err) {}
  return null;
}

// ---- Log sheet ----------------------------------------------------------------------------------
function logToSheet_(row) {
  const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
  let sh = ss.getSheetByName(LOG_TAB);
  if (!sh) { sh = ss.getSheets()[0]; sh.setName(LOG_TAB); }
  if (sh.getLastRow() === 0 || String(sh.getRange(1, 1).getValue()).trim() !== LOG_HEADERS[0]) {
    sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor: writes one test row to the log sheet (no FUB call) so you can see the trail works.
function testLogSheet() {
  logToSheet_([new Date(), 'test', 'Test Row', 'test@example.com', '', '', '', 'from testLogSheet()', 'no', 'editor', '', 'not sent (editor test)', '']);
  Logger.log('Row written to ' + 'https://docs.google.com/spreadsheets/d/' + LOG_SHEET_ID);
}

// Run once from the editor to confirm the FUB key works (check the log for the account name)
function testIdentity() {
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  if (!key) { Logger.log('No FUB_API_KEY set: log-only mode.'); return; }
  const r = UrlFetchApp.fetch(FUB + 'identity', { headers: { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' } });
  Logger.log(r.getContentText());
}
