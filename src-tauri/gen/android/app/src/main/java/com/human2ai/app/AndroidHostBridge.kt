package com.human2ai.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

class AndroidHostBridge(
    private val appContext: Context,
    private val mode: HostMode = HostMode.STUDIO,
    private val processTextActivity: ProcessTextActivity? = null
) {
    enum class HostMode {
        STUDIO,
        OVERLAY,
        PROCESS_TEXT
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun loadStoreJson(): String = Human2AiStore.loadStoreJson(appContext)

    @JavascriptInterface
    fun saveStoreJson(json: String) {
        Human2AiStore.saveStoreJson(appContext, json)
    }

    @JavascriptInterface
    fun copyToClipboard(text: String) {
        mainHandler.post {
            runCatching {
                val cm = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                cm?.setPrimaryClip(ClipData.newPlainText("Human2AI", text))
            }
        }
    }

    @JavascriptInterface
    fun getHostCapabilities(): String {
        val overlayGranted = Human2AiOverlayController.canDrawOverlays(appContext)
        val accessibilityEnabled = Human2AiAccessibilityService.isServiceEnabled(appContext)
        val accessibilityConnected = Human2AiAccessibilityService.instance != null
        val triggerMode = Human2AiStore.getFloatingTriggerMode(appContext)
        val ignoringBattery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            runCatching {
                val pm = appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                pm?.isIgnoringBatteryOptimizations(appContext.packageName) ?: false
            }.getOrDefault(false)
        } else {
            true
        }

        return JSONObject().apply {
            put("overlayGranted", overlayGranted)
            put("accessibilityEnabled", accessibilityEnabled)
            put("accessibilityConnected", accessibilityConnected)
            put("triggerMode", triggerMode)
            put("ignoringBatteryOptimizations", ignoringBattery)
            put("androidSdk", Build.VERSION.SDK_INT)
            put("entryMode", mode.name.lowercase())
        }.toString()
    }

    @JavascriptInterface
    fun getInputContext(): String {
        return when (mode) {
            HostMode.PROCESS_TEXT -> processTextActivity?.buildContextJson() ?: emptyContextJson("process_text")
            HostMode.OVERLAY -> Human2AiOverlayController.buildContextJson()
            HostMode.STUDIO -> {
                val clip = runCatching {
                    val cm = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    val c = cm?.primaryClip
                    if (c != null && c.itemCount > 0) c.getItemAt(0).coerceToText(appContext)?.toString().orEmpty() else ""
                }.getOrDefault("")
                JSONObject().apply {
                    put("capturedText", "")
                    put("clipboardText", clip)
                    put("sourceApp", "")
                    put("captureMode", "none")
                    put("entryMode", "studio")
                    put("isReadOnly", false)
                }.toString()
            }
        }
    }

    private fun emptyContextJson(entryMode: String): String {
        return JSONObject().apply {
            put("capturedText", "")
            put("clipboardText", "")
            put("sourceApp", "")
            put("captureMode", "none")
            put("entryMode", entryMode)
            put("isReadOnly", false)
        }.toString()
    }

    @JavascriptInterface
    fun captureScreenMessages(): String {
        val list = Human2AiAccessibilityService.instance?.captureRecentScreenMessages(6).orEmpty()
        return JSONArray(list).toString()
    }

    @JavascriptInterface
    fun commitText(text: String, closeAfter: Boolean) {
        commitTextWithPrefix(text, "", closeAfter)
    }

    @JavascriptInterface
    fun commitTextWithPrefix(bodyText: String, leadingPrefix: String, closeAfter: Boolean) {
        when (mode) {
            HostMode.PROCESS_TEXT -> {
                // In PROCESS_TEXT, Android replaces only the selected range
                processTextActivity?.commitResultAndFinish(leadingPrefix + bodyText)
            }
            HostMode.OVERLAY -> {
                Human2AiOverlayController.commitAndDismiss(bodyText, leadingPrefix)
            }
            HostMode.STUDIO -> {
                copyToClipboard(leadingPrefix + bodyText)
            }
        }
    }

    @JavascriptInterface
    fun dismissOverlay() {
        when (mode) {
            HostMode.PROCESS_TEXT -> processTextActivity?.cancelAndFinish()
            HostMode.OVERLAY -> Human2AiOverlayController.dismissPanel()
            HostMode.STUDIO -> Human2AiOverlayController.dismissPanel()
        }
    }

    @JavascriptInterface
    fun openOverlayPermissionSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${appContext.packageName}")
            )
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${appContext.packageName}"))
        }.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { appContext.startActivity(intent) }
    }

    @JavascriptInterface
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { appContext.startActivity(intent) }
    }

    @JavascriptInterface
    fun openAppDetailsSettings() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${appContext.packageName}")
        ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { appContext.startActivity(intent) }
    }

    @JavascriptInterface
    fun openBatteryOptimizationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        } else {
            Intent(Settings.ACTION_SETTINGS)
        }.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { appContext.startActivity(intent) }
    }

    @JavascriptInterface
    fun syncOverlayState() {
        Human2AiOverlayController.syncTriggerVisibility(appContext)
    }

    @JavascriptInterface
    fun testOpenOverlayPanel() {
        Human2AiOverlayController.openPanel(appContext)
    }
}
