import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";

const lastUpdated = "June 26, 2026";

export default function PrivacyPage() {
  return (
    <Layout>
      <div className="container max-w-3xl px-4 py-12 mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">Legal</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p>When you create an account on JuneX Hosting Platform (JXHP), we collect the following information:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Your name, email address, and username</li>
              <li>OAuth profile data if you sign in with Google or GitHub (name, email, profile photo)</li>
              <li>Payment information processed by Paystack (we do not store card details)</li>
              <li>Bot configuration data including environment variables you provide</li>
              <li>Usage logs and deployment history</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Create and manage your account</li>
              <li>Process payments and maintain your wallet balance</li>
              <li>Deploy and manage your bots on Heroku</li>
              <li>Send service-related communications</li>
              <li>Improve and maintain the platform</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Data Storage and Security</h2>
            <p>Your data is stored on Neon PostgreSQL. Environment variables and sensitive bot configurations are stored encrypted on Heroku. We use industry-standard security practices including HTTPS encryption for all data in transit.</p>
            <p className="mt-2">We do not store payment card details. All payment processing is handled by Paystack, which is PCI DSS compliant.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Third-Party Services</h2>
            <p>JXHP integrates with the following third-party services:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-foreground">Heroku</strong> — Bot hosting and deployment</li>
              <li><strong className="text-foreground">Paystack</strong> — Payment processing</li>
              <li><strong className="text-foreground">Google OAuth</strong> — Optional sign-in</li>
              <li><strong className="text-foreground">GitHub OAuth</strong> — Optional sign-in</li>
              <li><strong className="text-foreground">Neon</strong> — Database hosting</li>
            </ul>
            <p className="mt-2">Each of these services has their own privacy policies that govern data they collect.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. If you delete your account, your personal data and all associated bots are permanently deleted within 30 days. Payment transaction records may be retained for up to 7 years for legal and accounting purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for optional data processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Cookies</h2>
            <p>JXHP uses minimal cookies and local storage for authentication tokens. We do not use tracking cookies or advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a notice on the platform. Continued use of JXHP after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">9. Contact</h2>
            <p>For privacy-related questions or requests, contact us at <a href="mailto:wolfsilent906@gmail.com" className="text-primary hover:underline">wolfsilent906@gmail.com</a>.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
