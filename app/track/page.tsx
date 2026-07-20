import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TrackForm from "./TrackForm";

// ?order= lets the checkout thank-you screen and the order-approved email
// (see lib/email.ts) deep-link with the order number pre-filled -- the
// customer still has to type their email themselves, so the two-factor
// check in ./actions.ts's lookupOrder is unweakened by this convenience.
export default function TrackPage({ searchParams }: { searchParams: { order?: string } }) {
  return (
    <>
      <Header />
      <section className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-4xl mb-4">Track your order</h1>
        <p className="text-warm-grey mb-8">
          Enter your order number and the email you used at checkout to see its status.
        </p>
        <TrackForm initialOrderNumber={searchParams.order ?? ""} />
      </section>
      <Footer />
    </>
  );
}
