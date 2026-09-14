#!/usr/bin/env node

// This script lives in scripts/; the data it reads sits at the root. require
// resolves it relative to this file and parses it, so there is nothing here to
// read or parse by hand.
const { talks } = require('../public_speaking.json');

// A URL in any of these belongs to one talk and one talk only. The same
// recording, deck, session page or repository turning up under two talks means
// one of them was pasted onto the wrong entry - which is how the DevConf.CZ
// 2022 security talk ended up carrying the 2021 Zoom Out! recording.
//
// conferenceUrl is deliberately absent. Several talks at one conference share
// its page by definition, and five conferences here are represented that way.
const UNIQUE_FIELDS = ['talkUrl', 'slides', 'recording', 'code'];

// Where a talk really was given twice, the rule is the one the generated
// preamble states: only the most relevant conference links the recording or
// the slides. So a repeat is an error to fix in the data rather than something
// to annotate, and there is no opt-out marker for it.
const findDuplicates = () => {
  const uses = new Map();

  for (const talk of talks) {
    for (const field of UNIQUE_FIELDS) {
      const url = talk[field];
      if (!url) continue;

      uses.getOrInsertComputed(url, () => []).push({ id: talk.id, field });
    }
  }

  return [...uses]
    .filter(([, where]) => where.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
};

const main = () => {
  const checked = talks.reduce(
    (n, talk) => n + UNIQUE_FIELDS.filter((field) => talk[field]).length,
    0
  );
  const duplicates = findDuplicates();

  console.log(
    `Checked ${checked} links across ${UNIQUE_FIELDS.join(', ')} ` +
      `in ${talks.length} talks.`
  );

  if (duplicates.length === 0) {
    console.log('No link is used more than once.');
    return;
  }

  console.log(`\n${duplicates.length} link(s) used more than once:\n`);
  for (const [url, where] of duplicates) {
    console.log(`  ${url}`);
    for (const { id, field } of where) {
      console.log(`      ${id}  (${field})`);
    }
  }
  console.log(
    '\nA link belongs in one place. Where the same talk was given twice, only\n' +
      'the most relevant conference should carry the recording or the slides;\n' +
      'otherwise one of these entries is pointing at the wrong thing.'
  );

  process.exitCode = 1;
};

main();
