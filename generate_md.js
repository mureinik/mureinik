#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'public_speaking.json');
const mdPath = path.join(__dirname, 'public_speaking.md');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const talks = data.talks;

// Talks flagged with requiresLogin are only reachable to a signed-in visitor.
// Markdown has no hover of its own, but GitHub renders link titles as tooltips.
const LOGIN_MARKER = '\u{1F512}';
const LOGIN_TITLE = 'Requires a login to view';

// Links listed in a talk's "archived" map point at hosts that are gone for
// good; the value is the Wayback Machine timestamp to serve the copy from.
const ARCHIVE_MARKER = '\u{1F5C4}\uFE0F';
const ARCHIVE_TITLE = 'Archived copy \u2014 the original page is gone';

const snapshot = (talk, field) => (talk.archived || {})[field];
const linkUrl = (talk, field) => {
  const ts = snapshot(talk, field);
  return ts ? `https://web.archive.org/web/${ts}/${talk[field]}` : talk[field];
};
// requiresLogin describes the conference's own pages, not third-party media
// links (a gated talk's slides can still sit on a public SlideShare).
const GATED_FIELDS = ['conferenceUrl', 'talkUrl'];
const linkTitle = (talk, field) => {
  if (snapshot(talk, field)) return ` "${ARCHIVE_TITLE}"`;
  return talk.requiresLogin && GATED_FIELDS.includes(field) ? ` "${LOGIN_TITLE}"` : '';
};
const linkLabel = (talk, field, label) =>
  snapshot(talk, field) ? `${label} ${ARCHIVE_MARKER}` : label;

let md = `### Public Speaking

Talks are listed in reverse chronological order. In case a talk was given in several conferences, only the most relevant one will be linked to the recording/slides.

`;

// Group talks by conference + date for proper formatting
let currentConf = null;
let currentDate = null;

talks.forEach((talk) => {
  const confKey = `${talk.conference}|${talk.dateDisplay}`;

  // Add conference header (only once per unique conference+date combo)
  if (currentConf !== confKey) {
    currentConf = confKey;

    const confName = talk.subname || `${talk.conference} ${new Date(talk.date).getFullYear()}`;
    const dateRange = talk.dateEnd && talk.date !== talk.dateEnd
      ? `${talk.dateDisplay} - ${new Date(talk.dateEnd).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
      : talk.dateDisplay;

    if (talk.conferenceUrl) {
      md += `- **[${linkLabel(talk, 'conferenceUrl', confName)}](${linkUrl(talk, 'conferenceUrl')}${linkTitle(talk, 'conferenceUrl')})** (${dateRange})\n`;
    } else {
      md += `- **${confName}** (${dateRange})\n`;
    }
  }

  // Add talk entry
  let talkLine = '    - **';
  if (talk.talkUrl) {
    talkLine += `[${linkLabel(talk, 'talkUrl', talk.title)}](${linkUrl(talk, 'talkUrl')}${linkTitle(talk, 'talkUrl')})`;
  } else {
    talkLine += talk.title;
  }
  talkLine += '**';

  if (talk.requiresLogin) {
    talkLine += ` ${LOGIN_MARKER}`;
  }

  if (talk.language === 'Hebrew') {
    talkLine += ' (Hebrew)';
  }

  // Add media links
  const links = [];
  const mediaLink = (field, label) =>
    `[${linkLabel(talk, field, label)}](${linkUrl(talk, field)}${linkTitle(talk, field)})`;
  if (talk.slides) links.push(mediaLink('slides', 'slides'));
  if (talk.recording) links.push(mediaLink('recording', 'recording'));
  if (talk.code) links.push(mediaLink('code', 'code samples'));

  if (links.length > 0) {
    talkLine += ` (${links.join(', ')})`;
  }

  md += talkLine + '\n';
});

fs.writeFileSync(mdPath, md);
console.log('Generated public_speaking.md');
