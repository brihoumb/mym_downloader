#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const PRINT_ERROR = true;
const PRINT_PAGES = false;

const PROFILE = process.argv[2];
const COOKIES = init_cookies();

const HELP_FLAGS = ['-h', '--h', '-H', '--H', '-help', '--help'];
const LIST_FLAGS = ['-l', '--l', '-L', '--L', '-list', '--list'];

if (!PROFILE) {
  console.error('Missing parameter [profile] !!\n')
  console.log('Usage:\n./scrape_mym.js [profile] [selected page (default to all)]\n\nOptions:\n[-h|--h|-H|--H|-help|--help] open this help\n[-l|--l|-L|--L|-list|--list] list your subscribed models');
  process.exit(1);
} else if (HELP_FLAGS.indexOf(PROFILE) > -1) {
  console.log('Scrape MyM and download images/videos from feed.\n\nUsage:\n./scrape_mym.js [model name] [selected page (default to all)]\n\nOptions:\n[-h|--h|-H|--H|-help|--help] open this help\n[-l|--l|-L|--L|-list|--list] list your subscribed models');
  process.exit(0);
} else if (LIST_FLAGS.indexOf(PROFILE) > -1) {
  const list_models = (await retrieve_content_with_cookie({method: 'get', url: 'https://mym.fans/app/myms?tab=subscriptions', headers: {'Cookie': COOKIES}}));
  if (list_models == null) {console.error('Can\'t retrieve informations or wrong Cookies!');process.exit(1);}
  const models = list_models.match(/(nickname__name js\-nickname\-placeholder).*?(?=<)/gm).map((name)=>name.match(/(?<=>).*/gm));
  console.log(models.sort().join('\n'));
  process.exit(0);
}

let page = 0
let TOTAL_ERR = 0;
let TOTAL_IMG = 0;
let TOTAL_VID = 0;

if (process.argv[3] && !isNaN(parseInt(process.argv[3]))) {
	page = parseInt(process.argv[3]);
}

const user_token = (await retrieve_content_with_cookie({method: 'get', url: `https://mym.fans/${PROFILE}`, headers: {'Cookie': COOKIES, 'X-Requested-With': 'XMLHttpRequest'}}))?.match(/<div class=\\"js-env-user-infos\\" data-user-token=\\"(.*?)\\" data-user-cookie=\\"\\"><\/div>/gm)?.[0]?.replace(/.*data-user-token=\\"(.*?)\\".*/gm, '$1') ?? null;
if (user_token == null) {console.error('Can\'t retrieve user_token or wrong Cookies or wrong model name!');process.exit(1);}

if (!fs.existsSync(path.join(path.resolve('.'), PROFILE))) {fs.mkdirSync(PROFILE);}

if (!page) {
  let i = 1;
  let ret = 0;
  while (ret == 0) {
    ret = await download_page(i);
    i++;
    await new Promise(r => setTimeout(r, 1000));
  }
} else {
  await download_page(page);
}
await new Promise(r => setTimeout(r, 3000));
console.log(`img: ${TOTAL_IMG}, vid: ${TOTAL_VID}, err: ${TOTAL_ERR}`);

async function retrieve_content_with_cookie(config) {
  let resp;
  try {
    resp = await axios.request(config);
    if (resp.data == '') {return null}
    return JSON.stringify(resp.data)?.replace(/\&amp\;/gm, '&');
  } catch(error) {
    if (PRINT_ERROR) {
      console.error('ERROR IN retrieve_content_with_cookie', error.code, error?.config?.url);
      // console.log(error.response.data, error.config.headers);
    }
    TOTAL_ERR++;
    return null;
  }
}

async function download_page(x = 1) {
  if (PRINT_PAGES) console.error(`Page: ${x}`);
  let data = new FormData();
  data.append('page', x);
  const config_ctnt = {method: 'post', url: `https://mym.fans/app/ajax/profile/${PROFILE}/feed`, headers: {'Cookie': COOKIES, 'X-Requested-With': 'XMLHttpRequest', ...data.getHeaders()}, data : data};

  let all_uri = {'img': [], 'vid': []};

  const json_data = await retrieve_content_with_cookie(config_ctnt);
  if (json_data == null) {return 1;}
  json_data.match(/(data-media-id\=.*?)(<span class=\\"media__timer\\">.*?<\/span><img class=\\"media__image\\" )?src=\\"(.*?)\\"/gm).map((url) => {
    if (!url.match(/(<span class=\\"media__timer\\">.*?<\/span><img class=\\"media__image\\" )/gm)) {
      all_uri.img.push(url.match(/https.*(?=\\)/)[0]);
    } else {
      all_uri.vid.push(url.replace(/data-media-id\=\\"(\d+)\\\".*/gm, '$1'));
    }
  });

  TOTAL_VID += all_uri.vid.length;
  TOTAL_IMG += all_uri.img.length;
  await Promise.all(all_uri.img.map(async (img) => await download_image(img)));
  await Promise.all(all_uri.vid.map(async (vid) => await download_video(vid)));
  return 0;
}

async function download_video(media_id) {
  const video = JSON.parse(await retrieve_content_with_cookie({method: 'get', url: `https://public.mym.fans/api/medias/${media_id}/display?user_token=${user_token}`, headers: {'Cookie': COOKIES, 'X-Requested-With': 'XMLHttpRequest'}}));
  if (video == null) {return;}
  const cookies = `CloudFront-Policy=${video.data.cookies_list['CloudFront-Policy']}; CloudFront-Signature=${video.data.cookies_list['CloudFront-Signature']}; CloudFront-Key-Pair-Id=${video.data.cookies_list['CloudFront-Key-Pair-Id']}`;

  let m3u8_quality = await retrieve_content_with_cookie({method: 'get', url: video.data.url, headers: {'Cookie': cookies}});
  if (m3u8_quality == null) {return;}
  m3u8_quality = video.data.url.replace(/(.*\/).*/gm, '$1') + m3u8_quality.replaceAll('"', '').split('\\n').filter(e => ! e.startsWith('#'))[0];

  let m3u8_playlist = await retrieve_content_with_cookie({method: 'get', url: m3u8_quality, headers: {'Cookie': cookies}});
  if (m3u8_playlist == null) {return;}
  fs.writeFile(path.join(PROFILE, m3u8_quality.replace(/.*\/(.*)/gm, '$1')), m3u8_playlist.replaceAll('"', '').split('\\n').join('\n'), 'utf8', ()=>{});

  for (const ts_files of m3u8_playlist.replaceAll('"', '').split('\\n').filter(e => ! e.startsWith('#')).filter(e => e)) {
    download(video.data.url.replace(/(.*\/).*/gm, '$1') + ts_files, ts_files, cookies);
  }
}

async function download_image(url) {
  const file_info = JSON.parse(atob(url.match(/medias\/.*?(?=\?)/)[0].replace('medias/', '')));
  download(url, file_info.key.replace(/.*\/(.*)/, '$1'));
}

async function download(url, filename, cookies='') {
  try {
    await axios({method: 'get', url: url, headers: {'Cookie': cookies}, responseType: 'stream'}).then((response) => response.data.pipe(fs.createWriteStream(path.join(PROFILE, filename))));
    return 0;
  } catch(error) {
    if (PRINT_ERROR) {
      console.error('ERROR IN download', error.code, error.config.url);
      // console.log(error.response.data, error.config.headers);
    }
    TOTAL_ERR++;
    return 1;
  }
}

function init_cookies() {
  try {
    const data = fs.readFileSync('./cookies.cfg', 'utf8');
    return data.replace(/\r?\n/gm, ';');
  } catch (err) {
    console.error('Missing cookies.cfg file');
    process.exit(1)
  }
}