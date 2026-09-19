# selling-norcal.com — Deborah Maciel & Belia Martinez guide pages

Static site on GitHub Pages (CNAME selling-norcal.com). Working copy also lives in
`J:\My Drive\Expired Remarketing\Landing Page` (keep the two in sync; the repo is what is live).

| Page | Offer key | FUB plan |
|---|---|---|
| /why-your-luxury-home-didnt-sell | guide | 30 QR: Didn't Sell Guide |
| /the-second-launch | plan | 31 QR: Second Launch Plan |
| /spring-relaunch-checklist | checklist | 32 QR: Spring Checklist |
| /fall-prep-guide | fallprep | 33 QR: Fall Prep |
| /luxury-market-report | report | 34 QR: Market Report (report.pdf is a TEMPLATE — fill per city before card 7 mails) |
| / (contact form) | contact | 35 Website Contact |

`q/` = the postcard QR redirects (dynamic QR without a vendor): `/q/c1` … `/q/c7` → the matching page with `?src=cN`,
`/q/home-value` → Belia's Fello page. Change a destination by editing that folder's index.html; the printed QR never changes.

Lead capture: `apps-script/Code.gs` runs as a Google Apps Script web app under team@norcaladmin.com
(Script Property FUB_API_KEY = Belia's key). Its /exec URL goes into `LEAD_ENDPOINT` at the top of each page's script.
The script creates/merges the FUB person, tags + stages them, writes a note, and enrolls the plan; the plan's Day-0 email delivers the guide.
