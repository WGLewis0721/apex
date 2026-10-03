import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import './waitlist.css';

export function WaitlistSection() {
  const video = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotion(!query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element || !motion) { element?.pause(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void element.play().catch(() => setMotion(false));
      else element.pause();
    }, { threshold: .2 });
    observer.observe(element);
    return () => { observer.disconnect(); element.pause(); };
  }, [motion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setState('sending');
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://fnmxlmjrkgojowpzrcwa.supabase.co'}/functions/v1/apex-waitlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(values.get('name') || '').trim(), email: String(values.get('email') || '').trim(), website: String(values.get('website') || ''), consent: values.get('consent') === 'on' }),
      });
      const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok || result?.ok !== true) throw new Error('Waitlist unavailable');
      // The Sheet is the record. The alert is best-effort and cannot change signup status.
      void fetch("https://formsubmit.co/ajax/graymattertechllc@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `[APEX] New beta waitlist signup: ${String(values.get("email") || "").trim()}`,
          _template: "table", _captcha: "false",
          _replyto: String(values.get("email") || "").trim(),
          product: "APEX",
          name: String(values.get("name") || "").trim(),
          email: String(values.get("email") || "").trim(),
        }),
      }).catch(() => {});
      form.reset(); setState('success');
    } catch { setState('error'); }
  }

  return <section className="ap-waitlist" id="waitlist" aria-labelledby="ap-waitlist-title">
    <div className="ap-waitlist-inner">
      <div className="ap-waitlist-copy">
        <p className="ap-eyebrow">FOUNDING PARTNER INVITES.</p>
        <h2 id="ap-waitlist-title">They pay.<br/><em>They get in.</em></h2>
        <p>Stripe handles the money. APEX keeps the plan, credits, and access inside your product in step. Join the invite list to put that flow to work in your own app.</p>
        <form onSubmit={submit} className="ap-waitlist-form">
          <label htmlFor="ap-waitlist-name">Your name</label>
          <input className="ap-waitlist-name" id="ap-waitlist-name" type="text" name="name" autoComplete="name" placeholder="Your name" maxLength={100} required disabled={state === 'sending'}/>
          <label htmlFor="ap-waitlist-email">Your work email</label>
          <input className="ap-waitlist-trap" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
          <div className="ap-waitlist-fields"><input id="ap-waitlist-email" type="email" name="email" autoComplete="email" placeholder="you@company.com" required disabled={state === 'sending'}/><button className="ap-button" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Joining…' : 'Request an invite'} <ArrowRight size={16}/></button></div>
          <label className="ap-waitlist-consent"><input type="checkbox" name="consent" required disabled={state === 'sending'}/> Email me an APEX invitation and occasional launch updates. I can unsubscribe at any time.</label>
          <p className="ap-waitlist-feedback" role="status" aria-live="polite">{state === 'success' ? "You're on the list. We'll email you when an invitation is ready." : state === 'error' ? "We couldn't add you yet. Please try again later." : 'The interactive demo is open now. An invite is for your own product.'}</p>
        </form>
      </div>
      <div className="ap-waitlist-visual">
        <video ref={video} muted loop playsInline preload="none" poster="/apex/assets/waitlist/apex-poster.webp" aria-label="A cobalt ribbon connects payment, access, and product usage"><source src="/apex/assets/waitlist/apex-loop.mp4" type="video/mp4"/></video>
        <button type="button" aria-label={motion ? 'Pause waitlist motion' : 'Play waitlist motion'} aria-pressed={motion} onClick={() => setMotion(value => !value)}>{motion ? 'Pause motion' : 'Play motion'}</button>
      </div>
    </div>
  </section>;
}
