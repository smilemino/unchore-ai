import { NextResponse } from "next/server";
import { APP_CERTS, APP_PACKAGE } from "@/lib/app-login";

// Tells Android that links to unchore.ai may open the Unchore app (android/unchore-app · App Links «autoVerify»).

export function GET() {
  return NextResponse.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: APP_PACKAGE, sha256_cert_fingerprints: APP_CERTS } }],
    { headers: { "cache-control": "public, max-age=3600" } });
}
