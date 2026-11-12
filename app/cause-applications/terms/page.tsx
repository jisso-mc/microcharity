import { TRUST } from "@/lib/trust";

// Applicant Terms & Conditions, linked from the Acknowledgement section of the
// application form. Text taken from pages 5-7 of the paper application form
// (MicroCharity-EducationalApplication.pdf). Unlisted + noindex like the form itself.
export const metadata = {
  title: "Applicant Terms & Conditions — MicroCharity",
  robots: { index: false, follow: false },
};

type Clause = { n: string; text: string; sub?: Clause[] };
type Block = { heading?: string; clauses: Clause[] };

const BLOCKS: Block[] = [
  {
    clauses: [
      { n: "1", text: `MicroCharity Trust, whose registered office is at 112, West Village, Kengeri, Bangalore, INDIA – 560060 having Registration No. ${TRUST.trustRegistration} (the ‘MC’), operates the on-line micro donation service microcharity.com and other related systems and services as are outlined in these Terms and Conditions (the ‘MC Services’). The MC Services include various payment services, principally the collection, processing and transfer of donations.` },
      { n: "2", text: "These are the Terms and Conditions which govern use of the MC Services by applicants who are registered with MicroCharity. By continuing to use or access the MC Services, or by beginning the application process, you are agreeing as an applicant to be bound by these Terms and Conditions with immediate effect. References in these Terms and Conditions to the ‘Applicant’ or ‘you’ (and similar) are references to you as an applicant that has applied to MC Services." },
      { n: "3", text: "These Terms and Conditions are divided into three Sections. Section 1 sets out the provisions relevant to your membership with MC and is a contract in itself. Section 2 sets out the provisions relevant to the payment services provided to you as part of the MC Services and it is also a contract in itself. Section 3 then details the general provisions relevant to the contracts set out in Sections 1 and 2." },
    ],
  },
  {
    heading: "Section 1 – Application for availing MC Services",
    clauses: [
      {
        n: "4", text: "Application", sub: [
          { n: "4.1", text: "The MC Services are currently only available for use by Individuals/Organizations with an address in India." },
          { n: "4.2", text: "MC does not charge any fee to accept the application." },
          { n: "4.3", text: "Once you have successfully submitted the application form with MC, you will be deemed to be an ‘Applicant’." },
          { n: "4.4", text: "By becoming an Applicant, you are authorizing MC to collect donations on your behalf." },
          { n: "4.5", text: "By becoming an Applicant, you are authorizing MC to use your name and other details from your application in its website, social media campaigns, email campaigns and any other mode of marketing which deemed appropriate by MC to raise funds for you." },
          { n: "4.6", text: "MC reserves the right to decline any application without any further explanation. MC will undertake such checks as are necessary to verify the identity of the applicant and other details mentioned in application, as appropriate." },
          { n: "4.7", text: "The applicant hereby authorizes MC or its authorized volunteers to investigate the claims made in this application." },
        ],
      },
      {
        n: "5", text: "MC obligations", sub: [
          {
            n: "5.1", text: "MC will:", sub: [
              { n: "5.1.1", text: "Operate the MC Services so that donors can make online donations and payments, on a personal fundraising page or on a page established specifically for the applicant on the MC website." },
              { n: "5.1.2", text: "Hold the funds on your behalf in the Charity Trust Account until they are paid out in accordance with Section 2. This is a legal trust account in which monies are held on trust for you and other applicants." },
            ],
          },
          { n: "5.2", text: "In respect of personal details, MC will collect, protect and secure these at all times in accordance with all international Data Protection rules. In case a donor/fundraiser wishes to contact the applicant, MC will have the authority to pass on the applicant’s contact details." },
          { n: "5.3", text: "MC will periodically get in touch with the applicant to check the well-being of the donee. If in case there is a change in donee’s contact information, the applicant should inform MC about the change." },
          { n: "5.4", text: "Where a donor/fundraiser has chosen to allow us to pass their personal data to you, we will do so and you will be obliged to only use that data strictly for the purposes and in the manner consented to by the donor/fundraiser." },
        ],
      },
      {
        n: "6", text: "Your obligations", sub: [
          { n: "6.1", text: "The applicant is responsible for ensuring that all of the details provided in connection with their application is kept accurate and up-to-date." },
          { n: "6.2", text: "The applicant is responsible for ensuring that any donations paid to the applicant through the MC Services are used by the applicant in accordance with the stated purpose." },
          { n: "6.3", text: "During the fund raising process, if there is any change to the details furnished in the application, the applicant should notify MC on the same." },
        ],
      },
    ],
  },
  {
    heading: "Section 2 – Payment Services",
    clauses: [
      {
        n: "7", text: "The Payment Services", sub: [
          { n: "7.1", text: "MC will process and hold donations received from donors/fundraisers on your behalf." },
          {
            n: "7.2", text: "MC will transfer cleared funds that it has received on your behalf to you as follows:", sub: [
              { n: "7.2.1", text: "In case of other third party organizations like School, College, Hospital, Orphanage, banks etc. are involved, the payment will be made direct to the organization." },
              { n: "7.2.2", text: "In case of paying direct to you, we will be doing so only to your bank or other authorized bank accounts." },
            ],
          },
          { n: "7.3", text: "The amount transferred to you will be equal to the sums that we have received on your behalf. MC may decide to make the payments in multiple transactions as it may desire to do so." },
          { n: "7.4", text: "Transfers to your nominated bank account will normally be made by us through the NEFT. This means that the transfer from MC should reach your recipient bank no later than the end of the second business day following the date of the transfer." },
          { n: "7.5", text: "During the fund raising process, if it is found that the application has invalid or wrong information, MC reserves the right to disapprove the application." },
        ],
      },
    ],
  },
  {
    heading: "Section 3 – General",
    clauses: [
      {
        n: "8", text: "Communications", sub: [
          { n: "8.1", text: "These Terms and Conditions are issued and concluded in English. Communications between us will be in English and will generally be conducted by letter, phone or email using the most recent details that you have provided to us." },
          { n: "8.2", text: "If you wish to contact MC, please write to the address set out at the end of these Terms and Conditions, call us on +91 88615 82154 or email us at info@microcharity.com." },
          { n: "8.3", text: "Copies of these Terms and Conditions will be available upon request." },
        ],
      },
      {
        n: "9", text: "Consent and execution", sub: [
          { n: "9.1", text: "You authorize MC to receive funds on your behalf, and to make fund transfers to you." },
          { n: "9.2", text: "You authorize MC to use your name and other details from your application on MC’s website, Facebook pages and other marketing campaigns." },
        ],
      },
      {
        n: "10", text: "Confidentiality of your information", sub: [
          {
            n: "10.1", text: "Information of a sensitive and confidential nature that you provide to us and we retain about you will not be disclosed to anyone other than:", sub: [
              { n: "10.1.1", text: "to banks in relation to the Payment Services;" },
              { n: "10.1.2", text: "where we are legally required to disclose or have a public duty to disclose;" },
              { n: "10.1.3", text: "where the disclosure is made with your consent;" },
              { n: "10.1.4", text: "where the information is already in the public domain other than as a result of us breaching our confidentiality commitments to you; or" },
              { n: "10.1.5", text: "to third parties to whom MC are required to disclose this information in order for the MC Services to be performed." },
            ],
          },
          { n: "10.2", text: "By using our website you accept our use of cookies. Cookies are small text files held on your computer which we use to help us to give customers the best experience possible on our website and to let us understand how customers use our website. Some cookies have already been set. You can delete or block cookies but some parts of our website won’t work without them. You can find out more about cookies, how we use them and how you can update your browser settings in our Cookie Policy." },
        ],
      },
      { n: "11", text: "Amendments", sub: [
        { n: "", text: "MC reserves the right to amend these Terms and Conditions and any changes will be posted on the MC website at least 2 calendar months in advance of any such change coming into effect. You will be deemed to have accepted any such amendment unless you tell us otherwise before it comes into effect. It is the applicant’s responsibility to keep itself apprised of website updates and changes to these Terms and Conditions." },
      ] },
      { n: "12", text: "Governing law", sub: [
        { n: "", text: "These Terms and Conditions and any non-contractual obligations arising in connection with them are governed by Indian Law and the parties submit to the non-exclusive jurisdiction of the courts in Bangalore, India." },
      ] },
    ],
  },
];

function ClauseView({ c, depth }: { c: Clause; depth: number }) {
  const isHeading = depth === 0 && !!c.sub;
  return (
    <li className={depth === 0 ? "mt-5" : "mt-2"}>
      {isHeading ? (
        <h3 className="font-semibold text-ink">{c.n}. {c.text}</h3>
      ) : (
        <p className="text-sm text-body leading-relaxed">
          {c.n && <span className="font-semibold text-ink mr-1.5">{c.n}</span>}
          {c.text}
        </p>
      )}
      {c.sub && (
        <ul className={depth === 0 ? "mt-1" : "pl-5 mt-1"}>
          {c.sub.map((s, i) => <ClauseView key={i} c={s} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export default function ApplicantTermsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-soft)]">
      <header className="bg-white border-b border-[var(--color-line)]">
        <div className="container-page py-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-accent-600">MicroCharity Trust</div>
          <h1 className="font-display text-2xl md:text-3xl text-ink mt-1">MicroCharity Terms and Conditions</h1>
          <p className="text-sm text-muted mt-2">
            112, West Village, Kodipalaya, Kengeri, Bangalore – 560060 · Registration No: {TRUST.trustRegistration}
          </p>
        </div>
      </header>
      <main className="container-page py-8 max-w-3xl">
        <article className="rounded-2xl bg-white border border-[var(--color-line)] p-6 md:p-8">
          <p className="text-xs uppercase tracking-wider font-semibold text-accent-700">Please read these Terms and Conditions carefully before signing</p>
          {BLOCKS.map((b, i) => (
            <section key={i} className={i === 0 ? "mt-2" : "mt-8"}>
              {b.heading && <h2 className="font-display text-lg text-ink border-b border-[var(--color-line)] pb-2">{b.heading}</h2>}
              <ul>{b.clauses.map((c, j) => <ClauseView key={j} c={c} depth={c.sub ? 0 : 1} />)}</ul>
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
