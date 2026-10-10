// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Cloudflare Worker (src/worker) is bundled by Wrangler, not by Metro.
config.resolver.blockList = [/src[\\/]worker[\\/].*/];

module.exports = config;
