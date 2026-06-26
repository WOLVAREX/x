import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

const lastUpdated = "June 26, 2026";

export default function TermsPage() {
  return (
    <Layout>
      <div className="container max-w-3xl px-4 py-12 mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">Legal</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account on JuneX Hosting Platform (JXHP), you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. Eligibility</h2>
            <p>You must be at least 18 years old to use JXHP. By using the platform, you confirm that you meet this requirement and have the legal capacity to enter into this agreement.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. Account Responsibilities</h2>
            <p>You are responsible for:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Maintaining the security of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Ensuring your bots comply with all applicable laws and platform policies</li>
              <li>The content and behaviour of bots you deploy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. Acceptable Use</h2>
            <p>You agree NOT to use JXHP to deploy bots that:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Send spam or unsolicited messages</li>
              <li>Violate any third-party platform terms of service (WhatsApp, Discord, etc.)</li>
              <li>Engage in illegal activities</li>
              <li>Distribute malware, viruses, or harmful code</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Mine cryptocurrency or conduct resource-intensive unauthorized activities</li>
              <li>Infringe intellectual property rights</li>
            </ul>
            <p className="mt-2">JXHP reserves the right to suspend or terminate any account that violates these terms without prior notice.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. Payments and Refunds</h2>
            <p>JXHP operates on a pre-paid wallet model. All wallet deposits are final and non-refundable unless required by law. Template deployment fees are charged from your wallet balance and are non-refundable once a deployment has been initiated.</p>
            <p className="mt-2">We are not responsible for payment failures caused by your bank or payment provider.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. Service Availability</h2>
            <p>JXHP aims for maximum uptime but does not guarantee uninterrupted service. We may perform maintenance, updates, or experience downtime due to factors outside our control including Heroku infrastructure issues. We are not liable for losses caused by service interruptions.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. Heroku Dependency</h2>
            <p>Your bots are hosted on Heroku. JXHP acts as an intermediary and is subject to Heroku's own terms of service and policies. Changes to Heroku's pricing, availability, or policies may affect your deployments. We will make reasonable efforts to notify you of significant changes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Intellectual Property</h2>
            <p>Bot templates available on JXHP are provided by their respective creators and are subject to their own licenses. JXHP does not claim ownership of templates. The JXHP platform, branding, and code are the intellectual property of WOLF TECH.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, JXHP and WOLF TECH shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, including but not limited to loss of data, revenue, or profits.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">10. Account Termination</h2>
            <p>We reserve the right to suspend or permanently terminate your account if you violate these terms. Upon termination, your wallet balance is forfeited and your bots will be removed from Heroku. You may also terminate your account at any time by contacting support.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">11. Changes to Terms</h2>
            <p>We may update these Terms of Service at any time. Continued use of JXHP after changes take effect constitutes acceptance of the new terms. We will notify you of significant changes via email.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">12. Governing Law</h2>
            <p>These terms are governed by the laws of Kenya. Any disputes shall be resolved in the courts of Kenya.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">13. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:wolfsilent906@gmail.com" className="text-primary hover:underline">wolfsilent906@gmail.com</a>.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
