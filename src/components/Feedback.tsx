import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { apiPost } from '../lib/api';
import { deviceId, track } from '../lib/track';
import { useAccount } from '../context/AccountContext';

/** "Send feedback": a short form that lands in our feedback table, tagged with the screen you were on. */
export const FeedbackButton: React.FC<{ view: string; platform?: string; className?: string }> = ({ view, platform, className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? 'flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink'}>
        <MessageSquare className="w-4 h-4" aria-hidden /> Feedback
      </button>
      {open && <FeedbackDialog view={view} platform={platform} onClose={() => setOpen(false)} />}
    </>
  );
};

const FeedbackDialog: React.FC<{ view: string; platform?: string; onClose: () => void }> = ({ view, platform, onClose }) => {
  const { email: accountEmail } = useAccount();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(accountEmail ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal?.();
  }, []);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    apiPost('/api/feedback', { message, email, view, platform, device: deviceId() })
      .then(() => {
        setState('sent');
        track('feedback_sent', { view });
      })
      .catch((err) => {
        setError(err.message || 'Couldn’t send. Try again in a minute.');
        setState('idle');
      });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto h-fit max-h-[90vh] overflow-auto rounded-xl border border-line bg-paper text-text p-0 w-[min(92vw,30rem)] backdrop:bg-black/40"
      aria-labelledby="fb-title"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="fb-title" className="display text-[24px] text-ink">
            Send feedback
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        {state === 'sent' ? (
          <div className="space-y-3">
            <p className="text-[15px]">Thanks! It went straight to the person building this.</p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block">
              <span className="text-[13px] font-semibold text-muted">What’s working, what’s broken, what’s missing?</span>
              <textarea
                className="field mt-1 min-h-[120px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-muted">Email, if you’d like a reply (optional)</span>
              <input type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <p className="text-[12px] text-muted">We’ll also note which screen you were on. Nothing about your league is sent.</p>
            {error && (
              <p role="alert" className="text-[13px] text-down">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={state === 'sending' || message.trim().length < 2}>
              {state === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
};
