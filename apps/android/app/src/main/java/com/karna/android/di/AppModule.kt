package com.karna.android.di

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import com.karna.android.core.crypto.KeyStoreManager
import com.karna.android.core.model.MobileDeviceInfo
import com.karna.android.core.protocol.PairingProtocol
import com.karna.android.core.protocol.SequenceTracker
import com.karna.android.core.protocol.SessionProtocol
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Singleton

private const val USER_PREFERENCES = "karna_preferences"

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSharedPreferences(
        @ApplicationContext context: Context
    ): SharedPreferences {
        return context.getSharedPreferences(USER_PREFERENCES, Context.MODE_PRIVATE)
    }

    @Provides
    @Singleton
    fun providePreferencesDataStore(
        @ApplicationContext context: Context
    ): DataStore<Preferences> {
        return PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(USER_PREFERENCES) }
        )
    }

    @Provides
    @Singleton
    fun provideJson(): Json {
        return Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = false
            coerceInputValues = true
        }
    }

    @Provides
    @Singleton
    fun provideSequenceTracker(): SequenceTracker {
        return SequenceTracker()
    }

    @Provides
    @Singleton
    fun provideSessionProtocol(
        keyStoreManager: KeyStoreManager,
        sequenceTracker: SequenceTracker
    ): SessionProtocol {
        return SessionProtocol(keyStoreManager, sequenceTracker)
    }

    @Provides
    @Singleton
    fun provideLocalDeviceInfo(
        keyStoreManager: KeyStoreManager,
        sharedPreferences: SharedPreferences
    ): MobileDeviceInfo {
        val deviceId = sharedPreferences.getString("device_id", null)
            ?: UUID.randomUUID().toString().also {
                sharedPreferences.edit().putString("device_id", it).apply()
            }
        val publicKey = keyStoreManager.getOrCreateDeviceKeyPair().public
        val publicKeyBase64 = keyStoreManager.publicKeyToBase64(publicKey)
        return MobileDeviceInfo(
            deviceId = deviceId,
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            osName = "Android",
            osVersion = Build.VERSION.RELEASE,
            appVersion = "1.0.0",
            publicKey = publicKeyBase64
        )
    }

    @Provides
    @Singleton
    fun providePairingProtocol(
        localDeviceInfo: MobileDeviceInfo,
        keyStoreManager: KeyStoreManager,
        sessionProtocol: SessionProtocol,
        json: Json
    ): PairingProtocol {
        return PairingProtocol(localDeviceInfo, keyStoreManager, sessionProtocol, json)
    }
}
