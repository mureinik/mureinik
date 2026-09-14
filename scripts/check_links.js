#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// This script lives in scripts/; the data it reads sits at the root.
const jsonPath = path.join(__dirname, '..', 'public_speaking.json');

// The five fields in a talk that hold a URL. Everything else is metadata.
const LINK_FIELDS = ['conferenceUrl', 'talkUrl', 'slides', 'recording', 'code'];

// A talk's "archived" map names links whose host is already known to be gone,
// and "requiresLogin" names links that answer only for a signed-in visitor.
// Both are deliberate records of a link's state, so checking them would only
// re-report what the JSON already says.
const skipReason = (talk, field) => {
  if ((talk.archived || {})[field]) return 'archived';
  if ((talk.requiresLogin || []).includes(field)) return 'login';
  return null;
};

const REQUEST_TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
const RETRIES = 2;

// Hosts that refuse datacenter IP ranges outright. Sched serves every DevConf
// page here and answers a GitHub Actions runner with 403 while serving the same
// URL normally to anyone else, so a 403 from one of these says something about
// where the check ran, not about whether the link is alive.
//
// This downgrades 403 alone. A 404 from one of these hosts is still a 404, and
// a 403 from any host not listed here is still treated as dead - the entry has
// to be made deliberately, per host, with evidence that the host blocks.
const BOT_BLOCKING_HOSTS = ['sched.com'];

const isBotBlocked = (url, status) => {
  if (status !== 403) return false;
  // hostname, not host: the latter carries the port, which would stop an entry
  // from ever matching a URL that has one.
  const { hostname } = new URL(url);
  return BOT_BLOCKING_HOSTS.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)
  );
};

// Conference sites move wholesale rather than per-page - fosdem.org becomes
// archive.fosdem.org, video.fosdem.org hands off to a mirror, SlideShare
// rewrote every old path - so a redirect is the normal case, not a problem.
const USER_AGENT =
  'Mozilla/5.0 (compatible; mureinik-link-check/1.0; +https://github.com/mureinik/mureinik)';

const request = async (url, method) => {
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT },
    });
    return { status: response.status };
  } catch (error) {
    return { status: 0, error: error.cause?.code || error.name || String(error) };
  }
};

// A 4xx is the server's final answer, so there is nothing to gain by asking
// again. A timeout, a rate limit or a 5xx can all be a bad moment rather than a
// dead link.
const isRetryable = (result) =>
  result.status === 0 || result.status === 429 || result.status >= 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// HEAD is cheaper and enough for almost every host, but not all of them answer
// it - one YouTube URL here times out on HEAD and returns 200 to a GET.
const checkUrl = async (url) => {
  let result;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);

    result = await request(url, 'HEAD');
    if (result.status < 200 || result.status >= 300) {
      const viaGet = await request(url, 'GET');
      if (viaGet.status >= 200 && viaGet.status < 300) return viaGet;
      result = viaGet;
    }

    if (!isRetryable(result)) break;
  }
  return result;
};

const describe = (result) =>
  result.status === 0 ? result.error : String(result.status);

const main = async () => {
  const talks = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).talks;

  // One URL can appear under several talks - three of them share
  // https://fosdem.org/2022/ - so fetch each once and report every place it is
  // used, rather than asking the same host the same question repeatedly.
  const occurrences = new Map();
  const skipped = { archived: 0, login: 0 };

  for (const talk of talks) {
    for (const field of LINK_FIELDS) {
      const url = talk[field];
      if (!url) continue;

      const reason = skipReason(talk, field);
      if (reason) {
        skipped[reason]++;
        continue;
      }

      if (!occurrences.has(url)) occurrences.set(url, []);
      occurrences.get(url).push({ id: talk.id, field });
    }
  }

  const urls = [...occurrences.keys()];
  const results = new Map();
  const queue = [...urls];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        results.set(url, await checkUrl(url));
      }
    })
  );

  // Every place a failing URL is used, so the report names the talk to edit
  // rather than just the URL that broke.
  const usesOf = (matches) =>
    urls
      .filter((url) => matches(url, results.get(url).status))
      .flatMap((url) =>
        occurrences.get(url).map((use) => ({ ...use, url, result: results.get(url) }))
      )
      .sort((a, b) => a.id.localeCompare(b.id) || a.field.localeCompare(b.field));

  const blocked = usesOf((url, status) => isBotBlocked(url, status));
  const dead = usesOf(
    (url, status) => (status < 200 || status >= 300) && !isBotBlocked(url, status)
  );

  const report = (heading, entries) => {
    const width = {
      id: Math.max(...entries.map((e) => e.id.length)),
      field: Math.max(...entries.map((e) => e.field.length)),
    };
    console.log(`\n${heading}\n`);
    for (const e of entries) {
      console.log(
        `  ${e.id.padEnd(width.id)}  ${e.field.padEnd(width.field)}  ` +
          `${describe(e.result).padEnd(11)}  ${e.url}`
      );
    }
  };

  const checkedCount = [...occurrences.values()].reduce((n, uses) => n + uses.length, 0);
  console.log(
    `Checked ${checkedCount} links (${urls.length} distinct), ` +
      `skipped ${skipped.archived + skipped.login} ` +
      `(${skipped.archived} archived, ${skipped.login} login).`
  );

  if (blocked.length > 0) {
    report(
      `${blocked.length} link(s) could not be verified - the host refused this ` +
        `machine, which\nsays nothing about whether the link works:`,
      blocked
    );
  }

  if (dead.length === 0) {
    console.log(
      blocked.length > 0 ? '\nEvery link that could be checked is alive.' : 'All links are alive.'
    );
    return;
  }

  report(`${dead.length} dead link(s):`, dead);
  console.log(
    '\nCheck for a Wayback snapshot before dropping a URL: prefer an "archived"\n' +
      'entry in public_speaking.json over deleting the link.'
  );

  process.exitCode = 1;
};

main();
