package com.human2ai.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Zero-permission system text selection menu entry (`Intent.ACTION_PROCESS_TEXT`).
 * Allows rewriting any selected text natively in-place without Overlay or Accessibility permissions.
 */
class ProcessTextActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private var selectedText: String = ""
    private var isReadOnly: Boolean = false
    private var clipboardText: String = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        selectedText = intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString().orEmpty()
        isReadOnly = intent?.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false) ?: false

        val screenH = resources.displayMetrics.heightPixels
        val sheetHeight = (screenH * 0.62f).toInt().coerceAtLeast(dp(380))
        val cornerRadius = dp(22).toFloat()

        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#72000000"))
            setOnClickListener {
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
        }

        val sheetContainer = FrameLayout(this).apply {
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
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val wv = WebView(this).apply {
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
                    view.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('h2ai-overlay-shown'))",
                        null
                    )
                }
            }
            addJavascriptInterface(
                AndroidHostBridge(
                    appContext = applicationContext,
                    mode = AndroidHostBridge.HostMode.PROCESS_TEXT,
                    processTextActivity = this@ProcessTextActivity
                ),
                "H2AIAndroidBridge"
            )
            loadUrl("https://appassets.androidplatform.net/index.html#/overlay")
        }

        webView = wv
        sheetContainer.addView(wv)
        root.addView(sheetContainer)
        setContentView(root)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && clipboardText.isEmpty()) {
            clipboardText = runCatching {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val clip = cm?.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    clip.getItemAt(0).coerceToText(this)?.toString().orEmpty()
                } else {
                    ""
                }
            }.getOrDefault("")
        }
    }

    fun buildContextJson(): String {
        return JSONObject().apply {
            put("capturedText", selectedText)
            put("clipboardText", clipboardText)
            put("sourceApp", callingPackage.orEmpty())
            put("captureMode", "selection")
            put("entryMode", "process_text")
            put("isReadOnly", isReadOnly)
        }.toString()
    }

    fun commitResultAndFinish(finalText: String) {
        runOnUiThread {
            if (!isReadOnly) {
                val data = Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, finalText)
                setResult(Activity.RESULT_OK, data)
            } else {
                runCatching {
                    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    cm?.setPrimaryClip(ClipData.newPlainText("Human2AI", finalText))
                }
                Toast.makeText(this, "当前文本不可直接编辑，已复制到剪贴板", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
            }
            finish()
        }
    }

    fun cancelAndFinish() {
        runOnUiThread {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}
