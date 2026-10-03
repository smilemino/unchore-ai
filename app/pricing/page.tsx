import LegalView from "../LegalView";
import { LEGAL } from "@/lib/legal";
import { requestLang, trFor } from "@/lib/i18n-server";

export async function generateMetadata() {
  return { title: `${trFor(await requestLang())(LEGAL.pricing.title)} — Unchore` };
}

export default function PricingPage() {
  return <LegalView page="pricing" />;
}
