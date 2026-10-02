import type { ExtractionContext, MagicBoxSpan } from "../src";

export interface SampleSchema {
  readonly fields: readonly { readonly name: string; readonly question: string }[];
}

export const sampleSchema: SampleSchema = {
  fields: [
    { name: "Card", question: "What payment card is mentioned?" },
    { name: "Address", question: "What is the customer's delivery address?" },
    { name: "Email", question: "What is the email address?" },
    { name: "Person", question: "What is the name of the person mentioned?" },
  ],
};

export const caseNote = [
  'Both fraudulent charges reversed ($2,220.00 total). New card issued: Visa ending 7301, expiring 05/2030, delivered to 2847 Mission Street, Apt 4B, San Francisco, CA 94110 on 2026-02-25. Merchant "GLOBEX-DIRECT-88" added to blocklist BL-7741. Fraud case FC-2026-1198 closed.',
  "Security recommendations sent to customer:\n- Enable app-based 2FA instead of SMS (sent to elena.vasquez1987@fastmail.com)\n- Review authorized users on the household plan H-88-291-04\n- Consider a credit freeze with the three bureaus; instructions attached for Equifax, Experian, and TransUnion",
  "Customer confirmed she will set up the credit freeze before her trip to Paris, France (88 Rue du Faubourg Saint-Honore, June 2-19). Fraud flag F-2026-8812 extended to 2026-07-31 to cover the travel window.",
  "CSAT for this interaction: 5/5. Total resolution time: 7 days. Agents involved: Marcus Chen, Annette Kowalski, Sofia Marino. Compliance sign-off: R. Delgado, compliance officer ID CO-77.",
].join("\n\n");
export const meetingNote =
  "Meet Annette Kowalski at 10:30 on Thursday. Send the brief to annette@example.org and book a room at 2847 Mission Street, Apt 4B, San Francisco, CA 94110.\n\nSofia Marino will join after the design review.";

export function sampleSpans(text: string, schema: SampleSchema = sampleSchema): MagicBoxSpan[] {
  const matches: MagicBoxSpan[] = [];
  const patterns = [
    { regex: /Visa ending \d{4}/g, label: "Card", tone: "sky", confidence: 0.98 },
    {
      regex: /2847 Mission Street, Apt 4B, San Francisco, CA 94110/g,
      label: "Address",
      tone: "ember",
      confidence: 0.96,
    },
    { regex: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, label: "Email", tone: "lilac", confidence: 0.99 },
    {
      regex: /88 Rue du Faubourg Saint-Honore/g,
      label: "Address",
      tone: "ember",
      confidence: 0.93,
    },
    { regex: /Annette Kowalski/g, label: "Person", tone: "sage", confidence: 0.97 },
    { regex: /Sofia Marino/g, label: "Person", tone: "sage", confidence: 0.96 },
  ] as const;
  for (const { regex, label, tone, confidence } of patterns) {
    if (!schema.fields.some((field) => field.name === label)) continue;
    for (const match of text.matchAll(regex)) {
      matches.push({
        id: `${label}-${match.index}`,
        label,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        tone,
        confidence,
      });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

export function extractSample(
  text: string,
  { signal, schema }: ExtractionContext<SampleSchema>,
): Promise<MagicBoxSpan[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(sampleSpans(text, schema));
    }, 450);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
