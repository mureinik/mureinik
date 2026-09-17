#!/usr/bin/env node

// This script lives in scripts/; the data it reads sits at the root. require
// resolves it relative to this file and parses it, so there is nothing here to
// read or parse by hand.
const { talks, tagCategories } = require('../public_speaking.json');

// The topic cloud in public_speaking.html paints each tag in its category's
// color and sizes it by the number of talks. Color therefore has to mean
// something for every tag on the canvas: a tag in no category renders gray,
// which reads as a category of its own, and a tag in two would have to pick
// one. The legend, drawn from tagCategories, makes the same demand from the
// other side - a category that no talk uses is a swatch explaining nothing.
//
// So the two halves of the file have to agree exactly, and nothing in either
// one enforces that. This does.
const collectFaults = () => {
  const faults = [];

  // Tag -> the categories naming it. A tag in two categories appears twice.
  const categoriesOf = new Map();
  for (const [category, tags] of Object.entries(tagCategories)) {
    if (tags.length === 0) {
      faults.push({
        headline: `Category "${category}" names no tags.`,
        detail: ['It would draw a legend entry that colors nothing.'],
      });
    }
    for (const tag of tags) {
      categoriesOf.getOrInsertComputed(tag, () => []).push(category);
    }
  }

  // Tag -> the talks using it, so an uncategorized tag can be reported with
  // the entries that will render gray because of it.
  const talksOf = new Map();
  for (const talk of talks) {
    for (const tag of talk.tags) {
      talksOf.getOrInsertComputed(tag, () => []).push(talk.id);
    }
  }

  for (const [tag, ids] of talksOf) {
    if (!categoriesOf.has(tag)) {
      faults.push({
        headline: `Tag "${tag}" is used by ${ids.length} talk(s) but is in no category.`,
        detail: ids.map((id) => `  ${id}`),
      });
    }
  }

  for (const [tag, categories] of categoriesOf) {
    if (!talksOf.has(tag)) {
      faults.push({
        headline: `Tag "${tag}" is in "${categories[0]}" but is used by no talk.`,
        detail: ['A tag renamed in "talks" has to be renamed here too.'],
      });
    }
    if (categories.length > 1) {
      faults.push({
        headline: `Tag "${tag}" is in ${categories.length} categories.`,
        detail: categories.map((category) => `  ${category}`),
      });
    }
  }

  return faults;
};

const main = () => {
  const categoryCount = Object.keys(tagCategories).length;
  const tagCount = new Set(talks.flatMap((talk) => talk.tags)).size;
  const faults = collectFaults();

  console.log(
    `Checked ${tagCount} tag(s) across ${talks.length} talks against ` +
      `${categoryCount} categories.`
  );

  if (faults.length === 0) {
    console.log('Every tag is in exactly one category, and every tag in a category is used.');
    return;
  }

  console.log(`\n${faults.length} fault(s):\n`);
  for (const { headline, detail } of faults) {
    console.log(`  ${headline}`);
    for (const line of detail) {
      console.log(`    ${line}`);
    }
  }
  console.log(
    '\nThe cloud colors a tag by its category, so the two halves of\n' +
      'public_speaking.json have to name exactly the same tags. Fix the data:\n' +
      'a new tag needs a category, and a renamed one needs renaming in both.'
  );

  process.exitCode = 1;
};

main();
