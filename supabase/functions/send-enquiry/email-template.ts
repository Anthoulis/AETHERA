import type { BusinessType, Enquiry, ProductInterest } from "./types.ts";

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  "wholesaler-distributor": "Wholesaler or distributor",
  "retail-chain": "Supermarket or retail chain",
  "food-importer": "Food importer",
  "specialty-retail": "Delicatessen or specialty store",
  "horeca": "Hotel, restaurant, or catering",
  "other": "Other",
};

const PRODUCT_INTEREST_LABELS: Record<ProductInterest, string> = {
  "retail": "Retail formats",
  "bulk": "Bulk formats",
  "retail-and-bulk": "Retail and bulk",
};

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderHtmlValue(value: string): string {
  return escapeHtml(value).replace(/\n/gu, "<br>");
}

export function renderEnquiryEmail(
  enquiry: Enquiry,
  submittedAt: string,
): RenderedEmail {
  const businessType = BUSINESS_TYPE_LABELS[enquiry.businessType];
  const productInterest = PRODUCT_INTEREST_LABELS[enquiry.productInterest];
  const requirements = enquiry.requirements || "Not provided";
  const fields: ReadonlyArray<readonly [string, string]> = [
    ["Company name", enquiry.company],
    ["Country", enquiry.country],
    ["Contact person", enquiry.contactPerson],
    ["Contact email", enquiry.email],
    ["Business type", businessType],
    ["Product interest", productInterest],
    ["Estimated annual volume", enquiry.annualVolume],
    ["Requirements / message", requirements],
    ["Submission timestamp", submittedAt],
  ];

  const text = [
    "New AETHERA wholesale enquiry",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  const rows = fields.map(([label, value]) =>
    `<tr><th align="left" valign="top" style="padding:8px 12px 8px 0">${
      escapeHtml(label)
    }</th><td style="padding:8px 0">${renderHtmlValue(value)}</td></tr>`
  ).join("");
  const html =
    `<h1 style="font-size:20px">New AETHERA wholesale enquiry</h1><table role="presentation" cellspacing="0" cellpadding="0">${rows}</table>`;

  return {
    subject: `New AETHERA enquiry — ${enquiry.company}`,
    text,
    html,
  };
}
