/**
 * Postcard QR landing pages -> Follow Up Boss (Belia's account), no Zapier.
 * Deploy as a Web App (Execute as: Me · Who has access: Anyone). Deploy from the Google account
 * the guide emails should come FROM (team@norcaladmin.com is the sensible choice; replies go to info@deborahmaciel.com). Paste the /exec URL into
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
const SITE = 'https://selling-norcal.com';
const DELIVER = {   // what each offer emails to the lead
  guide:     { title: "Why Your Luxury Home Didn't Sell", file: 'guide.pdf' },
  plan:      { title: 'The Second Launch: Our Marketing Plan', file: 'plan.pdf' },
  checklist: { title: 'The Spring Relaunch Checklist', file: 'checklist.pdf' },
  fallprep:  { title: 'The Fall Prep Guide', file: 'fallprep.pdf' },
  report:    { title: 'Luxury Market Report', file: 'report.pdf' }
};

// Which offer -> which tags / stage / plan
const OFFERS = {
  guide:     { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Guide'],        stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  plan:      { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Plan'],         stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  checklist: { tags: ['Partners In Luxury', 'Expired Luxury', 'QR Checklist'],    stage: 'Expired Luxury - Partners In Luxury', plan: 24 },
  fallprep:  { tags: ['Partners In Luxury', 'Luxury', 'QR Fall Prep'],            stage: null, plan: null },
  report:    { tags: ['Partners In Luxury', 'Luxury', 'QR Market Report'],        stage: null, plan: null },
  contact:   { tags: ['Partners In Luxury', 'Website Contact'],                      stage: null, plan: null }
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
      source: d.offer === 'contact' ? 'Website' : 'Postcard QR',
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
      payload: JSON.stringify({ personId: id, subject: (d.offer === 'contact' ? 'Website contact' : 'Postcard QR: ' + d.offer),
        body: 'Requested: ' + (d.offer || 'guide') + '\nProperty: ' + (d.address || '') + '\nConsent to call/text: ' + (d.consent ? 'YES' : 'no') + '\nPage: ' + (d.page || '') + '\nSubmitted: ' + (d.ts || new Date().toISOString()) })
    });

    // Enroll in the action plan for expired-list offers
    if (cfg.plan) {
      UrlFetchApp.fetch(FUB + 'actionPlansPeople', {
        method: 'post', contentType: 'application/json', headers: auth, muteHttpExceptions: true,
        payload: JSON.stringify({ personId: id, actionPlanId: cfg.plan })
      });
    }
    // Email the lead their copy (skipped for the plain contact form)
    const dl = DELIVER[d.offer];
    if (dl && d.email) {
      try {
        MailApp.sendEmail({
          to: d.email,
          replyTo: 'info@deborahmaciel.com',
          name: 'Deborah Maciel & Belia Martinez',
          subject: 'Your copy: ' + dl.title,
          htmlBody: '<p>Hi ' + (first || 'there') + ',</p>' +
            '<p>Thank you for requesting <b>' + dl.title + '</b>. Here is your copy:</p>' +
            '<p><a href="' + SITE + '/downloads/' + dl.file + '">' + SITE + '/downloads/' + dl.file + '</a></p>' +
            '<p>If you would like to know what your home is worth today, reply to this email or call or text Deborah at (209) 207-2084 or Belia at (925) 518-7500.</p>' +
            '<p>Deborah Maciel &amp; Belia Martinez<br>REALTORS&reg; &middot; eXp Luxury</p>' +
            '<p style="font-size:11px;color:#777">Deborah Maciel, DRE 01997178, eXp Realty of Northern California, Inc., DRE 02188495 &middot; Belia Martinez, DRE 01705381, eXp Realty of California, Inc., DRE 01878277 &middot; Equal Housing Opportunity. This is not intended as a solicitation if your property is currently listed with another broker. To stop receiving email, reply with the word unsubscribe.</p>'
        });
      } catch (mailErr) {}
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
