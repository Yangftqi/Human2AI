# Add project specific ProGuard rules here.
# Human2AI WebView JS bridge, Accessibility, Overlay, ProcessText & Quick Settings Tile
-keepattributes JavascriptInterface
-keepclassmembers class com.human2ai.app.AndroidHostBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.human2ai.app.Human2AiAccessibilityService { *; }
-keep class com.human2ai.app.Human2AiTileService { *; }
-keep class com.human2ai.app.ProcessTextActivity { *; }
-keep class com.human2ai.app.OverlayLaunchActivity { *; }
