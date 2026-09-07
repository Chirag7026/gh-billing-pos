import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pos, unwrap } from '../lib/api';

export default function LoginSetup() {
  const nav = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const s: any = await unwrap(pos().auth.session()).catch(() => null);
      if (s?.loggedIn) nav('/');
      else {
        const n: any = await unwrap(pos().auth.needsSetup()).catch(() => false);
        setNeedsSetup(!!n);
      }
    })();
  }, [nav]);

  const submit = async () => {
    setMsg('');
    try {
      if (needsSetup) {
        if (password !== confirm) throw new Error('Passwords do not match');
        await unwrap(pos().auth.setup(password));
      } else {
        await unwrap(pos().auth.login(password));
      }
      nav('/');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center pt-8">
      <div className="card w-full max-w-sm">
        <div className="text-2xl font-extrabold text-center">G H</div>
        <div className="text-center text-sm text-slate-400 mb-4">{needsSetup ? 'First-run setup — create master Admin credentials' : 'Golden Heera POS — Admin login'}</div>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus /></label>
        {needsSetup && <label className="mt-2 block">Confirm<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>}
        <button className="btn-primary w-full mt-3" onClick={submit}>{needsSetup ? 'Create Admin' : 'Login'}</button>
        {msg && <div className="text-sm text-amber-300 mt-2">{msg}</div>}
      </div>
    </div>
  );
}
