import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap } from '../lib/api';

export default function LoginSetup() {
  const nav = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [username, setUsername] = useState('ADMIN');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s: any = await unwrap(pos().auth.session());
        if (s?.loggedIn) nav('/');
      } catch {}
      try {
        setNeedsSetup(!!(await unwrap(pos().auth.needsSetup())));
      } catch {}
    })();
  }, [nav]);

  const submit = async () => {
    setMsg('');
    try {
      if (needsSetup) {
        if (password !== confirm) throw new Error('Passwords do not match');
        await unwrap(pos().auth.setup(username, password));
      } else {
        if (!username.trim()) throw new Error('Username required');
        await unwrap(pos().auth.login(username, password));
      }
      nav('/');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="bare-wrap">
      <div className="card w-full max-w-sm">
        <div className="text-2xl font-extrabold text-center">G H</div>
        <div className="text-center text-sm text-slate-400 mb-4" id="subtitle">
          {needsSetup ? 'First-run setup — create master Admin credentials' : 'Golden Heera POS — sign in (MongoDB keeps running)'}
        </div>
        <label className="lbl">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
            className="mono"
            id="user"
          />
        </label>
        <label className="lbl mt-2 block">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} id="pass" />
        </label>
        {needsSetup && (
          <label className="lbl mt-2 block">
            Confirm
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} id="confirm" />
          </label>
        )}
        <button className="btn btn-primary w-full mt-3" id="go" onClick={submit}>
          {needsSetup ? 'Create Admin' : 'Login / Switch User'}
        </button>
        {msg && <div className="msg" id="msg">{msg}</div>}
      </div>
    </div>
  );
}
