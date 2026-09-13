'use strict';

// scripts/ holds Node programs that are run directly, never bundled and never
// shipped to a browser, so the two recommended sets that fit are ESLint's own
// and eslint-plugin-n's.
//
// "recommended-script" is the CommonJS half of the plugin's recommendation:
// these files use require() rather than import, and this package declares no
// "type", so they are scripts rather than modules.

const { defineConfig } = require('eslint/config');
const js = require('@eslint/js');
const n = require('eslint-plugin-n');

module.exports = defineConfig([
  js.configs.recommended,
  n.configs['flat/recommended-script'],
]);
