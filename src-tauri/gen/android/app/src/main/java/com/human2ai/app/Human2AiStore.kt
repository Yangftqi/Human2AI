package com.human2ai.app

import android.content.Context
import org.json.JSONObject
import java.io.File

object Human2AiStore {
    private val fileLock = Any()

    private fun storeFile(context: Context): File =
        File(context.applicationContext.filesDir, "h2ai_store.json")

    fun loadStoreJson(context: Context): String {
        synchronized(fileLock) {
            val file = storeFile(context)
            return if (file.exists()) {
                runCatching { file.readText(Charsets.UTF_8) }.getOrDefault("")
            } else {
                ""
            }
        }
    }

    fun saveStoreJson(context: Context, json: String) {
        synchronized(fileLock) {
            runCatching {
                val appCtx = context.applicationContext
                val target = storeFile(appCtx)
                val tmp = File(appCtx.filesDir, "h2ai_store.json.tmp")
                tmp.writeText(json, Charsets.UTF_8)
                if (!tmp.renameTo(target)) {
                    target.writeText(json, Charsets.UTF_8)
                    tmp.delete()
                }
            }
        }
        Human2AiOverlayController.onStoreUpdated(context.applicationContext)
    }

    /**
     * Reads `config.android.floatingTriggerMode` ("smart" | "always" | "off").
     * Defaults to "smart".
     */
    fun getFloatingTriggerMode(context: Context): String {
        val raw = loadStoreJson(context)
        if (raw.isBlank()) return "smart"
        return runCatching {
            val root = JSONObject(raw)
            val mode = root.optJSONObject("config")
                ?.optJSONObject("android")
                ?.optString("floatingTriggerMode", "smart")
                ?.trim()
                .orEmpty()
            if (mode in setOf("smart", "always", "off")) mode else "smart"
        }.getOrDefault("smart")
    }
}
