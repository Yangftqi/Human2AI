package com.human2ai.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.appcompat.app.AppCompatActivity

/**
 * Quick Settings Tile so users can summon the Human2AI overlay panel from anywhere
 * even when the floating trigger pill is hidden or set to "off".
 */
class Human2AiTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.let { tile ->
            tile.state = if (Human2AiOverlayController.canDrawOverlays(this)) {
                Tile.STATE_ACTIVE
            } else {
                Tile.STATE_INACTIVE
            }
            tile.updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        val intent = if (Human2AiOverlayController.canDrawOverlays(this)) {
            Intent(this, OverlayLaunchActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            }
        } else {
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pi = PendingIntent.getActivity(
                this,
                1001,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            startActivityAndCollapse(pi)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}

/**
 * Transparent 1-frame trampoline activity used by Quick Settings Tile to cleanly
 * collapse the notification shade before opening the Human2AI overlay panel.
 */
class OverlayLaunchActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appCtx = applicationContext
        window.decorView.postDelayed({
            Human2AiOverlayController.openPanel(appCtx)
        }, 120L)
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
