// Test builds reach a local relay over plain HTTP on the phone
// itself; every other route stays HTTPS-only, in the store too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import config from '../app.config';

const requirePlugin = createRequire(import.meta.url);

test('the network plugin is registered', () => {
  const plugins = (config.plugins ?? []) as unknown[];
  assert.ok(plugins.includes('./plugins/ittro-network.js'));
});

test('only localhost is cleartext', () => {
  const plugin = requirePlugin('../plugins/ittro-network.js') as { NETWORK_SECURITY_CONFIG: string };
  const xml = plugin.NETWORK_SECURITY_CONFIG;
  assert.match(xml, /<domain includeSubdomains="false">localhost<\/domain>/);
  assert.match(xml, /<domain includeSubdomains="false">127\.0\.0\.1<\/domain>/);
  assert.doesNotMatch(xml, /<base-config/);
});
