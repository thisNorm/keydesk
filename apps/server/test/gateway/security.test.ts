import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, targetUrl, validateBase } from '../../src/gateway/transport.ts';
import { UsageParser, priceCost } from '../../src/gateway/usage.ts';
import { parse, clientSchema, localDay, expired } from '../../src/gateway/validation.ts';
test('public destination classification blocks nonpublic IPv4 and IPv6 forms', () => {
  for (const value of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(value), false, value);
  for (const value of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(publicAddress(value), true, value);
});
test('destination URLs preserve scope and reject escape encodings and URL credentials', () => {
  assert.equal(
    targetUrl('https://example.com/v1/', 'chat?x=%2F', false).href,
    'https://example.com/v1/chat?x=%2F',
  );
  for (const path of [
    '../x',
    '%2e%2e/x',
    '%252e%252e/x',
    'a/%2f../x',
    '//evil.test',
    'https://evil.test/x',
    'x\\y',
    '%00',
  ])
    assert.throws(() => targetUrl('https://example.com/v1/', path, false), path);
  for (const value of [
    'http://example.com/',
    'https://u:p@example.com/',
    'https://example.com/?key=secret',
    'file:///tmp/key',
  ])
    assert.throws(() => validateBase(value, false), value);
});
test('SSE parser bounds events, validates token numbers and recognizes Responses terminal events', () => {
  const p = new UsageParser('openai', true);
  for (const part of [
    'data: {"type":"response.completed","response":{"model":"m","usage":{"input_tokens":0,',
    '"output_tokens":0}}}\r',
    '\n\r\n',
  ])
    p.push(Buffer.from(part));
  p.finish();
  assert.equal(p.known, true);
  assert.equal(p.input, 0);
  const bad = new UsageParser('openai', true);
  bad.push(
    Buffer.from(
      'data: ' +
        JSON.stringify({
          usage: {
            prompt_tokens: -1,
            completion_tokens: 4,
          },
        }) +
        '\n\ndata: [DONE]\n\n',
    ),
  );
  bad.finish();
  assert.equal(bad.known, false);
  const large = new UsageParser('openai', true);
  large.push(Buffer.from('data: ' + 'x'.repeat(129 * 1024) + '\n\ndata: [DONE]\n\n'));
  large.finish();
  assert.equal(large.known, false);
});
test('fixed decimal costs round once and retain fractional micros', () => {
  const price = {
    id: 'p',
    createdAt: '',
    adapter: 'openai' as const,
    model: 'm',
    currency: 'USD',
    startsAt: '',
    inputPerMillion: '0.1',
    outputPerMillion: '0.2',
    cachedInputPerMillion: '0.01',
  };
  assert.deepEqual(priceCost(price, 3, 2, 1), {
    costMicros: 1,
    costExactMicros: '0.610000000',
  });
});
test('client expiry rejects invalid calendar dates with controlled validation', () => {
  const draft = {
    name: 'x',
    projectId: 'p',
    routeIds: ['r'],
  };
  for (const expiresAt of ['2026-02-29', '2026-13-10', '2026-02-30T00:00:00Z', 'not-a-date'])
    assert.throws(
      () =>
        parse(clientSchema, {
          ...draft,
          expiresAt,
        }),
      (error: any) => error.statusCode === 400,
    );
  assert.equal(localDay(new Date('2026-11-05T15:00:00Z'), 'Asia/Seoul'), '2026-11-06');
  assert.equal(expired('2026-11-05', new Date('2026-11-05T15:00:00Z'), 'Asia/Seoul'), true);
});
