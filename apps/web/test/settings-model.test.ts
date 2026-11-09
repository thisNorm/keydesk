import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Settings } from '@keydesk/contracts';
import {
  settingsPayload,
  settingsSectionDirty,
  withoutSmtpPassword,
  validateBackupFileSize,
  parseBackupFile,
} from '../src/settings-model.ts';

const saved: Settings = {
  timeZone: 'Asia/Seoul',
  retentionDays: 30,
  krwExchangeRate: '1350',
  exchangeRateDate: '',
  smtp: {
    host: 'saved.invalid',
    port: 587,
    secure: false,
    user: 'owner',
    from: 'from@example.invalid',
    to: 'to@example.invalid',
    passwordConfigured: true,
  },
};
const draft: Settings = {
  timeZone: 'America/New_York',
  retentionDays: 60,
  krwExchangeRate: '1400',
  exchangeRateDate: '2026-11-06',
  smtp: { ...saved.smtp, host: 'unsaved.invalid', password: 'unused-test-password' },
};

test('일반 저장은 다른 섹션의 미저장 값과 SMTP 암호를 전송하지 않는다', () => {
  assert.deepEqual(settingsPayload(saved, draft, 'general', 'unused-new-password'), {
    ...saved,
    timeZone: 'America/New_York',
  });
  assert.equal(draft.smtp.password, 'unused-test-password');
});

test('서버 저장은 일반·메일의 저장값과 서버 초안만 조합한다', () => {
  assert.deepEqual(settingsPayload(saved, draft, 'server', 'unused-new-password'), {
    ...saved,
    retentionDays: 60,
    krwExchangeRate: '1400',
    exchangeRateDate: '2026-11-06',
  });
});

test('메일 저장만 새 SMTP 암호를 포함하고 빈 암호는 기존 암호를 유지한다', () => {
  const mail = settingsPayload(saved, draft, 'mail', 'unused-new-password');
  assert.equal(mail.timeZone, 'Asia/Seoul');
  assert.equal(mail.retentionDays, 30);
  assert.equal(mail.smtp.host, 'unsaved.invalid');
  assert.equal(mail.smtp.password, 'unused-new-password');
  assert.equal('password' in settingsPayload(saved, draft, 'mail').smtp, false);
});

test('저장 응답에 SMTP 암호가 섞여 있어도 보관할 설정에서 제거한다', () => {
  const clean = withoutSmtpPassword(draft);
  assert.equal('password' in clean.smtp, false);
  assert.equal(clean.smtp.passwordConfigured, true);
  assert.equal(draft.smtp.password, 'unused-test-password');
  assert.equal('password' in settingsPayload(draft, saved, 'general').smtp, false);
});

test('작성 내용 판별은 해당 섹션만 검사하고 SMTP 암호 입력도 포함한다', () => {
  const onlyMail = { ...saved, smtp: { ...saved.smtp, host: 'unsaved.invalid' } };
  assert.equal(settingsSectionDirty(saved, onlyMail, 'general'), false);
  assert.equal(settingsSectionDirty(saved, onlyMail, 'server'), false);
  assert.equal(settingsSectionDirty(saved, onlyMail, 'mail'), true);
  assert.equal(settingsSectionDirty(saved, saved, 'mail', 'unused-new-password'), true);
  assert.equal(settingsSectionDirty(saved, saved, 'mail'), false);
});

const envelope = {
  format: 'keydesk-backup',
  version: 1,
  kdf: 'scrypt-131072-8-1',
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  iv: 'AAAAAAAAAAAAAAAA',
  tag: 'AAAAAAAAAAAAAAAAAAAAAA==',
  data: 'AQIDBA==',
};

test('복원 파일은 읽기 전에 빈 파일과 서버 요청 한도를 넘는 크기를 거절한다', () => {
  assert.throws(() => validateBackupFileSize(0), /파일/);
  assert.throws(() => validateBackupFileSize(24 * 1024 * 1024 + 1), /24/);
  assert.doesNotThrow(() => validateBackupFileSize(1024));
});

test('복원 준비에는 온전한 암호화 파일 형식이 필요하다', () => {
  assert.deepEqual(parseBackupFile(JSON.stringify(envelope)), envelope);
  for (const invalid of [
    '{',
    'null',
    '[]',
    JSON.stringify({ format: 'keydesk-backup', version: 1 }),
    JSON.stringify({ ...envelope, kdf: 'unsupported' }),
    JSON.stringify({ ...envelope, salt: 'bad' }),
    JSON.stringify({ ...envelope, tag: 'AAAAAAAAAAAAAAAAAAAAAB==' }),
    JSON.stringify({ ...envelope, iv: '!!!!!!!!!!!!!!!!' }),
    JSON.stringify({ ...envelope, data: '' }),
    JSON.stringify({ ...envelope, data: 'not base64' }),
    JSON.stringify({ ...envelope, unexpected: true }),
  ]) {
    assert.throws(() => parseBackupFile(invalid), /백업 파일/);
  }
});

test('복원 파일의 암호문도 서버가 허용하는 16MiB를 넘지 않는다', () => {
  const tooLarge = { ...envelope, data: 'AAAA'.repeat(Math.ceil((16 * 1024 * 1024) / 3)) };
  assert.throws(() => parseBackupFile(JSON.stringify(tooLarge)), /백업 파일/);
});
