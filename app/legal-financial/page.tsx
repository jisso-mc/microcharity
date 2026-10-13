import PageHero from "@/components/PageHero";
import { site } from "@/lib/data/site";
import { TRUST } from "@/lib/trust";

export const metadata = { title: "Legal & Financial Information" };

// File names in public/financials are not consistent across years, so we map year → file explicitly.
const reports: { year: string; file: string }[] = [
  { year: "2025-2026", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2025-26.pdf" },
  { year: "2024-2025", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2024-25.pdf" },
  { year: "2023-2024", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2023-24.pdf" },
  { year: "2022-2023", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2022-23.pdf" },
  { year: "2021-2022", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2021-22.pdf" },
  { year: "2020-2021", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2020-21.pdf" },
  { year: "2019-2020", file: "/financials/MicroCharityTrust-AuditedFinancials-FY2019-20.pdf" },
  { year: "2018-2019", file: "/financials/MicroCharityTrustAuditReports-FY2018-19.pdf" },
  { year: "2017-2018", file: "/financials/MicroCharityAuditReport-2017-18.pdf" },
  { year: "2016-2017", file: "/financials/MicroCharity-AuditReport-2016-17.pdf" },
  { year: "2015-2016", file: "/financials/MicroCharity-AuditReport-2015-16.pdf" },
  { year: "2014-2015", file: "/financials/MicroCharityAuditsReport2014-15.pdf" },
  { year: "2013-2014", file: "/financials/MicroCharityAuditReport2013-14.pdf" },
  { year: "2012-2013", file: "/financials/MicroCharityTrust-Audit-2012-13.pdf" },
  { year: "2011-2012", file: "/financials/MicroCharityTrust-Audit-2011-12.pdf" },
  { year: "2010-2011", file: "/financials/MicroCharityTrust-Audit-2010-11.pdf" },
];

export default function LegalFinancialPage() {
  return (
    <>
      <PageHero
        eyebrow="Transparency"
        title="Legal & financial information."
        subtitle="Every rupee is accounted for. Read our registration details and download our annual audited reports."
      />

      <div className="container-page py-12 md:py-16">
        <div className="prose-mc">
          <h2>Trust details</h2>
          <ul>
            <li><strong>Registered name:</strong> MicroCharity Trust</li>
            <li><strong>Registration:</strong> {site.registration}, registered under the Indian Trust Act at the Sub-Registrar&apos;s office, Kengeri, Bangalore – 560060</li>
            <li><strong>Established:</strong> {site.established}</li>
            <li><strong>Banking:</strong> MicroCharity operates with a single bank account at South Indian Bank.</li>
            <li><strong>PAN:</strong> {TRUST.pan}</li>
            <li><strong>CSR registration:</strong> {TRUST.csrNumber}</li>
            <li>
              <strong>Tax Deduction Eligibility:</strong> All monetary donations made to MicroCharity qualify for tax deduction under Section 133 of the Income-tax Act, 2025 (corresponding to Section 80G(5) of the Income-tax Act, 1961).<br />
              <span className="text-sm text-muted">Unique Registration Number (URN): <span className="font-mono text-ink">{TRUST.urn}</span> ({TRUST.urnValidity})</span>
            </li>
          </ul>

          <h2>Annual audited financial reports</h2>
          <p>For detailed financial statements and disclosures, please refer to the audited annual reports below.</p>
        </div>

        <div className="mt-6 max-w-[70ch] grid sm:grid-cols-2 gap-3">
          {reports.map(r => (
            <a
              key={r.year}
              href={r.file}
              target="_blank"
              rel="noopener"
              download
              className="flex items-center justify-between rounded-lg border border-[var(--color-line)] hover:border-accent-600 px-4 py-3 text-sm transition"
            >
              <span className="font-semibold text-ink">Annual Audited Report {r.year}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
          ))}
        </div>

        <div className="prose-mc mt-12">
          <h2>Contact</h2>
          <p>
            <strong>Email:</strong> <a href={`mailto:${site.email}`}>{site.email}</a><br/>
            <strong>Phone:</strong> {site.phone}<br/>
            <strong>Address:</strong> {site.address}
          </p>
        </div>
      </div>
    </>
  );
}
