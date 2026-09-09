import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, CreditCard, Layers, Sparkles } from 'lucide-react';
import '../business-model.css';

export default function BusinessModelPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;

    function mount() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const developerSection = document.querySelector<HTMLElement>('.ap-developers');
        if (!developerSection) {
          setHost(null);
          return;
        }

        let mountPoint = document.getElementById('ap-business-model-mount');
        if (!mountPoint) {
          mountPoint = document.createElement('div');
          mountPoint.id = 'ap-business-model-mount';
          developerSection.parentElement?.insertBefore(mountPoint, developerSection);
        }
        setHost(mountPoint);
      });
    }

    mount();
    window.addEventListener('hashchange', mount);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', mount);
      document.getElementById('ap-business-model-mount')?.remove();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <section className="ap-business-model" id="business-model" aria-label="How the APEX business model works">
      <div className="ap-container ap-business-model-inner">
        <div className="ap-business-model-copy">
          <p className="ap-eyebrow">THE BUSINESS NORTH STAR.</p>
          <h2>Your customers pay you.<br /><span>You pay APEX to keep it usable.</span></h2>
          <p className="ap-business-model-lede">
            APEX is recurring infrastructure for SaaS companies that sell digital value through Stripe.
            You keep the customer relationship. APEX keeps purchases, credits, usage, renewals, refunds,
            balances, and access in sync behind your product.
          </p>
          <p className="ap-business-model-value">
            <strong>Why companies keep paying APEX:</strong> monetize faster, reduce custom billing logic,
            keep balances and access dependable, and make every commercial state change explainable.
          </p>
          <a href="#docs/learn/what-is-apex">See the product model <ArrowRight size={15} /></a>
        </div>

        <div className="ap-business-model-flow" aria-label="Who pays who">
          <div className="ap-business-node">
            <span className="ap-business-icon"><CreditCard size={18} /></span>
            <small>YOUR CUSTOMER</small>
            <b>Buys your product</b>
            <p>Subscriptions, credits, tokens, add-ons, usage.</p>
          </div>
          <div className="ap-business-arrow"><span>pays through Stripe</span><ArrowRight size={17} /></div>
          <div className="ap-business-node is-merchant">
            <span className="ap-business-icon"><Layers size={18} /></span>
            <small>YOUR SAAS</small>
            <b>Owns the customer</b>
            <p>Your brand, pricing, product, and Stripe account stay yours.</p>
          </div>
          <div className="ap-business-arrow"><span>recurring platform subscription</span><ArrowRight size={17} /></div>
          <div className="ap-business-node is-apex">
            <span className="ap-business-icon"><Sparkles size={18} /></span>
            <small>APEX</small>
            <b>Runs the commercial logic</b>
            <ul>
              <li><CheckCircle2 size={13} /> purchase → value</li>
              <li><CheckCircle2 size={13} /> usage → balance</li>
              <li><CheckCircle2 size={13} /> state → access</li>
            </ul>
          </div>
        </div>

        <p className="ap-business-model-tldr"><b>TL;DR:</b> Stripe moves the money. APEX knows what the money unlocks.</p>
      </div>
    </section>,
    host,
  );
}
