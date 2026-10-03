package ai.unchore.app;

import android.content.Context;
import android.view.View;
import android.webkit.WebView;

/**
 * Keeps the Unchore page «on screen» when another app is in front. Android's web view marks the page hidden when the app goes to the
 * back and slows its timers down to once a minute — voice mode's «has the speaker finished?» wait would lag. Only the «gone» news is
 * not passed on. (Same as AI Soul SoulWebView.)
 */
public class UcWebView extends WebView {
    public UcWebView(Context c) { super(c); }

    @Override protected void onWindowVisibilityChanged(int visibility) {
        if (visibility != View.GONE) super.onWindowVisibilityChanged(View.VISIBLE);
    }
}
