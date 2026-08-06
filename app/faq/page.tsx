import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BULK_ORDER_WHATSAPP_URL, BULK_ORDER_PHONE_DISPLAY } from "@/lib/contact";
import { MIN_ORDER_TOTAL } from "@/lib/checkout";

export const metadata = {
  title: "FAQ — Art Kade",
  alternates: { canonical: "/faq" },
};

const FAQS = [
  {
    q: "Is shipping really free?",
    a: (
      <>
        Yes, on everything, anywhere in Sri Lanka. No shipping charge at any order size. The
        only exception is bulk orders over one kilogram, where we work out the rate with you
        directly. Message us on{" "}
        <a
          href={BULK_ORDER_WHATSAPP_URL}
          className="text-accent underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp at {BULK_ORDER_PHONE_DISPLAY}
        </a>{" "}
        and we&apos;ll handle it.
      </>
    ),
  },
  {
    q: "Is there a minimum order?",
    a: `Yes, Rs. ${MIN_ORDER_TOTAL.toLocaleString("en-US")}. Since shipping is on us and everything is packed and posted by hand, a single small order costs us more to send than it's worth. The minimum keeps free shipping viable. Most orders clear it with two or three stickers, or any single print.`,
  },
  {
    q: "When do orders close?",
    a: "Friday at midnight. Everything ordered during the week goes into that week's batch. Anything after Friday midnight rolls into the following week.",
  },
  {
    q: "Why does delivery take two weeks?",
    a: "Because there isn't a warehouse behind this. Art Kade is run by the artists themselves, and every order is packed by hand over the weekend before it goes out. We check each print and sticker before it's sealed, because a bent corner on something you've been waiting for is not how we want this to go. Two weeks is our honest minimum, not a padded estimate.",
  },
  {
    q: "How does my order actually get to me?",
    a: "Smaller orders go by Registered Post. Larger prints, mixed orders and anything heavier go by courier. You don't need to pick, we sort it based on what you've bought.",
  },
  {
    q: "Can I get it faster?",
    a: (
      <>
        Sometimes. If you need something sooner, or you&apos;re ordering in bulk, message us
        on{" "}
        <a
          href={BULK_ORDER_WHATSAPP_URL}
          className="text-accent underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp at {BULK_ORDER_PHONE_DISPLAY}
        </a>
        . We can usually arrange a faster method if you&apos;re happy to cover the difference.
      </>
    ),
  },
  {
    q: "Do you ship outside Sri Lanka?",
    a: "Not yet. Right now we're shipping within Sri Lanka only. We'd like to change that, and when we do it'll be announced here first.",
  },
];

export default function FaqPage() {
  return (
    <>
      <Header />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          Good to know
        </p>
        <h1 className="font-display text-3xl md:text-4xl mb-10">
          Frequently asked questions
        </h1>

        <div className="divide-y divide-line border-t border-b border-line">
          {FAQS.map((item) => (
            <div key={item.q} className="py-6">
              <h2 className="font-display text-xl mb-2">{item.q}</h2>
              <p className="text-warm-grey">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}
