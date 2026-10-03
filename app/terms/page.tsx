import LegalView from "../LegalView";
import { LEGAL } from "@/lib/legal";
import { requestLang, trFor } from "@/lib/i18n-server";

export async function generateMetadata() {
  return { title: `${trFor(await requestLang())(LEGAL.terms.title)} — Unchore` };
}

export default function TermsPage() {
  return <LegalView page="terms" />;
}
