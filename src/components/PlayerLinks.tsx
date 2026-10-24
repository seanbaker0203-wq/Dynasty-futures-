import React from 'react';
import { ExternalLink } from 'lucide-react';
import { linksFor, type PlayerRef } from '../data/contentSources';

/** A quiet row of "read & watch" links for one player. */
export const PlayerLinks: React.FC<{ player: PlayerRef }> = ({ player }) => {
  const links = linksFor(player);
  if (!links.length) return null;
  return (
    <div>
      <div className="text-[13px] font-semibold mb-1">Read &amp; watch</div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px]">
        {links.map((l) => (
          <li key={l.id}>
            <a href={l.href} target="_blank" rel="noreferrer sponsored" className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4">
              {l.name}
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
            <span className="text-[12px] text-muted"> {l.partner ? 'Partner' : l.subscriber ? 'Subscriber' : l.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
