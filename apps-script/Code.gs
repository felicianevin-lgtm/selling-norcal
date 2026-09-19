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
 */
const FUB = 'https://api.followupboss.com/v1/';

// Which offer -> which tags / stage / plan
const OFFERS = {
  guide:     { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Guide'],        stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  plan:      { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Plan'],         stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  checklist: { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Checklist'],    stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  fallprep:  { tags: ['Partners In Luxury', 'Luxury', 'QR Fall Prep'],            stage: null, plan: null },
  report:    { tags: ['Partners In Luxury', 'Luxury', 'QR Market Report'],        stage: null, plan: null }
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
      source: 'Postcard QR',
      type: 'Seller'
    };
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
      payload: JSON.stringify({ personId: id, subject: 'Postcard QR: ' + (d.offer || 'guide'),
        body: 'Requested: ' + (d.offer || 'guide') + '\nProperty: ' + (d.address || '') + '\nConsent to call/text: ' + (d.consent ? 'YES' : 'no') + '\nPage: ' + (d.page || '') + '\nSubmitted: ' + (d.ts || new Date().toISOString()) })
    });

    // Enroll in the action plan for expired-list offers
    if (cfg.plan) {
      UrlFetchApp.fetch(FUB + 'actionPlansPeople', {
        method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
        payload: JSON.stringify({ personId: id, actionPlanId: cfg.plan })
      });
    }
    return out_({ ok: true, id: id });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doGet() { return out_({ ok: true, service: 'postcard-qr-to-fub' }); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to confirm the key works (check the log for the account name)
function testIdentity() {
  const key = PropertiesService.getScriptProperties().getProperty('FUB_API_KEY');
  const r = UrlFetchApp.fetch(FUB + 'identity', { headers: { Authorization: 'Basic ' + Utilities.base64Encode(key + ':'), 'X-System': 'NorCalAdmin-LandingPage' } });
  Logger.log(r.getContentText());
}
