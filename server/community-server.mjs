import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const graphemes = value => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value)].length;
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const exact = (value, keys) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(400, 'INVALID_PAYLOAD', '지원하지 않는 입력이에요'); };
const text = (value, min, max) => { if (typeof value !== 'string' || graphemes(value) < min || graphemes(value) > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(400, 'INVALID_PAYLOAD', '글자 수와 입력 내용을 확인해 주세요'); return value; };
const integer = (value, min, max) => { if (!Number.isInteger(value) || value < min || value > max) fail(400, 'INVALID_PAYLOAD', '숫자 입력을 확인해 주세요'); return value; };
const safeEqual = (a, b) => { const x = Buffer.from(a ?? ''), y = Buffer.from(b ?? ''); return x.length === y.length && timingSafeEqual(x, y); };

export function createCommunityServer(options = {}) {
  const environment = options.environment ?? process.env.NODE_ENV ?? 'production';
  const dev = environment === 'development' && options.allowDevAuth === true;
  const dbPath = options.dbPath ?? 'data/community.sqlite';
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, nickname TEXT NOT NULL DEFAULT '', accepted INTEGER NOT NULL DEFAULT 0, restricted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,author TEXT REFERENCES users(id) ON DELETE CASCADE,workout TEXT NOT NULL,snapshot TEXT NOT NULL,created TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');
    CREATE UNIQUE INDEX IF NOT EXISTS active_workout ON posts(author,workout) WHERE status IN ('active','hidden');
    CREATE TABLE IF NOT EXISTS requests(author TEXT REFERENCES users(id) ON DELETE CASCADE,key TEXT,post_id TEXT,body_hash TEXT,PRIMARY KEY(author,key));
    CREATE TABLE IF NOT EXISTS cheers(post TEXT REFERENCES posts(id) ON DELETE CASCADE,user TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(post,user));
    CREATE TABLE IF NOT EXISTS blocks(user TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(user,target));
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,reporter TEXT,post TEXT,reason TEXT,created INTEGER,status TEXT DEFAULT 'pending',UNIQUE(reporter,post));
    CREATE TABLE IF NOT EXISTS hidden_posts(user TEXT REFERENCES users(id) ON DELETE CASCADE,post TEXT REFERENCES posts(id) ON DELETE CASCADE,PRIMARY KEY(user,post));
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT,target TEXT,created INTEGER);
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,start INTEGER,count INTEGER);
  `);
  const now = options.now ?? Date.now;
  const query = (sql, ...args) => db.prepare(sql).get(...args);
  const rows = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const userView = user => ({ id: user.id, nickname: user.nickname, rulesAccepted: Boolean(user.accepted), identityKind: user.kind });
  const audit = (action, target) => run('INSERT INTO audit VALUES(?,?,?,?)', randomUUID(), action, target, now());
  const purge = () => transaction(() => {
    const cutoff = now() - (options.retentionDays ?? 30) * 86400000;
    run('DELETE FROM reports WHERE created<?', cutoff); run('DELETE FROM audit WHERE created<?', cutoff);
    run('DELETE FROM sessions WHERE expires<?', now()); run('DELETE FROM limits WHERE start<?', now() - 3600000);
  });
  const withdraw = id => transaction(() => {
    // Keep only reason/status/time of reports for the stated retention period.
    run("UPDATE reports SET post=NULL,reporter=NULL WHERE reporter=? OR post IN (SELECT id FROM posts WHERE author=?)", id, id);
    run('UPDATE audit SET target=NULL WHERE target=? OR target IN (SELECT id FROM posts WHERE author=?)', id, id);
    run('DELETE FROM users WHERE id=?', id); audit('withdrawal', null);
  });
  const rate = (key, max = 60) => {
    const current = query('SELECT * FROM limits WHERE key=?', key);
    if (!current || current.start <= now() - 60000) run('INSERT OR REPLACE INTO limits VALUES(?,?,1)', key, now());
    else { if (current.count >= max) fail(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요'); run('UPDATE limits SET count=count+1 WHERE key=?', key); }
  };
  const blocked = (a, b) => Boolean(query('SELECT 1 FROM blocks WHERE (user=? AND target=?) OR (user=? AND target=?)', a, b, b, a));
  const postView = (post, user) => ({ id: post.id, authorId: post.author, nickname: post.nickname ?? query('SELECT nickname FROM users WHERE id=?', post.author)?.nickname, ...(post.author === user?.id ? { workoutId: post.workout } : {}), ...JSON.parse(post.snapshot), createdAt: post.created, isMine: post.author === user?.id, cheerCount: query(`SELECT count(*) AS count FROM cheers c JOIN users u ON u.id=c.user WHERE c.post=? AND u.restricted=0 ${user ? 'AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user=? AND b.target=c.user) OR (b.target=? AND b.user=c.user))' : ''}`, post.id, ...(user ? [user.id, user.id] : [])).count, cheeredByMe: Boolean(user && query('SELECT 1 FROM cheers WHERE post=? AND user=?', post.id, user.id)) });
  const accessible = (id, user) => {
    const post = query('SELECT p.*,u.nickname,u.restricted FROM posts p JOIN users u ON p.author=u.id WHERE p.id=?', id);
    if (!post || post.status !== 'active' || post.restricted || (user && (blocked(user.id, post.author) || query('SELECT 1 FROM hidden_posts WHERE user=? AND post=?', user.id, id)))) fail(404, 'POST_NOT_FOUND', '삭제되었거나 볼 수 없는 인증이에요');
    return post;
  };
  const snapshot = body => {
    exact(body, ['workoutId','idempotencyKey','workoutDate','exerciseCount','completedSetCount','comment','visibility','exercises']);
    text(body.workoutId, 1, 128); text(body.idempotencyKey, 1, 128);
    if (typeof body.workoutDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.workoutDate) || !Number.isFinite(Date.parse(`${body.workoutDate}T00:00:00Z`)) || (typeof body.workoutDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.workoutDate) && new Date(`${body.workoutDate}T00:00:00Z`).toISOString().slice(0,10) !== body.workoutDate)) fail(400,'INVALID_PAYLOAD','운동 날짜를 확인해 주세요');
    integer(body.exerciseCount, 1, 100); integer(body.completedSetCount, 1, 1000);
    const comment = text(body.comment ?? '', 0, 100);
    exact(body.visibility, ['names','weights','reps']);
    if (['names','weights','reps'].some(k => typeof body.visibility[k] !== 'boolean')) fail(400,'INVALID_PAYLOAD','공개 범위를 확인해 주세요');
    const { names, weights, reps } = body.visibility;
    const exercises = body.exercises ?? [];
    if (!Array.isArray(exercises) || exercises.length > 100 || ((names || weights || reps) && exercises.length !== body.exerciseCount) || (!(names || weights || reps) && exercises.length)) fail(400,'INVALID_PAYLOAD','공개 종목을 확인해 주세요');
    let setCount = 0;
    exercises.forEach(exercise => {
      exact(exercise, ['name','sets']);
      if (names) text(exercise.name,1,80); else if ('name' in exercise) fail(400,'PRIVATE_FIELD','비공개 종목명은 보내지 마세요');
      if (weights || reps) {
        if (!Array.isArray(exercise.sets) || exercise.sets.length < 1 || exercise.sets.length > 1000) fail(400,'INVALID_PAYLOAD','세트를 확인해 주세요');
        setCount += exercise.sets.length;
        exercise.sets.forEach(set => { exact(set,['weight','reps']); if (weights) { if (typeof set.weight !== 'number' || !Number.isFinite(set.weight) || set.weight < 0 || set.weight > 2000) fail(400,'INVALID_PAYLOAD','무게를 확인해 주세요'); } else if ('weight' in set) fail(400,'PRIVATE_FIELD','비공개 무게는 보내지 마세요'); if (reps) integer(set.reps,1,999); else if ('reps' in set) fail(400,'PRIVATE_FIELD','비공개 횟수는 보내지 마세요'); });
      } else if ('sets' in exercise) fail(400,'PRIVATE_FIELD','비공개 세트는 보내지 마세요');
    });
    if ((weights || reps) && setCount !== body.completedSetCount) fail(400,'INVALID_PAYLOAD','완료 세트 수를 확인해 주세요');
    return {workoutDate:body.workoutDate,exerciseCount:body.exerciseCount,completedSetCount:body.completedSetCount,comment,visibility:body.visibility,exercises};
  };
  const bodyOf = async req => { let value=''; for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 65536) fail(413,'PAYLOAD_TOO_LARGE','입력이 너무 커요'); } try { return value ? JSON.parse(value) : {}; } catch { fail(400,'INVALID_JSON','입력을 확인해 주세요'); } };
  const server = http.createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    const send = (value,status=200) => { res.writeHead(status); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url,'http://localhost'), path=url.pathname.replace(/^\/api\/community/,'');
      const method=req.method;
      if(['/admin-ui','/admin-ui.js'].includes(path)&&method==='GET'){res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");res.end(readFileSync(new URL(path.endsWith('.js')?'./admin-ui.js':'./admin.html',import.meta.url)));return;}
      const origin=req.headers.origin;
      if (origin && options.allowedOrigins?.includes(origin)) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS'); }
      if (method==='OPTIONS') { if (!origin || !options.allowedOrigins?.includes(origin)) fail(403,'ORIGIN_DENIED','허용되지 않은 요청이에요'); return send({}); }
      if (origin && !options.allowedOrigins?.includes(origin)) fail(403,'ORIGIN_DENIED','허용되지 않은 요청이에요');
      if(path==='/health' && method==='GET')return send({status:'ok',auth:dev?'development':options.authVerifier?'toss':'unavailable'});
      if(path==='/policy' && method==='GET')return send({rules:['욕설·혐오, 광고·도배, 개인정보 노출을 금지해요','오프라인 기록의 인증은 실제 운동 수행을 보증하지 않아요'],retentionDays:options.retentionDays??30,policyUrl:options.policyUrl??null,operatorContact:options.operatorContact??null});
      const body = ['POST','PUT','PATCH','DELETE'].includes(method) ? await bodyOf(req) : {};
      if (path==='/auth/withdrawal-callback' && ['GET','POST'].includes(method)) {
        if (!options.callbackBasicAuth || !safeEqual(req.headers.authorization,`Basic ${options.callbackBasicAuth}`)) fail(401,'AUTH_REQUIRED','인증이 필요해요');
        const key=method==='GET'?url.searchParams.get('userKey'):body.userKey;
        if (String(key)==='0') return send({ok:true,test:true});
        if (!/^\d+$/.test(String(key)) || !Number.isSafeInteger(Number(key))) fail(400,'INVALID_PAYLOAD','userKey가 필요해요');
        const user=query('SELECT id FROM users WHERE subject=? AND kind=?',String(key),'toss'); if(user) withdraw(user.id); return send({ok:true});
      }
      if (path.startsWith('/admin')) {
        if (!options.adminToken || !safeEqual(req.headers.authorization,`Bearer ${options.adminToken}`)) fail(403,'ADMIN_REQUIRED','운영 권한이 필요해요');
        if (path==='/admin/reports' && method==='GET') return send({reports:rows('SELECT r.*,p.snapshot,p.status AS postStatus,p.author AS authorId,u.nickname FROM reports r LEFT JOIN posts p ON p.id=r.post LEFT JOIN users u ON u.id=p.author ORDER BY r.created DESC LIMIT 100')});
        if(path==='/admin/audit' && method==='GET') return send({events:rows('SELECT * FROM audit ORDER BY created DESC LIMIT 100')});
        if(path==='/admin/purge' && method==='POST') {purge();return send({ok:true});}
        const match=path.match(/^\/admin\/(posts|users|reports)\/([^/]+)$/);
        if(match && method==='PATCH') { const [,kind,id]=match; if(kind==='posts') {exact(body,['hidden']);if(typeof body.hidden!=='boolean')fail(400,'INVALID_PAYLOAD','상태를 확인해 주세요');const p=query('SELECT * FROM posts WHERE id=?',id);if(!p || p.status==='deleted')fail(404,'POST_NOT_FOUND','인증을 찾을 수 없어요');run('UPDATE posts SET status=? WHERE id=?',body.hidden?'hidden':'active',id);audit(body.hidden?'hide':'restore',id);} else if(kind==='users'){exact(body,['restricted']);if(typeof body.restricted!=='boolean')fail(400,'INVALID_PAYLOAD','상태를 확인해 주세요');if(!query('SELECT 1 FROM users WHERE id=?',id))fail(404,'USER_NOT_FOUND','계정을 찾을 수 없어요');run('UPDATE users SET restricted=? WHERE id=?',Number(body.restricted),id);audit(body.restricted?'restrict':'unrestrict',id);}else{exact(body,['status']);if(!['reviewed','dismissed'].includes(body.status))fail(400,'INVALID_PAYLOAD','상태를 확인해 주세요');run('UPDATE reports SET status=? WHERE id=?',body.status,id);audit(`report_${body.status}`,id);}return send({ok:true}); }
        fail(404,'NOT_FOUND','경로를 찾을 수 없어요');
      }
      if(path==='/auth/dev' || path==='/auth/toss') {
        if(method!=='POST')fail(405,'METHOD_NOT_ALLOWED','요청 방식을 확인해 주세요'); rate(`login:${req.socket.remoteAddress}`,20);
        let verified;
        if(path==='/auth/dev'){if(!dev || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail(403,'DEV_AUTH_DISABLED','개발 로그인은 사용할 수 없어요');exact(body,['identity']);verified={subject:`dev:${text(body.identity,1,80)}`,identityKind:'development'};}
        else {exact(body,['authorizationCode','referrer']);text(body.authorizationCode,1,4096);if(!['DEFAULT','SANDBOX'].includes(body.referrer))fail(400,'INVALID_PAYLOAD','로그인 환경을 확인해 주세요');if(environment==='production' && body.referrer!=='DEFAULT')fail(403,'SANDBOX_DISABLED','운영 환경에는 토스 로그인이 필요해요');if(!options.authVerifier)fail(503,'AUTH_UNAVAILABLE','토스 로그인 연결을 준비 중이에요');try{verified=await options.authVerifier.verify(body);}catch{fail(401,'AUTH_FAILED','토스 로그인에 실패했어요');}if(!verified || verified.identityKind!=='toss' || !/^\d+$/.test(verified.subject) || Number(verified.subject)<=0)fail(401,'AUTH_FAILED','사용자를 확인할 수 없어요');}
        let user=query('SELECT * FROM users WHERE subject=?',verified.subject);
        if(!user){run('INSERT INTO users(id,subject,kind) VALUES(?,?,?)',randomUUID(),verified.subject,verified.identityKind);user=query('SELECT * FROM users WHERE subject=?',verified.subject);}
        if(user.restricted)fail(403,'ACCOUNT_RESTRICTED','참여가 제한된 계정이에요');
        const token=randomBytes(32).toString('base64url');run('INSERT INTO sessions VALUES(?,?,?)',digest(token),user.id,now()+(options.sessionTtlMs??3600000));return send({token,user:userView(user)});
      }
      const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      let user;
      if(req.headers.authorization){if(!bearer)fail(401,'AUTH_REQUIRED','다시 로그인해 주세요');const session=query('SELECT * FROM sessions WHERE hash=?',digest(bearer));if(!session || session.expires<=now())fail(401,'AUTH_EXPIRED','로그인이 만료됐어요');user=query('SELECT * FROM users WHERE id=?',session.user_id);if(!user)fail(401,'AUTH_EXPIRED','다시 로그인해 주세요');}
      const requireUser=()=>{if(!user)fail(401,'AUTH_REQUIRED','로그인이 필요해요');if(user.restricted && !((path==='/me'&&['GET','DELETE'].includes(method))||(path==='/auth/session'&&method==='DELETE')))fail(403,'ACCOUNT_RESTRICTED','참여가 제한된 계정이에요');return user;};
      if((path==='/feed'||path==='/me/posts') && method==='GET') {
        if(path==='/me/posts')requireUser(); const cursor=url.searchParams.get('cursor');if(cursor && !/^\d+$/.test(cursor))fail(400,'INVALID_CURSOR','페이지를 확인해 주세요');
        const clauses=["p.status='active'","u.restricted=0"],args=[];
        if(cursor){clauses.push('p.seq<?');args.push(Number(cursor));}if(path==='/me/posts'){clauses.push('p.author=?');args.push(user.id);}
        if(user){clauses.push('NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user=? AND b.target=p.author) OR (b.target=? AND b.user=p.author))','NOT EXISTS(SELECT 1 FROM hidden_posts r WHERE r.user=? AND r.post=p.id)');args.push(user.id,user.id,user.id);}
        const found=rows(`SELECT p.*,u.nickname FROM posts p JOIN users u ON u.id=p.author WHERE ${clauses.join(' AND ')} ORDER BY p.seq DESC LIMIT 21`,...args);return send({posts:found.slice(0,20).map(p=>postView(p,user)),nextCursor:found.length>20?String(found[19].seq):null});
      }
      requireUser();rate(`user:${user.id}`,120);
      if(path==='/me'&&method==='GET')return send({user:userView(user)});
      if(path==='/me'&&method==='PATCH'){exact(body,['nickname','rulesAccepted']);const nickname=text(body.nickname?.trim(),2,12);if(body.rulesAccepted!==true || /(?:@|https?:|www\.|\d{3}[- .]?\d{3,4}[- .]?\d{4})/i.test(nickname))fail(400,'INVALID_PROFILE','닉네임과 운영 정책 동의를 확인해 주세요');run('UPDATE users SET nickname=?,accepted=1 WHERE id=?',nickname,user.id);return send({user:userView(query('SELECT * FROM users WHERE id=?',user.id))});}
      if(path==='/auth/session'&&method==='DELETE'){run('DELETE FROM sessions WHERE hash=?',digest(bearer));return send({ok:true});}
      if(path==='/me'&&method==='DELETE'){const subject=user.subject,kind=user.kind;withdraw(user.id);let disconnected=true;if(kind==='toss'&&options.authVerifier?.disconnect){try{await options.authVerifier.disconnect(subject);}catch{disconnected=false;audit('remote_disconnect_failed',null);}}return send({ok:true,remoteDisconnected:disconnected});}
      if(path==='/posts'&&method==='POST') {
        if(!user.accepted||!user.nickname)fail(409,'PROFILE_REQUIRED','닉네임과 운영 정책 동의가 필요해요');
        const value=snapshot(body),hash=digest(JSON.stringify(body));
        const result=transaction(()=>{const retry=query('SELECT * FROM requests WHERE author=? AND key=?',user.id,body.idempotencyKey);if(retry){if(retry.body_hash!==hash)fail(409,'IDEMPOTENCY_CONFLICT','요청 키가 다른 내용에 사용됐어요');const post=query('SELECT * FROM posts WHERE id=?',retry.post_id);if(!post||post.status==='deleted')fail(410,'POST_DELETED','삭제한 인증이에요');if(post.status==='hidden')fail(409,'POST_HIDDEN','운영 정책에 따라 숨겨진 인증이에요');return {post,duplicate:true};}const existing=query("SELECT * FROM posts WHERE author=? AND workout=? AND status IN ('active','hidden')",user.id,body.workoutId);if(existing){if(existing.status==='hidden')fail(409,'POST_HIDDEN','운영 정책에 따라 숨겨진 인증이에요');run('INSERT INTO requests VALUES(?,?,?,?)',user.id,body.idempotencyKey,existing.id,hash);return {post:existing,duplicate:true};}rate(`post:${user.id}`,10);const id=randomUUID();run('INSERT INTO posts(id,author,workout,snapshot,created) VALUES(?,?,?,?,?)',id,user.id,body.workoutId,JSON.stringify(value),new Date(now()).toISOString());run('INSERT INTO requests VALUES(?,?,?,?)',user.id,body.idempotencyKey,id,hash);return {post:query('SELECT * FROM posts WHERE id=?',id),duplicate:false};});return send({post:postView(result.post,user),duplicate:result.duplicate},result.duplicate?200:201);
      }
      const match=path.match(/^\/posts\/([^/]+)(?:\/(cheer|report))?$/);
      if(match){const [,id,action]=match;if(!action&&method==='DELETE'){const post=query('SELECT * FROM posts WHERE id=?',id);if(!post)fail(404,'POST_NOT_FOUND','인증을 찾을 수 없어요');if(post.author!==user.id)fail(403,'NOT_OWNER','내 인증만 삭제할 수 있어요');transaction(()=>{run("UPDATE posts SET status='deleted',snapshot='{}' WHERE id=?",id);run('DELETE FROM cheers WHERE post=?',id);});return send({ok:true});}
        if(action==='report'&&method==='POST'&&query('SELECT 1 FROM reports WHERE reporter=? AND post=?',user.id,id)){exact(body,['reason']);if(!['abuse','spam','privacy','other'].includes(body.reason))fail(400,'INVALID_REPORT','신고 사유를 확인해 주세요');return send({ok:true});}
        const post=accessible(id,user);
        if(action==='cheer'&&method==='PUT'){exact(body,['active']);if(typeof body.active!=='boolean')fail(400,'INVALID_PAYLOAD','응원 상태를 확인해 주세요');if(post.author===user.id)fail(403,'SELF_CHEER','내 인증에는 응원할 수 없어요');rate(`cheer:${user.id}`,60);if(body.active)run('INSERT OR IGNORE INTO cheers VALUES(?,?)',id,user.id);else run('DELETE FROM cheers WHERE post=? AND user=?',id,user.id);return send({post:postView(post,user)});}
        if(action==='report'&&method==='POST'){exact(body,['reason']);if(!['abuse','spam','privacy','other'].includes(body.reason))fail(400,'INVALID_REPORT','신고 사유를 확인해 주세요');if(post.author===user.id)fail(403,'SELF_REPORT','내 인증은 삭제할 수 있어요');rate(`report:${user.id}`,10);transaction(()=>{run('INSERT OR IGNORE INTO reports(id,reporter,post,reason,created) VALUES(?,?,?,?,?)',randomUUID(),user.id,id,body.reason,now());run('INSERT OR IGNORE INTO hidden_posts VALUES(?,?)',user.id,id);});return send({ok:true});}
      }
      if(path==='/blocks'&&method==='GET')return send({users:rows('SELECT u.id,u.nickname FROM blocks b JOIN users u ON u.id=b.target WHERE b.user=?',user.id)});
      const blockMatch=path.match(/^\/blocks\/([^/]+)$/);
      if(blockMatch&&method==='PUT'){exact(body,['active']);if(typeof body.active!=='boolean')fail(400,'INVALID_PAYLOAD','차단 상태를 확인해 주세요');const target=blockMatch[1];if(target===user.id)fail(400,'SELF_BLOCK','내 계정은 차단할 수 없어요');if(!query('SELECT 1 FROM users WHERE id=?',target))fail(404,'USER_NOT_FOUND','계정을 찾을 수 없어요');if(body.active)run('INSERT OR IGNORE INTO blocks VALUES(?,?)',user.id,target);else run('DELETE FROM blocks WHERE user=? AND target=?',user.id,target);return send({ok:true});}
      fail(404,'NOT_FOUND','경로를 찾을 수 없어요');
    }catch(error){send({error:{code:error.code??'SERVER_ERROR',message:error.status?error.message:'요청을 처리하지 못했어요'}},error.status??500);}
  });
  purge();const timer=setInterval(purge,3600000);timer.unref();server.on('close',()=>{clearInterval(timer);db.close();});
  return {server,purge};
}
