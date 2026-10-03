import LegalView from "../LegalView";
import { LEGAL } from "@/lib/legal";
import { requestLang, trFor } from "@/lib/i18n-server";

export async function generateMetadata() {
  return { title: `${trFor(await requestLang())(LEGAL.refund.title)} — Unchore` };
}

export default function RefundPage() {
  return <LegalView page="refund" />;
}
