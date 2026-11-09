import type { Credential, Entry, Project } from '@keydesk/contracts';
import { calendarDay, expiryDays, searchEntries } from '../helpers.ts';

export type DeskBucket = 'expired' | 'expiring' | 'unset';
export type DeskKey = { entry: Entry; credential: Credential; day: string; days: number | null };

function byExpiry(a: DeskKey, b: DeskKey): number {
  if (a.day !== b.day) return a.day.localeCompare(b.day);
  const ad = a.credential.expiresAt;
  const bd = b.credential.expiresAt;
  // A date-only deadline lasts through the end of its local day.
  if (ad.length === 10 || bd.length === 10)
    return Number(ad.length === 10) - Number(bd.length === 10);
  return Date.parse(ad) - Date.parse(bd);
}

export function deskQueue(
  entries: Entry[],
  zone: string,
  now: Date,
): Record<DeskBucket, DeskKey[]> {
  const queue: Record<DeskBucket, DeskKey[]> = { expired: [], expiring: [], unset: [] };
  for (const entry of entries) {
    for (const credential of entry.credentials) {
      const { status, expiresAt } = credential;
      if (status !== 'active') continue;
      if (expiresAt === '') {
        queue.unset.push({ entry, credential, day: '', days: null });
        continue;
      }
      const days = expiryDays(expiresAt, now, zone);
      if (days === null || days > 30) continue;
      const day = expiresAt.length === 10 ? expiresAt : calendarDay(new Date(expiresAt), zone);
      queue[days < 0 ? 'expired' : 'expiring'].push({ entry, credential, day, days });
    }
  }
  queue.expired.sort(byExpiry);
  queue.expiring.sort(byExpiry);
  queue.unset.sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'ko'));
  return queue;
}

export function deskMatches(entry: Entry, query: string, projects: Project[]): Credential[] | null {
  if (searchEntries([{ ...entry, credentials: [] }], query, projects).length) return null;
  const q = query.trim().normalize('NFC').toLocaleLowerCase('ko');
  const normalize = (label: string) => label.normalize('NFC').toLocaleLowerCase('ko');
  const exact = entry.credentials.filter(({ label }) => normalize(label) === q);
  return exact.length
    ? exact
    : entry.credentials.filter(({ label }) => normalize(label).includes(q));
}

export function deskKeyContext(
  entry: Entry,
  key: Credential,
  entries: Entry[],
  projects: Project[],
) {
  const projectText = (item: Entry) =>
    projects
      .filter(({ id }) => item.projectIds.includes(id))
      .map(({ name }) => name)
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .join(' · ') || '프로젝트 미연결';
  const sameLabel = (candidate: Credential) =>
    candidate.label.normalize('NFC') === key.label.normalize('NFC');
  const siblings = entry.credentials.filter(sameLabel);
  const others = entries.filter(
    (item) =>
      item.id !== entry.id &&
      item.name.normalize('NFC') === entry.name.normalize('NFC') &&
      item.credentials.some(sameLabel),
  );
  const project = projectText(entry);
  const sameProject = others.filter((item) => projectText(item) === project);
  const parts = [project];
  if (sameProject.length && entry.description) parts.push(entry.description);
  if (sameProject.some((item) => item.description === entry.description))
    parts.push(`항목 ${entry.id.slice(-8)}`);
  if (siblings.length > 1)
    parts.push(`${siblings.findIndex(({ id }) => id === key.id) + 1}번째 키`);
  return { caption: parts.join(' · '), ambiguous: Boolean(others.length || siblings.length > 1) };
}
