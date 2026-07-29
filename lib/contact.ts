// Single source of truth for Art Kade's own customer-facing contact info --
// referenced by components/Footer.tsx, app/checkout/page.tsx and
// app/faq/page.tsx. Varsha's number used to be hand-typed separately in
// each of those files (and in two different formats between the footer
// and everywhere else) -- centralizing it here is what actually prevents
// that drift instead of just fixing today's mismatch.
export type SupportContact = {
  name: string;
  email: string;
  phone: string; // display format
  whatsapp: string; // wa.me digit format (country code, no +, no spaces)
};

export const SUPPORT_CONTACTS: SupportContact[] = [
  { name: "Varsha", email: "varshadilan@gmail.com", phone: "+94 77 389 1111", whatsapp: "94773891111" },
  { name: "Nuwan Shilpa", email: "nuwanshilpa@gmail.com", phone: "+94 77 303 7170", whatsapp: "94773037170" },
  { name: "Sashanka", email: "sashanka.atapattu@gmail.com", phone: "+94 70 106 6499", whatsapp: "94701066499" },
];

// The WhatsApp bulk-order contact quoted at checkout and in the FAQ --
// always Varsha's own number, so this is exported by name rather than
// making those pages reach into SUPPORT_CONTACTS[0] and risk grabbing the
// wrong entry if this array is ever reordered.
export const BULK_ORDER_WHATSAPP_URL = `https://wa.me/${SUPPORT_CONTACTS[0].whatsapp}`;
export const BULK_ORDER_PHONE_DISPLAY = SUPPORT_CONTACTS[0].phone;
