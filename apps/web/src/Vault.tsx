import { Fragment, useEffect, useRef, useState } from 'react';
import type { Credential, Entry, Project } from '@keydesk/contracts';
import { api } from './api.ts';
import { calendarDay, expiryDays, expiryText, formatCredentialDate, matchesVaultFilter, parseVaultPreferences, searchEntries, vaultExpiry, visibleVaultEntries, type VaultFilter, type VaultSort } from './helpers.ts';
import { Confirm } from './ui.tsx';
import { Secret, hideRevealedSecrets } from './Secret.tsx';
import { EntryEditor } from './vault/EntryEditor.tsx';
import { ImportEntries } from './vault/ImportEntries.tsx';
import { RotateCredential } from './vault/RotateCredential.tsx';

const preferenceKey = 'keydesk-vault-view';
function preferences() { try { return parseVaultPreferences(localStorage.getItem(preferenceKey)); } catch { return parseVaultPreferences(null); } }
const filters = [['all', '전체'], ['expiring', '30일 이내'], ['expired', '만료됨'], ['unset', '만료일 미등록']] as const;

export function Vault({ entries, projects, reload, reloadProjects, notify, project, setProject, zone, initialEntryId }: { entries: Entry[]; projects: Project[]; reload: () => Promise<void>; reloadProjects: () => Promise<void>; notify: (message: string) => void; project: string; setProject: (id: string) => void; zone: string; initialEntryId?: string }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VaultFilter>(() => initialEntryId ? 'all' : preferences().filter);
  const [sort, setSort] = useState<VaultSort>(() => preferences().sort);
  const [selected, setSelected] = useState(initialEntryId ?? '');
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined);
  const [rotating, setRotating] = useState<{ entry: Entry; credential: Credential } | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [importing, setImporting] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [savedEntry, setSavedEntry] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); }
      if (event.key === 'Escape') { hideRevealedSecrets(); setSelected(''); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  useEffect(() => { try { localStorage.setItem(preferenceKey, JSON.stringify({ filter, sort })); } catch { /* 저장소를 사용할 수 없어도 현재 보기는 유지한다. */ } }, [filter, sort]);
  useEffect(() => { if (initialEntryId) { setQuery(''); setFilter('all'); setSelected(initialEntryId); } }, [initialEntryId]);
  useEffect(() => {
    const saved = entries.find(entry => entry.id === savedEntry);
    if (!saved) return;
    setQuery(''); setFilter('all');
    if (project && !saved.projectIds.includes(project)) setProject('');
    setSelected(saved.id); setSavedEntry('');
  }, [entries, savedEntry, project, setProject]);

  const now = new Date();
  const visible = visibleVaultEntries(entries, projects, { query, project, filter, sort, zone, now });
  const scoped = searchEntries(entries, query, projects).filter(entry => !project || entry.projectIds.includes(project));
  async function saved(id?: string) {
    try { await reload(); setRefreshError(''); if (id) setSavedEntry(id); }
    catch (error) { if (id) setSavedEntry(id); setRefreshError('저장은 완료했지만 목록을 다시 불러오지 못했습니다. 다시 저장하지 않아도 됩니다.'); throw error; }
  }
  function edit(entry: Entry | null) { hideRevealedSecrets(); setEditing(entry); }
  function toggle(id: string) { hideRevealedSecrets(); setSelected(value => value === id ? '' : id); }
  function resetFilters() { hideRevealedSecrets(); setQuery(''); setProject(''); setFilter('all'); }
  function expiry(entry: Entry) {
    const date = vaultExpiry(entry, filter, zone, now), days = expiryDays(date, now, zone);
    if (!date) {
      const active = entry.credentials.filter(key => key.status === 'active');
      const missing = active.filter(key => !key.expiresAt).length;
      return <><span>{entry.credentials.length === 0 ? '인증값 없음' : !active.length ? '사용 중인 키 없음' : '미등록'}</span>{active.length > 0 && <small>{missing}개 키의 만료일 미등록</small>}</>;
    }
    const day = date.length === 10 ? date : calendarDay(new Date(date), zone);
    return <><time className={`mono ${days !== null && days < 0 ? 'expired' : ''}`} dateTime={date} title={formatCredentialDate(date, zone)}>{day.replaceAll('-', '.')}</time><small>{expiryText(date, zone, now)}{date.length > 10 ? ' · 시각 지정' : ''}</small></>;
  }
  function entryDetail(entry: Entry) {
    return <aside className="entry-detail" aria-label="선택한 API 상세">
      <header className="entry-detail-head"><h2>등록한 키 <span className="muted">{entry.credentials.length}개</span></h2><div className="actions">{entry.consoleUrl && <a href={entry.consoleUrl} target="_blank" rel="noreferrer noopener">발급 콘솔 ↗</a>}{entry.docsUrl && <a href={entry.docsUrl} target="_blank" rel="noreferrer noopener">API 문서 ↗</a>}<button type="button" onClick={() => edit(entry)}>수정</button><button type="button" aria-label="상세 닫기" onClick={() => toggle(entry.id)}>닫기</button></div></header>
      {entry.credentials.map(credential => <Secret key={`${credential.id}-${credential.version}`} credential={credential} zone={zone} notify={notify} onRotate={() => { hideRevealedSecrets(); setRotating({ entry, credential }); }} />)}
      {!entry.credentials.length && <p>아직 인증값이 없습니다. <button type="button" className="text-button" onClick={() => edit(entry)}>인증값 추가</button></p>}
      <details className="entry-information"><summary>주소·요금제·관리 메모</summary><div className="entry-information-body"><dl>{([
        ['제공사', entry.provider], ['사용 프로젝트', projects.filter(p => entry.projectIds.includes(p.id)).map(p => p.name).join(', ')], ['API 주소', entry.endpointUrl], ['소유자 메모', entry.owner], ['태그', entry.tags.join(', ')], ['요금제 메모', entry.plan], ['제공사 한도 메모', entry.quota],
      ] as [string, string][]).filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{entry.websiteUrl && <a href={entry.websiteUrl} target="_blank" rel="noreferrer noopener">웹사이트 ↗</a>}{entry.notes && <div className="note"><h3>메모</h3><p>{entry.notes}</p></div>}<div className="detail-management"><span className="muted">최근 수정 {new Date(entry.updatedAt).toLocaleString('ko-KR', { timeZone: zone })}</span><button type="button" className="danger-text text-button" onClick={() => { hideRevealedSecrets(); setDeleting(entry); }}>항목 삭제</button></div></div></details>
    </aside>;
  }
  return <>
    <header className="pagehead"><div className="page-title"><h1>보관함</h1><span className="muted">{entries.length}개 항목 / 인증값 {entries.reduce((count, entry) => count + entry.credentials.length, 0)}개</span></div></header>
    <section className="inventory" aria-label="보관 항목">
      <div className="vault-toolbar"><div className="vault-filters"><select aria-label="사용 프로젝트" value={project} onChange={event => { hideRevealedSecrets(); setProject(event.target.value); }}><option value="">모든 프로젝트</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><div className="filterline" aria-label="만료 상태">{filters.map(([value,label]) => <button type="button" className={`tab ${filter === value ? 'current' : ''}`} key={value} aria-pressed={filter === value} onClick={() => { hideRevealedSecrets(); setFilter(value); }}>{label}<small>{scoped.filter(entry => matchesVaultFilter(entry, value, zone, now)).length}</small></button>)}</div></div><div className="vault-actions"><label className="search"><input ref={search} aria-label="API 검색" placeholder="이름·키 이름·사용처 검색" value={query} onChange={event => { hideRevealedSecrets(); setQuery(event.target.value); }}/><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd></label>{query && <button type="button" className="text-button" aria-label="검색어 지우기" onClick={() => { hideRevealedSecrets(); setQuery(''); search.current?.focus(); }}>지우기</button>}<button type="button" className="text-button" onClick={() => { hideRevealedSecrets(); setImporting(true); }}>가져오기</button><button type="button" className="primary" onClick={() => edit(null)}>키 추가</button></div></div>
      {refreshError && <p className="error" role="alert">{refreshError} <button type="button" onClick={() => void reload().then(() => setRefreshError('')).catch(error => notify(error.message))}>목록 다시 불러오기</button></p>}
      <div className="vault-list-options"><span className="hint">만료 필터는 사용 중인 키를 기준으로 합니다.</span><label>정렬 <select aria-label="정렬 순서" value={sort} onChange={event => { hideRevealedSecrets(); setSort(event.target.value as VaultSort); }}><option value="expiry">만료 가까운 순</option><option value="name">이름순</option><option value="updated">최근 수정순</option></select></label></div>
      <table className="table vault-table"><thead><tr><th className="number-column">번호</th><th className="name-column">API / 용도</th><th className="project-column">사용 프로젝트</th><th className="key-column">키</th><th className="date-column">{filter === 'expiring' ? '예정된 만료' : filter === 'expired' ? '지난 만료' : '가장 빠른 만료'}</th><th className="expand-column"><span className="sr-only">상세</span></th></tr></thead><tbody>{visible.map((entry,index) => <Fragment key={entry.id}><tr className={`entry-summary ${selected === entry.id ? 'selected' : ''}`}><td className="number-column mono">{String(index + 1).padStart(2,'0')}</td><td className="name-column"><button type="button" className="row-name" aria-expanded={selected === entry.id} onClick={() => toggle(entry.id)}>{entry.name}</button><div className="purpose">{entry.description || entry.provider || '용도 미등록'}</div></td><td className="project-column project-cell">{projects.filter(p => entry.projectIds.includes(p.id)).map(p => p.name).join(', ') || '연결 없음'}</td><td className="key-column">{entry.credentials.length}개</td><td className="expiry-cell date-column">{expiry(entry)}</td><td className="expand-column"><button type="button" aria-label={`${entry.name} ${selected === entry.id ? '접기' : '펼치기'}`} aria-expanded={selected === entry.id} onClick={() => toggle(entry.id)}>{selected === entry.id ? '−' : '+'}</button></td></tr>{selected === entry.id && <tr className="entry-detail-row"><td colSpan={6}>{entryDetail(entry)}</td></tr>}</Fragment>)}</tbody></table>
      {!visible.length && <div className="empty-state">{entries.length ? <><h2>조건에 맞는 항목이 없습니다.</h2><p>검색어나 프로젝트·만료 조건을 바꿔 보세요.</p><button type="button" onClick={resetFilters}>조건 초기화</button></> : <><h2>첫 API 키를 보관해 보세요.</h2><p>이름과 인증값부터 등록하고 사용처·만료일은 함께 기록할 수 있습니다.</p><div className="actions"><button type="button" className="primary" onClick={() => edit(null)}>첫 키 등록</button><button type="button" onClick={() => setImporting(true)}>.env 파일 가져오기</button></div></>}</div>}
      <footer className="tablefoot"><span>{visible.length}개 항목 · 인증값 {visible.reduce((count, entry) => count + entry.credentials.length, 0)}개</span><span>{zone === 'Asia/Seoul' ? '한국 시간 기준' : zone}</span></footer>
    </section>
    {editing !== undefined && <EntryEditor entry={editing ?? undefined} projects={projects} onProjects={reloadProjects} onClose={() => setEditing(undefined)} onSaved={saved} defaultProjectId={project || undefined} notify={notify} zone={zone}/>}
    {rotating && <RotateCredential entry={rotating.entry} credential={rotating.credential} zone={zone} onClose={() => setRotating(null)} onSaved={saved} notify={notify}/>}
    {importing && <ImportEntries entries={entries} projects={projects} onClose={() => setImporting(false)} onSaved={saved} notify={notify}/>}
    {deleting && <Confirm title="항목 삭제" confirmLabel="항목 삭제" onClose={() => setDeleting(null)} onConfirm={async () => { await api(`/entries/${deleting.id}`, 'DELETE'); setDeleting(null); setSelected(''); try { await reload(); notify('항목을 삭제했습니다.'); } catch { setRefreshError('삭제는 완료했지만 목록을 다시 불러오지 못했습니다.'); } }}><p>‘{deleting.name}’의 인증값과 모든 교체 기록을 삭제합니다. 되돌릴 수 없습니다.</p></Confirm>}
  </>;
}
