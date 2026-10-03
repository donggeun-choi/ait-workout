const token = document.querySelector('#token');
const status = document.querySelector('#status');
const reports = document.querySelector('#reports');
async function request(path, body) {
  const response = await fetch(`/api/community/admin/${path}`, { method: body ? 'PATCH' : 'GET', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error.message);
  return value;
}
const node = (tag, content) => { const element = document.createElement(tag); element.textContent = content; return element; };
function action(article, title, path, body) {
  const button = node('button', title);
  button.onclick = async () => { button.disabled = true; try { await request(path, body); status.textContent = '처리했어요'; } catch (error) { status.textContent = error.message; } finally { button.disabled = false; } };
  article.append(button);
}
let nextCursor=null;
async function loadMore(reset=false) {
  try {
    const value = await request(`reports${!reset&&nextCursor?'?cursor='+encodeURIComponent(nextCursor):''}`); if(reset)reports.replaceChildren();
    for (const report of value.reports) {
      const article = node('article', '');
      article.append(node('h2', `${report.nickname ?? '삭제된 계정'} · ${report.reason}`), node('p', `${report.status} · ${new Date(report.created).toLocaleString()}`), node('pre', report.snapshot ?? '탈퇴로 공개 스냅샷이 제거됨'));
      if (report.post) { action(article, '인증 숨김', `posts/${report.post}`, { hidden: true }); action(article, '인증 복구', `posts/${report.post}`, { hidden: false }); }
      if (report.authorId) { action(article, '계정 제한', `users/${report.authorId}`, { restricted: true }); action(article, '제한 해제', `users/${report.authorId}`, { restricted: false }); }
      action(article, '처리 완료', `reports/${report.id}`, { status: 'reviewed' }); action(article, '신고 기각', `reports/${report.id}`, { status: 'dismissed' }); reports.append(article);
    }
    nextCursor=value.nextCursor;document.querySelector('#more').hidden=!nextCursor;status.textContent = `${value.reports.length}건을 추가로 불러왔어요`;
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#load').onclick=()=>loadMore(true);
document.querySelector('#more').onclick=()=>loadMore();
