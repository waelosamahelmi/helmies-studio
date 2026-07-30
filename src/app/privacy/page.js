import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ══════════════════════════════════════════════════════════════════════════
   PRIVACY POLICY
   ──────────────────────────────────────────────────────────────────────────
   Reformatted onto .pg-prose. The wording is unchanged — legal text is not
   ours to rewrite. Static server component, so it costs nothing to serve
   and is indexable.
   ══════════════════════════════════════════════════════════════════════════ */

export const metadata = {
  title: "Privacy policy",
  description:
    "How Helmies Studio collects, uses and protects your information: account data, uploads, generation data, payments, retention and your GDPR rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <a className="hs-skip" href="#main">Skip to content</a>
      <Navbar />

      <main id="main" className="hs-wrap hs-wrap--narrow hs-section--tight">
        <header className="hs-head">
          <span className="hs-eyebrow">Legal</span>
          <h1 style={{ fontSize: "var(--t-2xl)" }}>Privacy policy</h1>
          <p>How we collect, use, and protect your information.</p>
          <p className="hs-hint">Last updated: <span className="hs-mono">July 30, 2026</span></p>
        </header>

        <div className="pg-prose">
          <h2>1. Information We Collect</h2>
          <p>
            We collect information you provide directly, information generated through your use
            of the Service, and information from third-party integrations.
          </p>
          <p>
            <strong>Account Data:</strong> When you register, we collect your name, email address,
            and optionally a profile image. If you sign in with Google, we receive your name and
            email from Google.
          </p>
          <p>
            <strong>Uploaded Content:</strong> Files you upload for processing (images, videos,
            audio files, reference material) are transmitted to our servers and, as needed, to
            our AI provider partners for generation.
          </p>
          <p>
            <strong>Generation Data:</strong> We store your prompts, generation parameters
            (model, resolution, settings), and the resulting Generated Content in your account
            gallery.
          </p>
          <p>
            <strong>Payment Information:</strong> We do not store full credit card details.
            Payments are processed by Stripe, which receives your payment method information
            directly. We store only a reference to your Stripe customer ID and subscription status.
          </p>
          <p>
            <strong>Usage Data:</strong> We collect technical information about how you interact
            with the Service, including pages visited, features used, browser type, device
            information, and IP address. This helps us improve the Service and diagnose issues.
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Process your generations and deliver Generated Content</li>
            <li>Manage your account, subscriptions, and credits</li>
            <li>Communicate about your account, billing, and Service updates</li>
            <li>Detect, prevent, and address fraud, abuse, and security incidents</li>
            <li>Comply with legal obligations and enforce our Terms</li>
            <li>Analyze usage trends to improve features and performance</li>
          </ul>
          <p>
            We do not sell your personal information, User Content, or Generated Content to
            third parties. We do not use your content to train AI models.
          </p>

          <h2>3. Data Storage and Security</h2>
          <p>
            Your data is stored on secure servers in the European Union. We implement
            industry-standard security measures including encryption in transit (TLS/HTTPS) and
            encryption at rest for sensitive data.
          </p>
          <p>
            We maintain administrative, technical, and physical safeguards designed to protect
            your information against unauthorized access, alteration, disclosure, or destruction.
            However, no method of electronic storage or transmission is 100% secure.
          </p>

          <h2>4. Third-Party Services</h2>
          <p>
            We rely on trusted third-party providers to deliver the Service. Your data may be
            shared with these providers only as necessary:
          </p>
          <p>
            <strong>Stripe</strong> — Payment processing. Stripe receives your payment details
            directly. See{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
              Stripe&rsquo;s Privacy Policy
            </a>.
          </p>
          <p>
            <strong>AI Providers (KIE, WaveSpeed, OpenRouter)</strong> — Your prompts and
            uploaded files are transmitted to these providers for AI generation. They process
            your content solely to generate and return results. We have data processing agreements
            in place with our providers.
          </p>
          <p>
            <strong>Hosting &amp; Infrastructure</strong> — Our servers and databases are hosted with
            European infrastructure providers. Database and file storage are located in the EU.
          </p>

          <h2>5. Cookies and Tracking</h2>
          <p>
            We use essential cookies required for the Service to function, including session
            cookies for authentication and security. We may use analytics cookies to understand
            how the Service is used, but we do not use third-party advertising trackers or
            cross-site tracking.
          </p>
          <p>
            You can configure your browser to reject cookies, but this may prevent the Service
            from working correctly. Our authentication system requires session cookies.
          </p>

          <h2>6. Your Rights (GDPR)</h2>
          <p>
            If you are in the European Economic Area (EEA), you have the following rights under
            the General Data Protection Regulation (GDPR):
          </p>
          <ul>
            <li><strong>Access:</strong> Request a copy of your personal data we hold.</li>
            <li><strong>Rectification:</strong> Correct inaccurate or incomplete personal data.</li>
            <li><strong>Erasure:</strong> Request deletion of your personal data (&ldquo;right to be forgotten&rdquo;).</li>
            <li><strong>Restriction:</strong> Request restriction of processing under certain conditions.</li>
            <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format.</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:privacy@helmies.fi">privacy@helmies.fi</a>. We will respond within
            30 days. You also have the right to lodge a complaint with your local data protection
            authority.
          </p>

          <h2>7. Data Retention and Deletion</h2>
          <p>
            We retain your account information and Generated Content for as long as your account
            is active. You can delete individual Generated Content items from your gallery at any
            time. Uploaded files are automatically deleted after generation completes.
          </p>
          <p>
            If you delete your account, we delete your personal data, User Content, and Generated
            Content within 30 days. We may retain certain information as required by law or for
            legitimate business purposes (such as fraud prevention, dispute resolution, and
            aggregated analytics).
          </p>
          <p>
            Inactive free accounts may be deleted after 12 months of inactivity, following
            reasonable notice to the account email address.
          </p>

          <h2>8. Children&rsquo;s Privacy</h2>
          <p>
            The Service is not intended for anyone under the age of 18. We do not knowingly
            collect personal information from children. If we become aware that a child under
            18 has provided us with personal data, we will delete it promptly. If you believe
            a child has provided us with personal information, please contact us immediately.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes,
            we will notify you through the Service or by email. Your continued use of the Service
            after changes become effective constitutes acceptance of the updated policy. We
            encourage you to review this policy periodically.
          </p>

          <h2>10. Contact Information</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, please
            contact us:
          </p>
          <p>
            Email: <a href="mailto:privacy@helmies.fi">privacy@helmies.fi</a>
            <br />
            Website: <a href="https://studio.helmies.fi/contact">https://studio.helmies.fi/contact</a>
          </p>
          <p>Data Controller: Helmies, Finland</p>
        </div>
      </main>

      <Footer />
    </>
  );
}
