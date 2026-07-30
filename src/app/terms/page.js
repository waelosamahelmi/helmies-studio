"use client";

import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useIsMobile } from "@/lib/use-media-query";

const EASE = [0.32, 0.72, 0, 1];

export default function TermsPage() {
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
            Terms of <em>Service</em>
          </h1>
          <p className="page__sub">
            Please read these terms carefully before using Helmies Studio.
          </p>
        </div>

        <div className="v6-legal">
          {/* 1. Introduction */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">1. Introduction and Acceptance</h2>
            <p className="v6-legal-text">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of
              Helmies Studio (&ldquo;the Service&rdquo;), a creative AI platform operated by
              Helmies (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), accessible at{" "}
              <a href="https://studio.helmies.fi">https://studio.helmies.fi</a>.
            </p>
            <p className="v6-legal-text">
              By creating an account, accessing, or using the Service, you agree to be bound by
              these Terms. If you do not agree to these Terms, you may not use the Service. We
              reserve the right to update these Terms at any time. Continued use of the Service
              after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          {/* 2. Account Registration */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">2. Account Registration and Responsibilities</h2>
            <p className="v6-legal-text">
              You must be at least 18 years old to create an account. You agree to provide
              accurate, complete registration information and to keep it updated. You are
              responsible for maintaining the confidentiality of your account credentials and for
              all activity under your account.
            </p>
            <p className="v6-legal-text">
              You must notify us immediately of any unauthorized use of your account. We are not
              liable for losses caused by unauthorized account use where you have failed to secure
              your credentials.
            </p>
          </section>

          {/* 3. Services Description */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">3. Services Description</h2>
            <p className="v6-legal-text">
              Helmies Studio provides access to artificial intelligence models for generating
              images, videos, audio, and other media content (&ldquo;Generated Content&rdquo;).
              The Service includes 13 specialized creative studios, a model catalog, media gallery,
              and related features.
            </p>
            <p className="v6-legal-text">
              We continuously improve the Service and may add, modify, or remove features, models,
              or capabilities at any time without prior notice. We do not guarantee the availability
              of any specific AI model or feature.
            </p>
          </section>

          {/* 4. Credits and Pricing */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">4. Credits, Pricing, and Payment Terms</h2>
            <p className="v6-legal-text">
              The Service operates on a credit-based system. Subscriptions include a monthly credit
              allowance. Additional credits may be purchased as one-off top-up packs. Pricing is
              displayed on our Pricing page and is subject to change with notice.
            </p>
            <p className="v6-legal-text">
              Subscription fees are charged in advance on a monthly or yearly basis. You authorize
              us to charge your payment method for the subscription period selected. Subscription
              payments are non-refundable except as required by applicable law. Credit top-up packs
              are non-refundable once credits have been consumed.
            </p>
            <p className="v6-legal-text">
              We use Stripe for payment processing. By subscribing, you agree to Stripe&rsquo;s
              terms of service. We do not store full payment card details on our servers.
            </p>
          </section>

          {/* 5. Intellectual Property */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">5. Intellectual Property Rights</h2>
            <p className="v6-legal-text">
              You retain ownership of content you upload to the Service (&ldquo;User
              Content&rdquo;). By uploading, you grant us a limited license to process, store, and
              transmit your User Content solely as necessary to provide the Service.
            </p>
            <p className="v6-legal-text">
              Subject to these Terms, you own the Generated Content produced by the Service using
              your prompts and inputs. You may use Generated Content for personal and commercial
              purposes, provided such use does not violate these Terms or applicable law.
            </p>
            <p className="v6-legal-text">
              The Service, its underlying technology, branding, and all associated intellectual
              property are and remain the exclusive property of Helmies and its licensors. These
              Terms do not grant you any rights to our trademarks, service marks, or proprietary
              technology beyond using the Service as intended.
            </p>
            <p className="v6-legal-text">
              You acknowledge that AI models may produce similar or identical outputs for different
              users. Generated Content that coincidentally resembles other users&rsquo; outputs does
              not constitute infringement by us or those users.
            </p>
          </section>

          {/* 6. Acceptable Use */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">6. Acceptable Use Policy</h2>
            <p className="v6-legal-text">
              You agree not to use the Service to create, upload, or distribute content that:
            </p>
            <ul className="v6-legal-list">
              <li>Violates any applicable law or regulation</li>
              <li>Infringes intellectual property or privacy rights of others</li>
              <li>Is harassing, abusive, defamatory, or threatening</li>
              <li>Contains sexually explicit material involving minors</li>
              <li>Promotes violence, terrorism, or hate speech</li>
              <li>Creates deepfakes intended to deceive, defraud, or harm individuals</li>
              <li>Attempts to reverse engineer, extract, or bypass the Service&rsquo;s security</li>
              <li>Generates spam, malware, phishing content, or unauthorized advertising</li>
            </ul>
            <p className="v6-legal-text">
              We reserve the right to monitor usage, remove content, and suspend or terminate
              accounts that violate this policy, at our sole discretion.
            </p>
          </section>

          {/* 7. Termination */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">7. Termination and Account Suspension</h2>
            <p className="v6-legal-text">
              You may terminate your account at any time through your account settings or by
              contacting us. Upon termination, your right to access the Service ceases immediately.
            </p>
            <p className="v6-legal-text">
              We may suspend or terminate your account without prior notice if you violate these
              Terms, engage in fraudulent activity, or if your use poses a risk to the Service or
              other users. In such cases, no refund will be provided for prepaid subscriptions.
            </p>
            <p className="v6-legal-text">
              We may also terminate inactive free accounts after a reasonable period of non-use.
              Upon termination, we may delete your User Content and Generated Content from our
              servers in accordance with our data retention policy.
            </p>
          </section>

          {/* 8. Disclaimer */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">8. Disclaimer of Warranties</h2>
            <p className="v6-legal-text">
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
              WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE
              UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT GENERATED CONTENT WILL MEET YOUR
              EXPECTATIONS.
            </p>
            <p className="v6-legal-text">
              AI-generated content may contain inaccuracies, artifacts, or unintended outputs. You
              are solely responsible for reviewing and validating Generated Content before use. We
              disclaim all liability for decisions made or actions taken based on Generated Content.
            </p>
          </section>

          {/* 9. Limitation of Liability */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">9. Limitation of Liability</h2>
            <p className="v6-legal-text">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, HELMIES AND ITS AFFILIATES SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
              INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF
              THE SERVICE.
            </p>
            <p className="v6-legal-text">
              Our total liability for any claim arising from these Terms or the Service shall not
              exceed the amount you paid us in the twelve (12) months preceding the claim, or one
              hundred euros (€100), whichever is greater. This limitation applies regardless of the
              legal theory on which the claim is based.
            </p>
          </section>

          {/* 10. Governing Law */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">10. Governing Law</h2>
            <p className="v6-legal-text">
              These Terms are governed by the laws of Finland, without regard to conflict of law
              principles. Any disputes arising from these Terms shall be resolved in the courts of
              Helsinki, Finland. If any provision of these Terms is found unenforceable, the
              remaining provisions remain in full effect.
            </p>
          </section>

          {/* 11. Contact */}
          <section className="v6-legal-section">
            <h2 className="v6-legal-heading">11. Contact Information</h2>
            <p className="v6-legal-text">
              For questions about these Terms, please contact us:
            </p>
            <p className="v6-legal-text">
              Email:{" "}
              <a href="mailto:legal@helmies.fi">legal@helmies.fi</a>
              <br />
              Website:{" "}
              <a href="https://studio.helmies.fi/contact">https://studio.helmies.fi/contact</a>
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
