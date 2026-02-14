/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export', // static export for Tauri compatibility
  // no API routes — backend logic lives in packages/document-ai
};
