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

// Which offer -> which tags / stage / plan
const OFFERS = {
  guide:     { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Guide'],        stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_DIDNT_SELL },
  plan:      { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Plan'],         stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_SECOND_LAUNCH },
  checklist: { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Checklist'],    stage: 'Expired Luxury - Partners In Luxury', plan: PLAN_ID_QR_SPRING_CHECKLIST },
  fallprep:  { tags: ['Partners In Luxury', 'Luxury', 'QR Fall Prep'],            stage: null, plan: PLAN_ID_QR_FALL_PREP },
  report:    { tags: ['Partners In Luxury', 'Luxury', 'QR Market Report'],        stage: null, plan: PLAN_ID_QR_MARKET_REPORT },
  contact:   { tags: ['Partners In Luxury', 'Website Contact'],                      stage: null, plan: PLAN_ID_WEBSITE_CONTACT }
};

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { d = {}; }
  const offer = OFFERS[d.offer] ? d.offer : 'guide';
  const src = ((d.page || '').match(/[?&]src=([^&#]+)/) || [])[1] || (offer === 'contact' ? 'website' : '');

  // 1) Follow Up Boss — only when the key is present (LIVE mode). Otherwise log-only.
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  let fub = { result: 'not sent (log-only mode: FUB_API_KEY not set)', id: '' };
  if (key) fub = sendToFub_(d, offer, key);

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
function sendToFub_(d, offer, key) {
  try {
    const cfg = OFFERS[offer];
    const name = (d.name || '').trim().split(/\s+/);
    const first = name.shift() || '', last = name.join(' ');
    const addr = (d.address || '').split(',').map(s => s.trim());

    const person = {
      firstName: first, lastName: last,
      emails: d.email ? [{ value: d.email, type: 'home' }] : [],
      phones: d.phone ? [{ value: d.phone, type: 'mobile' }] : [],
      addresses: d.address ? [{ street: addr[0] || '', city: addr[1] || '', state: 'CA' }] : [],
      tags: cfg.tags,
      source: offer === 'contact' ? 'Website' : 'Postcard QR'
    };   // NOTE: FUB rejects a 'type' field on people (tested 9/19/2026); seller-ness is carried by tags + stage
    if (cfg.stage) person.stage = cfg.stage;

    const auth = { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' };
    // Create or merge (FUB dedupes on email/phone)
    const r = UrlFetchApp.fetch(FUB + 'people?deduplicate=true', {
      method: 'post', contentType: 'application/json', headers: auth, payload: JSON.stringify(person), muteHttpExceptions: true
    });
    const body = JSON.parse(r.getContentText() || '{}');
    const id = body.id;
    if (!id) return { result: 'FUB ERROR ' + r.getResponseCode() + ' ' + (body.errorMessage || r.getContentText()).slice(0, 200), id: '' };

    // Note with the details the ISAs / agents want to see
    UrlFetchApp.fetch(FUB + 'notes', {
      method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
      payload: JSON.stringify({ personId: id, subject: (offer === 'contact' ? 'Website contact' : 'Postcard QR: ' + offer),
        body: 'Requested: ' + offer + '\nProperty: ' + (d.address || '') + (d.interest ? '\nInterest: ' + d.interest : '') + (d.message ? '\nMessage: ' + d.message : '') + '\nConsent to call/text: ' + (d.consent ? 'YES' : 'no') + '\nPage: ' + (d.page || '') + '\nSubmitted: ' + (d.ts || new Date().toISOString()) })
    });

    // Enroll in this offer's action plan (one QR plan per person; Website Contact always enrolls)
    let result = 'created/merged';
    if (cfg.plan) {
      const already = QR_PLAN_IDS.indexOf(cfg.plan) >= 0 ? currentQrPlan_(id, auth) : null;
      if (already) {
        UrlFetchApp.fetch(FUB + 'notes', {
          method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
          payload: JSON.stringify({ personId: id, subject: 'Second QR request: ' + offer,
            body: 'Also requested "' + offer + '" but is already in QR plan ' + already + '. Not re-enrolled (one QR plan per person). Send the piece by hand if they ask.' })
        });
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
