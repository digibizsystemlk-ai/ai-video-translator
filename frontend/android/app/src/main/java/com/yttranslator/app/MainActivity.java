package com.yttranslator.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null) {
                    // Send the shared text to the React web app via a custom window event
                    // We wait 1500ms to ensure the React UI is fully loaded and mounted
                    final String jsSnippet = "setTimeout(function() { " +
                        "window.dispatchEvent(new CustomEvent('youtubeShareReceived', { detail: '" + sharedText.replace("'", "\\'") + "' })); " +
                        "}, 1500);";
                    
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                getBridge().getWebView().evaluateJavascript(jsSnippet, null);
                            }
                        }
                    });
                }
            }
        }
    }
}
