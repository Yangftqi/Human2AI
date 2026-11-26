package com.human2ai.app

import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import kotlin.math.abs

@SuppressLint("StaticFieldLeak")
object Human2AiOverlayController {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var appContext: Context? = null

    private var triggerView: View? = null
    private var triggerParams: WindowManager.LayoutParams? = null
    private var triggerVisible = false

    private var panelRoot: FrameLayout? = null
    private var panelWebView: WebView? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var panelVisible = false
    private var webViewLoaded = false

    @Volatile
    private var cachedSnapshot = FocusedInputSnapshot("", "", false)
    @Volatile
    private var cachedClipboard = ""

    private val smartHideRunnable = Runnable {
        if (!panelVisible) {
            hideTriggerInternal()
        }
    }

    private val dimTriggerRunnable = Runnable {
        triggerView?.animate()?.alpha(0.58f)?.setDuration(260L)?.start()
    }

    private fun overlayWindowType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
    }

    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context.applicationContext)
        } else {
            true
        }
    }

    fun isPanelVisible(): Boolean = panelVisible

    fun onStoreUpdated(context: Context) {
        appContext = context.applicationContext
        mainHandler.post {
            syncTriggerVisibility(context.applicationContext)
            if (webViewLoaded) {
                panelWebView?.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('h2ai-store-sync'))",
                    null
                )
            }
        }
    }

    fun onAccessibilityDisconnected() {
        mainHandler.post {
            val ctx = appContext ?: return@post
            syncTriggerVisibility(ctx)
        }
    }

    fun syncTriggerVisibility(context: Context) {
        appContext = context.applicationContext
        mainHandler.post {
            val ctx = appContext ?: return@post
            if (!canDrawOverlays(ctx)) {
                hideTriggerInternal()
                hidePanelInternal()
                return@post
            }
            val mode = Human2AiStore.getFloatingTriggerMode(ctx)
            when (mode) {
                "always" -> {
                    mainHandler.removeCallbacks(smartHideRunnable)
                    if (!panelVisible) showTriggerInternal(ctx)
                }
                "off" -> {
                    mainHandler.removeCallbacks(smartHideRunnable)
                    hideTriggerInternal()
                }
                else -> {
                    // "smart": trigger only shown on editable focus; if accessibility isn't running, hide
                    if (Human2AiAccessibilityService.instance == null && !panelVisible) {
                        hideTriggerInternal()
                    }
                }
            }
        }
    }

    fun onInputFocusChanged(context: Context, focused: Boolean, sourcePackage: String) {
        appContext = context.applicationContext
        mainHandler.post {
            val ctx = appContext ?: return@post
            if (!canDrawOverlays(ctx)) return@post
            val mode = Human2AiStore.getFloatingTriggerMode(ctx)
            if (mode == "off") {
                hideTriggerInternal()
                return@post
            }
            if (mode == "always") {
                mainHandler.removeCallbacks(smartHideRunnable)
                if (!panelVisible) showTriggerInternal(ctx)
                return@post
            }
            // Smart mode
            if (focused && sourcePackage != ctx.packageName) {
                mainHandler.removeCallbacks(smartHideRunnable)
                if (!panelVisible) {
                    showTriggerInternal(ctx)
                }
            } else if (!panelVisible) {
                mainHandler.removeCallbacks(smartHideRunnable)
                mainHandler.postDelayed(smartHideRunnable, 2400L)
            }
        }
    }

    fun openPanel(context: Context) {
        appContext = context.applicationContext
        mainHandler.post {
            val ctx = appContext ?: return@post
            if (!canDrawOverlays(ctx)) {
                Toast.makeText(ctx, "请先在 Human2AI 中开启悬浮窗权限", Toast.LENGTH_SHORT).show()
                return@post
            }

            // 1. Capture focused input text BEFORE overlay steals window focus!
            cachedSnapshot = Human2AiAccessibilityService.instance?.readFocusedInputSnapshot()
                ?: FocusedInputSnapshot("", "", false)

            // 2. Hide trigger ball & show focusable bottom-sheet overlay panel
            mainHandler.removeCallbacks(smartHideRunnable)
            hideTriggerInternal()
            ensurePanelCreated(ctx)
            showPanelInternal(ctx)

            // 3. Once our overlay window has focus, Android 10+ allows reading clipboard cleanly
            mainHandler.postDelayed({
                cachedClipboard = readClipboardSafe(ctx)
                dispatchOverlayShown()
            }, 90L)
        }
    }

    fun dismissPanel() {
        mainHandler.post {
            hidePanelInternal()
            val ctx = appContext ?: return@post
            val mode = Human2AiStore.getFloatingTriggerMode(ctx)
            if (mode == "always" && canDrawOverlays(ctx)) {
                showTriggerInternal(ctx)
            }
        }
    }

    fun commitAndDismiss(bodyText: String, leadingPrefix: String) {
        mainHandler.post {
            val ctx = appContext ?: return@post
            val fullText = leadingPrefix + bodyText
            hidePanelInternal()

            // Wait briefly for underlying chat app window to regain input focus
            mainHandler.postDelayed({
                val service = Human2AiAccessibilityService.instance
                val written = service?.commitToFocusedInput(bodyText, leadingPrefix) == true
                if (!written) {
                    copyToClipboardSafe(ctx, fullText)
                    Toast.makeText(
                        ctx,
                        "未锁定输入框，已复制到剪贴板，直接粘贴即可",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                val mode = Human2AiStore.getFloatingTriggerMode(ctx)
                if (mode == "always" && canDrawOverlays(ctx)) {
                    showTriggerInternal(ctx)
                }
            }, 110L)
        }
    }

    fun buildContextJson(): String {
        val snap = cachedSnapshot
        return JSONObject().apply {
            put("capturedText", snap.text)
            put("clipboardText", cachedClipboard)
            put("sourceApp", snap.sourcePackage)
            put("captureMode", if (snap.hasEditableFocus) "select_all" else "none")
            put("entryMode", "overlay")
            put("isReadOnly", false)
        }.toString()
    }

    private fun readClipboardSafe(context: Context): String {
        return runCatching {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = cm?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                clip.getItemAt(0).coerceToText(context)?.toString().orEmpty()
            } else {
                ""
            }
        }.getOrDefault("")
    }

    private fun copyToClipboardSafe(context: Context, text: String) {
        runCatching {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.setPrimaryClip(android.content.ClipData.newPlainText("Human2AI", text))
        }
    }

    private fun dispatchOverlayShown() {
        val wv = panelWebView ?: return
        if (!webViewLoaded) return
        wv.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('h2ai-store-sync')); window.dispatchEvent(new CustomEvent('h2ai-overlay-shown'));",
            null
        )
    }

    private fun dp(context: Context, value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            context.resources.displayMetrics
        ).toInt()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun showTriggerInternal(context: Context) {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        val metrics = context.resources.displayMetrics
        val sizePx = dp(context, 46)

        if (triggerView == null) {
            val pill = TextView(context).apply {
                text = "✦"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
                gravity = Gravity.CENTER
                elevation = dp(context, 8).toFloat()
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#E609090B"))
                    setStroke(dp(context, 1), Color.parseColor("#55FFFFFF"))
                }
            }

            val params = WindowManager.LayoutParams(
                sizePx,
                sizePx,
                overlayWindowType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = metrics.widthPixels - sizePx - dp(context, 8)
                y = (metrics.heightPixels * 0.42f).toInt()
            }

            val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
            var downRawX = 0f
            var downRawY = 0f
            var startX = 0
            var startY = 0
            var dragging = false

            pill.setOnTouchListener { v, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        mainHandler.removeCallbacks(dimTriggerRunnable)
                        v.animate().alpha(1f).setDuration(120L).start()
                        downRawX = event.rawX
                        downRawY = event.rawY
                        startX = params.x
                        startY = params.y
                        dragging = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - downRawX).toInt()
                        val dy = (event.rawY - downRawY).toInt()
                        if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
                            dragging = true
                        }
                        if (dragging) {
                            params.x = (startX + dx).coerceIn(0, metrics.widthPixels - sizePx)
                            params.y = (startY + dy).coerceIn(
                                dp(context, 48),
                                metrics.heightPixels - sizePx - dp(context, 64)
                            )
                            runCatching { wm.updateViewLayout(v, params) }
                        }
                        true
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        if (!dragging) {
                            openPanel(context)
                        } else {
                            // Snap smoothly to left or right edge
                            val margin = dp(context, 8)
                            val targetX = if (params.x + sizePx / 2 < metrics.widthPixels / 2) {
                                margin
                            } else {
                                metrics.widthPixels - sizePx - margin
                            }
                            params.x = targetX
                            runCatching { wm.updateViewLayout(v, params) }
                            scheduleDimTrigger()
                        }
                        true
                    }
                    else -> false
                }
            }

            triggerView = pill
            triggerParams = params
        }

        val view = triggerView ?: return
        val params = triggerParams ?: return
        if (!triggerVisible) {
            runCatching {
                view.alpha = 0.96f
                wm.addView(view, params)
                triggerVisible = true
                scheduleDimTrigger()
            }
        } else {
            view.animate().alpha(0.96f).setDuration(120L).start()
            scheduleDimTrigger()
        }
    }

    private fun scheduleDimTrigger() {
        mainHandler.removeCallbacks(dimTriggerRunnable)
        mainHandler.postDelayed(dimTriggerRunnable, 2800L)
    }

    private fun hideTriggerInternal() {
        mainHandler.removeCallbacks(dimTriggerRunnable)
        val ctx = appContext ?: return
        val view = triggerView ?: return
        if (!triggerVisible) return
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        runCatching { wm.removeViewImmediate(view) }
        triggerVisible = false
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun ensurePanelCreated(context: Context) {
        if (panelRoot != null && panelWebView != null) return

        val screenH = context.resources.displayMetrics.heightPixels
        val sheetHeight = (screenH * 0.62f).toInt().coerceAtLeast(dp(context, 380))
        val cornerRadius = dp(context, 22).toFloat()

        val root = object : FrameLayout(context) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
                    dismissPanel()
                    return true
                }
                return super.dispatchKeyEvent(event)
            }
        }.apply {
            setBackgroundColor(Color.parseColor("#72000000"))
            isFocusableInTouchMode = true
            setOnClickListener { dismissPanel() }
        }

        val sheetContainer = FrameLayout(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                sheetHeight,
                Gravity.BOTTOM
            )
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#09090B"))
                cornerRadii = floatArrayOf(
                    cornerRadius, cornerRadius,
                    cornerRadius, cornerRadius,
                    0f, 0f,
                    0f, 0f
                )
            }
            clipToOutline = true
            isClickable = true
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()

        val wv = WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#09090B"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    webViewLoaded = true
                    if (panelVisible) {
                        dispatchOverlayShown()
                    }
                }
            }
            addJavascriptInterface(
                AndroidHostBridge(
                    appContext = context.applicationContext,
                    mode = AndroidHostBridge.HostMode.OVERLAY
                ),
                "H2AIAndroidBridge"
            )
            loadUrl("https://appassets.androidplatform.net/index.html#/overlay")
        }

        sheetContainer.addView(wv)
        root.addView(sheetContainer)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            overlayWindowType(),
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

        panelRoot = root
        panelWebView = wv
        panelParams = params
    }

    private fun showPanelInternal(context: Context) {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        val root = panelRoot ?: return
        val params = panelParams ?: return
        if (!panelVisible) {
            runCatching {
                wm.addView(root, params)
                root.requestFocus()
                panelVisible = true
            }
        }
    }

    private fun hidePanelInternal() {
        val ctx = appContext ?: return
        val root = panelRoot ?: return
        if (!panelVisible) return
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        runCatching { wm.removeViewImmediate(root) }
        panelVisible = false
    }
}
