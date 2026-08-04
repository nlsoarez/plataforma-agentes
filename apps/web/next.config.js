/** @type {import('next').NextConfig} */
const path = require('node:path');
const standalone = process.env.NEXT_OUTPUT_STANDALONE === 'true' || process.platform !== 'win32';

module.exports = {
  reactStrictMode: true,
  ...(standalone ? { output: 'standalone' } : {}),
  outputFileTracingRoot: path.join(__dirname, '../..'),
};
