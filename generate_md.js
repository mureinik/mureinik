#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'public_speaking.json');
const mdPath = path.join(__dirname, 'public_speaking.md');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const talks = data.talks;

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
      md += `- **[${confName}](${talk.conferenceUrl})** (${dateRange})\n`;
    } else {
      md += `- **${confName}** (${dateRange})\n`;
    }
  }

  // Add talk entry
  let talkLine = '    - **';
  if (talk.talkUrl) {
    talkLine += `[${talk.title}](${talk.talkUrl})`;
  } else {
    talkLine += talk.title;
  }
  talkLine += '**';

  if (talk.language === 'Hebrew') {
    talkLine += ' (Hebrew)';
  }

  // Add media links
  const links = [];
  if (talk.slides) links.push(`[slides](${talk.slides})`);
  if (talk.recording) links.push(`[recording](${talk.recording})`);
  if (talk.code) links.push(`[code samples](${talk.code})`);

  if (links.length > 0) {
    talkLine += ` (${links.join(', ')})`;
  }

  md += talkLine + '\n';
});

fs.writeFileSync(mdPath, md);
console.log('Generated public_speaking.md');
