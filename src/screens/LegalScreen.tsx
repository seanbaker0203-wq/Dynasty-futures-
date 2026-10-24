import React from 'react';

/** Fill these in before charging money; have a lawyer review both documents. */
export const LEGAL = {
  product: 'Dynasty Futures',
  operator: 'Sean Baker',
  contact: 'the contact link in the app',
  governingState: 'the State of [STATE]',
  updated: 'October 24, 2026',
};

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <h2 className="display text-[22px] text-ink mt-6 mb-1">{children}</h2>;
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-[15px] leading-relaxed mb-2">{children}</p>;

export const TermsScreen: React.FC = () => (
  <article className="max-w-prose">
    <h1 className="display text-[30px] text-ink">Terms of Service</h1>
    <p className="text-[13px] text-muted">Last updated {LEGAL.updated}</p>

    <H>1. Agreement</H>
    <P>
      These terms are an agreement between you and {LEGAL.operator} (“we”, “us”), who operates {LEGAL.product} (the “Service”). By using the
      Service you agree to these terms. If you don’t agree, don’t use the Service. You must be at least 18, or the age of majority where you
      live.
    </P>

    <H>2. What the Service is</H>
    <P>
      {LEGAL.product} provides fantasy football analysis: player and pick values, projections, trade ideas and related tools. It is for
      entertainment and informational purposes only. Values, projections and suggestions are opinions and estimates, not guarantees, and are
      not financial, gambling or professional advice. You are responsible for your own decisions, including any trade you make.
    </P>

    <H>3. Your account</H>
    <P>
      You are responsible for activity under your account and for keeping your sign-in email secure. Give accurate information and tell us if
      you think your account has been used without permission. We may suspend or close accounts that break these terms.
    </P>

    <H>4. Your league data and connected services</H>
    <P>
      When you connect a league, you authorize us to retrieve that league’s data from the platform you choose (for example Sleeper or
      MyFantasyLeague) to provide the Service to you. You confirm you are allowed to access that data. We don’t store your platform passwords.
      Your use of those platforms is governed by their own terms.
    </P>

    <H>5. Acceptable use</H>
    <P>You agree not to, and not to help anyone else to:</P>
    <ul className="list-disc pl-5 text-[15px] leading-relaxed mb-2 space-y-1">
      <li>copy, scrape, crawl, harvest or bulk-download the Service’s values, rankings, projections or other content, by any automated or manual means;</li>
      <li>reverse engineer, decompile or attempt to derive the Service’s source code, models, formulas or methods;</li>
      <li>use the Service or its output to build, train or improve a competing product or data set;</li>
      <li>resell, republish or redistribute the Service’s content, except sharing your own results (for example a screenshot of your team) for personal, non-commercial purposes;</li>
      <li>get around rate limits, access controls or security, or use the Service in a way that harms it or other users;</li>
      <li>break any law or anyone else’s rights.</li>
    </ul>

    <H>6. Our intellectual property</H>
    <P>
      The Service, including its software, Futures Value and other models, methods, data compilations, designs, text and the {LEGAL.product}{' '}
      name, belongs to us and is protected by copyright, trade secret and other laws. We give you a personal, limited, non-exclusive,
      non-transferable, revocable right to use the Service for your own fantasy football purposes under these terms. All other rights are
      reserved.
    </P>

    <H>7. Your content</H>
    <P>
      Notes, rules, tags and settings you save stay yours. You give us permission to store and process them only to provide the Service to
      you. Private notes are not shown to other users.
    </P>

    <H>8. Third-party content and links</H>
    <P>
      The Service shows information from and links to third parties (for example FantasyCalc, FantasyPros, Footballguys, KeepTradeCut and
      YouTube). We don’t control them and aren’t responsible for their content. Some links may be partner or affiliate links, which means we
      may earn a commission at no cost to you. Partner links are labelled. Partners never pay to change our values or advice.
    </P>

    <H>9. Subscriptions and payments</H>
    <P>
      If we offer paid plans, the price, billing period, renewal and cancellation terms will be shown before you buy and form part of these
      terms.
    </P>

    <H>10. Changes and availability</H>
    <P>
      We may change, suspend or stop any part of the Service. We may update these terms; if a change is material we’ll give notice in the
      Service. Continuing to use the Service after a change means you accept it.
    </P>

    <H>11. Disclaimers</H>
    <P>
      THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT WARRANTIES OF ANY KIND, INCLUDING ACCURACY, FITNESS FOR A PARTICULAR
      PURPOSE AND NON-INFRINGEMENT. WE DON’T GUARANTEE THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR THAT ANY RESULT WILL OCCUR.
    </P>

    <H>12. Limitation of liability</H>
    <P>
      TO THE FULLEST EXTENT ALLOWED BY LAW, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST
      PROFITS, DATA OR GOODWILL. OUR TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO THE GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE
      THE CLAIM OR $50.
    </P>

    <H>13. Ending this agreement</H>
    <P>
      You can stop using the Service at any time. We may end or suspend your access if you break these terms. Sections that by their nature
      should survive (including 5, 6, 11, 12 and 14) survive.
    </P>

    <H>14. Governing law</H>
    <P>These terms are governed by the laws of {LEGAL.governingState}, without regard to conflict-of-laws rules.</P>

    <H>15. Contact</H>
    <P>Questions about these terms: use {LEGAL.contact}.</P>
  </article>
);

export const PrivacyScreen: React.FC = () => (
  <article className="max-w-prose">
    <h1 className="display text-[30px] text-ink">Privacy Policy</h1>
    <p className="text-[13px] text-muted">Last updated {LEGAL.updated}</p>

    <H>What we collect</H>
    <ul className="list-disc pl-5 text-[15px] leading-relaxed mb-2 space-y-1">
      <li>
        <b>Account:</b> your email address, if you sign in.
      </li>
      <li>
        <b>League data:</b> the league IDs, team and usernames you enter, and the public league data we retrieve from Sleeper or
        MyFantasyLeague to analyse it. We don’t store platform passwords; an MFL API key, if you enter one, is used for that request only.
      </li>
      <li>
        <b>What you save:</b> rules, notes, tags, settings and value lists you import.
      </li>
      <li>
        <b>Technical data:</b> IP address and basic request information, used for security and rate limiting.
      </li>
    </ul>

    <H>How we use it</H>
    <P>
      To run the Service (analysing your league, saving your settings across devices), keep it secure and prevent abuse, and improve it. We
      may use anonymized, aggregated data (for example how often a pick trades and for what) to improve our values; this never identifies you
      or your league.
    </P>

    <H>What we don’t do</H>
    <P>We don’t sell your personal information, and we don’t show your private notes or settings to anyone else.</P>

    <H>Who processes it</H>
    <P>
      Our hosting provider (Render) and database and sign-in provider (Supabase) process data on our behalf. Some features retrieve data from
      Sleeper, MyFantasyLeague, FantasyCalc and other sources you can see in the app.
    </P>

    <H>Your choices</H>
    <P>
      You can stop using the Service, delete your saved rules and settings in the app, or ask us to delete your account and data by using{' '}
      {LEGAL.contact}. Data saved only on your device can be cleared in your browser.
    </P>

    <H>Children</H>
    <P>The Service isn’t intended for anyone under 18, and we don’t knowingly collect their information.</P>

    <H>Changes</H>
    <P>We’ll post updates here and note the date above.</P>
  </article>
);
