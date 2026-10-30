/* eslint-disable @typescript-eslint/no-require-imports -- config plugins run in plain node at prebuild */
// Expo config plugin: test builds reach a local relay over plain
// HTTP, but only on the phone itself. Release keeps cleartext off
// everywhere else, so store builds still use HTTPS only.
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CONFIG = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<network-security-config>',
  '  <domain-config cleartextTrafficPermitted="true">',
  '    <domain includeSubdomains="false">localhost</domain>',
  '    <domain includeSubdomains="false">127.0.0.1</domain>',
  '  </domain-config>',
  '</network-security-config>',
  '',
].join('\n');

function withIttroNetwork(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return mod;
  });
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'network_security_config.xml'), CONFIG);
    },
  ]);
  return config;
}

withIttroNetwork.NETWORK_SECURITY_CONFIG = CONFIG;

module.exports = withIttroNetwork;
