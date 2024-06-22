# MyM Downloader
Download a mym model's feed

## How to setup
1) Install nodejs version 18 or higher
2) Run `npm install` to install axios and form-data
3) Login on your mym account
4) Press F12 and locate the cookie named: PHPSESSID
5) Copy the value of PHPSESSID in `cookies.cfg`
6) Run `scrape.bat` on Windows or `./scrape_mym.js -l` to list your subscribed model then `./scrape_mym.js [profileName]` to download everything or `./scrape_mym.js [profileName] [page]` to download a page of 20 posts.

## Legal terms
Use at your own risk.
SVP m'envoyer pas en justice MyM 🙏.