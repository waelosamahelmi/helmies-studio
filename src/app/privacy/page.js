"use client";

import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useIsMobile } from "@/lib/use-media-query";

const EASE = [0.32, 0.72, 0, 1];

export default function PrivacyPage() {
  const isMobile = useIsMobile();
  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <motion.div
        className="page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={isMobile ? { paddingBottom: "env(safe-area-inset-bottom, 20px)" } : {}}
      >
        <div className="page__head">
          <div className="eyebrow mb-5">Legal</div>
          <h1 className="page__title">
            Privacy <em>Policy</em>
          </h1>
          <p className="page__sub">
            How we collect, use, and protect your information.
          </p>
        </div>

        <div className="v6-legal">
          {/* 1. Information We Collect */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">1. Information We Collect</h2>
            <p className="v6-legal-text">
              We collect information you provide directly, information generated through your use
              of the Service, and information from third-party integrations.
            </p>
            <p className="v6-legal-text">
              <strong>Account Data:</strong> When you register, we collect your name, email address,
              and optionally a profile image. If you sign in with Google, we receive your name and
              email from Google.
            </p>
            <p className="v6-legal-text">
              <strong>Uploaded Content:</strong> Files you upload for processing (images, videos,
              audio files, reference material) are transmitted to our servers and, as needed, to
              our AI provider partners for generation.
            </p>
            <p className="v6-legal-text">
              <strong>Generation Data:</strong> We store your prompts, generation parameters
              (model, resolution, settings), and the resulting Generated Content in your account
              gallery.
            </p>
            <p className="v6-legal-text">
              <strong>Payment Information:</strong> We do not store full credit card details.
              Payments are processed by Stripe, which receives your payment method information
              directly. We store only a reference to your Stripe customer ID and subscription status.
            </p>
            <p className="v6-legal-text">
              <strong>Usage Data:</strong> We collect technical information about how you interact
              with the Service, including pages visited, features used, browser type, device
              information, and IP address. This helps us improve the Service and diagnose issues.
            </p>
          </section>

          {/* 2. How We Use Information */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">2. How We Use Your Information</h2>
            <p className="v6-legal-text">We use the information we collect to:</p>
            <ul className="v6-legal-list">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process your generations and deliver Generated Content</li>
              <li>Manage your account, subscriptions, and credits</li>
              <li>Communicate about your account, billing, and Service updates</li>
              <li>Detect, prevent, and address fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations and enforce our Terms</li>
              <li>Analyze usage trends to improve features and performance</li>
            </ul>
            <p className="v6-legal-text">
              We do not sell your personal information, User Content, or Generated Content to
              third parties. We do not use your content to train AI models.
            </p>
          </section>

          {/* 3. Data Storage and Security */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">3. Data Storage and Security</h2>
            <p className="v6-legal-text">
              Your data is stored on secure servers in the European Union. We implement
              industry-standard security measures including encryption in transit (TLS/HTTPS) and
              encryption at rest for sensitive data.
            </p>
            <p className="v6-legal-text">
              We maintain administrative, technical, and physical safeguards designed to protect
              your information against unauthorized access, alteration, disclosure, or destruction.
              However, no method of electronic storage or transmission is 100% secure.
            </p>
          </section>

          {/* 4. Third-Party Services */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">4. Third-Party Services</h2>
            <p className="v6-legal-text">
              We rely on trusted third-party providers to deliver the Service. Your data may be
              shared with these providers only as necessary:
            </p>
            <p className="v6-legal-text">
              <strong>Stripe</strong> — Payment processing. Stripe receives your payment details
              directly. See{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Stripe&rsquo;s Privacy Policy
              </a>.
            </p>
            <p className="v6-legal-text">
              <strong>AI Providers (KIE, WaveSpeed, OpenRouter)</strong> — Your prompts and
              uploaded files are transmitted to these providers for AI generation. They process
              your content solely to generate and return results. We have data processing agreements
              in place with our providers.
            </p>
            <p className="v6-legal-text">
              <strong>Hosting & Infrastructure</strong> — Our servers and databases are hosted with
              European infrastructure providers. Database and file storage are located in the EU.
            </p>
          </section>

          {/* 5. Cookies and Tracking */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">5. Cookies and Tracking</h2>
            <p className="v6-legal-text">
              We use essential cookies required for the Service to function, including session
              cookies for authentication and security. We may use analytics cookies to understand
              how the Service is used, but we do not use third-party advertising trackers or
              cross-site tracking.
            </p>
            <p className="v6-legal-text">
              You can configure your browser to reject cookies, but this may prevent the Service
              from working correctly. Our authentication system requires session cookies.
            </p>
          </section>

          {/* 6. Your Rights (GDPR) */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">6. Your Rights (GDPR)</h2>
            <p className="v6-legal-text">
              If you are in the European Economic Area (EEA), you have the following rights under
              the General Data Protection Regulation (GDPR):
            </p>
            <ul className="v6-legal-list">
              <li>
                <strong>Access:</strong> Request a copy of your personal data we hold.
              </li>
              <li>
                <strong>Rectification:</strong> Correct inaccurate or incomplete personal data.
              </li>
              <li>
                <strong>Erasure:</strong> Request deletion of your personal data (&ldquo;right to
                be forgotten&rdquo;).
              </li>
              <li>
                <strong>Restriction:</strong> Request restriction of processing under certain
                conditions.
              </li>
              <li>
                <strong>Portability:</strong> Receive your data in a structured, machine-readable
                format.
              </li>
              <li>
                <strong>Objection:</strong> Object to processing based on legitimate interests.
              </li>
            </ul>
            <p className="v6-legal-text">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@helmies.fi">privacy@helmies.fi</a>. We will respond within
              30 days. You also have the right to lodge a complaint with your local data protection
              authority.
            </p>
          </section>

          {/* 7. Data Retention and Deletion */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">7. Data Retention and Deletion</h2>
            <p className="v6-legal-text">
              We retain your account information and Generated Content for as long as your account
              is active. You can delete individual Generated Content items from your gallery at any
              time. Uploaded files are automatically deleted after generation completes.
            </p>
            <p className="v6-legal-text">
              If you delete your account, we delete your personal data, User Content, and Generated
              Content within 30 days. We may retain certain information as required by law or for
              legitimate business purposes (such as fraud prevention, dispute resolution, and
              aggregated analytics).
            </p>
            <p className="v6-legal-text">
              Inactive free accounts may be deleted after 12 months of inactivity, following
              reasonable notice to the account email address.
            </p>
          </section>

          {/* 8. Children's Privacy */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">8. Children&rsquo;s Privacy</h2>
            <p className="v6-legal-text">
              The Service is not intended for anyone under the age of 18. We do not knowingly
              collect personal information from children. If we become aware that a child under
              18 has provided us with personal data, we will delete it promptly. If you believe
              a child has provided us with personal information, please contact us immediately.
            </p>
          </section>

          {/* 9. Changes to This Policy */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">9. Changes to This Policy</h2>
            <p className="v6-legal-text">
              We may update this Privacy Policy from time to time. When we make material changes,
              we will notify you through the Service or by email. Your continued use of the Service
              after changes become effective constitutes acceptance of the updated policy. We
              encourage you to review this policy periodically.
            </p>
          </section>

          {/* 10. Contact */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">10. Contact Information</h2>
            <p className="v6-legal-text">
              If you have questions about this Privacy Policy or our data practices, please
              contact us:
            </p>
            <p className="v6-legal-text">
              Email:{" "}
              <a href="mailto:privacy@helmies.fi">privacy@helmies.fi</a>
              <br />
              Website:{" "}
              <a href="https://studio.helmies.fi/contact">https://studio.helmies.fi/contact</a>
            </p>
            <p className="v6-legal-text">
              Data Controller: Helmies, Finland
            </p>
          </section>

          <p className="v6-legal-update">
            Last updated: July 30, 2026
          </p>
        </div>
      </motion.div>
    </>
  );
}
