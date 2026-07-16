package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "devices")
data class DesktopDeviceEntity(
    @PrimaryKey val id: String,
    val deviceName: String,
    val osName: String,
    val osVersion: String,
    val appVersion: String,
    val capabilitiesJson: String? = null,
    val publicKey: String,
    val host: String? = null,
    val port: Int? = null,
    val isPaired: Boolean = false,
    val pairingToken: String? = null,
    val lastSeen: Long = System.currentTimeMillis(),
    val createdAt: Long = System.currentTimeMillis()
)
