package com.human2ai.app

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import java.util.LinkedHashSet

data class FocusedInputSnapshot(
    val text: String,
    val sourcePackage: String,
    val hasEditableFocus: Boolean
)

class Human2AiAccessibilityService : AccessibilityService() {

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var lastTargetPackage: String = ""

    companion object {
        @Volatile
        var instance: Human2AiAccessibilityService? = null
            private set

        private val TIMESTAMP_REGEX = Regex(
            """^(?:\d{1,2}:\d{2}|(?:昨天|前天|今天|上午|下午|晚上|凌晨|星期[一二三四五六日天]|周[一二三四五六日天]|\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)\s*\d{0,2}:?\d{0,2})$"""
        )
        private val PURE_COUNTER_REGEX = Regex("""^\d+\+?$""")
        private val IGNORED_UI_LABELS = setOf(
            "发送", "按住 说话", "按住说话", "语音", "表情", "返回", "微信", "QQ",
            "消息", "更多", "通讯录", "发现", "我", "复制", "转发", "撤回", "引用",
            "收藏", "删除", "多选", "搜一搜", "翻译", "拍照", "相册", "视频通话",
            "位置", "红包", "转账", "语音输入", "切换键盘", "确定", "取消", "搜索"
        )

        fun isServiceEnabled(context: Context): Boolean {
            if (instance != null) return true
            return runCatching {
                val enabled = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: return false
                val targetFull = "${context.packageName}/${Human2AiAccessibilityService::class.java.name}"
                val targetShort = "${context.packageName}/.Human2AiAccessibilityService"
                enabled.split(':').any { entry ->
                    entry.equals(targetFull, ignoreCase = true) ||
                        entry.equals(targetShort, ignoreCase = true)
                }
            }.getOrDefault(false)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Human2AiOverlayController.syncTriggerVisibility(applicationContext)
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) {
            instance = null
        }
        Human2AiOverlayController.onAccessibilityDisconnected()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        super.onDestroy()
    }

    override fun onInterrupt() {
        // No-op
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkg = event.packageName?.toString().orEmpty()
        if (pkg.isBlank() || pkg == packageName) {
            if (pkg == packageName && !Human2AiOverlayController.isPanelVisible()) {
                Human2AiOverlayController.onInputFocusChanged(applicationContext, false, pkg)
            }
            return
        }

        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val src = event.source
                if (src != null) {
                    val editableSafe = isSafeEditableNode(src)
                    if (editableSafe) {
                        lastTargetPackage = pkg
                        Human2AiOverlayController.onInputFocusChanged(applicationContext, true, pkg)
                    } else if (event.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
                        checkActiveWindowFocus(pkg)
                    }
                } else {
                    checkActiveWindowFocus(pkg)
                }
            }

            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (pkg != "com.android.systemui") {
                    checkActiveWindowFocus(pkg)
                }
            }
        }
    }

    private fun checkActiveWindowFocus(pkg: String) {
        val focused = findSafeFocusedEditableNode(allowFallbackSearch = false)
        if (focused != null) {
            val nodePkg = focused.packageName?.toString().takeUnless { it.isNullOrBlank() } ?: pkg
            if (nodePkg != packageName) {
                lastTargetPackage = nodePkg
                Human2AiOverlayController.onInputFocusChanged(applicationContext, true, nodePkg)
                return
            }
        }
        Human2AiOverlayController.onInputFocusChanged(applicationContext, false, pkg)
    }

    private fun isSafeEditableNode(node: AccessibilityNodeInfo): Boolean {
        if (node.isPassword) return false
        if (node.packageName?.toString() == packageName) return false
        return node.isEditable
    }

    private fun findSafeFocusedEditableNode(allowFallbackSearch: Boolean): AccessibilityNodeInfo? {
        // 1. Direct input focus on active window
        runCatching {
            val root = rootInActiveWindow
            if (root != null && root.packageName?.toString() != packageName) {
                val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                if (focused != null && isSafeEditableNode(focused)) {
                    return focused
                }
            }
        }

        // 2. Check across all interactive application windows
        val appWindows = runCatching { windows }.getOrNull().orEmpty()
        for (win in appWindows) {
            if (win.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
            val root = win.root ?: continue
            if (root.packageName?.toString() == packageName) continue
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focused != null && isSafeEditableNode(focused)) {
                return focused
            }
        }

        if (!allowFallbackSearch) return null

        // 3. Fallback: find visible editable node in preferred/top application window
        val sortedWindows = appWindows
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .sortedByDescending { win ->
                val p = win.root?.packageName?.toString().orEmpty()
                when {
                    p == lastTargetPackage && lastTargetPackage.isNotBlank() -> 2
                    win.isActive -> 1
                    else -> 0
                }
            }
        for (win in sortedWindows) {
            val root = win.root ?: continue
            if (root.packageName?.toString() == packageName) continue
            val candidate = findFirstVisibleEditable(root)
            if (candidate != null) return candidate
        }
        return null
    }

    private fun findFirstVisibleEditable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isVisibleToUser && isSafeEditableNode(node)) {
            return node
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findFirstVisibleEditable(child)
            if (found != null) return found
        }
        return null
    }

    fun readFocusedInputSnapshot(): FocusedInputSnapshot {
        val node = findSafeFocusedEditableNode(allowFallbackSearch = true)
            ?: return FocusedInputSnapshot("", lastTargetPackage, false)

        val pkg = node.packageName?.toString().orEmpty().ifBlank { lastTargetPackage }
        val raw = node.text?.toString().orEmpty()
        // Some Android EditTexts expose hint text through getText(); guard against returning placeholder hint
        val isHint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            node.isShowingHintText || (raw.isNotEmpty() && raw == node.hintText?.toString().orEmpty())
        } else {
            false
        }
        val text = if (isHint) "" else raw
        if (pkg.isNotBlank()) lastTargetPackage = pkg
        return FocusedInputSnapshot(text = text, sourcePackage = pkg, hasEditableFocus = true)
    }

    /**
     * On-demand screen text extraction for "接话回怼" quick-pick (never runs passively).
     * Returns up to 6 recent non-editable message bubbles from the active chat window.
     */
    fun captureRecentScreenMessages(maxItems: Int = 6): List<String> {
        val targetRoot = findActiveExternalAppRoot() ?: return emptyList()
        val ordered = mutableListOf<String>()
        collectReadableTexts(targetRoot, ordered)

        // Keep bottom-most (most recent) unique candidates
        val dedupReversed = LinkedHashSet<String>()
        for (i in ordered.indices.reversed()) {
            val candidate = ordered[i]
            if (dedupReversed.add(candidate) && dedupReversed.size >= maxItems) {
                break
            }
        }
        return dedupReversed.toList()
    }

    private fun findActiveExternalAppRoot(): AccessibilityNodeInfo? {
        val appWindows = runCatching { windows }.getOrNull().orEmpty()
            .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .sortedByDescending { win ->
                val p = win.root?.packageName?.toString().orEmpty()
                when {
                    p == lastTargetPackage && lastTargetPackage.isNotBlank() -> 3
                    win.isActive -> 2
                    win.isFocused -> 1
                    else -> 0
                }
            }
        for (win in appWindows) {
            val root = win.root ?: continue
            if (root.packageName?.toString() != packageName) {
                return root
            }
        }
        val active = rootInActiveWindow
        return if (active != null && active.packageName?.toString() != packageName) active else null
    }

    private fun collectReadableTexts(node: AccessibilityNodeInfo, out: MutableList<String>) {
        if (!node.isVisibleToUser || node.isPassword) return
        if (!node.isEditable) {
            val raw = node.text?.toString()?.trim().orEmpty()
            if (isLikelyChatMessage(raw)) {
                out.add(raw)
            }
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectReadableTexts(child, out)
        }
    }

    private fun isLikelyChatMessage(text: String): Boolean {
        if (text.length < 2 || text.length > 260) return false
        if (text in IGNORED_UI_LABELS) return false
        if (TIMESTAMP_REGEX.matches(text)) return false
        if (PURE_COUNTER_REGEX.matches(text)) return false
        return true
    }

    /**
     * Smart write-back:
     * - If leadingPrefix is non-empty and current box starts with it, try ACTION_SET_SELECTION + ACTION_PASTE
     *   (with clipboard backup/restore) so WeChat/QQ rich-text @mention Spans survive intact!
     * - Otherwise (or if selection paste fails), use atomic ACTION_SET_TEXT.
     * - Never auto-clicks any Send button.
     */
    fun commitToFocusedInput(bodyText: String, leadingPrefix: String): Boolean {
        val node = findSafeFocusedEditableNode(allowFallbackSearch = true) ?: return false
        if (node.isPassword) return false

        val fullOutput = leadingPrefix + bodyText
        val currentText = node.text?.toString().orEmpty()

        // Strategy 1: Preserve leading @mention Span via partial selection + paste
        if (leadingPrefix.isNotEmpty() && currentText.startsWith(leadingPrefix)) {
            if (tryPreservePrefixPaste(node, currentText, leadingPrefix, bodyText)) {
                return true
            }
        }

        // Strategy 2: Atomic ACTION_SET_TEXT
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                fullOutput
            )
        }
        val ok = runCatching {
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }.getOrDefault(false)

        if (ok) {
            val selArgs = Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, fullOutput.length)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, fullOutput.length)
            }
            runCatching { node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs) }
            return true
        }

        return false
    }

    private fun tryPreservePrefixPaste(
        node: AccessibilityNodeInfo,
        currentText: String,
        leadingPrefix: String,
        bodyText: String
    ): Boolean {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
        val previousClip = runCatching { cm.primaryClip }.getOrNull()

        val selArgs = Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, leadingPrefix.length)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, currentText.length)
        }
        val selected = runCatching {
            node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, selArgs)
        }.getOrDefault(false)
        if (!selected) return false

        return try {
            cm.setPrimaryClip(ClipData.newPlainText("Human2AI", bodyText))
            val pasted = node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            if (pasted && previousClip != null) {
                mainHandler.postDelayed({
                    runCatching { cm.setPrimaryClip(previousClip) }
                }, 220L)
            }
            pasted
        } catch (_: Throwable) {
            false
        }
    }
}
