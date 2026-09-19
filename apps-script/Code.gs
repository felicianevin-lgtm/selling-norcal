/**
 * Postcard QR landing pages -> Follow Up Boss (Belia's account), no Zapier.
 * Deploy as a Web App (Execute as: Me · Who has access: Anyone). Paste the /exec URL into
 * LEAD_ENDPOINT at the top of each landing page's <script>.
 *
 * ONE-TIME SETUP: Project Settings -> Script Properties -> add
 *   FUB_API_KEY = <Belia's Follow Up Boss API key>      (never put the key in the HTML)
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
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
    if (!key) return out_({ ok: false, error: 'FUB_API_KEY not set' });
    const cfg = OFFERS[d.offer] || OFFERS.guide;
    const name = (d.name || '').trim().split(/\s+/);
    const first = name.shift() || '', last = name.join(' ');
    const addr = (d.address || '').split(',').map(s => s.trim());

    const person = {
      firstName: first, lastName: last,
      emails: d.email ? [{ value: d.email, type: 'home' }] : [],
      phones: d.phone ? [{ value: d.phone, type: 'mobile' }] : [],
      addresses: d.address ? [{ street: addr[0] || '', city: addr[1] || '', state: 'CA' }] : [],
      tags: cfg.tags,
      source: d.offer === 'contact' ? 'Website' : 'Postcard QR'
    };   // NOTE: FUB rejects a 'type' field on people (tested 9/19/2026); seller-ness is carried by tags + stage
    if (cfg.stage) person.stage = cfg.stage;

    const auth = { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' };
    // Create or merge (FUB dedupes on email/phone)
    const r = UrlFetchApp.fetch(FUB + 'people?deduplicate=true', {
      method: 'post', contentType: 'application/json', headers: auth, payload: JSON.stringify(person), muteHttpExceptions: true
    });
    const body = JSON.parse(r.getContentText() || '{}');
    const id = body.id;
    if (!id) return out_({ ok: false, error: 'FUB create failed', status: r.getResponseCode(), body: body });

    // Note with the details the ISAs / agents want to see
    UrlFetchApp.fetch(FUB + 'notes', {
      method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
      payload: JSON.stringify({ personId: id, subject: (d.offer === 'contact' ? 'Website contact' : 'Postcard QR: ' + d.offer),
        body: 'Requested: ' + (d.offer || 'guide') + '\nProperty: ' + (d.address || '') + (d.interest ? '\nInterest: ' + d.interest : '') + (d.message ? '\nMessage: ' + d.message : '') + '\nConsent to call/text: ' + (d.consent ? 'YES' : 'no') + '\nPage: ' + (d.page || '') + '\nSubmitted: ' + (d.ts || new Date().toISOString()) })
    });

    // Enroll in this offer's action plan (one QR plan per person; Website Contact always enrolls)
    let enrolled = false, skipped = null;
    if (cfg.plan) {
      const already = QR_PLAN_IDS.indexOf(cfg.plan) >= 0 ? currentQrPlan_(id, auth) : null;
      if (already) {
        skipped = already;
        UrlFetchApp.fetch(FUB + 'notes', {
          method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
          payload: JSON.stringify({ personId: id, subject: 'Second QR request: ' + d.offer,
            body: 'Also requested "' + d.offer + '" but is already in QR plan ' + already + '. Not re-enrolled (one QR plan per person). Send the piece by hand if they ask.' })
        });
      } else {
        const e = UrlFetchApp.fetch(FUB + 'actionPlansPeople', {
          method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
          payload: JSON.stringify({ personId: id, actionPlanId: cfg.plan })
        });
        enrolled = e.getResponseCode() < 300;
      }
    }
    return out_({ ok: true, id: id, enrolled: enrolled, alreadyInPlan: skipped });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doGet() { return out_({ ok: true, service: 'postcard-qr-to-fub' }); }

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

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to confirm the key works (check the log for the account name)
function testIdentity() {
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  const r = UrlFetchApp.fetch(FUB + 'identity', { headers: { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' } });
  Logger.log(r.getContentText());
}
